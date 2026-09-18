import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { artifactSchema, idSchema } from '../index'
import { runAcceptedSchema } from './run'

export const promptAttachmentSchema = z.strictObject({
  kind: z.enum(['image', 'file']),
  artifact: artifactSchema,
})
const draftResultSchema = z.strictObject({ sessionId: idSchema, revision: z.number().int().nonnegative() })
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
  'draft.reconcileSubmission': defineCommand(
    metadata('draft.reconcileSubmission'),
    z.strictObject({ sessionId: idSchema }),
    runAcceptedSchema.nullable(),
  ),
}

export type PromptAttachment = z.output<typeof promptAttachmentSchema>
