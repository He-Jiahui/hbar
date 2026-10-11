import type {
  SessionMessageProjection,
  SessionMessageRow,
  SessionTimelineSequenceItem,
  SessionToolRow,
} from './session-message-model'
import { buildMessageRows } from './session-message-model'
import { toolOutcomeCounts } from './session-tool-outcome-model'

export type SessionActivityRow = Extract<SessionMessageRow, { kind: 'thinking' | 'tool' }>
export type SessionActivityCategory =
  'tool' | 'file-read' | 'file-write' | 'file-edit' | 'terminal' | 'directory' | 'search'

export interface HbarMessageActivitySummary {
  readonly thinkingCount: number
  readonly toolCounts: readonly { readonly name: string; readonly displayName?: string; readonly count: number }[]
  readonly actionCounts: Readonly<Record<SessionActivityCategory, number>>
  readonly failedCount: number
  readonly outcomeCounts: ReturnType<typeof toolOutcomeCounts>
  /** Settled outcomes are the denominator; pending calls never acquire a success percentage. */
  readonly successRate: number | null
}

export function summarizeMessageActivity(
  rows: readonly SessionActivityRow[],
  describe: (row: SessionToolRow) => { readonly category: SessionActivityCategory; readonly displayName: string },
): HbarMessageActivitySummary {
  const tools: SessionToolRow[] = []
  const seen = new Set<string>()
  const toolCounts = new Map<string, { name: string; displayName?: string; count: number }>()
  const actionCounts: Record<SessionActivityCategory, number> = {
    tool: 0,
    'file-read': 0,
    'file-write': 0,
    'file-edit': 0,
    terminal: 0,
    directory: 0,
    search: 0,
  }
  let thinkingCount = 0
  for (const row of rows) {
    if (row.kind === 'thinking') {
      thinkingCount++
      continue
    }
    if (seen.has(row.id)) continue
    seen.add(row.id)
    tools.push(row)
    const { category, displayName } = describe(row)
    actionCounts[category]++
    const prior = toolCounts.get(row.name)
    if (prior) {
      prior.count++
      if (prior.displayName !== displayName) delete prior.displayName
    } else toolCounts.set(row.name, { name: row.name, displayName, count: 1 })
  }
  const outcomeCounts = toolOutcomeCounts(tools)
  const settled = tools.length - outcomeCounts.pending
  return {
    thinkingCount,
    toolCounts: [...toolCounts.values()],
    actionCounts,
    failedCount: outcomeCounts.failed,
    outcomeCounts,
    successRate:
      settled > 0 && outcomeCounts.pending === 0
        ? (outcomeCounts.succeeded + outcomeCounts['legacy-result']) / settled
        : null,
  }
}

export interface SessionCompletedActivityGroup {
  readonly kind: 'activityGroup'
  /** Reuse the first original message identity for timeline scrolling and incremental appends. */
  readonly id: string
  readonly projections: readonly SessionMessageProjection[]
  readonly rows: readonly SessionActivityRow[]
}

export type SessionActivitySequenceItem = SessionTimelineSequenceItem | SessionCompletedActivityGroup

/**
 * Group only the already loaded page, across original messages in one Session/Run.
 * Prose, attachments, lifecycle facts, streams and actionable decisions are boundaries.
 * Original messages/results remain untouched, including paged orphan results.
 */
export function groupCompletedSessionActivities(
  sequence: readonly SessionTimelineSequenceItem[],
  protectedMessage: (projection: SessionMessageProjection) => boolean = () => false,
): readonly SessionActivitySequenceItem[] {
  const result: SessionActivitySequenceItem[] = []
  let pending: SessionMessageProjection[] = []
  let activities: SessionActivityRow[] = []
  const flush = () => {
    const first = pending[0]
    if (first && pending.length > 1)
      result.push({ kind: 'activityGroup', id: first.message.id, projections: pending, rows: activities })
    else if (first) result.push({ kind: 'message', projection: first })
    pending = []
    activities = []
  }
  for (const item of sequence) {
    if (item.kind !== 'message') {
      flush()
      result.push(item)
      continue
    }
    const { projection } = item
    const rows = buildMessageRows(projection.blocks, projection.results)
    const eligible = rows.filter(
      (row): row is SessionActivityRow => row.kind === 'thinking' || (row.kind === 'tool' && Boolean(row.result)),
    )
    if (
      projection.message.role === 'user' ||
      projection.message.role === 'system' ||
      rows.length === 0 ||
      eligible.length !== rows.length ||
      protectedMessage(projection)
    ) {
      flush()
      result.push(item)
      continue
    }
    const previous = pending.at(-1)?.message
    if (
      previous &&
      (previous.runId !== projection.message.runId || previous.sessionId !== projection.message.sessionId)
    )
      flush()
    pending.push(projection)
    activities.push(...eligible)
  }
  flush()
  return result
}
