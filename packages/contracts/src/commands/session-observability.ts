import { defineCommand } from '@hbar/commands/protocol'
import { sessionObservabilityInputSchema, sessionObservabilityReportSchema } from '../session-observability'

const id = 'session.observability'
export const sessionObservabilityCommands = {
  [id]: defineCommand(
    {
      id,
      version: 1,
      owner: 'hbar.core',
      kind: 'query',
      execution: 'host',
      stateEffect: 'none',
      category: 'monitoring.session',
      scope: 'session',
      titleKey: `commands.${id}.title`,
      descriptionKey: `commands.${id}.description`,
      surfaces: ['api', 'cli', 'tui'],
    },
    sessionObservabilityInputSchema,
    sessionObservabilityReportSchema,
  ),
}
