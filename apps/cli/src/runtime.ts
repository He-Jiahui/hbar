import { openSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { HbarClient } from '@hbar/client'
import { resolvePathLayout } from '@hbar/storage'
import type { Bootstrap, Session, ThinkingLevel, ApprovalMode, Run, SessionEvent } from '@hbar/contracts'

export interface CliRuntime {
  client: HbarClient
  layout: Awaited<ReturnType<typeof resolvePathLayout>>
  bootstrap: Bootstrap
  project: Bootstrap['workspaces'][number]
  session: Session
  modelId: string
  close(): void
}

interface ConnectionFile { url: string; token: string; instanceId?: string }

async function connection(layout: CliRuntime['layout']): Promise<ConnectionFile | undefined> {
  try {
    const value = JSON.parse(await readFile(layout.connectionFile, 'utf8')) as ConnectionFile
    const health = await fetch(`${value.url}/healthz`, { signal: AbortSignal.timeout(1200) })
    const status = (await health.json()) as { instanceId?: string }
    if (health.ok && (!value.instanceId || status.instanceId === value.instanceId)) return value
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
  const child = spawn(process.execPath, [hostScript, '--desktop', '--host', '127.0.0.1', '--port', '0', '--data-root', layout.dataRoot, '--cache-root', layout.cacheRoot, '--workspace', project, ...(demo ? ['--demo'] : [])], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  })
  child.unref()
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    const value = await connection(layout)
    if (value) return
    await Bun.sleep(100)
  }
  throw new Error(`Host startup timed out; inspect ${logPath}`)
}

async function selectSession(client: HbarClient, bootstrap: Bootstrap, projectId: string, selector?: string) {
  const candidates = bootstrap.sessions.filter((session) => session.workspaceId === projectId)
  const chosen = selector && candidates.find((session) => session.id === selector || session.title === selector)
  if (chosen) return chosen
  return candidates.find((session) => !session.archived) ?? (await client.call('session.create', { workspaceId: projectId }))
}

function selectModel(bootstrap: Bootstrap, selector?: string) {
  const model = selector
    ? bootstrap.models.find((value) => value.id === selector || value.name === selector || `${value.id}/${value.model}` === selector || `${value.id}/${value.model}`.toLowerCase() === selector.toLowerCase())
    : bootstrap.models[0]
  if (!model) throw new Error('No model configured. Add a provider in Settings or pass --demo.')
  return model.id
}

export async function openRuntime(options: { project?: string | undefined; session?: string | undefined; model?: string | undefined; dataRoot?: string | undefined; cacheRoot?: string | undefined; demo?: boolean | undefined; thinking?: ThinkingLevel | undefined; approval?: ApprovalMode | undefined }): Promise<CliRuntime> {
  const projectPath = resolve(options.project ?? process.cwd())
  const layout = await resolvePathLayout({ dataRoot: options.dataRoot, cacheRoot: options.cacheRoot })
  if (!(await connection(layout))) {
    await startHost(layout, projectPath, Boolean(options.demo))
  }
  const file = await connection(layout)
  if (!file) throw new Error('Host connection is unavailable')
  const client = new HbarClient(file.url, file.token)
  await client.connect()
  let bootstrap = await client.call('system.bootstrap', {})
  let project = bootstrap.workspaces.find((workspace) => resolve(workspace.path) === projectPath || workspace.name === options.project)
  if (!project) {
    project = await client.call('workspace.create', { path: projectPath })
    bootstrap = await client.call('system.bootstrap', {})
  }
  const session = await selectSession(client, bootstrap, project.id, options.session)
  const modelId = selectModel(bootstrap, options.model)
  return { client, layout, bootstrap, project, session, modelId, close: () => client.disconnect() }
}

export async function waitForRun(client: HbarClient, session: Session, run: Run, output: 'text' | 'jsonl', approval: ApprovalMode) {
  const events: SessionEvent[] = []
  let settled: SessionEvent | undefined
  const approvals = new Set<string>()
  let unsubscribe = () => {}
  const done = new Promise<void>((resolveDone, reject) => {
    unsubscribe = client.onEvent((notification) => {
      if (notification.method === 'stream.update' && notification.params.runId === run.id && output === 'text') {
        process.stderr.write('\r' + (notification.params.thinking ? '[thinking] ' : '') + notification.params.text.slice(-120).replaceAll('\n', ' '))
      }
      if (notification.method !== 'session.event' || notification.params.runId !== run.id) return
      const event = notification.params
      events.push(event)
      if (event.type === 'approval.requested') {
        const item = event.data as { id: string }
        if (!approvals.has(item.id)) {
          approvals.add(item.id)
          if (approval === 'allow' || approval === 'deny') void client.call('approval.resolve', { approvalId: item.id, decision: approval === 'allow' ? 'allowed' : 'denied' }).catch(reject)
          else if (!process.stdin.isTTY || !process.stdout.isTTY) reject(new Error('Approval requested in non-interactive headless mode'))
          else {
            process.stderr.write(`\nApprove ${String((event.data as { tool?: string }).tool)}? [y/N] `)
            process.stdin.once('data', (answer) => {
              void client.call('approval.resolve', { approvalId: item.id, decision: String(answer).trim().toLowerCase().startsWith('y') ? 'allowed' : 'denied' }).catch(reject)
            })
          }
        }
      }
      if (event.type === 'run.settled') {
        settled = event
        unsubscribe()
        resolveDone()
      }
    })
  })
  await client.follow(session.id, session.seq)
  const immediate = await client.call('session.snapshot', { sessionId: session.id })
  const current = immediate.runs.find((item) => item.id === run.id)
  if (current && !['queued', 'running', 'waiting_approval'].includes(current.status)) {
    settled = { eventId: randomId(), sessionId: session.id, seq: immediate.cursor, runId: run.id, stepId: null, type: 'run.settled', data: { run: current }, time: Date.now(), version: 1 }
    unsubscribe()
    return finish(client, session, run, output, events, settled)
  }
  await done
  await finish(client, session, run, output, events, settled)
}

function randomId() { return crypto.randomUUID() }
async function finish(client: HbarClient, session: Session, run: Run, output: 'text' | 'jsonl', events: SessionEvent[], settled?: SessionEvent) {
  if (output === 'jsonl') for (const event of events) process.stdout.write(`${JSON.stringify({ type: event.type, runId: run.id, sessionId: session.id, event })}\n`)
  const snapshot = await client.call('session.snapshot', { sessionId: session.id })
  const assistant = snapshot.messages.filter((message) => message.runId === run.id && message.role === 'assistant').at(-1)
  if (output === 'text') {
    process.stderr.write('\n')
    if (assistant) process.stdout.write(`${assistant.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')}\n`)
  }
  const status = (settled?.data as { run?: Run })?.run?.status
  if (status && status !== 'completed') throw new Error(`Run ${status}`)
}
