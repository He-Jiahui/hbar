import { defineCommand } from '@hbar/commands/protocol'
import { contextHistoryInputSchema, contextHistoryPageSchema } from '../context-history'

const id = 'session.contextHistory'
export const contextHistoryCommands = {
  [id]: defineCommand(
    {
      id,
      version: 1,
      owner: 'hbar.context',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'run.history',
      scope: 'session',
      titleKey: `commands.${id}.title`,
      descriptionKey: `commands.${id}.description`,
      surfaces: ['api', 'cli', 'tui'],
      cli: {
        arguments: [
          { field: 'sessionId', type: 'string', flag: 'session', position: 0 },
          { field: 'before', type: 'number', flag: 'before' },
          { field: 'limit', type: 'number', flag: 'limit' },
        ],
      },
    },
    contextHistoryInputSchema,
    contextHistoryPageSchema,
  ),
}
