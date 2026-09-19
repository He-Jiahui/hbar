import { z } from 'zod'
import { defineCommand } from '@hbar/commands/protocol'

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.terminal',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  category: 'app.navigation',
  scope: 'client' as const,
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['tui', 'api'] as ('tui' | 'api')[],
})

export const terminalApplicationCommands = {
  'app.clearTranscript': defineCommand(
    metadata('app.clearTranscript'),
    z.strictObject({}),
    z.strictObject({ cleared: z.boolean() }),
  ),
  'app.closeTerminal': defineCommand(
    metadata('app.closeTerminal'),
    z.strictObject({}),
    z.strictObject({ closed: z.boolean() }),
  ),
}

export type TerminalApplicationCommandId = keyof typeof terminalApplicationCommands
