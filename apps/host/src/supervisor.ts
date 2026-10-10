import { readFile } from 'node:fs/promises'
import { supervisorLifecycleEvent, type HostRuntimeDiagnostics } from './runtime-diagnostics.ts'

export const RESTART_EXIT_CODE = 75
export const STORAGE_FAILURE_RESTART_EXIT_CODE = 76

export interface HostSupervisorOptions {
  readonly command: readonly [string, ...string[]]
  readonly hostArgs: readonly string[]
  readonly connectionFile: string | (() => Promise<string>)
  readonly stdio?: 'inherit' | 'ignore'
  /** Receives a bounded, secret-free record for every supervised child exit. */
  readonly onExit?: (event: HostSupervisorExit) => void
  /** Optional process-owned journal. Sink failures never affect supervision. */
  readonly diagnostics?: HostRuntimeDiagnostics
}

export interface HostSupervisorExit {
  readonly code: number
  readonly signal: NodeJS.Signals | null
  readonly expectedRestart: boolean
  readonly recoveryAttempt?: number
  readonly recoveryLimit?: number
}

function supervisedArguments(input: readonly string[], port?: number): string[] {
  const args: string[] = []
  let replacedPort = false
  for (let index = 0; index < input.length; index++) {
    const value = input[index]!
    if (value === '--supervisor' || value === '--supervised') continue
    if (value === '--port') {
      const current = input[index + 1]
      if (current !== undefined) index++
      args.push('--port', port === undefined ? (current ?? '0') : String(port))
      replacedPort = port !== undefined
      continue
    }
    if (value.startsWith('--port=')) {
      args.push(port === undefined ? value : `--port=${port}`)
      replacedPort = port !== undefined
      continue
    }
    args.push(value)
  }
  if (port !== undefined && !replacedPort) args.push('--port', String(port))
  args.push('--supervised')
  return args
}

async function connectionPort(path: string): Promise<number> {
  const value = JSON.parse(await readFile(path, 'utf8')) as { url?: unknown }
  if (typeof value.url !== 'string') throw new Error('Host connection file does not contain a URL')
  const port = Number(new URL(value.url).port)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535)
    throw new Error('Host connection file does not contain a valid port')
  return port
}

export function createHostSupervisor(options: HostSupervisorOptions) {
  let child: ReturnType<typeof Bun.spawn> | null = null
  let stopped = false
  let running = false
  return {
    async run(): Promise<number> {
      if (running) throw new Error('Host supervisor is already running')
      running = true
      let port: number | undefined
      let recoveryAttempts = 0
      let recoveryWindowStartedAt = 0
      while (!stopped) {
        const connectionFile =
          typeof options.connectionFile === 'string' ? options.connectionFile : await options.connectionFile()
        const output = options.stdio ?? 'inherit'
        child = Bun.spawn([...options.command, ...supervisedArguments(options.hostArgs, port)], {
          stdin: 'ignore',
          stdout: output,
          stderr: output,
          windowsHide: true,
        })
        const childPid = child.pid
        supervisorLifecycleEvent(options.diagnostics, {
          event: 'supervisor.child_spawn',
          outcome: 'success',
          ...(childPid === undefined ? {} : { childPid }),
          supervisorPid: process.pid,
        })
        const startedAt = Date.now()
        const code = await child.exited
        const stable = Date.now() - startedAt >= 60_000
        if (stable) {
          recoveryAttempts = 0
          recoveryWindowStartedAt = 0
        }
        const isStorageRecovery = code === STORAGE_FAILURE_RESTART_EXIT_CODE
        if (isStorageRecovery) {
          if (!recoveryWindowStartedAt) recoveryWindowStartedAt = Date.now()
          recoveryAttempts++
        }
        const event: HostSupervisorExit = {
          code,
          signal: child.signalCode ?? null,
          expectedRestart:
            code === RESTART_EXIT_CODE ||
            (isStorageRecovery && recoveryAttempts <= 3 && Date.now() - recoveryWindowStartedAt <= 60_000),
          ...(isStorageRecovery ? { recoveryAttempt: recoveryAttempts, recoveryLimit: 3 } : {}),
        }
        try {
          options.onExit?.(event)
        } catch {
          // Diagnostics must never change restart or shutdown behavior.
          console.error('[hbar supervisor] exit observer failed')
        }
        supervisorLifecycleEvent(options.diagnostics, {
          event: 'supervisor.child_exit',
          outcome: event.expectedRestart ? 'success' : 'failure',
          durationMs: Math.max(0, Date.now() - startedAt),
          ...(childPid === undefined ? {} : { childPid }),
          supervisorPid: process.pid,
          exitCode: code,
          ...(child.signalCode ? { signal: child.signalCode } : {}),
          restartExpected: event.expectedRestart,
          ...(code === STORAGE_FAILURE_RESTART_EXIT_CODE ? { errorCode: 'STORAGE_FAILURE_RESTART' } : {}),
          ...(event.recoveryAttempt === undefined ? {} : { recoveryAttempt: event.recoveryAttempt, recoveryLimit: 3 }),
        })
        child = null
        if (stopped) return 0
        if (code === STORAGE_FAILURE_RESTART_EXIT_CODE) {
          if (recoveryAttempts > 3 || Date.now() - recoveryWindowStartedAt > 60_000) {
            supervisorLifecycleEvent(options.diagnostics, {
              event: 'supervisor.recovery_limit',
              outcome: 'failure',
              errorCode: 'STORAGE_RECOVERY_LIMIT',
              supervisorPid: process.pid,
              recoveryAttempt: recoveryAttempts,
              recoveryLimit: 3,
            })
            return 1
          }
          supervisorLifecycleEvent(options.diagnostics, {
            event: 'supervisor.backoff',
            outcome: 'success',
            durationMs: [250, 1_000, 4_000][recoveryAttempts - 1] ?? 4_000,
            supervisorPid: process.pid,
            recoveryAttempt: recoveryAttempts,
            recoveryLimit: 3,
          })
          await Bun.sleep([250, 1_000, 4_000][recoveryAttempts - 1] ?? 4_000)
        } else if (code !== RESTART_EXIT_CODE) return code
        port = await connectionPort(connectionFile)
        if (code === RESTART_EXIT_CODE) await Bun.sleep(100)
      }
      return 0
    },
    stop(): void {
      stopped = true
      child?.kill()
    },
  }
}
