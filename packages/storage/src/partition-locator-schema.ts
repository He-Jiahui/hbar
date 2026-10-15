import { z } from 'zod'
import { partitionIdSchema } from './partition-layout'

export const locatorEntityIdSchema = z.string().min(1).max(160)
const revision = z.number().int().positive().safe()
export const partitionAddressSchema = z.strictObject({
  generation: partitionIdSchema,
  projectPartitionId: partitionIdSchema,
  partitionId: partitionIdSchema,
  incarnation: partitionIdSchema,
})
export const projectLocatorSchema = z.strictObject({
  workspaceId: locatorEntityIdSchema,
  generation: partitionIdSchema,
  projectPartitionId: partitionIdSchema,
  revision,
})
export const sessionLocatorSchema = z.strictObject({
  sessionId: locatorEntityIdSchema,
  workspaceId: locatorEntityIdSchema,
  address: partitionAddressSchema,
  sourceEpoch: partitionIdSchema,
  revision,
  state: z.enum(['staging', 'active', 'moving', 'tombstone']),
})
export const entityLocatorSchema = z.strictObject({
  kind: z.enum(['run', 'approval', 'message', 'recoveryChain']),
  id: locatorEntityIdSchema,
  sessionId: locatorEntityIdSchema,
  address: partitionAddressSchema,
  sourceEpoch: partitionIdSchema,
  sourceRevision: revision,
})
export type PartitionAddress = z.output<typeof partitionAddressSchema>
export type ProjectLocator = z.output<typeof projectLocatorSchema>
export type SessionLocator = z.output<typeof sessionLocatorSchema>
export type EntityLocator = z.output<typeof entityLocatorSchema>
export type LocatorResolution =
  | { readonly status: 'active'; readonly session: SessionLocator }
  | { readonly status: 'missing' | 'recovering' | 'tombstoned' | 'wrong-generation' }
