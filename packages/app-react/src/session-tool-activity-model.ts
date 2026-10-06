import {
  toolBatchEventSchema,
  toolExecutionEventSchema,
  type ToolBatchProgress,
  type ToolExecution,
} from '@hbar/contracts'
import type { SessionTimelineState } from '@hbar/app-runtime'
import type { SessionToolRow } from './session-message-model'

export interface SessionToolActivity {
  readonly callId: string
  readonly execution?: ToolExecution
  readonly batch?: ToolBatchProgress
  readonly active: boolean
  readonly pending?: boolean
  readonly observedAt: number
  readonly elapsedAtObservation?: number
}
export type SessionToolActivities = ReadonlyMap<string, SessionToolActivity>
export const EMPTY_TOOL_ACTIVITIES: SessionToolActivities = new Map<string, SessionToolActivity>()
export interface ToolActivityCounts {
  readonly total: number
  readonly settled: number
  readonly running: number
  readonly pending: number
  readonly skipped: number
  readonly unknown: number
}
export function toolActivityKey(callId: string, name: string): string {
  return JSON.stringify([callId, name])
}

/** Typed read-only projection, scoped by Session/Run/call/tool; UI never reads plugin output for progress. */
export function projectToolActivities(
  timeline: Pick<SessionTimelineState, 'sessionId' | 'messages' | 'runs' | 'toolEvents' | 'toolClock'>,
  connected: boolean,
): ReadonlyMap<string, SessionToolActivities> {
  const byRun = new Map<string, Map<string, SessionToolActivity>>()
  const batches = new Map<string, ToolBatchProgress>()
  const latest = new Map<string, number>()
  for (const message of timeline.messages) {
    if (message.sessionId !== timeline.sessionId) continue
    const run = timeline.runs.find((item) => item.id === message.runId && item.sessionId === timeline.sessionId)
    const pending = connected && (run?.status === 'running' || run?.status === 'waiting_approval')
    for (const call of message.content) {
      if (call.type !== 'tool_call') continue
      const values = byRun.get(message.runId) ?? new Map<string, SessionToolActivity>()
      byRun.set(message.runId, values)
      values.set(toolActivityKey(call.callId, call.name), {
        callId: call.callId,
        active: false,
        pending,
        observedAt: 0,
      })
    }
  }
  const events = [...(timeline.toolEvents ?? [])].sort((a, b) => a.seq - b.seq)
  for (const event of events) {
    if (event.sessionId !== timeline.sessionId || !event.runId) continue
    if (event.type === 'tool.sequence_progress') {
      const parsed = toolBatchEventSchema.safeParse(event.data)
      if (parsed.success) batches.set(JSON.stringify([event.runId, parsed.data.parentCallId]), parsed.data.progress)
    } else if (event.type === 'tool.execution') {
      const parsed = toolExecutionEventSchema.safeParse(event.data)
      if (!parsed.success) continue
      const { callId, name, execution } = parsed.data
      const key = toolActivityKey(callId, name)
      const identity = JSON.stringify([event.runId, key])
      if ((latest.get(identity) ?? -1) >= event.seq) continue
      latest.set(identity, event.seq)
      const values = byRun.get(event.runId) ?? new Map<string, SessionToolActivity>()
      byRun.set(event.runId, values)
      const run = timeline.runs.find((item) => item.id === event.runId && item.sessionId === timeline.sessionId)
      const active =
        connected &&
        execution.endedAt === undefined &&
        (run?.status === 'running' || run?.status === 'waiting_approval')
      const clock = timeline.toolClock
      values.set(key, {
        callId,
        execution,
        active,
        observedAt: clock?.receivedAt ?? 0,
        elapsedAtObservation: execution.elapsedMs + (active && clock ? Math.max(0, clock.hostTime - event.time) : 0),
      })
    }
  }
  for (const [runId, values] of byRun)
    for (const [key, activity] of values) {
      const batch = batches.get(JSON.stringify([runId, activity.callId]))
      if (batch) values.set(key, { ...activity, batch })
    }
  return byRun
}

export function rowToolActivity(
  row: SessionToolRow,
  activities?: SessionToolActivities,
): SessionToolActivity | undefined {
  const callId = row.call?.callId ?? row.result?.callId
  const live = callId ? activities?.get(toolActivityKey(callId, row.name)) : undefined
  if (row.result) {
    // Terminal result wins over an earlier live event, including crash recovery with unknown timing.
    return row.result.execution || row.result.batch
      ? {
          callId: row.result.callId,
          active: false,
          observedAt: 0,
          ...(row.result.execution && { execution: row.result.execution }),
          ...(row.result.batch && { batch: row.result.batch }),
        }
      : undefined
  }
  return live
}

export function activityCounts(
  rows: readonly SessionToolRow[],
  activities?: SessionToolActivities,
): ToolActivityCounts {
  let settled = 0,
    running = 0,
    pending = 0,
    unknown = 0
  for (const row of rows) {
    if (row.result) settled++
    else if (rowToolActivity(row, activities)?.active) running++
    else if (!activities || rowToolActivity(row, activities)?.pending) pending++
    else unknown++
  }
  return { total: rows.length, settled, running, pending, skipped: 0, unknown }
}

export function toolElapsed(activity: SessionToolActivity, now: number): number | undefined {
  if (!activity.execution) return undefined
  return activity.execution.endedAt !== undefined
    ? activity.execution.elapsedMs
    : (activity.elapsedAtObservation ?? activity.execution.elapsedMs) +
        (activity.active && activity.observedAt > 0 ? Math.max(0, now - activity.observedAt) : 0)
}
