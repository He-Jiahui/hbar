import { HbarClient, type ConnectionStatus } from '@hbar/client'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'

export type WebSessionHostReady = Readonly<{
  token: string
  workspaceId: string
  workspaceName: string
  sessionId: string
  sessionTitle: string
}>

export type WebSessionHost = Readonly<{
  child: ChildProcess
  client: HbarClient
  ready: WebSessionHostReady
  url: string
  diagnostics?: WebSessionHostLifecycleDiagnostics
}>

export type WebSessionHostLifecycleStage =
  'spawned' | 'ready' | 'client_connected' | 'stop_requested' | 'exited' | 'stopped' | 'startup_failed'

export type WebSessionHostLifecycleSnapshot = Readonly<{
  enabled: boolean
  pid: number | null
  stage: WebSessionHostLifecycleStage
  spawnedAt: number
  readyAt: number | null
  connectedAt: number | null
  stopRequestedAt: number | null
  exitedAt: number | null
  stoppedAt: number | null
  exitCode: number | null
  signal: string | null
  stderrBytes: number
  stderrSha256: string
  stderrCodes: readonly string[]
  connectionStatuses: readonly ConnectionStatus[]
}>

export type WebSessionHostLifecycleDiagnostics = Readonly<{
  mark(stage: Exclude<WebSessionHostLifecycleStage, 'spawned' | 'exited'>): void
  connectionStatus(status: ConnectionStatus): void
  attachConnectionStatusDisposer(dispose: () => void): void
  snapshot(): WebSessionHostLifecycleSnapshot
  dispose(): void
}>

const DIAGNOSTIC_CODES = [
  'EADDRINUSE',
  'ECONNREFUSED',
  'ERR_MODULE_NOT_FOUND',
  'SQLITE_BUSY',
  'STORAGE_CLOSED',
  'HOST_CLOSING',
  'INVALID_API_KEY',
] as const

/** Opt-in, redacted child lifecycle telemetry; it never stores raw stderr or fixture inputs. */
export function createWebSessionHostLifecycleDiagnostics(
  child: ChildProcess,
  enabled = process.env.HBAR_E2E_HOST_DIAGNOSTICS === '1',
): WebSessionHostLifecycleDiagnostics {
  const spawnedAt = Date.now()
  const hash = createHash('sha256')
  let stage: WebSessionHostLifecycleStage = 'spawned'
  let readyAt: number | null = null
  let connectedAt: number | null = null
  let stopRequestedAt: number | null = null
  let exitedAt: number | null = null
  let stoppedAt: number | null = null
  let exitCode: number | null = null
  let signal: string | null = null
  let stderrBytes = 0
  const codes = new Set<string>()
  const connectionStatuses: ConnectionStatus[] = []
  let disposed = false
  let disposeConnectionStatus: (() => void) | undefined
  const emit = (event: Record<string, unknown>) => {
    if (!enabled) return
    try {
      console.error(JSON.stringify({ scope: 'e2e-host-child', pid: child.pid ?? null, time: Date.now(), ...event }))
    } catch {
      // Diagnostics must never affect fixture control flow.
    }
  }
  const onStderr = (chunk: unknown) => {
    if (!enabled) return
    try {
      const text = String(chunk)
      stderrBytes += Buffer.byteLength(text)
      hash.update(text)
      for (const code of DIAGNOSTIC_CODES) if (text.includes(code)) codes.add(code)
    } catch {
      // Diagnostics must never affect fixture control flow.
    }
  }
  const onExit = (code: number | null, childSignal: NodeJS.Signals | null) => {
    if (!enabled) return
    exitedAt ??= Date.now()
    exitCode = code
    signal = childSignal
    stage = 'exited'
    emit({ stage, exitCode: code, signal: childSignal })
  }
  if (enabled) {
    child.stderr?.on('data', onStderr)
    child.once('exit', onExit)
  }
  const snapshot = (): WebSessionHostLifecycleSnapshot => ({
    enabled,
    pid: child.pid ?? null,
    stage,
    spawnedAt,
    readyAt,
    connectedAt,
    stopRequestedAt,
    exitedAt,
    stoppedAt,
    exitCode,
    signal,
    stderrBytes,
    stderrSha256: hash.copy().digest('hex'),
    stderrCodes: [...codes].sort(),
    connectionStatuses: [...connectionStatuses],
  })
  return {
    mark(next) {
      if (!enabled) return
      stage = next
      const at = Date.now()
      if (next === 'ready') readyAt = at
      else if (next === 'client_connected') connectedAt = at
      else if (next === 'stop_requested') stopRequestedAt = at
      else if (next === 'stopped') stoppedAt = at
      else if (next === 'startup_failed') stage = 'startup_failed'
      emit({ stage })
    },
    connectionStatus(status) {
      if (!enabled) return
      if (connectionStatuses.at(-1) !== status) {
        connectionStatuses.push(status)
        if (connectionStatuses.length > 32) connectionStatuses.shift()
      }
      emit({ stage, connectionStatus: status })
    },
    attachConnectionStatusDisposer(dispose) {
      if (enabled) disposeConnectionStatus = dispose
    },
    snapshot() {
      return snapshot()
    },
    dispose() {
      if (!enabled || disposed) return
      disposed = true
      const releaseConnectionStatus = disposeConnectionStatus
      disposeConnectionStatus = undefined
      try {
        releaseConnectionStatus?.()
      } catch {
        // Diagnostics cleanup is best effort and must never alter fixture flow.
      }
      try {
        child.stderr?.off('data', onStderr)
        child.off('exit', onExit)
      } catch {
        // Diagnostics cleanup is best effort and must never alter fixture flow.
      }
      emit({ event: 'summary', ...snapshot() })
    },
  }
}

const hostReadySchema = z.strictObject({
  token: z.string().min(1),
  workspaceId: z.string().min(1),
  workspaceName: z.string().min(1),
  sessionId: z.string().min(1),
  sessionTitle: z.string().min(1),
})

/** Only call for a child spawned by this fixture; rejection must not orphan its process. */
export async function stopOwnedWebSessionHostChild(child: ChildProcess): Promise<void> {
  const ended = () => child.exitCode !== null || child.signalCode !== null
  if (ended() || child.pid === undefined) return
  let timer: ReturnType<typeof setTimeout> | undefined
  let onExit: (() => void) | undefined
  const waitForExit = (timeoutMs: number) =>
    new Promise<void>((resolve) => {
      onExit = resolve
      child.once('exit', onExit)
      timer = setTimeout(resolve, timeoutMs)
    }).finally(() => {
      if (timer) clearTimeout(timer)
      if (onExit) child.off('exit', onExit)
    })
  const exit = waitForExit(5_000)
  if (child.stdin?.writable) child.stdin.end('close\n')
  else child.kill()
  await exit
  if (!ended()) {
    const forcedExit = waitForExit(2_000)
    child.kill('SIGKILL')
    await forcedExit
  }
  if (!ended()) throw new Error('Owned E2E Host did not exit after termination')
}

/** A bounded protocol wait that owns startup cleanup even before a Host handle exists. */
export async function waitForWebSessionHostReady(
  child: ChildProcess,
  timeoutMs = 20_000,
): Promise<WebSessionHostReady> {
  if (!child.stdout || !child.stderr) {
    await stopOwnedWebSessionHostChild(child)
    throw new Error('E2E Host requires piped stdout and stderr')
  }
  const output = createInterface({ input: child.stdout })
  let errors = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let onLine: ((line: string) => void) | undefined
  let onExit: ((code: number | null) => void) | undefined
  let onError: ((error: Error) => void) | undefined
  const onDiagnostic = (chunk: unknown) => {
    errors = `${errors}${String(chunk)}`.slice(-16_384)
  }
  child.stderr.on('data', onDiagnostic)
  try {
    return await new Promise<WebSessionHostReady>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`E2E Host did not start: ${errors}`)), timeoutMs)
      onLine = (line) => {
        try {
          const value: unknown = JSON.parse(line)
          const ready = hostReadySchema.safeParse(value)
          if (ready.success) resolve(ready.data)
        } catch {
          // Non-protocol diagnostics remain available in the startup error.
        }
      }
      onExit = (code) => reject(new Error(`E2E Host exited with ${code}: ${errors}`))
      onError = reject
      output.on('line', onLine)
      child.once('exit', onExit)
      child.once('error', onError)
      if (child.exitCode !== null || child.signalCode !== null) onExit(child.exitCode)
    })
  } catch (error) {
    try {
      await stopOwnedWebSessionHostChild(child)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E Host startup and owned process cleanup failed', {
        cause: cleanupError,
      })
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    if (onLine) output.off('line', onLine)
    if (onExit) child.off('exit', onExit)
    if (onError) child.off('error', onError)
    child.stderr.off('data', onDiagnostic)
    output.close()
  }
}

export function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the E2E Host fixture')
  return executable
}

/** Keep the fixture's listener and preview proxy on the same allocated Host port. */
export function resolveWebSessionHostPort(explicitPort?: number): number {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .parse(explicitPort ?? process.env.HBAR_E2E_HOST_PORT ?? 4317)
}

export async function startWebSessionHost(
  options: Readonly<{
    root: string
    /** Isolated-worktree fixtures keep Host storage outside the repository. */
    home?: string
    port?: number
    sessionCount?: number
    /** Test-only persisted node registry rows for the Nodes Settings surface. */
    nodeManagementSeedCount?: number
    historyCount?: number
    /** Test-only authored message content; never sent to a real Provider. */
    historyText?: string
    fixture?: 'session' | 'chat-database' | 'chat-deletion' | 'runtime-status' | 'file-changes'
    goalAutoContinue?: boolean
    budgetAutoContinue?: boolean
    /** Bounded delay in the local summary fixture, only for observing compaction lifecycle. */
    compactionDelayMs?: number
    /** Archived source for paired historical UI evidence; ordinary scenarios use the current checkout. */
    sourceRoot?: string
  }>,
): Promise<WebSessionHost> {
  const port = resolveWebSessionHostPort(options.port)
  const child = spawn(
    bunExecutable(),
    [
      options.fixture === 'runtime-status'
        ? 'scripts/e2e-runtime-status-host.ts'
        : options.fixture === 'chat-database' || options.fixture === 'chat-deletion'
          ? 'scripts/e2e-chat-database-host.ts'
          : options.fixture === 'file-changes'
            ? 'scripts/e2e-run-file-changes-host.ts'
          : 'scripts/e2e-session-host.ts',
    ],
    {
      cwd: options.sourceRoot ?? process.cwd(),
      env: {
        ...process.env,
        HBAR_E2E_DATA_ROOT: options.root,
        HBAR_E2E_CHAT_DELETION: options.fixture === 'chat-deletion' ? '1' : '0',
        HBAR_E2E_HOME: options.home ?? '',
        HBAR_E2E_HOST_PORT: String(port),
        HBAR_E2E_SESSION_COUNT: String(options.sessionCount ?? 1),
        HBAR_E2E_NODE_MANAGEMENT_SEED_COUNT:
          options.nodeManagementSeedCount === undefined ? '' : String(options.nodeManagementSeedCount),
        HBAR_E2E_HISTORY_COUNT: String(options.historyCount ?? 0),
        HBAR_E2E_HISTORY_TEXT: options.historyText ?? '',
        HBAR_E2E_GOAL_AUTO_CONTINUE: options.goalAutoContinue === false ? '0' : '1',
        HBAR_E2E_BUDGET_AUTO_CONTINUE: options.budgetAutoContinue === false ? '0' : '1',
        HBAR_E2E_COMPACTION_DELAY_MS: options.compactionDelayMs ? String(options.compactionDelayMs) : '',
        HBAR_E2E_WEB_ORIGIN: `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`,
      },
      stdio: [options.fixture === 'runtime-status' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  const diagnostics = createWebSessionHostLifecycleDiagnostics(child)
  let ready: WebSessionHostReady
  try {
    ready = await waitForWebSessionHostReady(
      child,
      options.fixture === 'runtime-status' ? 120_000 : options.nodeManagementSeedCount !== undefined ? 30_000 : 20_000,
    )
    diagnostics.mark('ready')
  } catch (error) {
    diagnostics.mark('startup_failed')
    diagnostics.dispose()
    throw error
  }
  const url = `http://127.0.0.1:${port}`
  const client = new HbarClient(url, ready.token)
  if (diagnostics.snapshot().enabled) {
    const offConnectionStatus = client.onStatus((status) => diagnostics.connectionStatus(status))
    diagnostics.attachConnectionStatusDisposer(offConnectionStatus)
  }
  try {
    await client.connect()
    diagnostics.mark('client_connected')
  } catch (error) {
    client.disconnect()
    diagnostics.mark('stop_requested')
    try {
      await stopOwnedWebSessionHostChild(child)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'E2E Host client connection and owned process cleanup failed', {
        cause: cleanupError,
      })
    } finally {
      diagnostics.dispose()
    }
    throw error
  }
  return { child, client, ready, url, ...(diagnostics.snapshot().enabled ? { diagnostics } : {}) }
}

export async function stopWebSessionHost(host: WebSessionHost): Promise<void> {
  host.client.disconnect()
  host.diagnostics?.mark('stop_requested')
  try {
    await stopOwnedWebSessionHostChild(host.child)
    host.diagnostics?.mark('stopped')
  } finally {
    host.diagnostics?.dispose()
  }
}
