import type { ScheduleOccurrence } from '@hbar/contracts/commands/schedules'
import {
  createScheduleRunner,
  ScheduleRunFailure,
  type ScheduleExecutionPort,
  type ScheduleService,
  type SchedulePrepareInput,
  type ScheduleSubmitInput,
} from '@hbar/kernel/controller'
import { operationSnapshotSchema, runAcceptedSchema, submitRunInputSchema } from '@hbar/contracts/commands/run'

export interface ScheduleHostReader {
  enabledSchedules(after: string | null, limit: number): Promise<readonly { id: string }[]>
  activeScheduleOccurrences(
    limit: number,
    after?: { dueAt: number; id: string } | null,
  ): Promise<
    readonly ScheduleOccurrence[] | { items: readonly ScheduleOccurrence[]; next: { dueAt: number; id: string } | null }
  >
  dueScheduleOccurrences(now: number, limit: number): Promise<readonly { scheduleId: string; dueAt: number }[]>
}

export interface ScheduleRunCommands {
  execute(
    id: 'run.submit' | 'operation.get',
    input: unknown,
    options?: { actorId?: string; idempotencyKey?: string; requestId?: string; signal?: AbortSignal },
  ): Promise<unknown>
  getReceipt?(
    commandId: 'run.submit',
    sessionId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<{ operationId: string } | null>
}

export interface ScheduleHostControllerOptions {
  service: ScheduleService
  reader: ScheduleHostReader
  runCommands: ScheduleRunCommands
  prepareSession(input: SchedulePrepareInput): Promise<{ sessionId: string }>
  authorizeSubmission(input: ScheduleSubmitInput): Promise<void>
  intervalMs?: number
  now?: () => number
  onFailure?: (input: { scheduleId: string; occurrenceId: string; error: string }) => Promise<void> | void
}

export function createScheduleHostController(options: ScheduleHostControllerOptions) {
  const now = options.now ?? Date.now
  const getReceipt = options.runCommands.getReceipt
  const execution: ScheduleExecutionPort = {
    async prepare(input) {
      return options.prepareSession(input)
    },
    async submit(input) {
      await options.authorizeSubmission(input)
      const runInput = submitRunInputSchema.parse({
        sessionId: input.sessionId,
        modelId: input.modelId,
        input: { text: input.input, images: [], source: 'user' },
      })
      const result = runAcceptedSchema.parse(
        await options.runCommands.execute('run.submit', runInput, {
          actorId: input.actorId,
          idempotencyKey: input.idempotencyKey,
        }),
      )
      return { operationId: result.operationId }
    },
    async observeOperation(operationId) {
      const result = operationSnapshotSchema.safeParse(
        await options.runCommands.execute('operation.get', { operationId }),
      )
      if (!result.success) return 'unknown'
      return result.data.status
    },
    ...(getReceipt
      ? {
          getReceipt: (input: { sessionId: string; actorId: string; idempotencyKey: string }) =>
            getReceipt('run.submit', input.sessionId, input.actorId, input.idempotencyKey),
        }
      : {}),
  }
  const runner = createScheduleRunner(options.service, execution, { maxActive: 2 })
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let paused = false
  let nextDueAt: number | null = null
  let ticking: Promise<void> | undefined
  const notifiedFailures = new Set<string>()
  let recoveryCursor: { dueAt: number; id: string } | null = null
  const notifyFailure = async (failed: ScheduleOccurrence, fallback: string) => {
    if (notifiedFailures.has(failed.id)) return
    notifiedFailures.add(failed.id)
    if (notifiedFailures.size > 400) {
      const oldest = notifiedFailures.values().next().value
      if (oldest !== undefined) notifiedFailures.delete(oldest)
    }
    await options.onFailure?.({
      scheduleId: failed.scheduleId,
      occurrenceId: failed.id,
      error: failed.error ?? fallback,
    })
  }
  const tick = async () => {
    if (stopped || paused || ticking) return ticking
    if (timer) clearTimeout(timer)
    timer = undefined
    nextDueAt = null
    ticking = (async () => {
      const timestamp = now()
      const activePage = await options.reader.activeScheduleOccurrences(64, recoveryCursor)
      const activeItems: readonly ScheduleOccurrence[] = 'items' in activePage ? activePage.items : activePage
      const recoveredFailures = await runner.recover(activeItems)
      for (const failed of recoveredFailures) await notifyFailure(failed, 'Scheduled run failed')
      recoveryCursor = 'items' in activePage ? activePage.next : null
      const due = await options.reader.dueScheduleOccurrences(timestamp, 32)
      for (const item of due) {
        let occurrence: ScheduleOccurrence | null = null
        try {
          occurrence = await runner.runSchedule(item.scheduleId, item.dueAt, timestamp)
          if (!occurrence?.runId) continue
          const status = await execution.observeOperation(occurrence.runId)
          if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted') {
            const settled = await runner.settle(occurrence.id, status)
            if (settled.status === 'failed') await notifyFailure(settled, 'Scheduled run failed')
          }
        } catch (error) {
          console.error('Scheduled run failed:', error)
          const failed = error instanceof ScheduleRunFailure ? error.occurrence : occurrence
          if (failed?.status === 'failed')
            await notifyFailure(failed, error instanceof Error ? error.message : String(error))
        }
      }
    })().finally(() => {
      ticking = undefined
      if (!stopped && !paused) {
        nextDueAt = now() + (options.intervalMs ?? 30_000)
        timer = setTimeout(() => {
          void tick().catch((error) => console.error('Schedule tick failed:', error))
        }, options.intervalMs ?? 30_000)
      }
    })
    return ticking
  }
  // A clean restoration re-arms the existing periodic check; it does not replay start/recover immediately.
  const resumeTimer = () => {
    if (stopped || !paused) return
    paused = false
    if (timer || ticking) return
    nextDueAt = now() + (options.intervalMs ?? 30_000)
    timer = setTimeout(() => {
      void tick().catch((error) => console.error('Schedule tick failed:', error))
    }, options.intervalMs ?? 30_000)
  }
  return {
    resumeTimer,
    async wakeDue() {
      if (stopped) throw new Error('SCHEDULE_CONTROLLER_STOPPED')
      paused = false
      await tick()
    },
    idleSnapshot() {
      return {
        stopped,
        paused,
        timer: timer !== undefined,
        nextDueAt,
        ticking: ticking !== undefined,
        recoveryCursor: recoveryCursor ? { ...recoveryCursor } : null,
      }
    },
    async start() {
      if (stopped) return
      paused = false
      await tick()
    },
    tick,
    async pause() {
      paused = true
      if (timer) clearTimeout(timer)
      timer = undefined
      nextDueAt = null
      await ticking
    },
    async close() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = undefined
      nextDueAt = null
      await ticking
    },
  }
}
