import { HbarError } from '@hbar/contracts'
import { NODE_LIMITS } from '@hbar/contracts/node'
import { procedure, type RuntimeProcessContext, type RuntimeProcessService } from '@hbar/runtime'
import { NODE_PROCESS_FINGERPRINT, nodeProcessInputSchema, nodeProcessOutputSchema } from './execution-contract'

/** One admitted command per owner. A recovered owner has no command to replay. */
export function create(context: RuntimeProcessContext): RuntimeProcessService {
  let active = false
  let used = false
  const controller = new AbortController()
  let child: Bun.Subprocess | undefined
  context.peer.register(
    'node.exec',
    procedure(nodeProcessInputSchema, nodeProcessOutputSchema, async (input, call) => {
      if (!active || used)
        throw new HbarError('NODE_EXECUTION_REVOKED', 'This execution owner cannot start another command')
      const signal = AbortSignal.any([call.signal, controller.signal])
      signal.throwIfAborted()
      used = true
      const argv =
        process.platform === 'win32'
          ? ['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', input.command]
          : ['/bin/sh', '-c', input.command]
      const processRef = Bun.spawn(argv, {
        cwd: input.workspace,
        env: input.environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      })
      child = processRef
      const abort = () => processRef.kill('SIGKILL')
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        abort()
      }, input.timeoutMs)
      let retained = Buffer.alloc(0)
      let truncated = false
      async function collect(stream: ReadableStream<Uint8Array>): Promise<void> {
        const reader = stream.getReader()
        const cutoff = processRef.exited.then(() =>
          setTimeout(() => {
            void reader.cancel().catch(() => undefined)
          }, 250),
        )
        try {
          for (;;) {
            const next = await reader.read()
            if (next.done) return
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
      }
      try {
        const [, , exitCode] = await Promise.all([
          collect(processRef.stdout),
          collect(processRef.stderr),
          processRef.exited,
        ])
        signal.throwIfAborted()
        let start = 0
        while (start < retained.length && ((retained[start] ?? 0) & 0xc0) === 0x80) start++
        return {
          text: retained.subarray(start).toString('utf8'),
          isError: timedOut || exitCode !== 0,
          details: { code: timedOut ? 'TOOL_TIMEOUT' : exitCode, exitCode, truncated, executionStarted: true as const },
        }
      } finally {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
      }
    }),
  )
  return {
    async prepare() {
      return { contractFingerprint: NODE_PROCESS_FINGERPRINT, storageSchema: 0, capabilities: ['node.exec'] }
    },
    async activate() {
      active = true
    },
    async drain() {
      active = false
      return { requests: child?.exitCode === null ? 1 : 0, runs: 0, resources: 0 }
    },
    async dispose() {
      active = false
      controller.abort()
      if (child?.exitCode === null) child.kill('SIGKILL')
      await child?.exited
    },
  }
}
