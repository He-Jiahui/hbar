import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'

const id = z.string().min(1).max(160)
const ownerKey = z.string().min(1).max(200)
const revision = z.number().int().nonnegative().safe()
export const chatDatabaseDraftOwnerInputSchema = z
  .strictObject({
    id,
    kind: z.enum(['session', 'preSession', 'appearance']),
    artifactIds: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(24)
      .refine((ids) => new Set(ids).size === ids.length),
    pendingArtifactIds: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(24)
      .default([]),
    clientRevision: revision.default(0),
  })
  .refine(
    (owner) =>
      new Set([...owner.artifactIds, ...owner.pendingArtifactIds]).size ===
        owner.artifactIds.length + owner.pendingArtifactIds.length &&
      owner.artifactIds.length + owner.pendingArtifactIds.length <= 24,
    'Owner references must be unique and bounded to 24',
  )
export type ChatDatabaseDraftOwnerInput = z.output<typeof chatDatabaseDraftOwnerInputSchema>
export const chatDatabaseDraftOwnerSchema = chatDatabaseDraftOwnerInputSchema.safeExtend({
  revision,
  updatedAt: revision,
})
export const chatDatabaseUploadOwnerSchema = z.strictObject({
  id,
  kind: z.enum(['session', 'preSession', 'appearance']),
  clientRevision: revision,
})
export type ChatDatabaseUploadOwner = z.output<typeof chatDatabaseUploadOwnerSchema>
export type ChatDatabaseDraftOwner = z.output<typeof chatDatabaseDraftOwnerSchema>
export const chatDatabaseDraftSyncInputSchema = z.strictObject({
  owner: chatDatabaseDraftOwnerInputSchema,
  expectedRevision: revision,
})
export type ChatDatabaseDraftSyncInput = z.output<typeof chatDatabaseDraftSyncInputSchema>
export const chatDatabaseDraftPageSchema = z.strictObject({
  items: z.array(chatDatabaseDraftOwnerSchema).max(100),
  next: ownerKey.nullable(),
})
const manifest = z
  .array(ownerKey)
  .max(1000)
  .refine((ids) => new Set(ids).size === ids.length)
export const chatDatabaseInventoryBeginInputSchema = z.strictObject({ inventoryId: id, ownerIds: manifest })
export type ChatDatabaseInventoryBeginInput = z.output<typeof chatDatabaseInventoryBeginInputSchema>
export const chatDatabaseInventoryFinishInputSchema = z.strictObject({
  inventoryId: id,
  ownerRevisions: z.record(ownerKey, revision).refine((items) => Object.keys(items).length <= 1000),
})
export type ChatDatabaseInventoryFinishInput = z.output<typeof chatDatabaseInventoryFinishInputSchema>
export const chatDatabaseInventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  complete: z.boolean(),
  inventoryId: id.nullable(),
  revision: revision.default(0),
  updatedAt: revision,
})
export type ChatDatabaseInventory = z.output<typeof chatDatabaseInventorySchema>
const meta = (commandId: string, mutation = false): CommandMetadataInput => ({
  id: commandId,
  version: 1,
  owner: 'hbar.chat-database',
  kind: mutation ? 'command' : 'query',
  execution: 'host',
  stateEffect: mutation ? 'persistent' : 'none',
  scope: 'global',
  category: 'system.storage',
  titleKey: `commands.${commandId}.title`,
  descriptionKey: `commands.${commandId}.description`,
  surfaces: ['api'],
  ...(mutation ? { idempotency: 'required' as const } : {}),
})
export const chatDatabaseDraftCommands = {
  'chatDatabase.draft.sync': defineCommand(
    meta('chatDatabase.draft.sync', true),
    chatDatabaseDraftSyncInputSchema,
    chatDatabaseDraftOwnerSchema,
  ),
  'chatDatabase.draft.list': defineCommand(
    meta('chatDatabase.draft.list'),
    z.strictObject({ after: ownerKey.nullable().default(null), limit: z.number().int().min(1).max(100).default(50) }),
    chatDatabaseDraftPageSchema,
  ),
  'chatDatabase.inventory.begin': defineCommand(
    meta('chatDatabase.inventory.begin', true),
    chatDatabaseInventoryBeginInputSchema,
    chatDatabaseInventorySchema,
  ),
  'chatDatabase.inventory.finish': defineCommand(
    meta('chatDatabase.inventory.finish', true),
    chatDatabaseInventoryFinishInputSchema,
    chatDatabaseInventorySchema,
  ),
  'chatDatabase.inventory.get': defineCommand(
    meta('chatDatabase.inventory.get'),
    z.strictObject({}),
    chatDatabaseInventorySchema,
  ),
}
