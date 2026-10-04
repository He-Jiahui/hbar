import { CronExpressionParser } from 'cron-parser'
import { HbarError } from '@hbar/contracts'
import type {
  ScheduleCreateInput,
  ScheduleDefinition,
  ScheduleOccurrence,
  SchedulePreviewInput,
  ScheduleUpdateInput,
} from '@hbar/contracts/commands/schedules'

export interface ScheduleStore {
  list(
    workspaceId: string,
    after: string | null,
    limit: number,
  ): Promise<{ items: ScheduleDefinition[]; next: string | null; revision: number }>
  get(scheduleId: string): Promise<ScheduleDefinition | null>
  create(
    input: ScheduleCreateInput,
    identity?: { actorId: string; idempotencyKey: string },
  ): Promise<ScheduleDefinition>
  update(
    input: ScheduleUpdateInput,
    identity?: { actorId: string; idempotencyKey: string },
  ): Promise<ScheduleDefinition>
  delete(
    scheduleId: string,
    expectedRevision: number,
    identity?: { actorId: string; idempotencyKey: string },
  ): Promise<{ scheduleId: string; revision: number }>
  occurrences(
    scheduleId: string,
    after: string | null,
    limit: number,
  ): Promise<{ items: ScheduleOccurrence[]; next: string | null }>
  claim(scheduleId: string, dueAt: number, now: number): Promise<ScheduleOccurrence | null>
  transition(
    occurrenceId: string,
    status: ScheduleOccurrence['status'],
    runId?: string,
    error?: string,
    sessionId?: string,
  ): Promise<ScheduleOccurrence>
}

const five = 5
export function previewSchedule(input: SchedulePreviewInput, now = Date.now()): number[] {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(new Date(now))
    if (input.spec.kind === 'once') {
      if (input.spec.at <= now) throw new HbarError('INVALID_INPUT', 'One-time schedule must be in the future')
      return [input.spec.at]
    }
    const expression =
      input.spec.kind === 'cron'
        ? input.spec.expression
        : input.spec.kind === 'daily'
          ? `${input.spec.minute} ${input.spec.hour} * * *`
          : `${input.spec.minute} ${input.spec.hour} * * ${input.spec.weekdays.join(',')}`
    if (expression.trim().split(/\s+/).length !== 5)
      throw new HbarError('INVALID_INPUT', 'Cron expression must contain exactly five fields')
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(input.from ?? now),
      tz: input.timezone,
    })
    return Array.from({ length: five }, () => interval.next().getTime())
  } catch (error) {
    if (error instanceof HbarError) throw error
    throw new HbarError('INVALID_INPUT', 'Invalid schedule expression or timezone')
  }
}

export function latestDueSchedule(input: SchedulePreviewInput, now = Date.now()): number | null {
  if (input.spec.kind === 'once')
    return input.spec.at <= now && input.spec.at >= (input.from ?? 0) ? input.spec.at : null
  const expression =
    input.spec.kind === 'cron'
      ? input.spec.expression
      : input.spec.kind === 'daily'
        ? `${input.spec.minute} ${input.spec.hour} * * *`
        : `${input.spec.minute} ${input.spec.hour} * * ${input.spec.weekdays.join(',')}`
  try {
    if (expression.trim().split(/\s+/).length !== 5) throw new Error('field count')
    const interval = CronExpressionParser.parse(expression, { currentDate: new Date(now + 1), tz: input.timezone })
    let latest = interval.prev().getTime()
    if (latest > now)
      latest = CronExpressionParser.parse(expression, { currentDate: new Date(now), tz: input.timezone })
        .prev()
        .getTime()
    return latest <= now && latest >= (input.from ?? 0) ? latest : null
  } catch (error) {
    if (error instanceof HbarError) throw error
    throw new HbarError('INVALID_INPUT', 'Invalid schedule expression or timezone')
  }
}

export function createScheduleService(store: ScheduleStore) {
  return {
    list: (workspaceId: string, after: string | null, limit: number) =>
      store.list(workspaceId, after, Math.min(100, Math.max(1, limit))),
    get: (scheduleId: string) => store.get(scheduleId),
    create: async (input: ScheduleCreateInput, identity?: { actorId: string; idempotencyKey: string }) => {
      previewSchedule({ spec: input.spec, timezone: input.timezone })
      return store.create(input, identity)
    },
    update: async (input: ScheduleUpdateInput, identity?: { actorId: string; idempotencyKey: string }) => {
      const current = await store.get(input.scheduleId)
      const unchangedOnce =
        input.spec.kind === 'once' &&
        current?.spec.kind === 'once' &&
        input.spec.at === current.spec.at &&
        input.timezone === current.timezone
      if (!unchangedOnce) previewSchedule({ spec: input.spec, timezone: input.timezone })
      return store.update(input, identity)
    },
    delete: (scheduleId: string, expectedRevision: number, identity?: { actorId: string; idempotencyKey: string }) =>
      store.delete(scheduleId, expectedRevision, identity),
    preview: (input: SchedulePreviewInput) => ({ occurrences: previewSchedule(input), timezone: input.timezone }),
    occurrences: (scheduleId: string, after: string | null, limit: number) =>
      store.occurrences(scheduleId, after, Math.min(100, Math.max(1, limit))),
    claim: (scheduleId: string, dueAt: number, now = Date.now()) => store.claim(scheduleId, dueAt, now),
    transition: (
      occurrenceId: string,
      status: ScheduleOccurrence['status'],
      runId?: string,
      error?: string,
      sessionId?: string,
    ) => store.transition(occurrenceId, status, runId, error, sessionId),
  }
}
export type ScheduleService = ReturnType<typeof createScheduleService>
