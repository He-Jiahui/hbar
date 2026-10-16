import { browserCommands } from '@hbar/contracts/commands/browser'
import { computerCommands } from '@hbar/contracts/commands/computer'
import { SESSION_COMMAND_BROWSER_IDS, SESSION_COMMAND_COMPUTER_IDS } from '@hbar/kernel/session-command-port'
import { HbarError } from '@hbar/contracts'

const ids = new Set<string>([...SESSION_COMMAND_BROWSER_IDS, ...SESSION_COMMAND_COMPUTER_IDS])
const commands = { ...browserCommands, ...computerCommands }
const aliases: Readonly<Record<string, string>> = {
  'browser.press': 'browser_press_key',
  'computer.doubleClick': 'computer_double_click',
}
const fields: Readonly<Record<string, string>> = {
  contextId: 'context_id',
  pageId: 'page_id',
  appId: 'app_id',
  fullPage: 'full_page',
  deltaX: 'delta_x',
  deltaY: 'delta_y',
}

export function sessionInteractionCommand(commandId: string, input: Record<string, unknown>) {
  if (!ids.has(commandId)) return undefined
  const definition = Object.values(commands).find((item) => item.metadata.id === commandId)
  if (!definition)
    throw new HbarError('COMMAND_ADMISSION_UNAVAILABLE', 'The interaction command definition is unavailable')
  const browser = commandId.startsWith('browser.')
  return {
    metadata: definition.metadata,
    effect: browser ? ('network' as const) : commandId === 'computer.status' ? ('read' as const) : ('process' as const),
    alias: aliases[commandId] ?? commandId.replace('.', '_'),
    arguments: Object.fromEntries(
      Object.entries(input)
        .filter(([key]) => key !== 'sessionId')
        .map(([key, value]) => [fields[key] ?? key, value]),
    ),
  }
}

export function bindInteractionSession(sessionId: string, input: Record<string, unknown>) {
  if (input.sessionId !== undefined && input.sessionId !== sessionId)
    throw new HbarError('COMMAND_SOURCE_MISMATCH', 'This interaction belongs to the original Session')
  return { ...input, sessionId }
}
