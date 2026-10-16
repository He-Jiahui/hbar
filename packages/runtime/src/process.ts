import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import { HbarError } from '@hbar/contracts'
import {
  RUNTIME_LIMITS,
  runtimeGenerationSchema,
  type RuntimeGeneration,
  type RuntimeOwner,
  type RuntimeProcessTree,
  type RuntimeProcessTreePort,
  type RuntimeUnitDescriptor,
} from '@hbar/contracts/runtime'
import { IpcPeer, type IpcCallOptions } from './ipc'
import { RUNTIME_CONTROL_METHODS, runtimeDrainSchema, runtimeReadySchema, type RuntimeDrain } from './lifecycle'

export interface ManagedProcessOptions {
  readonly descriptor: RuntimeUnitDescriptor
  readonly artifactId: string
  readonly modulePath: string
  readonly generation: number
  /** A retry before any generation has served is still a cold startup. */
  readonly purpose?: 'startup' | 'candidate'
  readonly parent: RuntimeOwner
  readonly configuration?: Readonly<Record<string, unknown>>
  /** Verify registered bytes again before every candidate import and recovery incarnation. */
  readonly verifyModule?: (signal: AbortSignal) => Promise<void>
  readonly command?: readonly [string, ...string[]]
  /** Local native lifetime port; descendants must exit before execution ownership is released. */
  readonly processTree?: RuntimeProcessTreePort
  readonly heartbeatMs?: number
  readonly startupMs?: number
  readonly shutdownMs?: number
  readonly onPeer?: (peer: IpcPeer, owner: RuntimeOwner) => void
  /** Called only after activation has been authorized, for each actual process incarnation. */
  readonly onActivating?: (
    owner: RuntimeOwner,
    role: 'default' | 'draining',
    signal: AbortSignal,
  ) => void | Promise<void>
  /** Publish owner-local descriptions after activation acknowledgement, before serving routes become visible. */
  readonly onActivated?: (owner: RuntimeOwner, role: 'default' | 'draining', signal: AbortSignal) => Promise<void>
  readonly onState?: (snapshot: RuntimeGeneration) => void
  readonly onFault?: (owner: RuntimeOwner, reasonCode: string, childPid: number) => Promise<void>
  readonly onExit?: (owner: RuntimeOwner, exit: RuntimeProcessExit) => Promise<void>
  readonly retryDelaysMs?: readonly [number, number, number]
  readonly retrySlowMs?: number
  readonly healthyResetMs?: number
  readonly jitter?: number
  readonly controlMethods?: readonly string[]
}

export interface RuntimeProcessExit {
  readonly childPid: number
  readonly exitCode: number
  readonly reasonCode: string | null
  readonly deliberate: boolean
  readonly restartExpected: boolean
}

interface Retirement {
  readonly owner: RuntimeOwner
  readonly exit: RuntimeProcessExit
  readonly tree: Promise<RuntimeProcessTree | undefined>
  readonly deliberate: boolean
  fence: Promise<void> | undefined
  release: Promise<void> | undefined
  joined: boolean
}

function duration(value: number | undefined, fallback: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 1 || result > 2_147_483_647)
    throw new RangeError('Invalid runtime lifecycle duration')
  return result
}

export class ManagedProcess {
  private readonly heartbeatMs: number
  private readonly startupMs: number
  private readonly shutdownMs: number
  private readonly retrySlowMs: number
  private readonly healthyResetMs: number
  private readonly jitter: number
  private child: Bun.Subprocess | undefined
  private peer: IpcPeer | undefined
  private monitor: ReturnType<typeof setInterval> | undefined
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private activated = false
  private healthySince: number | null = null
  private recovering: Promise<void> | undefined
  private disposal: Promise<void> | undefined
  private launching: Promise<void> | undefined
  private exitHandling: Promise<void> = Promise.resolve()
  private fencing: Promise<void> | undefined
  private tree: RuntimeProcessTree | undefined
  private retirement: Retirement | undefined
  private retiring: Promise<void> | undefined
  private activation: AbortController | undefined
  private readonly stopController = new AbortController()
  private state: RuntimeGeneration

  constructor(private readonly options: ManagedProcessOptions) {
    this.heartbeatMs = duration(options.heartbeatMs, RUNTIME_LIMITS.heartbeatMs)
    this.startupMs = duration(options.startupMs, RUNTIME_LIMITS.startupMs)
    this.shutdownMs = duration(options.shutdownMs, RUNTIME_LIMITS.shutdownMs)
    this.retrySlowMs = duration(options.retrySlowMs, 30_000)
    this.healthyResetMs = duration(options.healthyResetMs, 60_000)
    this.jitter = options.jitter ?? 0.2
    if (!Number.isFinite(this.jitter) || this.jitter < 0 || this.jitter > 0.5)
      throw new RangeError('Invalid runtime recovery jitter')
    for (const delay of options.retryDelaysMs ?? [250, 1_000, 4_000]) duration(delay, 250)
    this.state = runtimeGenerationSchema.parse({
      unitId: options.descriptor.id,
      generation: options.generation,
      incarnation: crypto.randomUUID(),
      artifactId: options.artifactId,
      role: 'candidate',
      phase: 'preparing',
      pid: null,
      references: { runs: 0, resources: 0, requests: 0 },
      lastHeartbeatAt: null,
      failures: 0,
      nextAttemptAt: null,
      reasonCode: null,
    })
  }

  owner(): RuntimeOwner {
    return { unitId: this.state.unitId, generation: this.state.generation, incarnation: this.state.incarnation }
  }
  snapshot(): RuntimeGeneration {
    return runtimeGenerationSchema.parse({
      ...this.state,
      references: { ...this.state.references, requests: this.peer?.snapshot().inFlight ?? 0 },
    })
  }
  references(runs: number, resources: number): void {
    this.state.references = runtimeGenerationSchema.shape.references.parse({
      runs,
      resources,
      requests: this.peer?.snapshot().inFlight ?? 0,
    })
    this.publish()
  }
  prepare(): Promise<void> {
    if (this.launching) return this.launching
    if (this.child) {
      if (this.state.phase === 'ready' || this.state.phase === 'serving' || this.state.phase === 'draining')
        return Promise.resolve()
      return Promise.reject(new HbarError('RUNTIME_OWNER_ACTIVE', 'The previous runtime process has not exited'))
    }
    this.launching = this.launch().finally(() => {
      this.launching = undefined
    })
    return this.launching
  }
  async activate(role: 'default' | 'draining' = 'default'): Promise<void> {
    if (this.stopped || this.state.phase !== 'ready' || !this.peer)
      throw new HbarError('RUNTIME_NOT_READY', 'Runtime candidate is not ready')
    // Recovery targets this artifact from the point activation is authorized, even if its receipt is lost.
    this.activated = true
    this.state.role = role
    const owner = this.owner()
    const deadline = Date.now() + this.startupMs
    const activation = new AbortController()
    this.activation = activation
    const signal = AbortSignal.any([activation.signal, AbortSignal.timeout(this.startupMs)])
    const aborted = () => {
      activation.abort()
    }
    try {
      if (this.options.onActivating)
        await new Promise<void>((resolve, reject) => {
          const cancel = () =>
            reject(new HbarError('RUNTIME_ACTIVATION_EXPIRED', 'Runtime activation authority expired'))
          signal.addEventListener('abort', cancel, { once: true })
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return this.options.onActivating?.(owner, role, signal)
            })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', cancel))
        })
      if (
        signal.aborted ||
        this.stopped ||
        this.state.phase !== 'ready' ||
        !this.peer ||
        this.owner().incarnation !== owner.incarnation
      )
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Runtime activation authority expired before production started')
      await this.peer.call('runtime.activate', { role }, z.undefined(), {
        timeoutMs: Math.max(1, deadline - Date.now()),
      })
      if (this.options.onActivated) await new Promise<void>((resolve, reject) => {
        const cancel = () => reject(new HbarError('RUNTIME_ACTIVATION_EXPIRED', 'Runtime description readiness expired'))
        signal.addEventListener('abort', cancel, { once: true })
        Promise.resolve().then(() => {
          signal.throwIfAborted()
          return this.options.onActivated?.(owner, role, signal)
        }).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
      })
      signal.throwIfAborted()
      this.state.phase = role === 'draining' ? 'draining' : 'serving'
      this.state.lastHeartbeatAt = Date.now()
      this.healthySince = Date.now()
      this.publish()
    } catch (error) {
      this.fault(error instanceof HbarError ? error.code : 'RUNTIME_ACTIVATION_FAILED')
      throw error
    } finally {
      aborted()
      if (this.activation === activation) this.activation = undefined
    }
  }
  async drain(): Promise<RuntimeDrain> {
    if (!this.activated || this.stopped) throw new HbarError('RUNTIME_LIFECYCLE', 'Runtime generation cannot drain')
    this.state.role = 'draining'
    if (!this.peer || this.state.phase === 'recovering') {
      this.publish()
      return { requests: 0, runs: this.state.references.runs, resources: this.state.references.resources }
    }
    this.state.phase = 'draining'
    this.publish()
    return this.peer.call('runtime.drain', undefined, runtimeDrainSchema, { timeoutMs: this.shutdownMs })
  }
  call<Output>(
    method: string,
    input: unknown,
    schema: z.ZodType<Output>,
    options: IpcCallOptions = {},
  ): Promise<Output> {
    if (!this.peer || (this.state.phase !== 'serving' && this.state.phase !== 'draining'))
      return Promise.reject(
        new HbarError('RUNTIME_RECOVERING', 'Runtime unit is recovering; reconcile existing requests'),
      )
    return this.peer.call(method, input, schema, options)
  }
  dispose(): Promise<void> {
    this.disposal ??= this.disposeProcess()
    return this.disposal
  }

  private publish(): void {
    try {
      this.options.onState?.(this.snapshot())
    } catch {
      console.error('[hbar runtime] generation observer failed')
    }
  }

  private async launch(): Promise<void> {
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime generation is disposed')
    await this.retire()
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime generation is disposed')
    this.state.incarnation = crypto.randomUUID()
    this.state.phase = 'preparing'
    this.state.nextAttemptAt = null
    this.state.lastHeartbeatAt = Date.now()
    this.state.reasonCode = null
    this.fencing = undefined
    this.publish()
    const owner = this.owner()
    const deadline = Date.now() + this.startupMs
    if (this.options.verifyModule) {
      const signal = AbortSignal.any([this.stopController.signal, AbortSignal.timeout(this.startupMs)])
      try {
        await new Promise<void>((resolve, reject) => {
          const cancel = () =>
            reject(new HbarError('RUNTIME_VERIFICATION_EXPIRED', 'Runtime module verification expired'))
          signal.addEventListener('abort', cancel, { once: true })
          Promise.resolve()
            .then(() => {
              signal.throwIfAborted()
              return this.options.verifyModule?.(signal)
            })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', cancel))
        })
        signal.throwIfAborted()
      } catch (error) {
        if (!this.stopped) {
          this.state.phase = this.activated ? 'recovering' : 'failed'
          this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_VERIFICATION_FAILED'
          this.publish()
        }
        throw error
      }
    }
    if (this.stopped) throw new HbarError('RUNTIME_DISPOSED', 'Runtime process stopped before module loading')
    const child = Bun.spawn(
      this.options.command
        ? [...this.options.command]
        : [process.execPath, fileURLToPath(new URL('./process-entry.ts', import.meta.url))],
      {
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
        windowsHide: true,
        serialization: 'json',
        env: {
          ...process.env,
          ...this.options.processTree?.environment,
          HBAR_RUNTIME_SELF: JSON.stringify(owner),
          HBAR_RUNTIME_PARENT: JSON.stringify(this.options.parent),
          HBAR_RUNTIME_MODULE: this.options.modulePath,
          HBAR_RUNTIME_PREPARATION: this.activated
            ? 'recovery'
            : (this.options.purpose ?? (this.options.generation === 1 ? 'startup' : 'candidate')),
          HBAR_RUNTIME_HEARTBEAT_MS: String(this.heartbeatMs),
          HBAR_RUNTIME_CONTROL_METHODS: JSON.stringify([
            ...RUNTIME_CONTROL_METHODS,
            ...(this.options.controlMethods ?? []),
          ]),
        },
        ipc: (message: unknown) => {
          if (this.child === child) this.peer?.receive(message)
        },
      },
    )
    this.child = child
    this.state.pid = child.pid
    const peer = new IpcPeer({
      owner: this.options.parent,
      remote: owner,
      controlRemoteDeadlines: true,
      controlMethods: [...RUNTIME_CONTROL_METHODS, ...(this.options.controlMethods ?? [])],
      transport: { send: (frame) => child.send(frame) },
      onFailure: () => this.fault('RUNTIME_IPC_FAILED'),
      onTimeout: () => this.fault('RUNTIME_CALL_TIMEOUT'),
    })
    this.peer = peer
    const attachment = this.options.processTree
      ? this.options.processTree.attach(
          child.pid,
          AbortSignal.any([this.stopController.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]),
        )
      : Promise.resolve(undefined)
    void attachment.catch(() => {})
    peer.onEvent('runtime.heartbeat', z.strictObject({ time: z.number().int().nonnegative() }), () => {
      this.state.lastHeartbeatAt = Date.now()
    })
    void child.exited
      .then((exitCode) => {
        this.exitHandling = this.exited(child, peer, owner, attachment, exitCode)
        return this.exitHandling
      })
      .catch(() => {
        this.state.reasonCode = 'RUNTIME_EXIT_RECONCILIATION_FAILED'
        this.publish()
      })
    try {
      this.options.onPeer?.(peer, owner)
      const tree = await attachment
      if (this.child !== child || this.stopped) {
        tree?.terminate()
        throw new HbarError(
          'RUNTIME_OWNER_REVOKED',
          'Runtime owner exited before native process ownership was established',
        )
      }
      this.tree = tree
      this.monitor = setInterval(
        () => {
          if (this.stopped || this.child !== child || this.state.phase === 'preparing') return
          if (Date.now() - (this.state.lastHeartbeatAt ?? 0) >= this.heartbeatMs * RUNTIME_LIMITS.missedHeartbeats)
            this.fault('RUNTIME_HEARTBEAT_TIMEOUT')
        },
        Math.min(this.heartbeatMs, 500),
      )
      const ready = await peer.call(
        'runtime.prepare',
        { descriptor: this.options.descriptor, configuration: this.options.configuration ?? {} },
        runtimeReadySchema,
        { timeoutMs: Math.max(1, deadline - Date.now()) },
      )
      if (
        ready.contractFingerprint !== this.options.descriptor.contractFingerprint ||
        ready.storageSchema !== this.options.descriptor.storageSchema
      )
        throw new HbarError(
          'RUNTIME_RESTART_REQUIRED',
          'Runtime candidate is incompatible with the stable ports or storage schema',
        )
      if (this.child !== child || this.stopped)
        throw new HbarError('RUNTIME_OWNER_REVOKED', 'Runtime owner exited during preparation')
      this.state.phase = 'ready'
      this.state.lastHeartbeatAt = Date.now()
      this.publish()
    } catch (error) {
      this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_PREPARE_FAILED'
      try {
        child.kill('SIGKILL')
      } catch {
        /* Exit is observed independently. */
      }
      await child.exited
      await this.exitHandling
      throw error
    }
  }

  private fault(reason: string): void {
    if (this.stopped || !this.child || this.state.phase === 'recovering' || this.state.phase === 'failed') return
    this.state.reasonCode = reason
    this.state.phase = this.activated ? 'recovering' : 'failed'
    try {
      this.fencing = this.options.onFault?.(this.owner(), reason, this.child.pid)
    } catch (error) {
      this.fencing = Promise.reject(error)
    }
    void this.fencing?.catch(() => {
      this.state.reasonCode = 'RUNTIME_FENCE_FAILED'
      this.publish()
    })
    this.publish()
    this.terminate(this.child)
  }

  private terminate(child: Bun.Subprocess): void {
    try {
      this.tree?.terminate()
    } catch {
      console.error('[hbar runtime] descendant termination needs reconciliation')
    }
    try {
      if (child.exitCode === null) child.kill('SIGKILL')
    } catch {
      console.error('[hbar runtime] owner termination failed')
    }
  }

  private async exited(
    child: Bun.Subprocess,
    peer: IpcPeer,
    owner: RuntimeOwner,
    tree: Promise<RuntimeProcessTree | undefined>,
    exitCode: number,
  ): Promise<void> {
    if (this.child !== child) return
    clearInterval(this.monitor)
    const deliberate = this.stopped
    if (!deliberate) this.state.reasonCode ??= 'RUNTIME_PROCESS_EXITED'
    this.state.phase = deliberate ? 'disposing' : this.activated ? 'recovering' : 'failed'
    const reason = this.state.reasonCode
    if (!deliberate && !this.fencing) {
      try {
        this.fencing = this.options.onFault?.(owner, reason ?? 'RUNTIME_PROCESS_EXITED', child.pid)
      } catch (error) {
        this.fencing = Promise.reject(error)
      }
      void this.fencing?.catch(() => {})
    }
    this.child = undefined
    this.tree = undefined
    this.peer = undefined
    this.state.pid = null
    peer.close()
    this.publish()
    const exit: RuntimeProcessExit = {
      childPid: child.pid,
      exitCode,
      reasonCode: reason,
      deliberate,
      restartExpected: !deliberate && this.activated,
    }
    this.retirement = { owner, exit, tree, deliberate, fence: this.fencing, release: undefined, joined: false }
    try {
      await this.retire()
    } catch (error) {
      this.state.reasonCode = error instanceof HbarError ? error.code : 'RUNTIME_EXIT_RECONCILIATION_FAILED'
      this.publish()
    } finally {
      if (!deliberate && this.activated) this.scheduleRecovery()
    }
  }

  private retire(): Promise<void> {
    if (!this.retirement) return Promise.resolve()
    this.retiring ??= this.reconcileRetirement(this.retirement).finally(() => {
      this.retiring = undefined
    })
    return this.retiring
  }

  private async bounded<Value>(pending: Promise<Value>, deadline: number): Promise<Value> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new HbarError('RUNTIME_EXIT_RECONCILIATION_FAILED', 'Execution ownership retirement has not completed'),
              ),
            Math.max(1, deadline - Date.now()),
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async reconcileRetirement(retirement: Retirement): Promise<void> {
    const deadline = Date.now() + this.shutdownMs
    // The module is never imported before attachment succeeds; a failed attachment has no owned descendants.
    const tree = await this.bounded(
      retirement.tree.catch(() => undefined),
      deadline,
    )
    if (!retirement.joined) {
      tree?.terminate()
      await tree?.join(Math.max(1, deadline - Date.now()))
      tree?.close()
      retirement.joined = true
    }
    if (!retirement.deliberate) {
      retirement.fence ??= Promise.resolve().then(() =>
        this.options.onFault?.(
          retirement.owner,
          this.state.reasonCode ?? 'RUNTIME_PROCESS_EXITED',
          retirement.exit.childPid,
        ),
      )
      try {
        await this.bounded(retirement.fence, deadline)
      } catch (error) {
        // Keep a still-pending fence, but allow a rejected durable write to retry on the next backoff.
        void retirement.fence.catch(() => {
          retirement.fence = undefined
        })
        throw error
      }
    }
    retirement.release ??= Promise.resolve().then(() => this.options.onExit?.(retirement.owner, retirement.exit))
    try {
      await this.bounded(retirement.release, deadline)
    } catch (error) {
      void retirement.release.catch(() => {
        retirement.release = undefined
      })
      throw error
    }
    if (this.retirement === retirement) this.retirement = undefined
  }

  private scheduleRecovery(): void {
    if (this.stopped || this.recoveryTimer) return
    if (this.healthySince !== null && Date.now() - this.healthySince >= this.healthyResetMs) this.state.failures = 0
    this.healthySince = null
    const base = (this.options.retryDelaysMs ?? [250, 1_000, 4_000])[this.state.failures] ?? this.retrySlowMs
    this.state.failures++
    const delay = Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * this.jitter)))
    this.state.nextAttemptAt = Date.now() + delay
    this.publish()
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined
      this.recovering = this.recover()
        .catch(() => {
          if (!this.stopped && !this.child) this.scheduleRecovery()
        })
        .finally(() => {
          this.recovering = undefined
        })
    }, delay)
  }

  private async recover(): Promise<void> {
    await this.prepare()
    if (this.stopped) return
    const role = this.state.role
    await this.activate(role === 'draining' ? 'draining' : 'default')
  }

  private async waitForExit(child: Bun.Subprocess, timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        child.exited.then(() => true),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  private async disposeProcess(): Promise<void> {
    const end = Date.now() + this.shutdownMs
    this.stopped = true
    this.stopController.abort()
    this.activation?.abort()
    clearTimeout(this.recoveryTimer)
    clearInterval(this.monitor)
    this.state.phase = 'disposing'
    this.publish()
    const child = this.child
    const peer = this.peer
    if (child) {
      const deadline = setTimeout(() => {
        this.terminate(child)
      }, this.shutdownMs)
      try {
        await peer?.call('runtime.dispose', undefined, z.undefined(), { timeoutMs: Math.max(1, end - Date.now()) })
        await peer?.call('runtime.exit', undefined, z.undefined(), { timeoutMs: Math.max(1, end - Date.now()) })
      } catch {
        /* The deadline is enforced by termination of the owning process. */
      }
      if (!(await this.waitForExit(child, Math.max(1, end - Date.now())))) {
        this.terminate(child)
      }
      if (!(await this.waitForExit(child, this.shutdownMs)))
        throw new HbarError('RUNTIME_EXIT_UNKNOWN', 'Runtime process exit could not be confirmed')
      await this.exitHandling
      clearTimeout(deadline)
    }
    await this.launching?.catch(() => {})
    await this.recovering?.catch(() => {})
    await this.retire()
    this.state.phase = 'disposed'
    this.state.nextAttemptAt = null
    this.state.pid = null
    this.publish()
  }
}
