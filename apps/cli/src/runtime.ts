import { openSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  HbarClient,
  createConnectionCommands,
  createInteractionCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { NamedContextStore } from './context.ts'
import { resolvePathLayout } from '@hbar/storage'
import { hostProcessCommand } from './host-process.ts'
import { queuedRunGuidedOperationId, admitOperationRecovery } from '@hbar/contracts/commands/run'
import type {
  ApprovalMode,
  Bootstrap,
  Message,
  Run,
  Session,
  SessionEvent,
  SessionSnapshot,
  StreamDelta,
  ThinkingLevel,
} from '@hbar/contracts'

export interface CliRuntime {
  client: HbarClient
  layout: Awaited<ReturnType<typeof resolvePathLayout>>
  bootstrap: Bootstrap
  project: Bootstrap['workspaces'][number]
  session: Session
  modelId: string
  thinkingLevel: ThinkingLevel
  close(): void
}

export interface RunObserver {
  onDelta?(delta: StreamDelta): void
  onEvent?(event: SessionEvent): void
}

export interface RunResult {
  run: Run
  snapshot: SessionSnapshot
  assistant?: Message | undefined
  events: SessionEvent[]
}

interface ConnectionFile {
  url: string
  token: string
  instanceId?: string
}

async function connection(layout: CliRuntime['layout']): Promise<ConnectionFile | undefined> {
  try {
    const raw: unknown = JSON.parse(await readFile(layout.connectionFile, 'utf8')) as unknown
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('url' in raw) ||
      typeof raw.url !== 'string' ||
      !('token' in raw) ||
      typeof raw.token !== 'string'
    )
      return undefined
    const value: ConnectionFile = {
      url: raw.url,
      token: raw.token,
      ...('instanceId' in raw && typeof raw.instanceId === 'string' ? { instanceId: raw.instanceId } : {}),
    }
    const health = await fetch(`${value.url}/healthz`, { signal: AbortSignal.timeout(1200) })
    const status: unknown = await health.json()
    const instanceId =
      status && typeof status === 'object' && 'instanceId' in status && typeof status.instanceId === 'string'
        ? status.instanceId
        : undefined
    if (health.ok && (!value.instanceId || instanceId === value.instanceId)) return value
  } catch {
    return undefined
  }
  return undefined
}

async function startHost(layout: CliRuntime['layout'], project: string, demo: boolean) {
  let existingOwner = false
  try {
    const record: unknown = JSON.parse(await readFile(`${layout.hostLock}.supervisor`, 'utf8'))
    if (typeof record === 'object' && record !== null && 'pid' in record && typeof record.pid === 'number' && Number.isSafeInteger(record.pid) && record.pid > 0) {
      try { process.kill(record.pid, 0); existingOwner = true } catch { /* Owner has exited. */ }
    }
  } catch { /* No launcher has claimed this isolated data root yet. */ }
  if (existingOwner) {
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      if (await connection(layout)) return
      await Bun.sleep(100)
    }
    throw new Error('The managed Host is recovering; inspect its diagnostics before starting another owner')
  }
  await mkdir(layout.dataRoot, { recursive: true })
  const logPath = join(layout.diagnostics, 'host.log')
  await mkdir(layout.diagnostics, { recursive: true })
  const log = openSync(logPath, 'a', 0o600)
  const command = hostProcessCommand([
    '--supervisor',
    '--desktop',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--data-root',
    layout.dataRoot,
    '--cache-root',
    layout.cacheRoot,
    '--workspace',
    project,
    ...(demo ? ['--demo'] : []),
  ])
  const child = spawn(command[0], command.slice(1), {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  })
  child.unref()
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    if (await connection(layout)) return
    await Bun.sleep(100)
  }
  throw new Error(`Host startup timed out; inspect ${logPath}`)
}

async function isDirectory(path: string) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export async function selectProject(
  client: HbarClient,
  bootstrap: Bootstrap,
  selector: string | undefined,
  allowCreate = true,
) {
  const path = resolve(selector ?? process.cwd())
  const existing = bootstrap.workspaces.find(
    (workspace) => workspace.id === selector || workspace.name === selector || resolve(workspace.path) === path,
  )
  if (existing) return existing
  if (!allowCreate) throw new Error(`Project not found on the attached Host: ${selector ?? 'default'}`)
  if (!(await isDirectory(path))) throw new Error(`Project not found by path, id, or name: ${selector}`)
  return createWorkspaceSessionCommandClient(client).execute('workspace.create', { path })
}

export async function openAttachedRuntime(
  url: string,
  token: string | undefined,
  options: { project?: string | undefined; session?: string | undefined; model?: string | undefined },
  pairingCode?: string,
): Promise<CliRuntime> {
  const layout = await resolvePathLayout()
  const client = new HbarClient(url, token)
  const connection = createConnectionCommands(client)
  try {
    try {
      await connection.execute('connection.connect', {})
    } catch (error) {
      if (!pairingCode) throw error
      await connection.execute('pairing.accept', { code: pairingCode, name: 'hbar CLI' })
    }
  } finally {
    connection.dispose()
  }
  const bootstrap = await client.call('system.bootstrap', {})
  const project = options.project
    ? await selectProject(client, bootstrap, options.project, false)
    : bootstrap.workspaces[0]
  if (!project) throw new Error('The attached Host has no projects')
  const session = await selectSession(client, bootstrap, project.id, options.session)
  const configured = await createModelCommandClient(client).execute('session.getModel', { sessionId: session.id })
  return {
    client,
    layout,
    bootstrap,
    project,
    session,
    modelId: options.model ? selectModel(bootstrap, options.model) : (configured.modelId ?? selectModel(bootstrap)),
    thinkingLevel: configured.thinkingLevel ?? 'off',
    close: () => client.disconnect(),
  }
}

export async function selectSession(
  client: HbarClient,
  bootstrap: Bootstrap,
  projectId: string,
  selector?: string,
  allowCreate = true,
) {
  const candidates = bootstrap.sessions.filter((session) => session.workspaceId === projectId)
  const chosen = selector
    ? candidates.find((session) => session.id === selector || session.title === selector)
    : undefined
  if (selector && !chosen) throw new Error(`Session not found in this project: ${selector}`)
  const selected = chosen ?? candidates.find((session) => !session.archived)
  if (selected) return selected
  if (!allowCreate) throw new Error('Session not found in this project')
  return createWorkspaceSessionCommandClient(client).execute(
    'session.create',
    { workspaceId: projectId },
    { idempotencyKey: randomUUID() },
  )
}

export function selectModel(bootstrap: Bootstrap, selector?: string) {
  const normalized = selector?.toLowerCase()
  const model = selector
    ? bootstrap.models.find(
        (value) =>
          value.id === selector ||
          value.name.toLowerCase() === normalized ||
          value.model === selector ||
          `${value.id}/${value.model}`.toLowerCase() === normalized,
      )
    : bootstrap.models[0]
  if (!model) throw new Error(`Model not found: ${selector ?? 'no model configured'}`)
  return model.id
}

export async function openRuntime(options: {
  project?: string | undefined
  context?: string | undefined
  session?: string | undefined
  model?: string | undefined
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  demo?: boolean | undefined
  thinking?: ThinkingLevel | undefined
  thinkingExplicit?: boolean | undefined
  approval?: ApprovalMode | undefined
  modelRequired?: boolean | undefined
  createSession?: boolean | undefined
}): Promise<CliRuntime> {
  const { client, layout } = await openCatalogClient(options)
  let bootstrap = await client.call('system.bootstrap', {})
  const saved = options.context ? await new NamedContextStore(layout.dataRoot).get(options.context) : null
  const project = await selectProject(client, bootstrap, options.project ?? saved?.workspaceId)
  bootstrap = await client.call('system.bootstrap', {})
  const session = await selectSession(
    client,
    bootstrap,
    project.id,
    options.session ?? (options.project ? undefined : saved?.sessionId),
    options.createSession !== false,
  )
  const configured = await createModelCommandClient(client).execute('session.getModel', { sessionId: session.id })
  const modelId =
    options.modelRequired === false
      ? (configured.modelId ?? '')
      : options.model
        ? selectModel(bootstrap, options.model)
        : (configured.modelId ?? selectModel(bootstrap))
  const thinkingLevel = options.thinkingExplicit
    ? (options.thinking ?? 'off')
    : (configured.thinkingLevel ?? options.thinking ?? 'off')
  return { client, layout, bootstrap, project, session, modelId, thinkingLevel, close: () => client.disconnect() }
}

export async function openCatalogClient(options: {
  project?: string | undefined
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  demo?: boolean | undefined
}) {
  const initialProject = resolve(options.project ?? process.cwd())
  const layout = await resolvePathLayout({ dataRoot: options.dataRoot, cacheRoot: options.cacheRoot })
  if (!(await connection(layout)))
    await startHost(layout, (await isDirectory(initialProject)) ? initialProject : process.cwd(), Boolean(options.demo))
  const file = await connection(layout)
  if (!file) throw new Error('Host connection is unavailable')
  const client = new HbarClient(file.url, file.token)
  await client.connect()
  return { client, layout }
}

function jsonLine(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function eventLine(event: SessionEvent, run: Run) {
  const base = { runId: run.id, sessionId: run.sessionId }
  if (queuedRunGuidedOperationId(event) === run.id) return { type: 'run.guided', ...base, guidance: event.data }
  if (event.type === 'tool.started') {
    const data = event.data as { callId?: unknown; name?: unknown }
    return { type: 'tool.started', ...base, callId: data.callId, tool: data.name }
  }
  if (event.type === 'approval.requested') {
    const data = event.data as { id?: unknown; tool?: unknown }
    return { type: 'approval.requested', ...base, approvalId: data.id, tool: data.tool }
  }
  if (event.type === 'message.committed') return { type: 'message.committed', ...base, message: event.data }
  if (event.type === 'run.settled') {
    const status = (event.data as { run?: { status?: unknown } }).run?.status
    return { type: status === 'completed' ? 'run.completed' : 'run.failed', ...base, status }
  }
  return { type: event.type, ...base, eventId: event.eventId, seq: event.seq, data: event.data }
}

export async function waitForRun(
  client: HbarClient,
  session: Session,
  run: Run,
  output: 'text' | 'jsonl' | 'silent',
  approval: ApprovalMode | 'defer',
  observer: RunObserver = {},
): Promise<RunResult> {
  const interactions = createInteractionCommandClient(client)
  const operations = createRunCommandClient(client)
  const runIds = new Set([run.id])
  let executionRunId = run.id
  const events: SessionEvent[] = []
  const seen = new Set<string>()
  const approvals = new Set<string>()
  let settled = false
  let streamedText = false
  let probing = false
  let recoveryReason: string | null = null
  const completion = Promise.withResolvers<void>()
  const probe = async () => {
    if (settled || probing) return
    probing = true
    try {
      const state = await operations.execute('operation.get', { operationId: run.id })
      executionRunId = state.executionRunId ?? run.id
      recoveryReason = state.recovery?.reasonCode ?? null
      runIds.add(executionRunId)
      const active = ['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(state.status) || state.recoveryPending ||
        (state.recovery && ['pending', 'running'].includes(state.recovery.status))
      if (!active) { settled = true; completion.resolve() }
    } catch {
      // Safe reads retry while an owner or connection is recovering; accepted work is never resubmitted.
    } finally { probing = false }
  }
  if (output === 'jsonl') jsonLine({ type: 'run.started', runId: run.id, sessionId: run.sessionId })
  const done = completion.promise
  const reject = completion.reject
  const timer = setInterval(() => { probe().catch(reject) }, 500)
  timer.unref()
  const unsubscribe = client.onEvent((notification) => {
      if (notification.method === 'stream.update' && runIds.has(notification.params.runId)) {
        const delta = notification.params
        observer.onDelta?.(delta)
        if (output === 'jsonl')
          jsonLine({
            type: 'message.delta',
            runId: delta.runId,
            sessionId: run.sessionId,
            streamId: delta.id,
            operation: delta.operation,
            text: delta.text,
            thinking: delta.thinking,
            textOffset: delta.textOffset,
            thinkingOffset: delta.thinkingOffset,
          })
        else if (output === 'text') {
          if (delta.text) {
            streamedText = true
            process.stdout.write(delta.text)
          }
          if (delta.thinking) process.stderr.write(delta.thinking)
        }
        return
      }
      if (notification.method !== 'session.event') return
      const event = notification.params
      admitOperationRecovery(event, runIds)
      if (event.type === 'run.recoveryQueued' && event.runId && runIds.has(event.runId)) executionRunId = event.runId
      const guided = queuedRunGuidedOperationId(event) === run.id
      if ((!event.runId || !runIds.has(event.runId)) && !guided) return
      if (seen.has(event.eventId)) return
      seen.add(event.eventId)
      if (seen.size > 4_096) seen.delete(seen.values().next().value!)
      events.push(event)
      if (events.length > 4_096) events.shift()
      observer.onEvent?.(event)
      if (output === 'jsonl') jsonLine(eventLine(event, { ...run, id: event.runId ?? run.id }))
      else if (output === 'text' && event.type === 'tool.started') {
        const data = event.data as { name?: unknown }
        process.stderr.write(`\n[tool] ${String(data.name ?? 'unknown')}\n`)
      }
      if (event.type === 'approval.requested') {
        const item = event.data as { id: string; tool?: string }
        if (approvals.has(item.id)) return
        approvals.add(item.id)
        if (approval === 'allow' || approval === 'deny')
          void interactions
            .execute('approval.resolve', {
              sessionId: run.sessionId,
              approvalId: item.id,
              decision: approval === 'allow' ? 'allowed' : 'denied',
            })
            .catch(reject)
        else if (approval === 'defer') return
        else if (!process.stdin.isTTY || !process.stdout.isTTY)
          reject(new Error('Approval requested in non-interactive headless mode'))
        else {
          process.stderr.write(`\nApprove ${item.tool ?? 'tool'}? [y/N] `)
          process.stdin.once('data', (answer) => {
            void interactions
              .execute('approval.resolve', {
                sessionId: run.sessionId,
                approvalId: item.id,
                decision: String(answer).trim().toLowerCase().startsWith('y') ? 'allowed' : 'denied',
              })
              .catch(reject)
          })
        }
      }
      if (event.type === 'run.settled' || guided) {
        // An interrupted identity stays truthful; only the recovery chain's eventual terminal result ends the waiter.
        probe().catch(reject)
      }
  })
  const offStatus = client.onStatus(status => { if (status === 'disconnected') reject(new Error('Run observation stopped because the connection was explicitly closed or authorization was revoked')) })
  try {
    await client.follow(session.id, session.seq)
    await probe()
    if (!settled) await done
  } finally {
    unsubscribe()
    offStatus()
    clearInterval(timer)
  }
  const snapshot = await client.call('session.snapshot', { sessionId: session.id })
  const assistant = snapshot.messages
    .filter((message) => message.runId === executionRunId && message.role === 'assistant')
    .at(-1)
  if (output === 'text') {
    if (!streamedText && assistant)
      process.stdout.write(
        assistant.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n'),
      )
    process.stdout.write('\n')
  }
  const finalRun = snapshot.runs.find((item) => item.id === executionRunId) ?? run
  if (finalRun.status !== 'completed' && finalRun.status !== 'guided')
    throw new Error(`Run ${finalRun.status}: ${recoveryReason ?? finalRun.error ?? 'no details'}`)
  return { run: finalRun, snapshot, assistant, events }
}
