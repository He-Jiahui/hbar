import { HbarError } from '@hbar/contracts'
import type { NodeTerminalBackend, NodeTerminalProcess } from '@hbar/node-core'
import type { NodeFloor } from '@hbar/contracts/node'
import { probeUnixConfinement, prepareUnixConfinement, type UnixConfinementBackend } from './unix-confinement'

/** A PTY backend exists only when the OS confinement probe proved its guarantees. */
export async function createNodeTerminalBackend(floor: NodeFloor): Promise<NodeTerminalBackend> {
  const requested: UnixConfinementBackend =
    floor.backend === 'seatbelt' || (floor.backend === 'auto' && process.platform === 'darwin') ? 'seatbelt' : 'bwrap'
  let available = false
  // Direct PTYs are only enabled where bwrap's private PID namespace and
  // --die-with-parent bind descendants to the owning node process. Seatbelt
  // confinement is probed elsewhere, but this PTY adapter has no native tree owner.
  if (process.platform === 'linux' && requested === 'bwrap') {
    const result = await probeUnixConfinement(requested)
    available = result.available && result.filesystem && result.processTree && (floor.network || result.network)
  }
  return {
    backend: requested,
    available,
    async open(input): Promise<NodeTerminalProcess> {
      if (!available)
        throw new HbarError('SANDBOX_BACKEND_UNAVAILABLE', 'A confined interactive PTY is unavailable on this platform')
      const confinement = {
        level: 'elevated' as const,
        readableRoots: input.readableRoots,
        writableRoots: input.writableRoots,
        networkEnabled: input.networkEnabled,
        envOverrides: input.environment,
      }
      const environment = { ...input.environment, HOME: '/tmp' }
      const plan = await prepareUnixConfinement({
        backend: requested,
        operation: { kind: 'argv', argv: ['/bin/sh', '-i'] },
        cwd: input.cwd,
        environment,
        confinement,
        protectedPaths: input.protectedPaths,
        readOnlyPaths: input.readOnlyPaths,
      })
      let child: ReturnType<typeof Bun.spawn> | undefined
      let terminal: Bun.Terminal | undefined
      let closed = false
      let timeout: ReturnType<typeof setTimeout> | undefined
      let cleanupTask: Promise<void> | undefined
      let resolveExit!: () => void
      const decoder = new TextDecoder()
      const launchEnvironment = requested === 'seatbelt' ? { ...plan.env, HOME: plan.env.TMPDIR ?? '/tmp' } : plan.env
      const exited = new Promise<void>((resolve) => {
        resolveExit = resolve
      })
      const finish = () => {
        if (closed) return
        closed = true
        if (timeout) clearTimeout(timeout)
        const remaining = decoder.decode()
        if (remaining) input.onOutput(remaining)
        input.onExit()
        cleanupTask ??= plan.cleanup()
        void cleanupTask.catch(() => console.error('[hbar] terminal confinement cleanup failed'))
        resolveExit()
      }
      try {
        terminal = new Bun.Terminal({
          cols: input.cols,
          rows: input.rows,
          name: 'xterm-256color',
          data: (_pty, data) => input.onOutput(decoder.decode(data, { stream: true })),
          exit: () => finish(),
        })
        child = Bun.spawn([...plan.argv], { cwd: plan.cwd, env: launchEnvironment, terminal, windowsHide: true })
        void child.exited.then(finish, finish)
      } catch (error) {
        terminal?.close()
        await plan.cleanup()
        throw error
      }
      timeout = setTimeout(() => {
        if (child?.exitCode === null) child.kill()
      }, input.timeoutMs)
      return {
        write(data) {
          if (!closed) terminal?.write(data)
        },
        resize(cols, rows) {
          if (!closed) terminal?.resize(cols, rows)
        },
        async close() {
          if (!closed && child?.exitCode === null) child.kill()
          if (terminal) terminal.close()
          await exited
          await (cleanupTask ??= plan.cleanup())
        },
      }
    },
  }
}
