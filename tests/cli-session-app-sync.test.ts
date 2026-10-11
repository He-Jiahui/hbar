/**
 * Windows CLI restoration and the shared App SDK projection, through real
 * CLI subprocesses and an isolated Host. Ownership fences protect cleanup.
 */
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { test } from 'bun:test'
import { planStateSchema, threadGoalSchema } from '@hbar/contracts'
import { operationSnapshotSchema, runAcceptedSchema } from '@hbar/contracts/commands/run'
import {
  HbarClient,
  createGoalPlanCommandClient,
  createSessionTimelineClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'

type CliResult = { code: number; stdout: string; stderr: string }
const cli = resolve('apps/cli/src/main.ts')
let activeSignal: AbortSignal | undefined
const jsonRecordSchema = z.record(z.string(), z.unknown())
const runStartedSchema = z.object({ type: z.literal('run.started'), sessionId: z.string().min(1) })
const runCompletedSchema = z.object({ type: z.literal('run.completed') })
function stableGoal(value: { goal: z.infer<typeof threadGoalSchema> | null }) {
  return (
    value.goal && {
      goalId: value.goal.goalId ?? null,
      objective: value.goal.objective,
      status: value.goal.status,
      tokenBudget: value.goal.tokenBudget,
    }
  )
}
function stablePlan(value: z.infer<typeof planStateSchema> | null) {
  return value && { revision: value.revision, plan: value.plan }
}

async function runCli(root: string, project: string, args: string[], timeoutMs = 30_000): Promise<CliResult> {
  if (activeSignal?.aborted) throw activeSignal.reason ?? new Error('CLI sync deadline expired')
  const child = Bun.spawn(
    [process.execPath, cli, ...args, '--data-root', join(root, 'data'), '--cache-root', join(root, 'cache')],
    { cwd: project, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } },
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  let failed = false
  const signal = activeSignal
  const onAbort = () => {
    failed = true
    child.kill()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const exited = Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          reject(new Error('CLI timed out'))
        }, timeoutMs)
      }),
    ])
    const read = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      try {
        while (true) {
          const item = await reader.read()
          if (item.done) break
          total += item.value.byteLength
          if (total > 1_000_000) throw new Error('CLI output exceeded 1 MiB')
          chunks.push(item.value)
        }
      } finally {
        reader.releaseLock()
      }
      return new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk])))
    }
    const [code, stdout, stderr] = await Promise.all([exited, read(child.stdout), read(child.stderr)]).catch(
      (error) => {
        failed = true
        throw error
      },
    )
    return { code, stdout, stderr }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (timer) clearTimeout(timer)
    if (timedOut || failed) {
      child.kill()
      await child.exited.catch(() => undefined)
    }
  }
}

function jsonl(result: CliResult) {
  if (result.code !== 0) throw new Error('CLI failed with exit code ' + result.code + ': ' + result.stderr)
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => jsonRecordSchema.parse(JSON.parse(line)))
}

async function readConnection(root: string) {
  return z
    .object({
      url: z.string().url(),
      token: z.string().min(1),
      pid: z.number().int().positive(),
      supervisorPid: z.number().int().positive().optional(),
      instanceId: z.string().min(1).optional(),
    })
    .parse(JSON.parse(await readFile(join(root, 'data', 'settings', 'connection.json'), 'utf8')))
}

const processIdentitySchema = z.object({
  pid: z.number().int().positive(),
  parentPid: z.number().int().nonnegative(),
  creationDate: z.string().min(1),
  commandLine: z.string().min(1),
})
const hostIdentitySchema = processIdentitySchema.extend({ supervisor: processIdentitySchema.optional() })
const psSingle = (value: string) => "'" + value.replaceAll("'", "''") + "'"

function captureOwnedHost(connection: { pid: number; supervisorPid?: number | undefined }, root: string): z.infer<typeof hostIdentitySchema> {
  const command =
    '$p=Get-CimInstance Win32_Process -Filter "ProcessId=' +
    connection.pid +
    '"; if($null -eq $p){exit 2}; [ordered]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;creationDate=[string]$p.CreationDate;commandLine=[string]$p.CommandLine}|ConvertTo-Json -Compress'
  const output = Bun.spawnSync(['powershell', '-NoProfile', '-Command', command], { windowsHide: true })
  if (output.exitCode !== 0) throw new Error('Owned Host process identity unavailable')
  const identity = hostIdentitySchema.parse(JSON.parse(new TextDecoder().decode(output.stdout)))
  const expected = [join(root, 'data'), join(root, 'cache'), join(root, 'project')]
  if (
    identity.pid !== connection.pid ||
    !identity.commandLine.includes('apps\\host') ||
    expected.some((value) => !identity.commandLine.includes(value))
  )
    throw new Error('Owned Host command identity mismatch')
  if (connection.supervisorPid === undefined) return identity
  if (identity.parentPid !== connection.supervisorPid) throw new Error('Owned supervisor parent identity mismatch')
  const supervisor = captureOwnedHost({ pid: connection.supervisorPid }, root)
  return { ...identity, supervisor }
}

async function stopOwnedHost(connection: { pid: number }, root: string, captured: z.infer<typeof hostIdentitySchema>) {
  if (captured.supervisor) await stopOwnedHost({ pid: captured.supervisor.pid }, root, captured.supervisor)
  if (!Number.isInteger(connection.pid) || connection.pid <= 0) throw new Error('Invalid owned Host PID')
  const dataRoot = join(root, 'data')
  const cacheRoot = join(root, 'cache')
  const projectRoot = join(root, 'project')
  const command =
    '$p=Get-CimInstance Win32_Process -Filter "ProcessId=' +
    connection.pid +
    '"; if($null -eq $p){exit 0}; if([string]$p.CreationDate -ne ' +
    psSingle(captured.creationDate) +
    ' -or [string]$p.CommandLine -ne ' +
    psSingle(captured.commandLine) +
    '){exit 2}; $c=$p.CommandLine; if($c -notmatch "apps[\\\\/]host|internal-host"){exit 2}; if($c -notmatch [regex]::Escape(' +
    psSingle(dataRoot) +
    ') -or $c -notmatch [regex]::Escape(' +
    psSingle(cacheRoot) +
    ') -or $c -notmatch [regex]::Escape(' +
    psSingle(projectRoot) +
    ')){exit 2}; Stop-Process -Id ' +
    connection.pid +
    ' -Force; for($i=0;$i -lt 50;$i++){if($null -eq (Get-Process -Id ' +
    connection.pid +
    ' -ErrorAction SilentlyContinue)){exit 0}; Start-Sleep -Milliseconds 100}; exit 3'
  const probe = Bun.spawnSync(['powershell', '-NoProfile', '-Command', command], { windowsHide: true })
  if (probe.exitCode !== 0) throw new Error('Owned Host did not stop')
}

async function cleanup(root: string, connection?: { pid: number }, captured?: z.infer<typeof hostIdentitySchema>) {
  if (connection && captured) await stopOwnedHost(connection, root, captured)
  const actual = await realpath(root)
  const parent = await realpath(tmpdir())
  if (dirname(actual) !== parent || !basename(actual).startsWith('hbar-cli-sync-'))
    throw new Error('Refusing to remove an unowned CLI sync fixture')
  await rm(actual, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
}

async function waitOperation(root: string, project: string, sessionId: string, operationId: string) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const result = await runCli(root, project, ['--demo', 'exec', 'operation.get', operationId, '--session', sessionId])
    if (result.code !== 0) throw new Error('operation.get failed with exit code ' + result.code)
    const value = operationSnapshotSchema.parse(JSON.parse(result.stdout))
    if (value.status === 'completed') return value
    if (value.status === 'failed' || value.status === 'cancelled') throw new Error('Operation failed: ' + value.status)
    await Bun.sleep(100)
  }
  throw new Error('Operation did not settle within 20 seconds')
}

async function main(signal: AbortSignal) {
  activeSignal = signal
  const root = await mkdtemp(join(tmpdir(), 'hbar-cli-sync-'))
  const project = join(root, 'project')
  await mkdir(project, { recursive: true })
  await Bun.write(join(project, '.keep'), '')
  let client: HbarClient | undefined
  let watcherClose: (() => Promise<void>) | undefined
  let primaryError: unknown
  let ownedHostIdentity: z.infer<typeof hostIdentitySchema> | undefined
  try {
    const first = jsonl(
      await runCli(root, project, [
        '--headless',
        '--demo',
        '--project',
        project,
        '--output-format',
        'jsonl',
        '--message',
        'first CLI session message',
      ]),
    )
    const started = first.map((line) => runStartedSchema.safeParse(line)).find((result) => result.success)
    const sessionId = started?.success ? started.data.sessionId : ''
    if (!sessionId) throw new Error('First CLI run did not return a session id')
    const connection = await readConnection(root)
    ownedHostIdentity = captureOwnedHost(connection, root)
    client = new HbarClient(connection.url, connection.token)
    const host = await client.connect()
    if (!host.dataRootId || (connection.instanceId && host.instanceId !== connection.instanceId))
      throw new Error('Owned Host identity mismatch')
    const timeline = createSessionTimelineClient(client)
    const before = await timeline.snapshot(sessionId)
    const goals = createGoalPlanCommandClient(client)
    const beforeGoal = await goals.execute('goal.get', { sessionId }, { signal })
    const beforePlan = await goals.execute('plan.get', { sessionId }, { signal })
    const dataRootId = host.dataRootId
    await goals.execute(
      'goal.set',
      {
        sessionId,
        objective: 'CLI sync acceptance goal',
        status: 'paused',
        tokenBudget: 1000,
      },
      { signal },
    )
    await goals.execute(
      'plan.update',
      {
        sessionId,
        explanation: 'CLI sync acceptance plan',
        plan: [{ step: 'Preserve session identity', status: 'in_progress' }],
      },
      { signal },
    )
    const goalBeforeReconnect = await goals.execute('goal.get', { sessionId }, { signal })
    const planBeforeReconnect = await goals.execute('plan.get', { sessionId }, { signal })
    if (!dataRootId) throw new Error('Host connection did not expose dataRootId')
    const watchCursor = (await timeline.snapshot(sessionId)).cursor
    const observed: Array<{ eventId: string; seq: number; sessionId: string }> = []
    watcherClose = await timeline.watch(sessionId, watchCursor, (update) => {
      if (update.kind === 'event')
        observed.push({ eventId: update.event.eventId, seq: update.event.seq, sessionId: update.event.sessionId })
    })
    const second = jsonl(
      await runCli(root, project, [
        '--headless',
        '--demo',
        '--project',
        project,
        '--session',
        sessionId,
        '--output-format',
        'jsonl',
        '--message',
        'second CLI restored session message',
      ]),
    )
    if (!second.some((line) => runCompletedSchema.safeParse(line).success))
      throw new Error('Restored CLI run did not complete')

    const stableKey = 'cli-sync-stable-run'
    const accepted = await runCli(root, project, [
      '--demo',
      '--project',
      project,
      '--session',
      sessionId,
      'exec',
      'run.submit',
      '--message',
      'idempotent CLI receipt message',
      '--idempotency-key',
      stableKey,
    ])
    if (accepted.code !== 0) throw new Error('run.submit failed: ' + accepted.stderr)
    const acceptedValue = runAcceptedSchema.parse(JSON.parse(accepted.stdout))
    await waitOperation(root, project, sessionId, acceptedValue.operationId)
    const receiptArgs = [
      '--demo',
      '--project',
      project,
      '--session',
      sessionId,
      'exec',
      'receipt',
      'run.submit',
      stableKey,
    ]
    const receipt = await runCli(root, project, receiptArgs)
    if (receipt.code !== 0) throw new Error('receipt failed: ' + receipt.stderr)
    const canonicalReceipt = runAcceptedSchema.parse(JSON.parse(receipt.stdout))
    if (canonicalReceipt.operationId !== acceptedValue.operationId)
      throw new Error('Receipt resolved a different accepted operation')
    const receiptAgain = await runCli(root, project, receiptArgs)
    if (receipt.stdout !== receiptAgain.stdout) throw new Error('Receipt retry changed the canonical result')

    const secondSession = await createWorkspaceSessionCommandClient(client).execute(
      'session.create',
      { workspaceId: before.session.workspaceId },
      { idempotencyKey: 'cli-sync-second-session' },
    )
    const cursorBeforeReconnect = watchCursor
    client.disconnect()
    const outageRun = jsonl(
      await runCli(root, project, [
        '--headless',
        '--demo',
        '--project',
        project,
        '--session',
        sessionId,
        '--output-format',
        'jsonl',
        '--message',
        'outage while observer disconnected canary',
      ]),
    )
    if (!outageRun.some((line) => runCompletedSchema.safeParse(line).success))
      throw new Error('Original session outage run did not complete')
    const secondRun = jsonl(
      await runCli(root, project, [
        '--headless',
        '--demo',
        '--project',
        project,
        '--session',
        secondSession.id,
        '--output-format',
        'jsonl',
        '--message',
        'independent second session canary',
      ]),
    )
    if (!secondRun.some((line) => runCompletedSchema.safeParse(line).success))
      throw new Error('Second session run did not complete')
    const secondStarted = secondRun.map((line) => runStartedSchema.safeParse(line)).find((result) => result.success)
    if (!secondStarted?.success || secondStarted.data.sessionId !== secondSession.id)
      throw new Error('Second CLI run restored another session')
    await client.connect()
    const afterReconnect = await timeline.snapshot(sessionId)
    const afterHost = client.connectionHost()
    const afterPlan = await goals.execute('plan.get', { sessionId }, { signal })
    const afterGoal = await goals.execute('goal.get', { sessionId }, { signal })
    if (
      afterReconnect.cursor < cursorBeforeReconnect ||
      new Set(afterReconnect.messages.map((message) => message.id)).size !== afterReconnect.messages.length
    )
      throw new Error('Reconnect snapshot regressed cursor or duplicated canonical messages')
    if (
      afterHost?.dataRootId !== dataRootId ||
      JSON.stringify(stablePlan(afterPlan)) !== JSON.stringify(stablePlan(planBeforeReconnect)) ||
      JSON.stringify(stableGoal(afterGoal)) !== JSON.stringify(stableGoal(goalBeforeReconnect))
    )
      throw new Error('Reconnect changed data identity, Plan, or Goal projection')
    const isolated = await timeline.snapshot(secondSession.id)
    const restoredText = afterReconnect.messages.flatMap((message) =>
      message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
    )
    const isolatedText = isolated.messages.flatMap((message) =>
      message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])),
    )
    if (
      !restoredText.includes('outage while observer disconnected canary') ||
      !restoredText.includes('second CLI restored session message') ||
      restoredText.includes('independent second session canary') ||
      !isolatedText.includes('independent second session canary') ||
      isolatedText.includes('outage while observer disconnected canary')
    )
      throw new Error('Reconnect lost an owned CLI message or crossed session content')
    if (isolated.messages.some((message) => afterReconnect.messages.some((other) => other.id === message.id)))
      throw new Error('Second session inherited messages from the restored session')
    await Bun.sleep(100)
    if (observed.length === 0 || observed.some((event) => event.sessionId !== sessionId))
      throw new Error('Timeline watcher did not observe owned restored-session events')
    if (new Set(observed.map((event) => event.eventId)).size !== observed.length)
      throw new Error('Timeline watcher duplicated event IDs')
    const observedSeq = observed.map((event) => event.seq).sort((a, b) => a - b)
    if (
      observedSeq.some((seq, index) => seq !== watchCursor + index + 1) ||
      observedSeq.at(-1) !== afterReconnect.cursor
    )
      throw new Error('Timeline watcher cursor has a gap')
    if (afterReconnect.cursor <= cursorBeforeReconnect) throw new Error('Reconnect did not advance the observed cursor')
    if (
      JSON.stringify(stableGoal(beforeGoal)) === JSON.stringify(stableGoal(goalBeforeReconnect)) ||
      JSON.stringify(stablePlan(beforePlan)) === JSON.stringify(stablePlan(planBeforeReconnect))
    )
      throw new Error('Goal/Plan setup was not persisted before reconnect')
  } catch (error) {
    primaryError = error
  }
  activeSignal = undefined
  const cleanupErrors: unknown[] = []
  try {
    await watcherClose?.()
  } catch (error) {
    cleanupErrors.push(error)
  }
  try {
    client?.disconnect()
  } catch (error) {
    cleanupErrors.push(error)
  }
  let connection: { pid: number } | undefined
  try {
    connection = await readConnection(root)
  } catch {
    /* preserve root if identity is unavailable */
  }
  try {
    if (!connection || !ownedHostIdentity)
      throw new Error('Preserving fixture because owned Host identity is unavailable')
    await cleanup(root, connection, ownedHostIdentity)
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (primaryError || cleanupErrors.length)
    throw new AggregateError([primaryError, ...cleanupErrors].filter(Boolean), 'CLI sync cleanup failed')
}

test.skipIf(process.platform !== 'win32')(
  'Windows CLI session restoration preserves the App SDK projection',
  async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      await main(controller.signal)
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  },
  120_000,
)
