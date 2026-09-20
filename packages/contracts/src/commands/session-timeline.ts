import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'
import { idSchema } from '../index'

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.timeline',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'run.history',
  scope: 'session' as const,
  visibility: 'internal' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})

const inputSchema = z.strictObject({ sessionId: idSchema })
const resultSchema = z.strictObject({
  sessionId: idSchema,
  loaded: z.number().int().nonnegative(),
  hasOlder: z.boolean(),
})

export const sessionTimelineCommands = {
  'timeline.loadOlder': defineCommand(metadata('timeline.loadOlder'), inputSchema, resultSchema),
  'timeline.retry': defineCommand(metadata('timeline.retry'), inputSchema, resultSchema),
}
