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
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { NamedContextStore } from './context.ts'
import { resolvePathLayout } from '@hbar/storage'
import { hostProcessCommand } from './host-process.ts'
import { queuedRunGuidedOperationId } from '@hbar/contracts/commands/run'
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

interface VerifiedConnectionFile extends ConnectionFile {
  instanceId: string
}

type ConnectOnlyFailureCode =
  | 'NO_SAVED_CONNECTION'
  | 'INVALID_CONNECTION'
  | 'HEALTH_UNAVAILABLE'
  | 'HEALTH_REJECTED'
  | 'HEALTH_INVALID_RESPONSE'
  | 'HEALTH_IDENTITY_MISSING'
  | 'HEALTH_INSTANCE_MISMATCH'
  | 'WEBSOCKET_INSTANCE_MISMATCH'
  | 'HOST_AUTHENTICATION_FAILED'
  | 'HOST_DISCONNECTED'
  | 'HOST_HANDSHAKE_TIMEOUT'
  | 'HOST_HANDSHAKE_FAILED'

class ConnectOnlyError extends Error {
  constructor(
    readonly code: ConnectOnlyFailureCode,
    message: string,
  ) {
    super(message)
    this.name = 'ConnectOnlyError'
  }
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

async function existingConnection(layout: CliRuntime['layout']): Promise<VerifiedConnectionFile> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(layout.connectionFile, 'utf8')) as unknown
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    if (code === 'ENOENT')
      throw new ConnectOnlyError('NO_SAVED_CONNECTION', 'Connect-only failed: no saved Host connection')
    throw new ConnectOnlyError('INVALID_CONNECTION', 'Connect-only failed: invalid Host connection file')
  }
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('url' in raw) ||
    typeof raw.url !== 'string' ||
    !('token' in raw) ||
    typeof raw.token !== 'string' ||
    ('instanceId' in raw && typeof raw.instanceId !== 'string')
  )
    throw new ConnectOnlyError('INVALID_CONNECTION', 'Connect-only failed: invalid Host connection file')
  const value: ConnectionFile = {
    url: raw.url,
    token: raw.token,
    ...('instanceId' in raw && typeof raw.instanceId === 'string' ? { instanceId: raw.instanceId } : {}),
  }
  let health: Response
  try {
    health = await fetch(`${value.url}/healthz`, { signal: AbortSignal.timeout(1200) })
  } catch {
    throw new ConnectOnlyError('HEALTH_UNAVAILABLE', 'Connect-only failed: saved Host health check was unavailable')
  }
  if (!health.ok)
    throw new ConnectOnlyError(
      'HEALTH_REJECTED',
      `Connect-only failed: saved Host health check returned HTTP ${health.status}`,
    )
  let status: unknown
  try {
    status = await health.json()
  } catch {
    throw new ConnectOnlyError(
      'HEALTH_INVALID_RESPONSE',
      'Connect-only failed: saved Host returned an invalid health response',
    )
  }
  if (!status || typeof status !== 'object' || !('ready' in status) || status.ready !== true)
    throw new ConnectOnlyError('HEALTH_REJECTED', 'Connect-only failed: saved Host is not healthy')
  const instanceId =
    status && typeof status === 'object' && 'instanceId' in status && typeof status.instanceId === 'string'
      ? status.instanceId
      : undefined
  if (!instanceId)
    throw new ConnectOnlyError(
      'HEALTH_IDENTITY_MISSING',
      'Connect-only failed: saved Host health response has no instance identity',
    )
  if (value.instanceId && instanceId !== value.instanceId)
    throw new ConnectOnlyError(
      'HEALTH_INSTANCE_MISMATCH',
      'Connect-only failed: saved Host instance identity does not match',
    )
  return { ...value, instanceId }
}

type StartHost = typeof startHost

async function connectExistingHost(client: HbarClient, expectedInstanceId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const host = await Promise.race([
      client.connect(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new ConnectOnlyError('HOST_HANDSHAKE_TIMEOUT', 'Connect-only failed: Host WebSocket handshake timed out'),
          )
          client.disconnect()
        }, 3_000)
      }),
    ])
    if (host.instanceId !== expectedInstanceId)
      throw new ConnectOnlyError(
        'WEBSOCKET_INSTANCE_MISMATCH',
        'Connect-only failed: Host instance identity changed after health check',
      )
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function startHost(layout: CliRuntime['layout'], project: string, demo: boolean) {
  await mkdir(layout.dataRoot, { recursive: true })
  const logPath = join(layout.diagnostics, 'host.log')
  await mkdir(layout.diagnostics, { recursive: true })
  const log = openSync(logPath, 'a', 0o600)
  const command = hostProcessCommand([
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
  options: {
    project?: string | undefined
    session?: string | undefined
    model?: string | undefined
    connectOnly?: boolean | undefined
  },
  pairingCode?: string,
): Promise<CliRuntime> {
  const layout = await resolvePathLayout()
  const client = new HbarClient(url, token)
  try {
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
    const session = await selectSession(client, bootstrap, project.id, options.session, !options.connectOnly)
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
  } catch (error) {
    client.disconnect()
    throw error
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

export async function openRuntime(
  options: {
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
    connectOnly?: boolean | undefined
    explicitSessionCreate?: boolean | undefined
  },
  startHostImpl: StartHost = startHost,
): Promise<CliRuntime> {
  const { client, layout } = await openCatalogClient(options, startHostImpl)
  try {
    let bootstrap = await client.call('system.bootstrap', {})
    const saved = options.context ? await new NamedContextStore(layout.dataRoot).get(options.context) : null
    const project = await selectProject(client, bootstrap, options.project ?? saved?.workspaceId, !options.connectOnly)
    bootstrap = await client.call('system.bootstrap', {})
    const session = await selectSession(
      client,
      bootstrap,
      project.id,
      options.session ?? (options.project ? undefined : saved?.sessionId),
      options.createSession !== false && (!options.connectOnly || options.explicitSessionCreate === true),
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
  } catch (error) {
    client.disconnect()
    throw error
  }
}

export async function openCatalogClient(
  options: {
    project?: string | undefined
    dataRoot?: string | undefined
    cacheRoot?: string | undefined
    demo?: boolean | undefined
    connectOnly?: boolean | undefined
  },
  startHostImpl: StartHost = startHost,
) {
  const initialProject = resolve(options.project ?? process.cwd())
  const layout = await resolvePathLayout({ dataRoot: options.dataRoot, cacheRoot: options.cacheRoot })
  let file: ConnectionFile
  let expectedInstanceId: string | undefined
  if (options.connectOnly) {
    const verified = await existingConnection(layout)
    file = verified
    expectedInstanceId = verified.instanceId
  } else {
    if (!(await connection(layout)))
      await startHostImpl(
        layout,
        (await isDirectory(initialProject)) ? initialProject : process.cwd(),
        Boolean(options.demo),
      )
    const connected = await connection(layout)
    if (!connected) throw new Error('Host connection is unavailable')
    file = connected
  }
  const client = new HbarClient(file.url, file.token)
  try {
    if (options.connectOnly) {
      if (!expectedInstanceId)
        throw new ConnectOnlyError('HEALTH_IDENTITY_MISSING', 'Connect-only failed: saved Host identity is unavailable')
      await connectExistingHost(client, expectedInstanceId)
    } else await client.connect()
  } catch (error) {
    client.disconnect()
    if (options.connectOnly) {
      if (error instanceof ConnectOnlyError) throw error
      const hostErrorCode =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined
      if (hostErrorCode === 'UNAUTHORIZED')
        throw new ConnectOnlyError(
          'HOST_AUTHENTICATION_FAILED',
          'Connect-only failed: Host authentication was rejected',
        )
      if (hostErrorCode === 'TIMEOUT')
        throw new ConnectOnlyError('HOST_HANDSHAKE_TIMEOUT', 'Connect-only failed: Host WebSocket handshake timed out')
      if (hostErrorCode === 'DISCONNECTED')
        throw new ConnectOnlyError('HOST_DISCONNECTED', 'Connect-only failed: Host disconnected after health check')
      throw new ConnectOnlyError('HOST_HANDSHAKE_FAILED', 'Connect-only failed: Host WebSocket handshake failed')
    }
    throw error
  }
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
  const events: SessionEvent[] = []
  const seen = new Set<string>()
  const approvals = new Set<string>()
  let settled = false
  let unsubscribe = () => {}
  let streamedText = false
  if (output === 'jsonl') jsonLine({ type: 'run.started', runId: run.id, sessionId: run.sessionId })
  const done = new Promise<void>((resolveDone, reject) => {
    unsubscribe = client.onEvent((notification) => {
      if (notification.method === 'stream.update' && notification.params.runId === run.id) {
        const delta = notification.params
        observer.onDelta?.(delta)
        if (output === 'jsonl')
          jsonLine({
            type: 'message.delta',
            runId: run.id,
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
      const guided = queuedRunGuidedOperationId(event) === run.id
      if (event.runId !== run.id && !guided) return
      if (seen.has(event.eventId)) return
      seen.add(event.eventId)
      events.push(event)
      observer.onEvent?.(event)
      if (output === 'jsonl') jsonLine(eventLine(event, run))
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
        settled = true
        resolveDone()
      }
    })
  })
  try {
    await client.follow(session.id, session.seq)
    const immediate = await client.call('session.snapshot', { sessionId: session.id })
    const current = immediate.runs.find((item) => item.id === run.id)
    if (current && !['queued', 'running', 'waiting_approval'].includes(current.status)) settled = true
    if (!settled) await done
  } finally {
    unsubscribe()
  }
  const snapshot = await client.call('session.snapshot', { sessionId: session.id })
  const assistant = snapshot.messages
    .filter((message) => message.runId === run.id && message.role === 'assistant')
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
  const finalRun = snapshot.runs.find((item) => item.id === run.id) ?? run
  if (finalRun.status !== 'completed' && finalRun.status !== 'guided')
    throw new Error(`Run ${finalRun.status}: ${finalRun.error ?? 'no details'}`)
  return { run: finalRun, snapshot, assistant, events }
}
