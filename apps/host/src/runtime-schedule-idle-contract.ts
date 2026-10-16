import { z } from 'zod'
import { scheduleIdleCheckpointSchema, type ScheduleIdleCheckpoint } from '@hbar/storage'
import { latestDueSchedule, previewSchedule } from '@hbar/kernel/controller'

const time = z.number().int().nonnegative().safe()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const scheduleIdleManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    snapshot: scheduleIdleCheckpointSchema,
    observedAt: time,
    nextDueAt: time.nullable(),
    nextSearchCheckAt: time,
  })
  .superRefine((value, context) => {
    if (value.snapshot.search.databaseId !== value.snapshot.database.id)
      context.addIssue({ code: 'custom', message: 'Search facts must belong to the same atomic database checkpoint' })
    if (value.nextSearchCheckAt !== value.observedAt + (value.snapshot.search.complete ? 60_000 : 1000))
      context.addIssue({ code: 'custom', message: 'Search inspection deadline must preserve the bounded cadence' })
    if (
      value.snapshot.coverage === 'complete' &&
      (value.nextDueAt === null || value.nextDueAt < value.observedAt || value.nextDueAt > value.nextSearchCheckAt)
    )
      context.addIssue({
        code: 'custom',
        message: 'Complete alarm coverage must retain the Search inspection deadline',
      })
  })
export type ScheduleIdleManifest = z.output<typeof scheduleIdleManifestSchema>
export const scheduleTransferAckSchema = z.strictObject({
  epoch: z.string().min(1).max(160),
  token: z.string().min(1).max(160),
  version: time,
  databaseId: digest,
  sourceRevision: digest,
  catalogRevision: digest,
})
export type ScheduleTransferAck = z.output<typeof scheduleTransferAckSchema>
export const scheduleTransferPrepareSchema = z.strictObject({ ack: scheduleTransferAckSchema })
export const scheduleWakeSchema = z.strictObject({ ack: scheduleTransferAckSchema })
export const scheduleWakeReplySchema = z.strictObject({
  kind: z.enum(['settled', 'changed']),
  manifest: scheduleIdleManifestSchema,
})
export type ScheduleWakeReply = z.output<typeof scheduleWakeReplySchema>

/** Same scheduling/coalescing semantics as the real due reader; no candidate record or write. */
export function projectScheduleIdleManifest(snapshot: ScheduleIdleCheckpoint, now: number): ScheduleIdleManifest {
  const nextSearchCheckAt = now + (snapshot.search.complete ? 60_000 : 1000)
  let nextDueAt: number | null = snapshot.activeOccurrences.length === 0 ? null : now + 30_000
  const include = (at: number): void => {
    nextDueAt = nextDueAt === null ? at : Math.min(nextDueAt, at)
  }
  if (snapshot.coverage === 'complete')
    for (const definition of snapshot.definitions) {
      const baseline = definition.runtime?.lastDueAt ?? definition.createdAt
      const latest = latestDueSchedule({ spec: definition.spec, timezone: definition.timezone, from: baseline }, now)
      const pending = definition.runtime?.pendingDueAt ?? null
      const candidate = latest === null ? pending : pending === null ? latest : Math.max(latest, pending)
      if (candidate !== null && candidate > baseline) {
        include(Math.max(now, candidate))
        if (candidate > now) continue
      }
      if (definition.spec.kind === 'once') {
        if (definition.spec.at > Math.max(now, baseline)) include(definition.spec.at)
      } else {
        const next = previewSchedule(
          {
            spec: definition.spec,
            timezone: definition.timezone,
            from: Math.max(now, baseline),
          },
          now,
        )[0]
        if (next !== undefined) include(next)
      }
    }
  return scheduleIdleManifestSchema.parse({
    schemaVersion: 1,
    snapshot,
    observedAt: now,
    nextSearchCheckAt,
    nextDueAt: snapshot.coverage === 'complete' ? Math.min(nextDueAt ?? nextSearchCheckAt, nextSearchCheckAt) : null,
  })
}

export function sameScheduleSource(left: ScheduleIdleManifest, right: ScheduleIdleManifest): boolean {
  return (
    left.snapshot.coverage === 'complete' &&
    right.snapshot.coverage === 'complete' &&
    left.snapshot.database.id === right.snapshot.database.id &&
    left.snapshot.database.schemaVersion === right.snapshot.database.schemaVersion &&
    left.snapshot.database.sourceRevision === right.snapshot.database.sourceRevision
  )
}
