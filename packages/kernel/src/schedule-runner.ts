import type { ScheduleOccurrence } from '@hbar/contracts/commands/schedules'
import type { ScheduleService } from './schedule-service'
import { HbarError } from '@hbar/contracts'
import type { ScheduleExecution } from '@hbar/contracts/schedule-execution'

export interface SchedulePrepareInput {
  scheduleId: string
  workspaceId: string
  target: 'new-session' | 'existing-session'
  sessionId?: string
  occurrenceId: string
  actorId: string
}
export interface ScheduleSubmitInput {
  sessionId: string
  input: string
  modelId: string
  idempotencyKey: string
  occurrenceId: string
  actorId: string
}

export type ScheduleOperationStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'guided'
  | 'cancelRequested'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown'
export interface ScheduleExecutionPort {
  prepare(input: SchedulePrepareInput): Promise<{ sessionId: string }>
  submit(input: ScheduleSubmitInput): Promise<{ operationId: string }>
  getReceipt?: (input: {
    sessionId: string
    actorId: string
    idempotencyKey: string
  }) => Promise<{ operationId: string } | null>
  observeOperation(operationId: string): Promise<ScheduleOperationStatus>
}

const terminal = new Set<ScheduleOperationStatus>(['completed', 'failed', 'cancelled', 'interrupted'])
const unknownError = (error: unknown) => (error instanceof Error ? error.message : String(error))
const isUnknownResult = (error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  return (
    ['RESULT_UNKNOWN', 'TIMEOUT', 'DISCONNECTED', 'CONNECTION_CLOSED', 'INVALID_OUTPUT'].includes(code) ||
    /unknown|timeout|timed out|disconnected/i.test(unknownError(error))
  )
}

export class ScheduleRunFailure extends Error {
  constructor(
    readonly occurrence: ScheduleOccurrence,
    message: string,
  ) {
    super(message)
    this.name = 'ScheduleRunFailure'
  }
}

export function createScheduleRunner(
  service: Pick<ScheduleService, 'get' | 'execution' | 'claim' | 'transition'>,
  execution: ScheduleExecutionPort,
  options: { maxActive?: number } = {},
) {
  const maxActive = Math.max(1, options.maxActive ?? 2)
  let active = 0
  const inFlight = new Set<string>()
  const release = (scheduleId: string) => {
    if (inFlight.delete(scheduleId)) active = Math.max(0, active - 1)
  }
  const reserve = (scheduleId: string) => {
    if (active >= maxActive || inFlight.has(scheduleId)) return false
    active++
    inFlight.add(scheduleId)
    return true
  }
  async function frozen(occurrence: ScheduleOccurrence): Promise<ScheduleExecution> {
    const value = await service.execution(occurrence.id)
    if (!value || value.occurrenceId !== occurrence.id || value.schedule.id !== occurrence.scheduleId)
      throw new HbarError(
        'SCHEDULE_AUTHORIZATION_REQUIRED',
        'This occurrence needs its original authorized schedule revision',
      )
    return value
  }
  return {
    async runSchedule(scheduleId: string, dueAt: number, now = Date.now()): Promise<ScheduleOccurrence | null> {
      if (!reserve(scheduleId)) return null
      let occurrence: ScheduleOccurrence | null = null
      let keepClaim = false
      let reconciling = false
      try {
        const schedule = await service.get(scheduleId)
        if (!schedule || !schedule.enabled) return null
        occurrence = await service.claim(scheduleId, dueAt, now)
        if (!occurrence) return null
        if (occurrence.status === 'completed' || occurrence.status === 'failed' || occurrence.status === 'cancelled')
          return occurrence
        if (occurrence.runId) {
          keepClaim = true
          return occurrence
        }
        reconciling = Boolean(occurrence.sessionId)
        const admitted = await frozen(occurrence)
        const original = admitted.schedule
        // A durable receipt closes the crash window where submit succeeded before its operation id was persisted.
        if (occurrence.sessionId) {
          const receipt = await execution.getReceipt?.({
            sessionId: occurrence.sessionId,
            actorId: admitted.authorization.actorId,
            idempotencyKey: occurrence.idempotencyKey,
          })
          reconciling = false
          if (receipt) {
            keepClaim = true
            return await service.transition(
              occurrence.id,
              'running',
              receipt.operationId,
              undefined,
              occurrence.sessionId,
            )
          }
          return await service.transition(
            occurrence.id,
            'unknown',
            undefined,
            'Run receipt is unavailable; inspect before retrying',
            occurrence.sessionId,
          )
        }
        reconciling = false
        if (occurrence.status === 'unknown') return occurrence
        const prepared = await execution.prepare({
          scheduleId,
          workspaceId: original.workspaceId,
          target: original.target.mode,
          occurrenceId: occurrence.id,
          actorId: admitted.authorization.actorId,
          ...(occurrence.sessionId
            ? { sessionId: occurrence.sessionId }
            : original.target.mode === 'existing-session'
              ? { sessionId: original.target.sessionId }
              : {}),
        })
        occurrence = await service.transition(
          occurrence.id,
          'running',
          occurrence.runId ?? undefined,
          undefined,
          prepared.sessionId,
        )
        if (occurrence.runId)
          return await service.transition(occurrence.id, 'running', occurrence.runId, undefined, prepared.sessionId)
        const accepted = await execution.submit({
          sessionId: prepared.sessionId,
          input: original.input,
          modelId: original.modelId,
          idempotencyKey: occurrence.idempotencyKey,
          occurrenceId: occurrence.id,
          actorId: admitted.authorization.actorId,
        })
        keepClaim = true
        return await service.transition(occurrence.id, 'running', accepted.operationId, undefined, prepared.sessionId)
      } catch (error) {
        const message = unknownError(error)
        if (occurrence) {
          const unknown = isUnknownResult(error) || reconciling
          occurrence = await service.transition(
            occurrence.id,
            unknown ? 'unknown' : 'failed',
            occurrence.runId ?? undefined,
            message,
            occurrence.sessionId ?? undefined,
          )
          throw new ScheduleRunFailure(occurrence, message)
        }
        throw error
      } finally {
        if (!keepClaim) release(scheduleId)
      }
    },
    async settle(occurrenceId: string, status: 'completed' | 'failed' | 'cancelled' | 'interrupted' = 'completed') {
      const occurrence = await service.transition(occurrenceId, status === 'interrupted' ? 'failed' : status)
      release(occurrence.scheduleId)
      return occurrence
    },
    async recover(occurrences: readonly ScheduleOccurrence[]): Promise<ScheduleOccurrence[]> {
      const failures: ScheduleOccurrence[] = []
      for (let occurrence of occurrences) {
        if (occurrence.status !== 'running' && occurrence.status !== 'unknown' && occurrence.status !== 'pending')
          continue
        if (active >= maxActive && !inFlight.has(occurrence.scheduleId)) continue
        if (!inFlight.has(occurrence.scheduleId)) {
          inFlight.add(occurrence.scheduleId)
          active++
        }
        let done = false
        const reconciling = Boolean(occurrence.sessionId && !occurrence.runId)
        try {
          if (!occurrence.runId && !occurrence.sessionId && occurrence.status === 'pending') {
            const schedule = await service.get(occurrence.scheduleId)
            if (!schedule || !schedule.enabled) {
              const failed = await service.transition(
                occurrence.id,
                'failed',
                undefined,
                'Schedule is unavailable for recovery',
              )
              failures.push(failed)
              done = true
              continue
            }
            const admitted = await frozen(occurrence)
            const original = admitted.schedule
            const prepared = await execution.prepare({
              scheduleId: original.id,
              workspaceId: original.workspaceId,
              target: original.target.mode,
              occurrenceId: occurrence.id,
              actorId: admitted.authorization.actorId,
              ...(original.target.mode === 'existing-session' ? { sessionId: original.target.sessionId } : {}),
            })
            occurrence = await service.transition(occurrence.id, 'running', undefined, undefined, prepared.sessionId)
            const accepted = await execution.submit({
              sessionId: prepared.sessionId,
              input: original.input,
              modelId: original.modelId,
              idempotencyKey: occurrence.idempotencyKey,
              occurrenceId: occurrence.id,
              actorId: admitted.authorization.actorId,
            })
            await service.transition(occurrence.id, 'running', accepted.operationId, undefined, prepared.sessionId)
            continue
          }
          if (!occurrence.runId) {
            if (occurrence.sessionId && execution.getReceipt) {
              const admitted = await frozen(occurrence)
              const receipt = await execution.getReceipt({
                sessionId: occurrence.sessionId,
                actorId: admitted.authorization.actorId,
                idempotencyKey: occurrence.idempotencyKey,
              })
              if (receipt) {
                await service.transition(occurrence.id, 'running', receipt.operationId, undefined, occurrence.sessionId)
                done = false
              } else {
                await service.transition(
                  occurrence.id,
                  'unknown',
                  undefined,
                  'Run receipt is unavailable; inspect before retrying',
                  occurrence.sessionId,
                )
                done = true
              }
            } else {
              // No durable session or receipt means there is no safe replay target; keep the
              // occurrence unknown for operator inspection while releasing the process guard.
              done = true
            }
            continue
          }
          const status = await execution.observeOperation(occurrence.runId)
          if (status === 'unknown') {
            await service.transition(
              occurrence.id,
              'unknown',
              occurrence.runId,
              'Operation result is unknown',
              occurrence.sessionId ?? undefined,
            )
            done = true
          } else if (terminal.has(status)) {
            const settled: ScheduleOccurrence = await service.transition(
              occurrence.id,
              status === 'interrupted'
                ? 'failed'
                : status === 'completed'
                  ? 'completed'
                  : status === 'failed'
                    ? 'failed'
                    : 'cancelled',
              occurrence.runId,
              undefined,
              occurrence.sessionId ?? undefined,
            )
            if (settled.status === 'failed') failures.push(settled)
            done = true
          } else
            await service.transition(
              occurrence.id,
              'running',
              occurrence.runId,
              undefined,
              occurrence.sessionId ?? undefined,
            )
        } catch (error) {
          const message = unknownError(error)
          const result = await service.transition(
            occurrence.id,
            isUnknownResult(error) || reconciling ? 'unknown' : 'failed',
            occurrence.runId ?? undefined,
            message,
            occurrence.sessionId ?? undefined,
          )
          if (result.status === 'failed') failures.push(result)
          done = true
        } finally {
          if (done) release(occurrence.scheduleId)
        }
      }
      return failures
    },
  }
}
