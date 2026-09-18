import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArguments, CommandError, validationError } from '@hbar/commands'
import { createBudgetCommandClient, createRunCommandClient } from '@hbar/client'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { runCommands } from '@hbar/contracts/commands/run'
import type { CliArgs } from './args.ts'
import type { CliRuntime } from './runtime.ts'
import type { HbarClient } from '@hbar/client'
import { selectModel, selectSession } from './runtime.ts'

function print(value: unknown) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
}

export async function runCatalogCommand(args: CliArgs, client: HbarClient): Promise<void> {
  const [action, selector] = args.commandArgs
  if (!action || action === 'list') {
    const limit = args.limit === undefined ? 100 : Number(args.limit)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new CommandError('INVALID_INPUT', '--limit must be an integer from 1 to 200')
    print(
      JSON.stringify(
        await client.call('command.catalog', {
          limit,
          ...(args.category ? { category: args.category } : {}),
          ...(args.after ? { after: args.after } : {}),
        }),
      ),
    )
  } else if (action === 'describe' && selector && args.commandArgs.length === 2)
    print(JSON.stringify(await client.call('command.describe', { commandId: selector })))
  else throw new CommandError('INVALID_SYNTAX', 'Usage: hbar commands list|describe <commandId>')
}

export async function runOperationCommand(args: CliArgs, client: HbarClient): Promise<void> {
  const action = args.commandArgs[0]
  if (action !== 'operation.get' && action !== 'operation.cancel')
    throw new CommandError('COMMAND_NOT_FOUND', 'Unknown operation command')
  const raw = parseArguments(runCommands[action].metadata, args.commandArgs.slice(1))
  const parsed = runCommands[action].input.safeParse(raw)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  print(JSON.stringify(await createRunCommandClient(client).execute(action, parsed.data)))
}

export async function runCliCommand(args: CliArgs, runtime: CliRuntime): Promise<boolean> {
  const [action, selector] = args.commandArgs
  if (args.command === 'exec') {
    const commands = createBudgetCommandClient(runtime.client)
    const runs = createRunCommandClient(runtime.client)
    if (action === 'receipt') {
      const runReceipt = selector === 'run.submit'
      const key = runReceipt ? args.commandArgs[2] : selector
      if (!key || args.commandArgs.length !== (runReceipt ? 3 : 2))
        throw new CommandError('INVALID_SYNTAX', 'Usage: hbar exec receipt [run.submit] <key> --session <id|name>')
      print(
        JSON.stringify(
          runReceipt
            ? await runs.getReceipt(runtime.session.id, key)
            : await commands.getReceipt(runtime.session.id, key),
        ),
      )
      return true
    }
    if (action === 'run.submit') {
      if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required for run.submit')
      if (args.inputJson && args.message)
        throw new CommandError('INVALID_INPUT', 'Use either --input-json or --message')
      if (!args.inputJson && !args.message) throw new CommandError('INVALID_INPUT', 'Provide --message or --input-json')
      let input: unknown
      try {
        input = args.inputJson
          ? (JSON.parse(args.inputJson) as unknown)
          : { text: args.message!, images: [], thinking: args.thinking, approval: args.approval }
      } catch {
        throw new CommandError('INVALID_INPUT', '--input-json must contain JSON')
      }
      const raw = parseArguments(runCommands[action].metadata, [
        '--session',
        runtime.session.id,
        '--model',
        runtime.modelId,
        '--input',
        JSON.stringify(input),
      ])
      const parsed = runCommands[action].input.safeParse(raw)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      print(
        JSON.stringify(
          await runs.execute(action, parsed.data, {
            idempotencyKey: args.idempotencyKey,
            ...(args.requestId ? { requestId: args.requestId } : {}),
          }),
        ),
      )
      return true
    }
    if (action !== 'session.setBudget' && action !== 'session.getBudget')
      throw new CommandError('COMMAND_NOT_FOUND', 'Command is not available from this CLI')
    const argv = [...args.commandArgs.slice(1), '--session', runtime.session.id]
    if (args.expectedRevision !== undefined && args.expectedRevision !== 'null')
      argv.push('--expected-revision', args.expectedRevision)
    else if (args.expectedRevision === 'null' && action !== 'session.setBudget')
      throw new CommandError('INVALID_SYNTAX', '--expected-revision is only valid for session.setBudget')
    const input = parseArguments(budgetCommands[action].metadata, argv)
    if (args.expectedRevision === 'null') input.expectedRevision = null
    if (action === 'session.setBudget') {
      if (!args.idempotencyKey)
        throw new CommandError('INVALID_INPUT', '--idempotency-key is required for session.setBudget')
      const parsed = budgetCommands[action].input.safeParse(input)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      print(
        JSON.stringify(
          await commands.execute(action, parsed.data, {
            idempotencyKey: args.idempotencyKey,
            ...(args.requestId ? { requestId: args.requestId } : {}),
          }),
        ),
      )
    } else {
      const parsed = budgetCommands[action].input.safeParse(input)
      if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
      print(JSON.stringify(await commands.execute(action, parsed.data)))
    }
    return true
  }
  if (args.command === 'diagnose') {
    print(await runtime.client.call('system.diagnose', {}))
    return true
  }
  if (args.command === 'config') {
    if (!action || action === 'show' || action === 'paths') print(await runtime.client.call('system.paths.get', {}))
    else throw new Error('Usage: hbar config paths|show')
    return true
  }
  if (args.command === 'session') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    const sessions = catalog.sessions.filter((session) => session.workspaceId === runtime.project.id)
    if (!action || action === 'list') print(sessions)
    else if (action === 'new') print(await runtime.client.call('session.create', { workspaceId: runtime.project.id }))
    else if (action === 'resume') print(await selectSession(runtime.client, catalog, runtime.project.id, selector))
    else if (action === 'fork')
      print(await runtime.client.call('session.fork', { sessionId: selector ?? runtime.session.id }))
    else if (action === 'archive')
      print(await runtime.client.call('session.archive', { sessionId: selector ?? runtime.session.id, archived: true }))
    else if (action === 'export') {
      const target = selector ?? runtime.session.id
      const events = await runtime.client.call('session.export', { sessionId: target })
      const path = resolve(args.commandArgs[2] ?? `hbar-${target}.jsonl`)
      await writeFile(path, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
      print(path)
    } else throw new Error('Usage: hbar session list|new|resume|fork|archive|export')
    return true
  }
  if (args.command === 'model') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    if (!action || action === 'list') print(catalog.models)
    else if (action === 'use') {
      if (!selector) throw new Error('Usage: hbar model use <provider/model|id|name>')
      print({ modelId: selectModel(catalog, selector) })
    } else throw new Error('Usage: hbar model list|use')
    return true
  }
  if (args.command === 'plugins') {
    if (!action || action === 'list') print((await runtime.client.call('system.bootstrap', {})).plugins)
    else if (action === 'install') {
      if (!selector) throw new Error('Usage: hbar plugins install <directory|archive>')
      print(await runtime.client.call('plugin.install', { path: selector, projectId: runtime.project.id }))
    } else if (action === 'enable' || action === 'disable') {
      if (!selector) throw new Error(`Usage: hbar plugins ${action} <package-name>`)
      print(await runtime.client.call(action === 'enable' ? 'plugin.enable' : 'plugin.disable', { id: selector }))
    } else if (action === 'remove') {
      if (!selector) throw new Error('Usage: hbar plugins remove <package-name>')
      print(await runtime.client.call('plugin.remove', { id: selector }))
    } else if (action === 'inspect') {
      if (!selector) throw new Error('Usage: hbar plugins inspect <package-name>')
      const plugin = (await runtime.client.call('system.bootstrap', {})).plugins.find((item) => item.id === selector)
      if (!plugin) throw new Error(`Plugin not found: ${selector}`)
      print(plugin)
    } else if (action === 'doctor') print(await runtime.client.call('plugin.doctor', {}))
    else if (action === 'lock') print(await runtime.client.call('plugin.lock', {}))
    else throw new Error('Usage: hbar plugins list|install|enable|disable|remove|inspect|doctor|lock')
    return true
  }
  if (args.command === 'skills') {
    if (action && action !== 'list') throw new Error('Usage: hbar skills list')
    const root = resolve(runtime.layout.skills, 'global')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    print(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ id: entry.name, path: resolve(root, entry.name) })),
    )
    return true
  }
  return false
}
