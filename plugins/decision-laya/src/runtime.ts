import { createHash, randomUUID } from 'node:crypto'
import { decisionRequestSchema, decisionResultSchema } from '@hbar/contracts/decision'
import type { DecisionMetadata, DecisionRequest, DecisionResult, ParsedDecisionRequest } from '@hbar/contracts/decision'
import type { DecisionContext, DecisionService } from '@hbar/plugin-sdk'
import { DecisionBackendError } from './backend'
import type { DecisionBackend } from './backend'
import { decodeAnswers } from './answers'
import { LAYA_RUNTIME_VERSION } from './config'
import type { LayaConfig } from './config'
import { ManagedLayaBackend } from './managed-backend'

type Recorder = (context: DecisionContext, result: DecisionResult) => Promise<void>
interface Job {
  request: ParsedDecisionRequest
  metadata: DecisionMetadata
  created: number
  context: DecisionContext | undefined
  resolve: (result: DecisionResult) => void
  settled: boolean
  cleanup: () => void
  controller?: AbortController
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export class LayaDecisionRuntime implements DecisionService {
  private readonly backend: DecisionBackend
  private readonly queue: Job[] = []
  private active: Job | undefined
  private worker: Promise<void> | undefined
  private disposed = false
  private closing: Promise<void> | undefined
  constructor(
    private readonly config: LayaConfig,
    backend?: DecisionBackend,
    private readonly record?: Recorder,
  ) {
    this.backend = backend ?? new ManagedLayaBackend(config)
  }

  async evaluate(request: DecisionRequest, signal: AbortSignal, context?: DecisionContext): Promise<DecisionResult> {
    const parsed = decisionRequestSchema.safeParse(request)
    const valid = parsed.success
      ? parsed.data
      : decisionRequestSchema.parse({
          state: 'invalid',
          questions: { input: { type: 'noul', instructions: 'Input validation failed' } },
        })
    const metadata: DecisionMetadata = {
      evaluationId: randomUUID(),
      provider: 'laya',
      runtimeVersion: LAYA_RUNTIME_VERSION,
      checkpoint: valid.checkpoint,
      modelRevision: this.backend.revision(valid.checkpoint),
      profile: valid.profile,
      schemaHash: hash(valid.questions),
      stateHash: hash(valid.state),
      startedAt: Date.now(),
      elapsedMs: 0,
      queueMs: 0,
      calibration: 'uncalibrated',
      inputTruncated: false,
      questionsTruncated: [],
      device: null,
      memoryAllocatedBytes: null,
      memoryReservedBytes: null,
    }
    return new Promise<DecisionResult>((resolveResult) => {
      const job: Job = {
        request: valid,
        metadata,
        created: performance.now(),
        context,
        resolve: resolveResult,
        settled: false,
        cleanup: () => {},
      }
      if (!parsed.success) {
        this.finishDetached(job, this.failure(job, 'INVALID_INPUT', 'Decision input failed schema validation'))
        return
      }
      if (this.disposed) {
        this.finishDetached(job, this.failure(job, 'DISPOSED', 'Laya plugin is stopped'))
        return
      }
      if (signal.aborted) {
        this.finishDetached(job, this.cancelled(job))
        return
      }
      if (!this.config.checkpoints.includes(valid.checkpoint)) {
        this.finishDetached(job, this.failure(job, 'MISSING_MODEL', `Checkpoint ${valid.checkpoint} is not enabled`))
        return
      }
      if (this.active && this.queue.length >= this.config.maxQueue) {
        this.finishDetached(job, this.failure(job, 'QUEUE_FULL', 'The Laya evaluation queue is full'))
        return
      }
      const remove = () => {
        const index = this.queue.indexOf(job)
        if (index >= 0) this.queue.splice(index, 1)
      }
      const abort = () => {
        remove()
        this.finishDetached(job, this.cancelled(job))
      }
      const timer = setTimeout(() => {
        if (this.queue.includes(job)) {
          remove()
          this.finishDetached(job, this.failure(job, 'REQUEST_TIMEOUT', 'Decision evaluation expired while queued'))
        }
      }, this.config.queueTimeoutMs)
      job.cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      signal.addEventListener('abort', abort, { once: true })
      this.queue.push(job)
      this.pump()
    })
  }

  private cancelled(job: Job): DecisionResult {
    return {
      status: 'cancelled',
      code: 'CANCELLED',
      message: 'Decision evaluation was cancelled; an active forward pass may finish',
      metadata: { ...job.metadata },
    }
  }
  private failure(
    job: Job,
    code: import('@hbar/contracts/decision').DecisionFailureCode,
    message: string,
  ): DecisionResult {
    return { status: 'unavailable', code, message: message.slice(0, 500), metadata: { ...job.metadata } }
  }
  private finishDetached(job: Job, result: DecisionResult): void {
    // finish handles recording failures itself; its rejection handler also settles the caller.
    this.finish(job, result).catch(() =>
      job.resolve(this.failure(job, 'RECORDING_FAILED', 'Decision evaluation could not be recorded')),
    )
  }
  private async finish(job: Job, result: DecisionResult): Promise<void> {
    if (job.settled) return
    job.settled = true
    job.cleanup()
    let value = decisionResultSchema.parse({
      ...result,
      metadata: {
        ...result.metadata,
        modelRevision: this.backend.revision(job.request.checkpoint),
        elapsedMs: Math.max(0, performance.now() - job.created),
      },
    })
    if (job.context && this.record) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Decision record confirmation timed out')),
            this.config.recordTimeoutMs,
          )
        })
        // The storage port cannot cancel a committed write. A timed-out confirmation
        // is reported as unavailable; its event can still appear later with the same ID.
        await Promise.race([this.record(job.context, value), deadline])
      } catch {
        value = {
          status: 'unavailable',
          code: 'RECORDING_FAILED',
          message: 'Decision record confirmation failed or timed out',
          metadata: value.metadata,
        }
      } finally {
        clearTimeout(timeout)
      }
    }
    job.resolve(value)
  }
  private pump(): void {
    if (this.active || this.disposed) return
    const job = this.queue.shift()
    if (!job) return
    this.active = job
    job.metadata.queueMs = Math.max(0, performance.now() - job.created)
    this.worker = this.run(job).finally(() => {
      this.active = undefined
      this.pump()
    })
    this.worker.catch(() => this.finishDetached(job, this.failure(job, 'INFERENCE_FAILED', 'Laya evaluation failed')))
  }
  private async phase<T>(
    job: Job,
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    code: 'STARTUP_TIMEOUT' | 'REQUEST_TIMEOUT',
  ): Promise<T> {
    if (this.disposed) throw new DecisionBackendError('DISPOSED', 'Laya plugin is stopped')
    const controller = new AbortController()
    job.controller = controller
    const timer = setTimeout(
      () =>
        controller.abort(
          new DecisionBackendError(
            code,
            code === 'STARTUP_TIMEOUT' ? 'Laya startup timed out' : 'Laya inference timed out',
          ),
        ),
      timeoutMs,
    )
    let rejectAbort: (reason: unknown) => void = () => {}
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = reject
    })
    const abort = () => rejectAbort(controller.signal.reason as unknown)
    controller.signal.addEventListener('abort', abort, { once: true })
    try {
      return await Promise.race([operation(controller.signal), aborted])
    } catch (error) {
      // HTTP cancellation cannot stop a PyTorch forward pass. Stop the owned process
      // before releasing its inference slot on timeout or plugin disposal.
      if (controller.signal.aborted) await this.backend.stop()
      throw error
    } finally {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', abort)
      delete job.controller
    }
  }
  private async run(job: Job): Promise<void> {
    try {
      await this.phase(job, (signal) => this.backend.ready(signal), this.config.startupTimeoutMs, 'STARTUP_TIMEOUT')
      if (job.settled) return
      const raw = await this.phase(
        job,
        (signal) => this.backend.predict(job.request, signal),
        this.config.requestTimeoutMs,
        'REQUEST_TIMEOUT',
      )
      if (job.settled) return
      const decoded = decodeAnswers(job.request, raw)
      job.metadata.inputTruncated = decoded.inputTruncated
      job.metadata.questionsTruncated = decoded.questionsTruncated
      job.metadata.device = decoded.device
      job.metadata.memoryAllocatedBytes = decoded.memoryAllocatedBytes
      job.metadata.memoryReservedBytes = decoded.memoryReservedBytes
      await this.finish(job, { status: 'evaluated', answers: decoded.answers, metadata: { ...job.metadata } })
    } catch (error) {
      if (job.settled) return
      const failure =
        error instanceof DecisionBackendError
          ? error
          : new DecisionBackendError('INFERENCE_FAILED', 'The local Laya runtime failed')
      if (failure.code === 'PROCESS_EXIT') await this.backend.stop()
      await this.finish(job, this.failure(job, failure.code, failure.message))
    }
  }
  dispose(): Promise<void> {
    if (!this.closing) this.closing = this.close()
    return this.closing
  }
  private async close(): Promise<void> {
    this.disposed = true
    const pending = this.queue.splice(0)
    this.active?.controller?.abort(new DecisionBackendError('DISPOSED', 'Laya plugin is stopped'))
    await Promise.all(pending.map((job) => this.finish(job, this.failure(job, 'DISPOSED', 'Laya plugin is stopped'))))
    await this.backend.dispose()
    await this.worker
  }
}
