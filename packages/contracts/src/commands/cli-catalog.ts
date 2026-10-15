import { navigationCommands } from './index'
import { connectionCommands } from './connection'
import { surfaceCommands } from './surfaces'
import { terminalApplicationCommands } from './terminal-application'
import { attachmentCommands } from './files'

/** The non-Host definitions published by command mode, shared with session discovery. */
export const cliLocalCommands = {
  ...navigationCommands,
  ...connectionCommands,
  ...surfaceCommands,
  ...terminalApplicationCommands,
  ...attachmentCommands,
}
