#!/usr/bin/env bun
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { CommandError } from '@hbar/commands'
import { createRunCommandClient } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { parseCli, HELP, type CliArgs } from './args.ts'
import {
  isSurfaceCommand,
  isSystemCommand,
  isExtensionCommand,
  isConnectionCommand,
  isFileCommand,
  isSettingsCommand,
  runModelListCommand,
  runApplicationCommand,
  runWorkspaceOpenCommand,
  runWorkspaceCreateCommand,
  runCatalogCommand,
  runCliCommand,
  runFileCommand,
  runOperationCommand,
  runSurfaceRelayCommand,
  runSystemCommand,
  runExtensionCommand,
  runConnectionCommand,
  runSettingsCommand,
} from './commands.ts'
import { openAttachedRuntime, openCatalogClient, openRuntime, selectProject, waitForRun } from './runtime.ts'
import { runTui } from './tui.ts'
import { runRepl } from './repl.ts'
import { hostProcessCommand } from './host-process.ts'
import { isNodeManagementCommand, runNodeManagementCommand } from './node-management'
import { conversationHostArguments } from './service-entry'
import { tryAttachNodeConsole } from './node-console-attach'

function exitCode(error: unknown, usage = false) {
  if (usage) return 2
  if (error instanceof CommandError) {
    if (['INVALID_SYNTAX', 'INVALID_INPUT', 'COMMAND_NOT_FOUND'].includes(error.code)) return 2
    if (error.code === 'RESULT_UNKNOWN') return 8
    if (['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'FILE_CONFLICT'].includes(error.code)) return 9
  }
  if (error instanceof HbarError) {
    if (['INVALID_SYNTAX', 'INVALID_INPUT', 'COMMAND_NOT_FOUND'].includes(error.code)) return 2
    if (['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'].includes(error.code)) return 8
    if (['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'FILE_CONFLICT'].includes(error.code)) return 9
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/approval|denied/i.test(message)) return 3
  if (/model|provider|configured/i.test(message)) return 4
  if (/plugin/i.test(message)) return 5
  if (/session|storage|Host connection/i.test(message)) return 6
  return 7
}

function completion(shell: string | undefined) {
  if (shell === 'powershell')
    return `Register-ArgumentCompleter -Native -CommandName hbar -ScriptBlock { param($wordToComplete) 'commands','exec','repl','session','model','plugins','skills','config','diagnose','version' | Where-Object { $_ -like "$wordToComplete*" } }`
  if (shell === 'bash' || shell === 'zsh')
    return `complete -W "commands exec repl session model plugins skills config diagnose version" hbar`
  throw new CommandError('INVALID_SYNTAX', 'Usage: hbar completion <powershell|bash|zsh>')
}

async function serve(args: CliArgs) {
  const command = hostProcessCommand(conversationHostArguments(args))
  const child = spawn(command[0]!, command.slice(1), { stdio: 'inherit', windowsHide: false })
  return new Promise<number>((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolveExit(code ?? 7))
  })
}

async function attached(args: CliArgs) {
  const url = args.commandArgs[0]
  if (!url) throw new Error('Usage: hbar attach <url>')
  if (await tryAttachNodeConsole(url, args)) return
  let runtime
  try {
    runtime = await openAttachedRuntime(url, process.env.HBAR_TOKEN, args)
  } catch (error) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw error
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const code = await prompt.question('Pairing code: ')
      runtime = await openAttachedRuntime(url, undefined, args, code.trim())
    } finally {
      prompt.close()
    }
  }
  await runTui(runtime, args.message, args)
}

let parsed: CliArgs | undefined
let usageError = false
try {
  try {
    parsed = parseCli()
  } catch (error) {
    usageError = true
    throw error
  }
  const args = parsed
  if (args.help) {
    console.log(HELP)
    process.exit(0)
  }
  if (args.command === 'version') {
    console.log('hbar 0.1.0')
    process.exit(0)
  }
  if (args.command === 'completion') {
    console.log(completion(args.commandArgs[0]))
    process.exit(0)
  }
  if (args.command === 'serve') {
    if (args.connectOnly) throw new Error('--connect-only cannot be used with serve')
    process.exit(await serve(args))
  }
  if (args.command === 'attach') {
    await attached(args)
    process.exit(0)
  }
  if (args.command === 'commands') {
    const { client } = await openCatalogClient(args)
    try {
      await runCatalogCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && isConnectionCommand(args.commandArgs[0])) {
    const { client } = await openCatalogClient(args)
    try {
      await runConnectionCommand(args, client)
    } finally {
      if (client.connectionStatus() !== 'disconnected') client.disconnect()
    }
    process.exit(0)
  }
  if (
    (args.command === 'exec' && isExtensionCommand(args.commandArgs[0])) ||
    args.command === 'plugins' ||
    args.command === 'skills'
  ) {
    const { client } = await openCatalogClient(args)
    try {
      const action = args.commandArgs[0]
      let commandArgs: string[]
      if (args.command === 'skills') {
        if (action && action !== 'list') throw new Error('Usage: hbar skills list')
        commandArgs = ['skill.list']
      } else if (args.command === 'plugins') {
        const command =
          !action || action === 'list'
            ? 'plugin.list'
            : action === 'install'
              ? 'plugin.install'
              : action === 'enable'
                ? 'plugin.enable'
                : action === 'disable'
                  ? 'plugin.disable'
                  : action === 'remove'
                    ? 'plugin.remove'
                    : action === 'inspect'
                      ? 'plugin.inspect'
                      : action === 'doctor'
                        ? 'plugin.doctor'
                        : action === 'lock'
                          ? 'plugin.lock'
                          : undefined
        if (!command) throw new Error('Usage: hbar plugins list|install|enable|disable|remove|inspect|doctor|lock')
        commandArgs = [command, ...args.commandArgs.slice(1)]
      } else commandArgs = args.commandArgs
      let projectId: string | undefined
      if (commandArgs[0] === 'plugin.install') {
        const bootstrap = await client.call('system.bootstrap', {})
        projectId = (await selectProject(client, bootstrap, args.workspace ?? args.project, !args.connectOnly)).id
      }
      await runExtensionCommand({ ...args, commandArgs }, client, projectId)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && isNodeManagementCommand(args.commandArgs[0])) {
    const { client } = await openCatalogClient(args)
    try {
      await runNodeManagementCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && args.commandArgs[0] === 'workspace.create') {
    const { client } = await openCatalogClient(args)
    try {
      await runWorkspaceCreateCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (
    (args.command === 'exec' && isSystemCommand(args.commandArgs[0])) ||
    args.command === 'diagnose' ||
    (args.command === 'config' && (!args.commandArgs[0] || ['show', 'paths'].includes(args.commandArgs[0])))
  ) {
    const { client } = await openCatalogClient({
      ...args,
      requireReady: !args.commandArgs[0]?.startsWith('system.runtime.'),
    })
    try {
      const commandArgs =
        args.command === 'diagnose'
          ? ['system.diagnose']
          : args.command === 'config'
            ? ['system.paths.get']
            : args.commandArgs
      await runSystemCommand({ ...args, commandArgs }, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (
    (args.command === 'exec' && args.commandArgs[0] === 'model.list') ||
    (args.command === 'model' && (!args.commandArgs[0] || args.commandArgs[0] === 'list'))
  ) {
    const { client } = await openCatalogClient(args)
    try {
      await runModelListCommand(client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && ['operation.get', 'operation.cancel'].includes(args.commandArgs[0] ?? '')) {
    const { client } = await openCatalogClient(args)
    try {
      await runOperationCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && args.commandArgs[0] === 'app.setSession') {
    const { client, layout } = await openCatalogClient(args)
    try {
      await runApplicationCommand(args, client, layout.dataRoot)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && args.commandArgs[0] === 'workspace.open') {
    const { client } = await openCatalogClient(args)
    try {
      await runWorkspaceOpenCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && isSurfaceCommand(args.commandArgs[0])) {
    const { client } = await openCatalogClient(args)
    try {
      await runSurfaceRelayCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && isSettingsCommand(args.commandArgs[0])) {
    const { client } = await openCatalogClient(args)
    try {
      await runSettingsCommand(args, client)
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.command === 'exec' && isFileCommand(args.commandArgs[0])) {
    const { client } = await openCatalogClient(args)
    try {
      const bootstrap = await client.call('system.bootstrap', {})
      const project = await selectProject(client, bootstrap, args.workspace ?? args.project, !args.connectOnly)
      await runFileCommand(args, { client, project })
    } finally {
      client.disconnect()
    }
    process.exit(0)
  }
  if (args.headless && !args.command && !args.message && !process.stdin.isTTY)
    args.message = (await Bun.stdin.text()).trim()
  if (args.headless && !args.command && !args.message) {
    usageError = true
    throw new Error('--message is required (or pipe one message on stdin)')
  }
  if (args.headless && args.approval === 'ask' && (!process.stdin.isTTY || !process.stdout.isTTY))
    throw new Error('--approval ask requires an interactive terminal')
  const runtime = await openRuntime({
    ...args,
    modelRequired:
      (args.command !== 'exec' && args.command !== 'model') ||
      ['run.submit', 'agent.create'].includes(args.commandArgs[0] ?? ''),
    createSession: args.command !== 'exec' || args.commandArgs[0] === 'run.submit',
    explicitSessionCreate: args.command === 'exec' && args.commandArgs[0] === 'run.submit',
  })
  try {
    if (args.command === 'repl') {
      await runRepl(runtime, args)
      runtime.close()
      process.exit(0)
    }
    const handled = await runCliCommand(args, runtime)
    if (!handled && args.headless) {
      const runs = createRunCommandClient(runtime.client)
      let activeOperationId = ''
      const interrupt = () => {
        if (activeOperationId) void runs.execute('operation.cancel', { operationId: activeOperationId }).catch(() => {})
      }
      process.once('SIGINT', interrupt)
      try {
        const accepted = await runs.execute(
          'run.submit',
          {
            sessionId: runtime.session.id,
            input: {
              text: args.message!,
              images: [],
              thinking: args.thinkingExplicit ? args.thinking : runtime.thinkingLevel,
              approval: args.approval,
            },
            modelId: runtime.modelId,
          },
          { idempotencyKey: randomUUID() },
        )
        activeOperationId = accepted.operationId
        const snapshot = await runtime.client.call('session.snapshot', { sessionId: runtime.session.id })
        const run = snapshot.runs.find((item) => item.id === accepted.operationId)
        if (!run) throw new Error('Accepted run is unavailable from the session snapshot')
        await waitForRun(runtime.client, runtime.session, run, args.outputFormat, args.approval)
      } finally {
        process.off('SIGINT', interrupt)
      }
    } else if (!handled) await runTui(runtime, args.message, args)
  } finally {
    runtime.close()
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (parsed?.headless && parsed.outputFormat === 'jsonl')
    process.stdout.write(`${JSON.stringify({ type: 'error', error: message, code: exitCode(error, usageError) })}\n`)
  else {
    console.error(message)
    if (usageError) console.error('\n' + HELP)
  }
  process.exit(exitCode(error, usageError))
}
