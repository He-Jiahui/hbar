import { CommandError, tokenizeCommand } from '@hbar/commands'
import { parseCli, type CliArgs } from './args.ts'
import {
  runApplicationCommand,
  runWorkspaceOpenCommand,
  runCatalogCommand,
  runCliCommand,
  runOperationCommand,
  runSurfaceRelayCommand,
  isSurfaceCommand,
  isSettingsCommand,
  runSettingsCommand,
  type CommandOutput,
} from './commands.ts'
import type { CliRuntime } from './runtime.ts'

function withDefaults(parsed: CliArgs, defaults: CliArgs, runtime: CliRuntime): CliArgs {
  return {
    ...parsed,
    dataRoot: parsed.dataRoot ?? defaults.dataRoot,
    cacheRoot: parsed.cacheRoot ?? defaults.cacheRoot,
    project: parsed.project ?? defaults.project,
    workspace: parsed.workspace ?? runtime.project.id,
    session: parsed.session ?? runtime.session.id,
    context: parsed.context ?? defaults.context,
    model: parsed.model ?? defaults.model,
    thinking: parsed.thinkingExplicit ? parsed.thinking : defaults.thinking,
    thinkingExplicit: parsed.thinkingExplicit || defaults.thinkingExplicit,
    demo: parsed.demo || defaults.demo,
  }
}

export function parseCommandLine(source: string, defaults: CliArgs, runtime: CliRuntime): CliArgs {
  const tokens = tokenizeCommand(source.trim().replace(/^\/+/, ''))
  if (!tokens.length) throw new CommandError('INVALID_SYNTAX', 'Command is empty')
  if (tokens[0]?.includes('.')) tokens.unshift('exec')
  return withDefaults(parseCli(tokens), defaults, runtime)
}

/** Shared argv/REPL/TUI dispatcher for migrated command definitions. */
export async function executeCommandLine(
  source: string,
  runtime: CliRuntime,
  defaults: CliArgs,
  output: CommandOutput,
): Promise<void> {
  const args = parseCommandLine(source, defaults, runtime)
  if (args.command === 'commands') return runCatalogCommand(args, runtime.client, output)
  if (args.command === 'exec' && ['operation.get', 'operation.cancel'].includes(args.commandArgs[0] ?? ''))
    return runOperationCommand(args, runtime.client, output)
  if (args.command === 'exec' && args.commandArgs[0] === 'app.setSession') {
    const selection = await runApplicationCommand(args, runtime.client, runtime.layout.dataRoot, output)
    const bootstrap = await runtime.client.call('system.bootstrap', {})
    const project = bootstrap.workspaces.find((item) => item.id === selection.workspaceId)
    const session = bootstrap.sessions.find((item) => item.id === selection.sessionId)
    if (!project || !session) throw new CommandError('RESULT_UNKNOWN', 'Selected context is absent from Host bootstrap')
    runtime.bootstrap = bootstrap
    runtime.project = project
    runtime.session = session
    return
  }
  if (args.command === 'exec' && args.commandArgs[0] === 'workspace.open') {
    await runWorkspaceOpenCommand(args, runtime.client, output)
    runtime.bootstrap = await runtime.client.call('system.bootstrap', {})
    return
  }
  if (args.command === 'exec' && isSurfaceCommand(args.commandArgs[0]))
    return runSurfaceRelayCommand(args, runtime.client, output)
  if (args.command === 'exec' && isSettingsCommand(args.commandArgs[0]))
    return runSettingsCommand(args, runtime.client, output)
  if (!(await runCliCommand(args, runtime, output)))
    throw new CommandError('COMMAND_NOT_FOUND', 'Command is not available in this runtime')
}
