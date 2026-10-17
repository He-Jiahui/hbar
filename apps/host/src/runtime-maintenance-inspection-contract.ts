import { z } from 'zod'
import { runtimeOwnerSchema } from '@hbar/contracts/runtime'
import { chatDatabaseInspectionCheckpointSchema } from '@hbar/kernel/maintenance'
import { chatDatabaseActiveJournalProofSchema } from '@hbar/storage'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.string().min(1).max(160)
export const maintenanceInspectionSourceSchema = z.strictObject({ databaseId: digest, catalogRevision: digest })
export const maintenanceInspectionManifestSchema = z
  .strictObject({
    version: z.literal(1),
    coverage: z.literal('periodic-inspection'),
    source: maintenanceInspectionSourceSchema,
    checkpoint: chatDatabaseInspectionCheckpointSchema,
    journal: chatDatabaseActiveJournalProofSchema,
  })
  .refine((value) => value.source.databaseId === value.journal.databaseId, { message: 'Maintenance source mismatch' })
export const maintenanceInspectionAckSchema = z.strictObject({
  epoch: id,
  token: z.string().uuid(),
  version: z.number().int().positive().safe(),
  source: maintenanceInspectionSourceSchema,
})
export const maintenanceInspectionCommitSchema = z.strictObject({
  ack: maintenanceInspectionAckSchema,
  owner: runtimeOwnerSchema,
})
export const maintenanceInspectionLifecycleGuardSchema = z.strictObject({ epoch: id, owner: runtimeOwnerSchema })
export type MaintenanceInspectionLifecycleGuard = z.infer<typeof maintenanceInspectionLifecycleGuardSchema>
export const maintenanceInspectionRestoreSchema = z.strictObject({
  ack: maintenanceInspectionAckSchema,
  checkpoint: chatDatabaseInspectionCheckpointSchema,
})
export const maintenanceInspectionWakeReplySchema = z.strictObject({
  ack: maintenanceInspectionAckSchema,
  owner: runtimeOwnerSchema,
  checkpoint: chatDatabaseInspectionCheckpointSchema,
  timerArmed: z.literal(true),
})
export type MaintenanceInspectionManifest = z.infer<typeof maintenanceInspectionManifestSchema>
export type MaintenanceInspectionAck = z.infer<typeof maintenanceInspectionAckSchema>
export type MaintenanceInspectionCommit = z.infer<typeof maintenanceInspectionCommitSchema>
export type MaintenanceInspectionWakeReply = z.infer<typeof maintenanceInspectionWakeReplySchema>
export function sameMaintenanceAck(left: MaintenanceInspectionAck, right: MaintenanceInspectionAck): boolean {
  return (
    left.epoch === right.epoch &&
    left.token === right.token &&
    left.version === right.version &&
    left.source.databaseId === right.source.databaseId &&
    left.source.catalogRevision === right.source.catalogRevision
  )
}
export function completeEmptyMaintenanceJournal(value: MaintenanceInspectionManifest): boolean {
  return (
    value.journal.empty &&
    Object.values(value.journal.counts).every((count) => count === 0) &&
    value.journal.firstActiveId === null &&
    value.checkpoint.nextCheckAt !== null
  )
}
