import { readFile, readdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { describeCommand, parseArguments, CommandError, validationError, type CommandDescriptor } from '@hbar/commands'
import {
  createBudgetCommandClient,
  createAttachmentCommandClient,
  createAttachmentSourceDescriptor,
  createAgentCommandClient,
  createDirectoryQueryAdapter,
  createFileCommandClient,
  createGoalPlanCommandClient,
  createInteractionCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createSettingsCommandClient,
} from '@hbar/client'
import { createAppRuntime } from '@hbar/app-runtime'
import { budgetCommands } from '@hbar/contracts/commands/budget'
import { agentCommands } from '@hbar/contracts/commands/agents'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { attachmentCommands, fileCommands } from '@hbar/contracts/commands/files'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { modelCommands } from '@hbar/contracts/commands/models'
import { runCommands } from '@hbar/contracts/commands/run'
import { navigationCommands, surfaceCommands } from '@hbar/contracts/commands'
import { settingsCommands, settingsScopeSchema } from '@hbar/contracts/commands/settings'
import { decodePath } from '@hbar/schema-core'
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
    const local = [
      navigationCommands['app.setSession'],
      ...Object.values(surfaceCommands),
      ...Object.values(attachmentCommands),
    ]
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
    const local = [
      navigationCommands['app.setSession'],
      ...Object.values(surfaceCommands),
      ...Object.values(attachmentCommands),
    ].find((definition) => definition.metadata.id === selector)
    output(
      JSON.stringify(local ? describeCommand(local) : await client.call('command.describe', { commandId: selector })),
    )
  } else throw new CommandError('INVALID_SYNTAX', 'Usage: hbar commands list|describe <commandId>')
}

export function isSurfaceCommand(value: string | undefined): value is keyof typeof surfaceCommands {
  return Boolean(value && Object.hasOwn(surfaceCommands, value))
}

export async function runSurfaceRelayCommand(
  args: CliArgs,
  client: HbarClient,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isSurfaceCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown surface command')
  if (!args.client) throw new CommandError('INVALID_INPUT', '--client is required for a remote surface command')
  let input: unknown
  if (args.inputJson) {
    try {
      input = JSON.parse(args.inputJson) as unknown
    } catch {
      throw new CommandError('INVALID_INPUT', '--input-json must contain JSON')
    }
  } else {
    const argv = [...args.commandArgs.slice(1)]
    for (const [flag, value] of [
      ['instance', args.instance],
      ['workspace', args.workspace],
      ['session', args.session],
      ['binding', args.binding],
      ['scope', args.scope],
      ['target', args.target],
      ['section', args.section],
      ['path', args.path],
      ['page', args.page],
    ] as const)
      if (value !== undefined && surfaceCommands[action].metadata.cli.arguments.some((item) => item.flag === flag))
        argv.push(`--${flag}`, value)
    input = parseArguments(surfaceCommands[action].metadata, argv)
  }
  const parsed = surfaceCommands[action].input.safeParse(input)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  const timeoutMs = args.timeout === undefined ? 5_000 : Number(args.timeout)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000)
    throw new CommandError('INVALID_INPUT', '--timeout must be an integer from 100 to 30000 milliseconds')
  output(
    await client.call('surface.invoke', {
      clientId: args.client,
      invocationId: args.invocationId ?? randomUUID(),
      commandId: action,
      input: parsed.data,
      timeoutMs,
    }),
  )
}

export function isSettingsCommand(value: string | undefined): value is keyof typeof settingsCommands {
  return Boolean(value && Object.hasOwn(settingsCommands, value))
}

export function isInteractionCommand(value: string | undefined): value is keyof typeof interactionCommands {
  return Boolean(value && Object.hasOwn(interactionCommands, value))
}

export function isGoalPlanCommand(value: string | undefined): value is keyof typeof goalPlanCommands {
  return Boolean(value && Object.hasOwn(goalPlanCommands, value))
}

export function isModelCommand(value: string | undefined): value is keyof typeof modelCommands {
  return Boolean(value && Object.hasOwn(modelCommands, value))
}

export function isAgentCommand(value: string | undefined): value is keyof typeof agentCommands {
  return Boolean(value && Object.hasOwn(agentCommands, value))
}

export async function runAgentCommand(
  args: CliArgs,
  runtime: CliRuntime,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isAgentCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown agent command')
  const commands = createAgentCommandClient(runtime.client)
  const argv = [...args.commandArgs.slice(1), '--session', runtime.session.id]
  if (action === 'agent.create') {
    if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required')
    argv.push('--model', args.model ? selectModel(runtime.bootstrap, args.model) : runtime.modelId)
    if (args.title !== undefined) argv.push('--title', args.title)
    if (args.tokenBudget !== undefined) argv.push('--token-budget', args.tokenBudget)
    if (args.thinkingExplicit) argv.push('--thinking', args.thinking)
    argv.push('--approval', args.approval)
    const input = agentCommands[action].input.safeParse(parseArguments(agentCommands[action].metadata, argv))
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(
      await commands.execute(action, input.data, {
        idempotencyKey: args.idempotencyKey,
        ...(args.requestId ? { requestId: args.requestId } : {}),
      }),
    )
    return
  }
  if (action === 'agent.list') {
    if (args.after !== undefined) argv.push('--after', args.after)
    if (args.limit !== undefined) argv.push('--limit', args.limit)
    const input = agentCommands[action].input.safeParse(parseArguments(agentCommands[action].metadata, argv))
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(await commands.execute(action, input.data))
    return
  }
  const input = agentCommands[action].input.safeParse(parseArguments(agentCommands[action].metadata, argv))
  if (!input.success) throw validationError('INVALID_INPUT', input.error)
  output(await commands.execute(action, input.data))
}

export function isFileCommand(
  value: string | undefined,
): value is keyof typeof fileCommands | keyof typeof attachmentCommands {
  return Boolean(value && (Object.hasOwn(fileCommands, value) || Object.hasOwn(attachmentCommands, value)))
}

export async function runFileCommand(
  args: CliArgs,
  runtime: Pick<CliRuntime, 'client' | 'project'>,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isFileCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown file command')
  if (action === 'attachment.upload') {
    const localPath = args.commandArgs[1]
    if (!localPath) throw new CommandError('INVALID_INPUT', 'A local attachment path is required')
    const absolute = resolve(localPath)
    const blob = Bun.file(absolute)
    if (!(await blob.exists())) throw new CommandError('SOURCE_NOT_FOUND', 'Attachment source was not found')
    if (blob.size < 1 || blob.size > 10 * 1024 * 1024)
      throw new CommandError('FILE_LIMIT', 'Attachment size must be between 1 byte and 10 MiB')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const name = basename(absolute)
    const mime = blob.type.trim().split(';', 1)[0]!.toLowerCase() || 'application/octet-stream'
    const sourceId = randomUUID()
    const file = new File([bytes], name, { type: mime })
    const uploads = createAttachmentCommandClient(runtime.client, {
      resolve(id) {
        if (id !== sourceId) throw new CommandError('SOURCE_NOT_FOUND', 'Attachment source expired')
        return file
      },
    })
    try {
      output(await uploads.execute('attachment.upload', await createAttachmentSourceDescriptor(sourceId, file)))
    } finally {
      uploads.dispose()
    }
    return
  }
  const commands = createFileCommandClient(runtime.client)
  if (action === 'attachment.query') {
    const input = fileCommands[action].input.safeParse(
      parseArguments(fileCommands[action].metadata, args.commandArgs.slice(1)),
    )
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(await commands.execute(action, input.data))
    return
  }
  const path = args.commandArgs[1] ?? (action === 'file.list' ? '.' : undefined)
  if (!path) throw new CommandError('INVALID_INPUT', 'A workspace-relative path is required')
  if (action === 'file.list') {
    const input = fileCommands[action].input.safeParse({
      workspaceId: runtime.project.id,
      path,
      ...(args.after ? { after: args.after } : {}),
      ...(args.limit === undefined ? {} : { limit: Number(args.limit) }),
    })
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(await commands.execute(action, input.data))
    return
  }
  if (action === 'file.read') {
    const input = fileCommands[action].input.safeParse({ workspaceId: runtime.project.id, path })
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(await commands.execute(action, input.data))
    return
  }
  if ((args.text === undefined) === (args.inputFile === undefined))
    throw new CommandError('INVALID_INPUT', 'Provide exactly one of --text or --input-file')
  const text = args.inputFile === undefined ? args.text! : await readFile(resolve(args.inputFile), 'utf8')
  let expectedSha256: string | null
  if (args.expectedSha256 === 'null') expectedSha256 = null
  else if (args.expectedSha256 !== undefined) expectedSha256 = args.expectedSha256
  else {
    try {
      expectedSha256 = (await commands.execute('file.read', { workspaceId: runtime.project.id, path })).sha256
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      expectedSha256 = null
    }
  }
  const input = fileCommands[action].input.safeParse({
    workspaceId: runtime.project.id,
    path,
    text,
    expectedSha256,
  })
  if (!input.success) throw validationError('INVALID_INPUT', input.error)
  output(await commands.execute(action, input.data))
}

export async function runModelListCommand(client: HbarClient, output: CommandOutput = writeStdout): Promise<void> {
  output(await createModelCommandClient(client).execute('model.list', {}))
}

export async function runSessionModelCommand(
  args: CliArgs,
  runtime: CliRuntime,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (action !== 'session.getModel' && action !== 'session.setModel' && action !== 'session.setThinkingLevel')
    throw new CommandError('COMMAND_NOT_FOUND', 'Unknown session model command')
  const argv = [...args.commandArgs.slice(1), '--session', runtime.session.id]
  const input = parseArguments(modelCommands[action].metadata, argv)
  if (action === 'session.getModel') {
    const parsed = modelCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await createModelCommandClient(runtime.client).execute(action, parsed.data))
    return
  }
  if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required')
  input.baselineRevisions =
    args.baselineJson !== undefined
      ? objectOption(args.baselineJson, '--baseline-json')
      : (await createModelCommandClient(runtime.client).execute('session.getModel', { sessionId: runtime.session.id }))
          .revisions
  const options = {
    idempotencyKey: args.idempotencyKey,
    ...(args.requestId ? { requestId: args.requestId } : {}),
  }
  if (action === 'session.setModel') {
    const parsed = modelCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await createModelCommandClient(runtime.client).execute(action, parsed.data, options))
  } else {
    const parsed = modelCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await createModelCommandClient(runtime.client).execute(action, parsed.data, options))
  }
}

function objectOption(source: string | undefined, name: string): Record<string, unknown> {
  const value = jsonOption(source, name)
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CommandError('INVALID_INPUT', `${name} must contain a JSON object`)
  return value as Record<string, unknown>
}

export async function runGoalPlanCommand(
  args: CliArgs,
  runtime: CliRuntime,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isGoalPlanCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown goal or plan command')
  const commands = createGoalPlanCommandClient(runtime.client)
  if (action === 'goal.set') {
    const parsed = goalPlanCommands[action].input.safeParse({
      ...objectOption(args.inputJson, '--input-json'),
      sessionId: runtime.session.id,
    })
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
    return
  }
  if (action === 'plan.update') {
    const parsed = goalPlanCommands[action].input.safeParse({
      ...objectOption(args.inputJson, '--input-json'),
      sessionId: runtime.session.id,
    })
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
    return
  }
  const argv = [...args.commandArgs.slice(1), '--session', runtime.session.id]
  if (action === 'goal.create' && args.tokenBudget !== undefined) argv.push('--token-budget', args.tokenBudget)
  const input = parseArguments(goalPlanCommands[action].metadata, argv)
  if (action === 'goal.get') {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  } else if (action === 'goal.create') {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  } else if (action === 'goal.update') {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  } else if (action === 'goal.clear') {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  } else if (action === 'plan.get') {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  } else {
    const parsed = goalPlanCommands[action].input.safeParse(input)
    if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
    output(await commands.execute(action, parsed.data))
  }
}

export async function runInteractionCommand(
  args: CliArgs,
  runtime: CliRuntime,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isInteractionCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown interaction command')
  const argv = [...args.commandArgs.slice(1), '--session', runtime.session.id]
  if (action === 'questionnaire.answer') {
    if (!args.inputJson) throw new CommandError('INVALID_INPUT', '--input-json must contain the answers object')
    argv.push('--answers', args.inputJson)
  }
  const input = parseArguments(interactionCommands[action].metadata, argv)
  const parsed = interactionCommands[action].input.safeParse(input)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  output(await createInteractionCommandClient(runtime.client).execute(action, parsed.data))
}
function settingsPath(value: string | undefined): ({ kind: 'field'; name: string } | { kind: 'item'; id: string })[] {
  if (!value) throw new CommandError('INVALID_INPUT', 'A settings path is required')
  return value.startsWith('f:')
    ? decodePath(value).map((segment) => ({ ...segment }))
    : [{ kind: 'field', name: value }]
}
function settingsScope(args: CliArgs) {
  const kind = args.scope
  const raw =
    kind === 'workspace'
      ? { kind, targetId: args.target ?? args.workspace }
      : kind === 'session'
        ? { kind, targetId: args.target ?? args.session }
        : { kind }
  const parsed = settingsScopeSchema.safeParse(raw)
  if (!parsed.success) throw validationError('INVALID_INPUT', parsed.error)
  return parsed.data
}
function jsonOption(source: string | undefined, name: string): unknown {
  if (source === undefined) throw new CommandError('INVALID_INPUT', `${name} is required`)
  try {
    return JSON.parse(source) as unknown
  } catch {
    throw new CommandError('INVALID_INPUT', `${name} must contain JSON`)
  }
}
export async function runSettingsCommand(
  args: CliArgs,
  client: HbarClient,
  output: CommandOutput = writeStdout,
): Promise<void> {
  const action = args.commandArgs[0]
  if (!isSettingsCommand(action)) throw new CommandError('COMMAND_NOT_FOUND', 'Unknown settings command')
  const commands = createSettingsCommandClient(client)
  if (action === 'settings.apply') {
    if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required')
    const input = settingsCommands[action].input.safeParse(jsonOption(args.inputJson, '--input-json'))
    if (!input.success) throw validationError('INVALID_INPUT', input.error)
    output(await commands.execute(action, input.data, { idempotencyKey: args.idempotencyKey }))
    return
  }
  const scope = settingsScope(args)
  if (action === 'settings.get') {
    output(
      await commands.execute(action, {
        scope,
        ...(args.commandArgs[1] || args.path ? { path: settingsPath(args.commandArgs[1] ?? args.path) } : {}),
      }),
    )
    return
  }
  if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required')
  const schemaVersion = args.schemaVersion === undefined ? 1 : Number(args.schemaVersion)
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1)
    throw new CommandError('INVALID_INPUT', '--schema-version must be a positive integer')
  let baselineRevisions: Record<string, number>
  if (args.baselineJson !== undefined) {
    const raw = jsonOption(args.baselineJson, '--baseline-json')
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.values(raw).some((value) => !Number.isSafeInteger(value) || (value as number) < 0)
    )
      throw new CommandError('INVALID_INPUT', '--baseline-json must map layer IDs to nonnegative revisions')
    baselineRevisions = raw as Record<string, number>
  } else baselineRevisions = (await commands.execute('settings.get', { scope })).revisions
  const path = settingsPath(args.commandArgs[1] ?? args.path)
  const commandInput =
    action === 'settings.set'
      ? { schemaVersion, scope, path, value: jsonOption(args.valueJson, '--value-json'), baselineRevisions }
      : { schemaVersion, scope, path, baselineRevisions }
  output(await commands.execute(action, commandInput, { idempotencyKey: args.idempotencyKey }))
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
    if (isAgentCommand(action)) {
      await runAgentCommand(args, runtime, output)
      return true
    }
    if (isFileCommand(action)) {
      await runFileCommand(args, runtime, output)
      return true
    }
    if (action === 'model.list') {
      await runModelListCommand(runtime.client, output)
      return true
    }
    if (action === 'session.getModel' || action === 'session.setModel' || action === 'session.setThinkingLevel') {
      await runSessionModelCommand(args, runtime, output)
      return true
    }
    if (isGoalPlanCommand(action)) {
      await runGoalPlanCommand(args, runtime, output)
      return true
    }
    if (isInteractionCommand(action)) {
      await runInteractionCommand(args, runtime, output)
      return true
    }
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
          : {
              text: args.message!,
              images: [],
              thinking: args.thinkingExplicit ? args.thinking : runtime.thinkingLevel,
              approval: args.approval,
            }
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
    if (!action || action === 'list') output(await createModelCommandClient(runtime.client).execute('model.list', {}))
    else if (action === 'use') {
      if (!selector) throw new Error('Usage: hbar model use <provider/model|id|name>')
      const modelId = selectModel(runtime.bootstrap, selector)
      if (!args.idempotencyKey) throw new CommandError('INVALID_INPUT', '--idempotency-key is required for model use')
      const before = await createModelCommandClient(runtime.client).execute('session.getModel', {
        sessionId: runtime.session.id,
      })
      const result = await createModelCommandClient(runtime.client).execute(
        'session.setModel',
        { sessionId: runtime.session.id, modelId, baselineRevisions: before.revisions },
        {
          idempotencyKey: args.idempotencyKey,
          ...(args.requestId ? { requestId: args.requestId } : {}),
        },
      )
      runtime.modelId = result.modelId ?? modelId
      runtime.thinkingLevel = result.thinkingLevel ?? runtime.thinkingLevel
      output(result)
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
