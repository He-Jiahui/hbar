import type { ScheduleOccurrence } from '@hbar/contracts/commands/schedules'
import {
  createScheduleRunner,
  ScheduleRunFailure,
  type ScheduleExecutionPort,
  type ScheduleService,
} from '@hbar/kernel'
import { operationSnapshotSchema, runAcceptedSchema, submitRunInputSchema } from '@hbar/contracts/commands/run'

export interface ScheduleHostReader {
  enabledSchedules(after: string | null, limit: number): Promise<readonly { id: string }[]>
  activeScheduleOccurrences(limit: number): Promise<readonly ScheduleOccurrence[]>
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
  actorId: string
  prepareSession(input: {
    scheduleId: string
    workspaceId: string
    target: 'new-session' | 'existing-session'
    sessionId?: string
    occurrenceId: string
  }): Promise<{ sessionId: string }>
  intervalMs?: number
  now?: () => number
  onFailure?: (input: { scheduleId: string; occurrenceId: string; error: string }) => Promise<void> | void
}

export function createScheduleHostController(options: ScheduleHostControllerOptions) {
  const now = options.now ?? Date.now
  const execution: ScheduleExecutionPort = {
    actorId: options.actorId,
    async prepare(input) {
      return options.prepareSession(input)
    },
    async submit(input) {
      const runInput = submitRunInputSchema.parse({
        sessionId: input.sessionId,
        modelId: input.modelId,
        input: { text: input.input, images: [], source: 'user' },
      })
      const result = runAcceptedSchema.parse(
        await options.runCommands.execute('run.submit', runInput, {
          actorId: options.actorId,
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
    ...(options.runCommands.getReceipt
      ? {
          getReceipt: (input: { sessionId: string; actorId: string; idempotencyKey: string }) =>
            options.runCommands.getReceipt!('run.submit', input.sessionId, input.actorId, input.idempotencyKey),
        }
      : {}),
  }
  const runner = createScheduleRunner(options.service, execution, { maxActive: 2 })
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let ticking: Promise<void> | undefined
  const notifiedFailures = new Set<string>()
  const tick = async () => {
    if (stopped || ticking) return ticking
    ticking = (async () => {
      const timestamp = now()
      const recoveredFailures = await runner.recover(await options.reader.activeScheduleOccurrences(64))
      for (const failed of recoveredFailures)
        if (!notifiedFailures.has(failed.id)) {
          notifiedFailures.add(failed.id)
          await options.onFailure?.({ scheduleId: failed.scheduleId, occurrenceId: failed.id, error: failed.error ?? 'Scheduled run failed' })
        }
      const due = await options.reader.dueScheduleOccurrences(timestamp, 32)
      for (const item of due) {
        let occurrence: ScheduleOccurrence | null = null
        try {
          occurrence = await runner.runSchedule(item.scheduleId, item.dueAt, timestamp)
          if (!occurrence?.runId) continue
          const status = await execution.observeOperation(occurrence.runId)
          if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'interrupted')
            await runner.settle(occurrence.id, status)
        } catch (error) {
          console.error('Scheduled run failed:', error)
          const failed = error instanceof ScheduleRunFailure ? error.occurrence : occurrence
          if (failed?.status === 'failed')
            await options.onFailure?.({
              scheduleId: item.scheduleId,
              occurrenceId: failed.id,
              error: error instanceof Error ? error.message : String(error),
            })
        }
      }
    })().finally(() => {
      ticking = undefined
      if (!stopped)
        timer = setTimeout(() => {
          void tick().catch((error) => console.error('Schedule tick failed:', error))
        }, options.intervalMs ?? 30_000)
    })
    return ticking
  }
  return {
    async start() {
      await runner.recover(await options.reader.activeScheduleOccurrences(64))
      await tick()
    },
    tick,
    async close() {
      stopped = true
      if (timer) clearTimeout(timer)
      await ticking
    },
  }
}
