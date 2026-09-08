import { openSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { HbarClient } from '@hbar/client'
import { resolvePathLayout } from '@hbar/storage'
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
  await mkdir(layout.dataRoot, { recursive: true })
  const hostScript = resolve(import.meta.dir, '../../host/src/main.ts')
  const logPath = join(layout.diagnostics, 'host.log')
  await mkdir(layout.diagnostics, { recursive: true })
  const log = openSync(logPath, 'a', 0o600)
  const child = spawn(
    process.execPath,
    [
      hostScript,
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
    ],
    { detached: true, stdio: ['ignore', log, log], windowsHide: true },
  )
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
  return client.call('workspace.create', { path })
}

export async function openAttachedRuntime(
  url: string,
  token: string | undefined,
  options: { project?: string | undefined; session?: string | undefined; model?: string | undefined },
  pairingCode?: string,
): Promise<CliRuntime> {
  const layout = await resolvePathLayout()
  const client = new HbarClient(url, token)
  try {
    await client.connect()
  } catch (error) {
    if (!pairingCode) throw error
    await client.pair(pairingCode, 'hbar CLI')
  }
  const bootstrap = await client.call('system.bootstrap', {})
  const project = options.project
    ? await selectProject(client, bootstrap, options.project, false)
    : bootstrap.workspaces[0]
  if (!project) throw new Error('The attached Host has no projects')
  const session = await selectSession(client, bootstrap, project.id, options.session)
  return {
    client,
    layout,
    bootstrap,
    project,
    session,
    modelId: selectModel(bootstrap, options.model),
    close: () => client.disconnect(),
  }
}

export async function selectSession(
  client: HbarClient,
  bootstrap: Bootstrap,
  projectId: string,
  selector?: string,
) {
  const candidates = bootstrap.sessions.filter((session) => session.workspaceId === projectId)
  const chosen = selector ? candidates.find((session) => session.id === selector || session.title === selector) : undefined
  if (selector && !chosen) throw new Error(`Session not found in this project: ${selector}`)
  return chosen ?? candidates.find((session) => !session.archived) ?? client.call('session.create', { workspaceId: projectId })
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
  session?: string | undefined
  model?: string | undefined
  dataRoot?: string | undefined
  cacheRoot?: string | undefined
  demo?: boolean | undefined
  thinking?: ThinkingLevel | undefined
  approval?: ApprovalMode | undefined
}): Promise<CliRuntime> {
  const initialProject = resolve(options.project ?? process.cwd())
  const layout = await resolvePathLayout({ dataRoot: options.dataRoot, cacheRoot: options.cacheRoot })
  if (!(await connection(layout)))
    await startHost(layout, (await isDirectory(initialProject)) ? initialProject : process.cwd(), Boolean(options.demo))
  const file = await connection(layout)
  if (!file) throw new Error('Host connection is unavailable')
  const client = new HbarClient(file.url, file.token)
  await client.connect()
  let bootstrap = await client.call('system.bootstrap', {})
  const project = await selectProject(client, bootstrap, options.project)
  bootstrap = await client.call('system.bootstrap', {})
  const session = await selectSession(client, bootstrap, project.id, options.session)
  const modelId = selectModel(bootstrap, options.model)
  return { client, layout, bootstrap, project, session, modelId, close: () => client.disconnect() }
}

function jsonLine(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function eventLine(event: SessionEvent, run: Run) {
  const base = { runId: run.id, sessionId: run.sessionId }
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
      if (notification.method !== 'session.event' || notification.params.runId !== run.id) return
      const event = notification.params
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
          void client
            .call('approval.resolve', {
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
            void client
              .call('approval.resolve', {
                approvalId: item.id,
                decision: String(answer).trim().toLowerCase().startsWith('y') ? 'allowed' : 'denied',
              })
              .catch(reject)
          })
        }
      }
      if (event.type === 'run.settled') {
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
  if (finalRun.status !== 'completed') throw new Error(`Run ${finalRun.status}: ${finalRun.error ?? 'no details'}`)
  return { run: finalRun, snapshot, assistant, events }
}
