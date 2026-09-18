import { readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describeCommand, parseArguments, CommandError, validationError, type CommandDescriptor } from '@hbar/commands'
import { createBudgetCommandClient, createDirectoryQueryAdapter, createRunCommandClient } from '@hbar/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { runCommands } from '@hbar/contracts/commands/run'
import { navigationCommands } from '@hbar/contracts/commands'
import type { CliArgs } from './args.ts'
import type { CliRuntime } from './runtime.ts'
import type { HbarClient } from '@hbar/client'
import { selectModel, selectSession } from './runtime.ts'
import { NamedContextStore } from './context.ts'

export type CommandOutput = (value: unknown) => void

function writeStdout(value: unknown) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`)
}

export async function runCatalogCommand(
  args: CliArgs,
  client: HbarClient,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const [action, selector] = args.commandArgs
  if (!action || action === 'list') {
    const limit = args.limit === undefined ? 100 : Number(args.limit)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
      throw new CommandError('INVALID_INPUT', '--limit must be an integer from 1 to 200')
    const remote: CommandDescriptor[] = []
    let cursor = args.after
    let revision: number
    do {
      const page = await client.call('command.catalog', {
        limit: 200,
        ...(args.category ? { category: args.category } : {}),
        ...(cursor ? { after: cursor } : {}),
      })
      revision = page.revision
      remote.push(...page.items)
      cursor = page.nextCursor
    } while (cursor && remote.length < 10_000)
    const local = [navigationCommands['app.setSession']]
      .map(describeCommand)
      .filter(
        ({ metadata }) =>
          (!args.category ||
            metadata.category === args.category ||
            metadata.category.startsWith(`${args.category}.`)) &&
          (!args.after || metadata.id > args.after),
      )
    const descriptors = [...new Map([...remote, ...local].map((item) => [item.metadata.id, item])).values()].sort(
      (a, b) => a.metadata.id.localeCompare(b.metadata.id),
    )
    const items = descriptors.slice(0, limit)
    output(
      JSON.stringify({
        revision: revision + local.length,
        items,
        ...(descriptors.length > limit ? { nextCursor: items.at(-1)!.metadata.id } : {}),
      }),
    )
  } else if (action === 'describe' && selector && args.commandArgs.length === 2) {
    const local = [navigationCommands['app.setSession']].find((definition) => definition.metadata.id === selector)
    output(
      JSON.stringify(local ? describeCommand(local) : await client.call('command.describe', { commandId: selector })),
    )
  } else throw new CommandError('INVALID_SYNTAX', 'Usage: hbar commands list|describe <commandId>')
}

export async function runOperationCommand(
  args: CliArgs,
  client: HbarClient,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (action !== 'operation.get' && action !== 'operation.cancel')
    throw new CommandError('COMMAND_NOT_FOUND', 'Unknown operation command')
  const raw = parseArguments(runCommands[action].metadata, args.commandArgs.slice(1))
  const parsed = runCommands[action].input.safeParse(raw)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  output(JSON.stringify(await createRunCommandClient(client).execute(action, parsed.data)))
}

export async function runApplicationCommand(
  args: CliArgs,
  client: HbarClient,
  dataRoot: string,
  output: CommandOutput = writeStdout,
): Promise<{ workspaceId: string; sessionId: string }> {
  const [action, selector] = args.commandArgs
  if (action !== 'app.setSession' || !selector || args.commandArgs.length !== 2)
    throw new CommandError('INVALID_SYNTAX', 'Usage: hbar exec app.setSession <id|name> --workspace <id|name>')
  const bootstrap = await client.call('system.bootstrap', {})
  const workspaceSelector = args.workspace ?? args.project
  const workspace = workspaceSelector
    ? bootstrap.workspaces.find(
        (item) =>
          item.id === workspaceSelector ||
          item.name === workspaceSelector ||
          resolve(item.path) === resolve(workspaceSelector),
      )
    : bootstrap.workspaces[0]
  if (!workspace) throw new CommandError('WORKSPACE_NOT_FOUND', 'Workspace is required or was not found')
  const runtime = createAppRuntime({
    instanceId: `cli-${process.pid}`,
    hostId: bootstrap.host.instanceId,
    directory: createDirectoryQueryAdapter(client),
  })
  try {
    const selection = await runtime.view.commands.execute('app.setSession', {
      session: selector,
      workspaceId: workspace.id,
    })
    if (!selection.workspaceId || !selection.sessionId)
      throw new CommandError('SESSION_NOT_FOUND', 'Session was not selected')
    const selected = { workspaceId: selection.workspaceId, sessionId: selection.sessionId }
    if (!args.context) {
      output(JSON.stringify({ ...selected, persisted: false }))
      return selected
    }
    const store = new NamedContextStore(dataRoot)
    const current = await store.get(args.context)
    let expected = current?.revision ?? null
    if (args.contextRevision !== undefined) {
      const parsed = Number(args.contextRevision)
      if (!Number.isSafeInteger(parsed) || parsed < 1)
        throw new CommandError('INVALID_INPUT', '--context-revision must be a positive integer')
      expected = parsed
    }
    output(JSON.stringify(await store.set(args.context, selected, expected)))
    return selected
  } finally {
    runtime.dispose()
  }
}

export async function runCliCommand(
  args: CliArgs,
  runtime: CliRuntime,
  output: CommandOutput = writeStdout,
): Promise<boolean> {
  const [action, selector] = args.commandArgs
  if (args.command === 'exec') {
    const commands = createBudgetCommandClient(runtime.client)
    const runs = createRunCommandClient(runtime.client)
    if (action === 'receipt') {
      const runReceipt = selector === 'run.submit'
      const key = runReceipt ? args.commandArgs[2] : selector
      if (!key || args.commandArgs.length !== (runReceipt ? 3 : 2))
        throw new CommandError('INVALID_SYNTAX', 'Usage: hbar exec receipt [run.submit] <key> --session <id|name>')
      output(
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
      output(
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
      output(
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
      output(JSON.stringify(await commands.execute(action, parsed.data)))
    }
    return true
  }
  if (args.command === 'diagnose') {
    output(await runtime.client.call('system.diagnose', {}))
    return true
  }
  if (args.command === 'config') {
    if (!action || action === 'show' || action === 'paths') output(await runtime.client.call('system.paths.get', {}))
    else throw new Error('Usage: hbar config paths|show')
    return true
  }
  if (args.command === 'session') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    const sessions = catalog.sessions.filter((session) => session.workspaceId === runtime.project.id)
    if (!action || action === 'list') output(sessions)
    else if (action === 'new') output(await runtime.client.call('session.create', { workspaceId: runtime.project.id }))
    else if (action === 'resume') output(await selectSession(runtime.client, catalog, runtime.project.id, selector))
    else if (action === 'fork')
      output(await runtime.client.call('session.fork', { sessionId: selector ?? runtime.session.id }))
    else if (action === 'archive')
      output(
        await runtime.client.call('session.archive', { sessionId: selector ?? runtime.session.id, archived: true }),
      )
    else if (action === 'export') {
      const target = selector ?? runtime.session.id
      const events = await runtime.client.call('session.export', { sessionId: target })
      const path = resolve(args.commandArgs[2] ?? `hbar-${target}.jsonl`)
      await writeFile(path, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8')
      output(path)
    } else throw new Error('Usage: hbar session list|new|resume|fork|archive|export')
    return true
  }
  if (args.command === 'model') {
    const catalog = await runtime.client.call('system.bootstrap', {})
    if (!action || action === 'list') output(catalog.models)
    else if (action === 'use') {
      if (!selector) throw new Error('Usage: hbar model use <provider/model|id|name>')
      output({ modelId: selectModel(catalog, selector) })
    } else throw new Error('Usage: hbar model list|use')
    return true
  }
  if (args.command === 'plugins') {
    if (!action || action === 'list') output((await runtime.client.call('system.bootstrap', {})).plugins)
    else if (action === 'install') {
      if (!selector) throw new Error('Usage: hbar plugins install <directory|archive>')
      output(await runtime.client.call('plugin.install', { path: selector, projectId: runtime.project.id }))
    } else if (action === 'enable' || action === 'disable') {
      if (!selector) throw new Error(`Usage: hbar plugins ${action} <package-name>`)
      output(await runtime.client.call(action === 'enable' ? 'plugin.enable' : 'plugin.disable', { id: selector }))
    } else if (action === 'remove') {
      if (!selector) throw new Error('Usage: hbar plugins remove <package-name>')
      output(await runtime.client.call('plugin.remove', { id: selector }))
    } else if (action === 'inspect') {
      if (!selector) throw new Error('Usage: hbar plugins inspect <package-name>')
      const plugin = (await runtime.client.call('system.bootstrap', {})).plugins.find((item) => item.id === selector)
      if (!plugin) throw new Error(`Plugin not found: ${selector}`)
      output(plugin)
    } else if (action === 'doctor') output(await runtime.client.call('plugin.doctor', {}))
    else if (action === 'lock') output(await runtime.client.call('plugin.lock', {}))
    else throw new Error('Usage: hbar plugins list|install|enable|disable|remove|inspect|doctor|lock')
    return true
  }
  if (args.command === 'skills') {
    if (action && action !== 'list') throw new Error('Usage: hbar skills list')
    const root = resolve(runtime.layout.skills, 'global')
    const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
    output(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ id: entry.name, path: resolve(root, entry.name) })),
    )
    return true
  }
  return false
}
