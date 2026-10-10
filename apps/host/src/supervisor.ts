import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { RecoveryPolicy, timerDuration, type RecoveryPolicyOptions } from './recovery-policy'
import { hostSupervisorMessageSchema } from './supervisor-protocol'
import { FAILURE_EXIT_CODE } from './process-shutdown'

export const RESTART_EXIT_CODE = 75
export { FAILURE_EXIT_CODE } from './process-shutdown'

export interface HostSupervisorOptions extends RecoveryPolicyOptions {
  readonly command: readonly [string, ...string[]]
  readonly hostArgs: readonly string[]
  readonly connectionFile: string | (() => Promise<string>)
  readonly stdio?: 'inherit' | 'ignore'
  readonly startupTimeoutMs?: number
  readonly shutdownTimeoutMs?: number
  readonly heartbeatMs?: number
  readonly onExit?: (event: HostSupervisorExit) => void
}

export interface HostSupervisorExit {
  readonly code: number
  readonly signal: NodeJS.Signals | null
  readonly expectedRestart: boolean
  readonly reason: 'exit' | 'startup_timeout' | 'heartbeat_timeout' | 'spawn_failed'
}

export interface HostSupervisorState {
  readonly phase: 'starting' | 'serving' | 'recovering' | 'stopping' | 'stopped'
  readonly pid: number | null
  readonly failures: number
  readonly nextAttemptAt: number | null
  readonly reason: HostSupervisorExit['reason'] | null
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

async function connectionPort(path: string): Promise<number | undefined> {
  try {
    const value = z.object({ url: z.string() }).parse(JSON.parse(await readFile(path, 'utf8')))
    const port = Number(new URL(value.url).port)
    return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : undefined
  } catch {
    return undefined
  }
}

async function exitedBefore(child: Bun.Subprocess, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      child.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function createHostSupervisor(options: HostSupervisorOptions) {
  const startupTimeoutMs = timerDuration(options.startupTimeoutMs, 120_000)
  const shutdownTimeoutMs = timerDuration(options.shutdownTimeoutMs, 5_000)
  const heartbeatMs = timerDuration(options.heartbeatMs, 2_000)
  const recovery = new RecoveryPolicy(options)
  let child: Bun.Subprocess | null = null
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let wake: (() => void) | undefined
  let stopPromise: Promise<void> | undefined
  let state: HostSupervisorState = { phase: 'stopped', pid: null, failures: 0, nextAttemptAt: null, reason: null }
  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve
      timer = setTimeout(resolve, ms)
    }).finally(() => {
      clearTimeout(timer)
      wake = undefined
    })
  const observe = (event: HostSupervisorExit) => {
    try {
      options.onExit?.(event)
    } catch {
      console.error('[hbar supervisor] exit observer failed')
    }
  }
  return {
    snapshot(): HostSupervisorState {
      return { ...state }
    },
    async run(): Promise<number> {
      if (running) throw new Error('Host supervisor is already running')
      if (stopped) return 0
      running = true
      let port: number | undefined
      try {
        while (!stopped) {
          let reason: HostSupervisorExit['reason'] = 'exit'
          const startedAt = Date.now()
          let lastHeartbeat = startedAt
          let ready = false
          let monitor: ReturnType<typeof setInterval> | undefined
          state = { ...state, phase: 'starting', pid: null, nextAttemptAt: null }
          let code = FAILURE_EXIT_CODE
          let signal: NodeJS.Signals | null = null
          try {
            const output = options.stdio ?? 'inherit'
            const launched = Bun.spawn([...options.command, ...supervisedArguments(options.hostArgs, port)], {
              stdin: 'ignore',
              stdout: output,
              stderr: output,
              windowsHide: true,
              serialization: 'json',
              ipc(message: unknown, source) {
                if (stopped || child !== source) return
                const parsed = hostSupervisorMessageSchema.safeParse(message)
                if (!parsed.success) return
                if (parsed.data.type === 'host.ready') {
                  port = parsed.data.port
                  ready = true
                  lastHeartbeat = Date.now()
                  recovery.healthy(lastHeartbeat)
                  state = { ...state, phase: 'serving', reason: null }
                } else if (parsed.data.type === 'host.heartbeat' && ready) lastHeartbeat = Date.now()
              },
            })
            child = launched
            state = { ...state, pid: launched.pid }
            monitor = setInterval(
              () => {
                if (stopped || child !== launched || launched.exitCode !== null) return
                const now = Date.now()
                if (
                  (!ready && now - startedAt >= startupTimeoutMs) ||
                  (ready && now - lastHeartbeat >= heartbeatMs * 3)
                ) {
                  reason = ready ? 'heartbeat_timeout' : 'startup_timeout'
                  try {
                    launched.kill('SIGKILL')
                  } catch {
                    console.error('[hbar supervisor] termination failed')
                  }
                }
              },
              Math.min(heartbeatMs, 500),
            )
            code = await launched.exited
            signal = launched.signalCode ?? null
          } catch {
            reason = 'spawn_failed'
          } finally {
            clearInterval(monitor)
            child = null
          }
          const event: HostSupervisorExit = { code, signal, expectedRestart: code === RESTART_EXIT_CODE, reason }
          observe(event)
          if (stopped) return 0
          if (port === undefined) {
            try {
              const path =
                typeof options.connectionFile === 'string' ? options.connectionFile : await options.connectionFile()
              port = await connectionPort(path)
            } catch {
              /* Path lookup failure must not stop process recovery. */
            }
          }
          if (stopped) return 0
          if (event.expectedRestart) recovery.interrupted()
          const retry = event.expectedRestart ? null : recovery.failed()
          const delayMs = retry?.delayMs ?? 100
          state = {
            phase: 'recovering',
            pid: null,
            failures: retry?.failures ?? state.failures,
            reason,
            nextAttemptAt: Date.now() + delayMs,
          }
          await delay(delayMs)
        }
        return 0
      } finally {
        running = false
        state = { ...state, phase: 'stopped', pid: null, nextAttemptAt: null }
      }
    },
    stop(): Promise<void> {
      stopped = true
      state = { ...state, phase: 'stopping', nextAttemptAt: null }
      clearTimeout(timer)
      wake?.()
      stopPromise ??= (async () => {
        const owned = child
        if (!owned) return
        try {
          owned.send({ type: 'host.shutdown' })
        } catch {
          owned.kill()
        }
        if (await exitedBefore(owned, shutdownTimeoutMs)) return
        owned.kill('SIGKILL')
        if (!(await exitedBefore(owned, shutdownTimeoutMs))) throw new Error('Host exit could not be confirmed')
      })()
      return stopPromise
    },
  }
}
