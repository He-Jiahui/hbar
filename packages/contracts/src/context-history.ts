import { z } from 'zod'

const count = z.number().int().nonnegative()
const duration = z.number().nonnegative()
export const contextCompactionTriggerSchema = z.enum(['automatic', 'manual'])
export type ContextCompactionTrigger = z.output<typeof contextCompactionTriggerSchema>
export const MAX_CONTEXT_COMPACTION_MARKERS = 1_000

/** Small, completed conversation facts, loaded alongside the paged messages; no summary body. */
export const contextCompactionMarkerSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  seq: count,
  time: count,
  trigger: contextCompactionTriggerSchema.nullable(),
})
export type ContextCompactionMarker = z.output<typeof contextCompactionMarkerSchema>
const tokens = z.strictObject({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  requests: count,
  recorded: count,
})

/** Usage is cumulative provider accounting; context lengths are separate Host estimates. */
export const contextWindowStatsSchema = z.strictObject({
  fromSeq: count,
  throughSeq: count,
  startedAt: count,
  endedAt: count,
  wallDurationMs: duration,
  executionMs: duration,
  turns: count,
  runs: count,
  usage: tokens,
  tools: z.strictObject({
    total: count,
    succeeded: count,
    failed: count,
    denied: count,
    cancelled: count,
    interrupted: count,
    unknown: count,
    pending: count,
    successRate: z.number().min(0).max(1).nullable(),
  }),
  files: z.strictObject({ reads: count, writes: count, readPaths: count, writtenPaths: count }),
})

export const contextCompactionRecordSchema = z.strictObject({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  /** Older journal records have no trigger; their provenance must stay unknown. */
  trigger: contextCompactionTriggerSchema.optional(),
  seq: count,
  window: count.positive(),
  modelId: z.string().min(1),
  status: z.enum(['running', 'completed', 'failed', 'cancelled', 'interrupted']),
  startedAt: count,
  endedAt: count.nullable(),
  durationMs: duration.nullable(),
  estimated: z.literal(true),
  contextWindow: count.positive(),
  beforeTokens: count,
  afterTokens: count.nullable(),
  summaryTokens: count.nullable(),
  retainedMessages: count.nullable(),
  chunks: count,
  errorCode: z.string().min(1).nullable(),
  stats: contextWindowStatsSchema,
  compactionUsage: tokens,
})

/** Newest first, at most 20 records per page; the cursor refers to the durable start sequence. */
export const contextHistoryInputSchema = z.strictObject({
  sessionId: z.string().min(1),
  before: count.positive().optional(),
  limit: count.min(1).max(20).default(10),
})
export const contextHistoryPageSchema = z.strictObject({
  sessionId: z.string().min(1),
  current: contextWindowStatsSchema,
  records: z.array(contextCompactionRecordSchema).max(20),
  before: count.positive().nullable(),
  hasOlder: z.boolean(),
})
export type ContextWindowStats = z.output<typeof contextWindowStatsSchema>
export type ContextCompactionRecord = z.output<typeof contextCompactionRecordSchema>
export type ContextHistoryInput = z.input<typeof contextHistoryInputSchema>
export type ContextHistoryPage = z.output<typeof contextHistoryPageSchema>

export function parseContextCompactionEvent(event: { type: string; data: unknown; sessionId: string; seq: number }) {
  if (!['context.compaction.started', 'context.compacted', 'context.compaction.settled'].includes(event.type))
    return null
  const data = z.object({ compaction: contextCompactionRecordSchema }).safeParse(event.data)
  if (!data.success || data.data.compaction.sessionId !== event.sessionId || data.data.compaction.seq > event.seq)
    return null
  const record = data.data.compaction
  if (event.type === 'context.compaction.started' && (record.status !== 'running' || record.seq !== event.seq))
    return null
  if (event.type === 'context.compacted' && record.status !== 'completed') return null
  if (event.type === 'context.compaction.settled' && ['running', 'completed'].includes(record.status)) return null
  return record
}

export function parseContextCompactionMarker(event: {
  type: string
  data: unknown
  sessionId: string
  seq: number
  eventId: string
  time: number
}): ContextCompactionMarker | null {
  if (event.type !== 'context.compacted') return null
  const envelope = z.object({ compaction: z.unknown().optional() }).safeParse(event.data)
  if (!envelope.success) return null
  const record = parseContextCompactionEvent(event)
  if (envelope.data.compaction !== undefined && !record) return null
  if (
    !record &&
    !z.object({ throughSeq: count, summary: z.string(), modelId: z.string().min(1) }).safeParse(event.data).success
  )
    return null
  const marker = contextCompactionMarkerSchema.safeParse({
    id: record?.id ?? event.eventId,
    sessionId: event.sessionId,
    seq: event.seq,
    time: event.time,
    trigger: record?.trigger ?? null,
  })
  return marker.success ? marker.data : null
}
