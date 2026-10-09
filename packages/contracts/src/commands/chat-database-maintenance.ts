import { z } from 'zod'
import { defineCommand, type CommandMetadataInput } from '@hbar/commands/protocol'
import { settingsScopeSchema } from './settings'

const count = z.number().int().nonnegative().safe()
const id = z.string().min(1).max(200)
export const chatDatabaseCleanupKindSchema = z.enum(['sessions', 'cache', 'attachments', 'database'])
export type ChatDatabaseCleanupKind = z.output<typeof chatDatabaseCleanupKindSchema>
export const chatDatabaseSkipReasonSchema = z.enum([
  'active',
  'queued',
  'approval',
  'userInput',
  'resume',
  'preparation',
  'schedule',
  'retainedChild',
  'notArchived',
  'retention',
  'autoDisabled',
  'changed',
  'missing',
  'referenced',
  'legacyInventory',
  'legacyArtifact',
  'inUse',
  'unknownCategory',
  'redirected',
  'fileChanged',
  'policyChanged',
  'capacityUnreachable',
])
export type ChatDatabaseSkipReason = z.output<typeof chatDatabaseSkipReasonSchema>
export const chatDatabasePreviewItemSchema = z.strictObject({
  kind: chatDatabaseCleanupKindSchema,
  id,
  title: z.string().max(1000),
  workspaceId: id.nullable(),
  expectedSeq: count.nullable(),
  lastActivityAt: count.nullable(),
  estimatedBytes: count,
  depth: count.max(64),
  policyRevisions: z.record(z.string(), count).refine((value) => Object.keys(value).length <= 3),
  eligible: z.boolean(),
  skipReason: chatDatabaseSkipReasonSchema.nullable(),
})
export type ChatDatabasePreviewItem = z.output<typeof chatDatabasePreviewItemSchema>
export const chatDatabaseOperationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  operationId: id,
  type: z.enum(['preview', 'cleanup']),
  kind: chatDatabaseCleanupKindSchema,
  scope: settingsScopeSchema,
  trigger: z.enum(['manual', 'schedule', 'capacity']),
  status: z.enum(['accepted', 'running', 'cancelRequested', 'completed', 'cancelled', 'failed', 'unknown']),
  stage: z.enum(['pending', 'scanning', 'deleting', 'checkpoint', 'vacuum', 'finished']),
  version: count.positive(),
  createdAt: count,
  updatedAt: count,
  completedAt: count.nullable(),
  previewId: id.nullable(),
  expiresAt: count.nullable(),
  policyRevisions: z.record(z.string(), count),
  candidateCount: count,
  totalCount: count.default(0),
  processedCount: count,
  deletedCount: count,
  estimatedBytes: count,
  reclaimedBytes: count,
  reusableDatabaseBytes: count,
  remainingBytes: count.nullable(),
  targetBytes: count.nullable(),
  skipped: z.array(z.strictObject({ code: chatDatabaseSkipReasonSchema, count })).max(24),
  cancellationRequested: z.boolean(),
  error: z.string().max(160).nullable(),
})
export type ChatDatabaseOperation = z.output<typeof chatDatabaseOperationSchema>
export const chatDatabasePreviewInputSchema = z.strictObject({
  scope: settingsScopeSchema,
  kind: chatDatabaseCleanupKindSchema,
})
export type ChatDatabasePreviewInput = z.output<typeof chatDatabasePreviewInputSchema>
export const chatDatabaseCleanupInputSchema = z.strictObject({ previewId: id })
export type ChatDatabaseCleanupInput = z.output<typeof chatDatabaseCleanupInputSchema>
const operationInput = z.strictObject({ operationId: id })
const pageLimit = z.number().int().min(1).max(100).default(50)
export const chatDatabasePreviewPageInputSchema = z.strictObject({
  previewId: id,
  after: count.nullable().default(null),
  limit: pageLimit,
})
export const chatDatabasePreviewPageSchema = z.strictObject({
  items: z.array(chatDatabasePreviewItemSchema).max(100),
  next: count.nullable(),
  operation: chatDatabaseOperationSchema,
})
export const chatDatabaseHistoryInputSchema = z.strictObject({
  scope: settingsScopeSchema,
  after: z.strictObject({ createdAt: count, id }).nullable().default(null),
  limit: pageLimit,
})
export type ChatDatabaseHistoryInput = z.input<typeof chatDatabaseHistoryInputSchema>
export const chatDatabaseHistoryPageSchema = z.strictObject({
  items: z.array(chatDatabaseOperationSchema).max(100),
  next: z.strictObject({ createdAt: count, id }).nullable(),
})
export type ChatDatabaseHistoryPage = z.output<typeof chatDatabaseHistoryPageSchema>
export const chatDatabaseDeletedEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sessionIds: z.array(id).min(1).max(100),
  revision: count,
})
export type ChatDatabaseDeletedEvent = z.output<typeof chatDatabaseDeletedEventSchema>
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
export const chatDatabaseMaintenanceCommands = {
  'chatDatabase.preview': defineCommand(
    meta('chatDatabase.preview', true),
    chatDatabasePreviewInputSchema,
    chatDatabaseOperationSchema,
  ),
  'chatDatabase.previewPage': defineCommand(
    meta('chatDatabase.previewPage'),
    chatDatabasePreviewPageInputSchema,
    chatDatabasePreviewPageSchema,
  ),
  'chatDatabase.cleanup': defineCommand(
    meta('chatDatabase.cleanup', true),
    chatDatabaseCleanupInputSchema,
    chatDatabaseOperationSchema,
  ),
  'chatDatabase.operation': defineCommand(meta('chatDatabase.operation'), operationInput, chatDatabaseOperationSchema),
  'chatDatabase.cancel': defineCommand(meta('chatDatabase.cancel', true), operationInput, chatDatabaseOperationSchema),
  'chatDatabase.reconcile': defineCommand(
    meta('chatDatabase.reconcile', true),
    operationInput,
    chatDatabaseOperationSchema,
  ),
  'chatDatabase.receipt': defineCommand(
    meta('chatDatabase.receipt'),
    z.strictObject({ idempotencyKey: id }),
    chatDatabaseOperationSchema.nullable(),
  ),
  'chatDatabase.history': defineCommand(
    meta('chatDatabase.history'),
    chatDatabaseHistoryInputSchema,
    chatDatabaseHistoryPageSchema,
  ),
}
