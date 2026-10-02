import { HbarClient } from '@hbar/client'
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
}>

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
  child.kill()
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

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the E2E Host fixture')
  return executable
}

export async function startWebSessionHost(
  options: Readonly<{
    root: string
    /** Isolated-worktree fixtures keep Host storage outside the repository. */
    home?: string
    port?: number
    sessionCount?: number
    historyCount?: number
    /** Test-only authored message content; never sent to a real Provider. */
    historyText?: string
    goalAutoContinue?: boolean
  }>,
): Promise<WebSessionHost> {
  const port = options.port ?? 4317
  const child = spawn(bunExecutable(), ['scripts/e2e-session-host.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HBAR_E2E_DATA_ROOT: options.root,
      HBAR_E2E_HOME: options.home ?? '',
      HBAR_E2E_HOST_PORT: String(port),
      HBAR_E2E_SESSION_COUNT: String(options.sessionCount ?? 1),
      HBAR_E2E_HISTORY_COUNT: String(options.historyCount ?? 0),
      HBAR_E2E_HISTORY_TEXT: options.historyText ?? '',
      HBAR_E2E_GOAL_AUTO_CONTINUE: options.goalAutoContinue === false ? '0' : '1',
      HBAR_E2E_WEB_ORIGIN: `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const ready = await waitForWebSessionHostReady(child)
  const url = `http://127.0.0.1:${port}`
  const client = new HbarClient(url, ready.token)
  try {
    await client.connect()
  } catch (error) {
    client.disconnect()
    await stopOwnedWebSessionHostChild(child)
    throw error
  }
  return { child, client, ready, url }
}

export async function stopWebSessionHost(host: WebSessionHost): Promise<void> {
  host.client.disconnect()
  await stopOwnedWebSessionHostChild(host.child)
}
