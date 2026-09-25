import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { artifactSchema, idSchema } from '../index'
import { attachmentUploadInputSchema } from './files'
import { runAcceptedSchema } from './run'

export const promptAttachmentSchema = z.strictObject({
  kind: z.enum(['image', 'file']),
  artifact: artifactSchema,
})
const draftResultSchema = z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() })
const attachmentResultSchema = draftResultSchema.extend({ attachment: promptAttachmentSchema })
const attachmentReservationTarget = z.strictObject({
  sessionId: idSchema,
  reservationId: idSchema,
  ownerRevision: z.number().int().nonnegative(),
})
const attachmentReservationSchema = z.strictObject({
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
    draftResultSchema.extend({ reservations: z.array(attachmentReservationSchema).max(12) }),
  ),
  'draft.uploadAttachment': defineCommand(
    metadata('draft.uploadAttachment'),
    attachmentReservationTarget.extend({ kind: z.enum(['image', 'file']), upload: attachmentUploadInputSchema }),
    attachmentResultSchema,
  ),
  'draft.failAttachmentPreparation': defineCommand(
    metadata('draft.failAttachmentPreparation'),
    attachmentReservationTarget.extend({ error: z.string().min(1).max(200) }),
    draftResultSchema,
  ),
  'draft.removeAttachmentTransfer': defineCommand(
    metadata('draft.removeAttachmentTransfer'),
    attachmentReservationTarget,
    draftResultSchema,
  ),
  'draft.reconcileAttachment': defineCommand(
    metadata('draft.reconcileAttachment'),
    attachmentReservationTarget,
    draftResultSchema,
  ),
  'draft.acceptReadyAttachment': defineCommand(
    metadata('draft.acceptReadyAttachment'),
    attachmentReservationTarget.extend({ expectedRevision: z.number().int().nonnegative() }),
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
