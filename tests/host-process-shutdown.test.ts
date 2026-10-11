import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

for (const failure of ['exception', 'rejection', 'shutdown'] as const) {
  test(`fatal ${failure} has bounded process cleanup and a truthful exit code`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-shutdown-'))
    const entrypoint = join(root, 'owner.ts')
    const module = pathToFileURL(resolve('apps/host/src/process-shutdown.ts')).href
    await writeFile(
      entrypoint,
      `import { installHostShutdown, registerHostProcessHandlers } from ${JSON.stringify(module)}
const shutdown = installHostShutdown(() => new Promise(() => {}), 40)
registerHostProcessHandlers(shutdown)
process.send?.({ type: 'host.ready', port: 43123 })
setTimeout(() => {
${failure === 'exception' ? "throw new Error('private error payload')" : failure === 'rejection' ? "Promise.reject(new Error('private rejection payload'))" : 'shutdown(0)'}
}, 10)`,
    )
    const owner = Bun.spawn([process.execPath, entrypoint], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
      windowsHide: true,
      timeout: 3_000,
      killSignal: 'SIGKILL',
      ipc: (_message: unknown) => {},
    })
    try {
      const [code, errors] = await Promise.all([owner.exited, new Response(owner.stderr).text()])
      expect(code).toBe(failure === 'shutdown' ? 0 : 76)
      expect(errors).toContain('resource shutdown deadline exceeded')
      expect(errors).not.toContain('private')
    } finally {
      if (owner.exitCode === null) {
        owner.kill('SIGKILL')
        await owner.exited
      }
      await rm(root, { recursive: true, force: true })
    }
  })
}
