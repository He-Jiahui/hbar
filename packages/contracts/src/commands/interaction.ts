import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema, userInputAnswerSchema } from '../index'

const commandMetadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.interaction',
  kind: 'command' as const,
  execution: 'host' as const,
  stateEffect: 'persistent' as const,
  category: 'run.approval',
  scope: 'session' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['cli', 'tui', 'api', 'palette'] as ('cli' | 'tui' | 'api' | 'palette')[],
})

export const interactionCommands = {
  'approval.resolve': defineCommand(
    {
      ...commandMetadata('approval.resolve'),
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string' as const, flag: 'session' },
          { field: 'approvalId', type: 'string' as const, position: 0 },
          { field: 'decision', type: 'string' as const, position: 1 },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      approvalId: idSchema,
      decision: z.enum(['allowed', 'denied']),
    }),
    z.strictObject({
      sessionId: idSchema,
      approvalId: idSchema,
      status: z.enum(['pending', 'allowed', 'denied', 'cancelled']),
    }),
  ),
  'questionnaire.answer': defineCommand(
    {
      ...commandMetadata('questionnaire.answer'),
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string' as const, flag: 'session' },
          { field: 'requestId', type: 'string' as const, position: 0 },
          { field: 'answers', type: 'json' as const, flag: 'answers' },
        ],
      },
    },
    z.strictObject({
      sessionId: idSchema,
      requestId: idSchema,
      answers: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), userInputAnswerSchema),
    }),
    z.strictObject({ sessionId: idSchema, requestId: idSchema, accepted: z.boolean() }),
  ),
}
