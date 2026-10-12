import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { createRuntimeProcessTreePort, exitRuntimeProcessGroup } from '@hbar/runtime-native'
import { prepareUnixConfinement } from './unix-confinement'
import {
  NODE_PROCESS_FINGERPRINT,
  nodeArgvOutputSchema,
  nodeProcessInputSchema,
  nodeProcessOutputSchema,
} from './execution-contract'

const processTree = createRuntimeProcessTreePort()
type Input = typeof nodeProcessInputSchema._output
type Captured = { text: string; truncated: boolean }

export function releaseExecutionAbortListener(
  signal: AbortSignal,
  abort: (() => void) | undefined,
  timeout: ReturnType<typeof setTimeout> | undefined,
): void {
  if (abort) signal.removeEventListener('abort', abort)
  if (timeout) clearTimeout(timeout)
}

async function capture(stream: ReadableStream<Uint8Array>, exited: Promise<number>): Promise<Captured> {
  const reader = stream.getReader()
  let retained = Buffer.alloc(0)
  let truncated = false
  const cutoff = exited.then(() =>
    setTimeout(() => {
      void reader.cancel().catch(() => undefined)
    }, 250),
  )
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      retained = Buffer.concat([retained, next.value])
      if (retained.byteLength > NODE_LIMITS.outputBytes) {
        retained = retained.subarray(-NODE_LIMITS.outputBytes)
        truncated = true
      }
    }
  } finally {
    clearTimeout(await cutoff)
    reader.releaseLock()
  }
  let start = 0
  while (start < retained.length && ((retained[start] ?? 0) & 0xc0) === 0x80) start++
  return { text: retained.subarray(start).toString('utf8'), truncated }
}

async function execute(
  input: Input,
  signal: AbortSignal,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number
  truncated: boolean
  timedOut: boolean
}> {
  signal.throwIfAborted()
  const operation = input.operation
  let plan: Awaited<ReturnType<typeof prepareUnixConfinement>> | undefined
  if (input.confinement) {
    const backend = input.confinement.backend
    if (!backend) throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'No live Unix confinement backend was selected')
    plan = await prepareUnixConfinement({
      backend,
      cwd: input.workspace,
      operation,
      environment: input.environment,
      confinement: input.confinement,
      protectedPaths: input.protectedPaths,
      readOnlyPaths: input.readOnlyPaths,
    })
  }
  try {
    signal.throwIfAborted()
  } catch (error) {
    await plan?.cleanup()
    throw error
  }
  const argv = plan
    ? [...plan.argv]
    : operation.kind === 'argv'
      ? [...operation.argv]
      : process.platform === 'win32'
        ? ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', operation.command]
        : ['/bin/sh', '-c', operation.command]
  let child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  try {
    child = Bun.spawn(argv, {
      cwd: plan?.cwd ?? input.workspace,
      env: plan?.env ?? input.environment,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      windowsHide: true,
      ...(process.platform === 'win32' ? {} : { detached: true }),
    })
  } catch (error) {
    await plan?.cleanup()
    throw error
  }
  let tree: Awaited<ReturnType<typeof processTree.attach>> | undefined
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let abort: (() => void) | undefined
  let cleanupDone = false
  let cleanup: Promise<void> | undefined
  const terminateAndJoin = () =>
    (cleanup ??= (async () => {
      if (cleanupDone) return
      if (!tree) {
        child.kill('SIGKILL')
        await child.exited.catch(() => 0)
        // An unconfirmed process-tree attach means descendants might have escaped.
        exitRuntimeProcessGroup(1)
      }
      tree.terminate()
      await child.exited
      await tree.join(Math.max(5_000, Math.min(input.timeoutMs, 30_000)))
      tree.close()
      cleanupDone = true
    })())
  try {
    try {
      tree = await processTree.attach(child.pid, signal)
    } catch (error) {
      child.kill('SIGKILL')
      await child.exited.catch(() => 0)
      // The enclosing ManagedProcess will reconcile this lost owner and join its tree.
      exitRuntimeProcessGroup(1)
      throw error
    }
    abort = () => {
      void terminateAndJoin().catch(() => exitRuntimeProcessGroup(1))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    timeout = setTimeout(() => {
      timedOut = true
      abort?.()
    }, input.timeoutMs)
    const [stdout, stderr, exitCode] = await Promise.all([
      capture(child.stdout, child.exited),
      capture(child.stderr, child.exited),
      child.exited,
    ])
    await terminateAndJoin()
    signal.throwIfAborted()
    return {
      stdout: stdout.text,
      stderr: stderr.text,
      exitCode,
      truncated: stdout.truncated || stderr.truncated,
      timedOut,
    }
  } finally {
    releaseExecutionAbortListener(signal, abort, timeout)
    try {
      if (tree && !cleanupDone) await terminateAndJoin()
    } finally {
      await plan?.cleanup()
    }
  }
}

/** One admitted process request per owner. Recovery never replays a command. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let active = false
  let used = false
  const controller = new AbortController()
  context.peer.register(
    'node.exec',
    procedure(nodeProcessInputSchema, nodeProcessOutputSchema, async (input, call) => {
      if (!active || used)
        throw new HbarError('NODE_EXECUTION_REVOKED', 'This execution owner cannot start another process')
      used = true
      const signal = AbortSignal.any([call.signal, controller.signal])
      const result = await execute(input, signal)
      const text = `${result.stdout}${result.stderr}`
      const encoded = Buffer.from(text)
      const start = Math.max(0, encoded.length - NODE_LIMITS.outputBytes)
      let aligned = start
      while (aligned < encoded.length && ((encoded[aligned] ?? 0) & 0xc0) === 0x80) aligned++
      const exitCode = result.timedOut ? 'TOOL_TIMEOUT' : result.exitCode
      return {
        text: encoded.subarray(aligned).toString('utf8'),
        isError: result.timedOut || result.exitCode !== 0,
        details: {
          code: exitCode,
          exitCode: result.exitCode,
          truncated: result.truncated || encoded.length > NODE_LIMITS.outputBytes,
          executionStarted: true as const,
        },
      }
    }),
  )
  context.peer.register(
    'node.execArgv',
    procedure(nodeProcessInputSchema, nodeArgvOutputSchema, async (input, call) => {
      if (!active || used)
        throw new HbarError('NODE_EXECUTION_REVOKED', 'This execution owner cannot start another process')
      if (input.operation.kind !== 'argv')
        throw new HbarError('INVALID_INPUT', 'An argv execution requires argv parameters')
      used = true
      const result = await execute(input, AbortSignal.any([call.signal, controller.signal]))
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        truncated: result.truncated,
        ...(result.timedOut === true ? { timedOut: true } : {}),
      }
    }),
  )
  return {
    async prepare() {
      return {
        contractFingerprint: NODE_PROCESS_FINGERPRINT,
        storageSchema: 0,
        capabilities: ['node.exec', 'node.execArgv'],
      }
    },
    async activate() {
      active = true
    },
    async drain() {
      active = false
      return { requests: 0, runs: 0, resources: 0 }
    },
    async dispose() {
      active = false
      controller.abort()
    },
  }
}
