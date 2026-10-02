import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { artifactSchema, idSchema } from '../index'
import { attachmentUploadInputSchema } from './files'
import { runAcceptedSchema } from './run'

export const promptAttachmentSchema = z.strictObject({
  kind: z.enum(['image', 'file']),
  artifact: artifactSchema,
})
export const promptMentionSchema = z.strictObject({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
  label: z.string().min(1).max(1024),
  path: z.string().min(1).max(4000),
  workspaceId: idSchema,
  directory: z.boolean(),
})
export const MAX_PROMPT_WORKSPACE_CONTEXTS = 12
export const MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH = 20_000
export const MAX_PROMPT_WORKSPACE_CONTEXT_NOTE_LENGTH = 4_000
export const MAX_PROMPT_WORKSPACE_CONTEXT_SERIALIZED_LENGTH = 200_000
const promptWorkspaceContextQuote = z
  .string()
  .min(1)
  .max(MAX_PROMPT_WORKSPACE_CONTEXT_QUOTE_LENGTH)
  .refine((value) => !!value.trim())
const promptWorkspaceContextRange = {
  workspaceId: idSchema,
  path: z.string().min(1).max(4000),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  quote: promptWorkspaceContextQuote,
}
const promptWorkspaceContextInputVariants = [
  z.strictObject({
    kind: z.literal('source-selection'),
    ...promptWorkspaceContextRange,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal('source-comment'),
    ...promptWorkspaceContextRange,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    note: z.string().trim().min(1).max(MAX_PROMPT_WORKSPACE_CONTEXT_NOTE_LENGTH),
  }),
  z.strictObject({
    kind: z.literal('diff-comment'),
    ...promptWorkspaceContextRange,
    cached: z.boolean(),
    diffSide: z.enum(['old', 'new']),
    hunkId: z.string().min(1).max(256),
    note: z.string().trim().min(1).max(MAX_PROMPT_WORKSPACE_CONTEXT_NOTE_LENGTH),
  }),
] as const
const promptWorkspaceContextVariants = [
  promptWorkspaceContextInputVariants[0].extend({ id: z.string().uuid() }),
  promptWorkspaceContextInputVariants[1].extend({ id: z.string().uuid() }),
  promptWorkspaceContextInputVariants[2].extend({ id: z.string().uuid() }),
  z.strictObject({
    kind: z.literal('chat-selection'),
    sourceSessionId: idSchema,
    messageId: idSchema,
    sourceRole: z.enum(['user', 'assistant']),
    quote: promptWorkspaceContextQuote,
    id: z.string().uuid(),
  }),
] as const
const validateWorkspaceContextRange = (
  context: { readonly kind: string; readonly lineStart?: number; readonly lineEnd?: number },
  refinement: z.RefinementCtx,
) => {
  if (context.lineStart !== undefined && context.lineEnd !== undefined && context.lineEnd < context.lineStart)
    refinement.addIssue({ code: z.ZodIssueCode.custom, path: ['lineEnd'], message: 'Line range end precedes start' })
}
export const promptWorkspaceContextInputSchema = z
  .discriminatedUnion('kind', promptWorkspaceContextInputVariants)
  .superRefine(validateWorkspaceContextRange)
export const promptWorkspaceContextSchema = z
  .discriminatedUnion('kind', promptWorkspaceContextVariants)
  .superRefine(validateWorkspaceContextRange)
export const promptWorkspaceContextsSchema = z.array(promptWorkspaceContextSchema).max(MAX_PROMPT_WORKSPACE_CONTEXTS)
const draftResultSchema = z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() })
const attachmentResultSchema = draftResultSchema.extend({ attachment: promptAttachmentSchema })
const workspaceContextResultSchema = draftResultSchema.extend({
  added: z.boolean(),
  context: promptWorkspaceContextSchema,
})
export const draftAttachmentTransferStatusSchema = z.enum([
  'preparing',
  'uploading',
  'failed',
  'unknown',
  'reconciling',
  'ready',
])
export const draftAttachmentTransferSchema = z.strictObject({
  id: idSchema,
  ownerRevision: z.number().int().nonnegative(),
  originalOperationId: idSchema.nullable(),
  name: z.string().max(240),
  mime: z.string().max(120),
  size: z.number().int().nonnegative().safe(),
  status: draftAttachmentTransferStatusSchema,
  kind: z.enum(['image', 'file']),
  upload: attachmentUploadInputSchema.nullable(),
  confirmed: promptAttachmentSchema.nullable(),
  error: z.string().max(200).nullable(),
})
export const attachmentReservationTargetSchema = z.strictObject({
  reservationId: idSchema,
  ownerRevision: z.number().int().nonnegative(),
})
export const attachmentSelectionReservationSchema = z.strictObject({
  reservationId: idSchema,
  ownerRevision: z.number().int().nonnegative(),
  preparing: z.boolean(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.draft',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'run.draft',
  scope: 'session' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

export const draftCommands = {
  'draft.setText': defineCommand(
    metadata('draft.setText'),
    z.strictObject({
      sessionId: idSchema,
      text: z.string().max(200_000),
      expectedRevision: z.number().int().nonnegative().optional(),
    }),
    draftResultSchema,
  ),
  'draft.setContent': defineCommand(
    metadata('draft.setContent'),
    z.strictObject({
      sessionId: idSchema,
      text: z.string().max(200_000),
      mentions: z.array(promptMentionSchema).max(40),
      expectedRevision: z.number().int().nonnegative(),
    }),
    draftResultSchema,
  ),
  'draft.addWorkspaceContext': defineCommand(
    metadata('draft.addWorkspaceContext'),
    z.strictObject({
      sessionId: idSchema,
      expectedRevision: z.number().int().nonnegative(),
      context: promptWorkspaceContextInputSchema,
    }),
    workspaceContextResultSchema,
  ),
  'draft.addConversationSelection': defineCommand(
    metadata('draft.addConversationSelection'),
    z.strictObject({
      sessionId: idSchema,
      messageId: idSchema,
      expectedText: z.string().max(200_000),
      quote: promptWorkspaceContextQuote,
      expectedRevision: z.number().int().nonnegative(),
    }),
    workspaceContextResultSchema,
  ),
  'draft.removeWorkspaceContext': defineCommand(
    metadata('draft.removeWorkspaceContext'),
    z.strictObject({
      sessionId: idSchema,
      contextId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
    }),
    draftResultSchema.extend({ removed: z.boolean() }),
  ),
  'draft.setWorkspaceContexts': defineCommand(
    metadata('draft.setWorkspaceContexts'),
    z.strictObject({
      sessionId: idSchema,
      workspaceContexts: promptWorkspaceContextsSchema,
      expectedRevision: z.number().int().nonnegative(),
    }),
    draftResultSchema,
  ),
  'draft.setAttachments': defineCommand(
    metadata('draft.setAttachments'),
    z.strictObject({
      sessionId: idSchema,
      attachments: z.array(promptAttachmentSchema).max(12),
      expectedRevision: z.number().int().nonnegative().optional(),
    }),
    draftResultSchema,
  ),
  'draft.addAttachment': defineCommand(
    metadata('draft.addAttachment'),
    z.strictObject({
      sessionId: idSchema,
      kind: z.enum(['image', 'file']),
      upload: attachmentUploadInputSchema,
    }),
    attachmentResultSchema,
  ),
  'draft.reserveAttachments': defineCommand(
    metadata('draft.reserveAttachments'),
    z.strictObject({
      sessionId: idSchema,
      expectedRevision: z.number().int().nonnegative(),
      files: z
        .array(
          z.strictObject({
            name: z.string().max(4096),
            mime: z.string().max(256),
            size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          }),
        )
        .min(1)
        .max(12),
    }),
    draftResultSchema.extend({ reservations: z.array(attachmentSelectionReservationSchema).max(12) }),
  ),
  'draft.uploadAttachment': defineCommand(
    metadata('draft.uploadAttachment'),
    z
      .strictObject({ sessionId: idSchema })
      .merge(attachmentReservationTargetSchema)
      .extend({ kind: z.enum(['image', 'file']), upload: attachmentUploadInputSchema }),
    attachmentResultSchema,
  ),
  'draft.failAttachmentPreparation': defineCommand(
    metadata('draft.failAttachmentPreparation'),
    z
      .strictObject({ sessionId: idSchema })
      .merge(attachmentReservationTargetSchema)
      .extend({ error: z.string().min(1).max(200) }),
    draftResultSchema,
  ),
  'draft.removeAttachmentTransfer': defineCommand(
    metadata('draft.removeAttachmentTransfer'),
    z.strictObject({ sessionId: idSchema }).merge(attachmentReservationTargetSchema),
    draftResultSchema,
  ),
  'draft.reconcileAttachment': defineCommand(
    metadata('draft.reconcileAttachment'),
    z.strictObject({ sessionId: idSchema }).merge(attachmentReservationTargetSchema),
    draftResultSchema,
  ),
  'draft.acceptReadyAttachment': defineCommand(
    metadata('draft.acceptReadyAttachment'),
    z
      .strictObject({ sessionId: idSchema })
      .merge(attachmentReservationTargetSchema)
      .extend({ expectedRevision: z.number().int().nonnegative() }),
    draftResultSchema,
  ),
  'draft.removeAttachment': defineCommand(
    metadata('draft.removeAttachment'),
    z.strictObject({
      sessionId: idSchema,
      kind: z.enum(['image', 'file']),
      artifactId: z.string().regex(/^[a-f0-9]{64}$/),
      expectedRevision: z.number().int().nonnegative(),
    }),
    draftResultSchema,
  ),
  'draft.reportAttachmentError': defineCommand(
    metadata('draft.reportAttachmentError'),
    z.strictObject({ sessionId: idSchema, error: z.string().min(1).max(200) }),
    draftResultSchema,
  ),
  'draft.reconcileSubmission': defineCommand(
    metadata('draft.reconcileSubmission'),
    z.strictObject({ sessionId: idSchema }),
    runAcceptedSchema.nullable(),
  ),
}

export type PromptAttachment = z.output<typeof promptAttachmentSchema>
export type PromptMention = z.output<typeof promptMentionSchema>
export type PromptWorkspaceContext = z.output<typeof promptWorkspaceContextSchema>
export type PromptWorkspaceContextInput = z.output<typeof promptWorkspaceContextInputSchema>
export type DraftAttachmentTransfer = Readonly<z.output<typeof draftAttachmentTransferSchema>>
export type AttachmentReservationTarget = Readonly<z.output<typeof attachmentReservationTargetSchema>>
export type AttachmentSelectionReservation = Readonly<z.output<typeof attachmentSelectionReservationSchema>>
