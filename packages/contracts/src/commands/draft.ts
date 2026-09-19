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
