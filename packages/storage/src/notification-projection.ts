import { z } from 'zod'
import { idSchema, runSchema, type SessionEvent } from '@hbar/contracts'
import { notificationRecordSchema, type NotificationRecord } from '@hbar/contracts/commands/notifications'
import type { ScheduleOccurrence } from '@hbar/contracts/commands/schedules'

const pendingApprovalSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  runId: idSchema,
  status: z.literal('pending'),
})

/** Projects committed session facts; the caller owns the event's SQLite transaction. */
export function notificationFromSessionEvent(event: SessionEvent, workspaceId: string): NotificationRecord | null {
  const base = {
    id: event.eventId,
    sourceEventId: event.eventId,
    createdAt: event.time,
    readAt: null,
  }
  if (event.type === 'run.settled') {
    const parsed = z.object({ run: runSchema }).safeParse(event.data)
    if (!parsed.success) return null
    const run = parsed.data.run
    if (run.sessionId !== event.sessionId || run.id !== event.runId) return null
    if (run.status !== 'completed' && run.status !== 'failed') return null
    return notificationRecordSchema.parse({
      ...base,
      kind: run.status === 'completed' ? 'run.completed' : 'run.failed',
      title: run.status === 'completed' ? 'Run completed' : 'Run failed',
      detail: (run.error ?? '').slice(0, 4_000),
      target: { kind: 'session', workspaceId, sessionId: event.sessionId, runId: run.id },
    })
  }
  if (event.type === 'approval.requested') {
    const parsed = pendingApprovalSchema.safeParse(event.data)
    if (!parsed.success) return null
    const approval = parsed.data
    if (approval.sessionId !== event.sessionId || approval.runId !== event.runId) return null
    return notificationRecordSchema.parse({
      ...base,
      kind: 'approval.pending',
      title: 'Approval required',
      detail: 'A run is waiting for approval.',
      target: {
        kind: 'approval',
        workspaceId,
        sessionId: event.sessionId,
        runId: approval.runId,
        approvalId: approval.id,
      },
    })
  }
  return null
}

export function notificationFromScheduleOccurrence(occurrence: ScheduleOccurrence): NotificationRecord | null {
  if (occurrence.status !== 'failed') return null
  const sourceEventId = `schedule:${occurrence.id}:failed`
  return notificationRecordSchema.parse({
    id: sourceEventId,
    sourceEventId,
    kind: 'schedule.failed',
    title: 'Scheduled run failed',
    detail: (occurrence.error ?? '').slice(0, 4_000),
    createdAt: occurrence.updatedAt,
    readAt: null,
    target: { kind: 'schedule', scheduleId: occurrence.scheduleId, occurrenceId: occurrence.id },
  })
}
