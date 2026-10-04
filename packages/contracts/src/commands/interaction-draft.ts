import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const resultSchema = z.strictObject({
  requestId: idSchema,
  revision: z.number().int().nonnegative(),
})
const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.interaction-draft',
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

export const interactionDraftCommands = {
  'questionnaire.setAnswer': defineCommand(
    metadata('questionnaire.setAnswer'),
    z.strictObject({
      sessionId: idSchema,
      requestId: idSchema,
      questionId: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
      answer: z.strictObject({ kind: z.enum(['option', 'custom']), value: z.string().max(4_000) }),
      expectedRevision: z.number().int().nonnegative().optional(),
    }),
    resultSchema,
  ),
  'questionnaire.resetAnswers': defineCommand(
    metadata('questionnaire.resetAnswers'),
    z.strictObject({ sessionId: idSchema, requestId: idSchema }),
    resultSchema,
  ),
}
