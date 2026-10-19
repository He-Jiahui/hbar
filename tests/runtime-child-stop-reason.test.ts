import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { IpcPeer, runtimeReadySchema } from '@hbar/runtime'
import type { RuntimeOwner } from '@hbar/contracts/runtime'

const stopDiagnostic = z.strictObject({
  event: z.literal('runtime.child_stop'),
  exitCode: z.literal(76),
  reason: z.enum(['IPC_FAILURE', 'UNCAUGHT_EXCEPTION']),
  phase: z.enum(['disposed', 'serving']),
  unitId: z.string(),
  generation: z.number().int().positive(),
  incarnation: z.string(),
  childPid: z.number().int().positive(),
})

for (const mode of ['dispose-channel', 'uncaught']) {
  test(`real child records its first ${mode} stop cause without error contents`, async () => {
    const owner: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: crypto.randomUUID() }
    const remote: RuntimeOwner = { unitId: 'fixture', generation: 4, incarnation: crypto.randomUUID() }
    let peer: IpcPeer | undefined
    const child = Bun.spawn([process.execPath, fileURLToPath(import.meta.resolve('@hbar/runtime/entry'))], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
      windowsHide: true,
      serialization: 'json',
      env: {
        ...process.env,
        HBAR_RUNTIME_SELF: JSON.stringify(remote),
        HBAR_RUNTIME_PARENT: JSON.stringify(owner),
        HBAR_RUNTIME_MODULE: fileURLToPath(new URL('./fixtures/runtime-child-stop-service.ts', import.meta.url)),
        HBAR_RUNTIME_PREPARATION: 'candidate',
      },
      ipc(value: unknown) {
        peer?.receive(value)
      },
    })
    peer = new IpcPeer({ owner, remote, transport: { send: (frame) => child.send(frame) } })
    const active = peer
    const stderr = new Response(child.stderr).text()
    void child.exited.then(() => active.close()).catch(() => active.close())
    try {
      await active.call(
        'runtime.prepare',
        {
          descriptor: {
            id: 'fixture',
            kind: 'plugin',
            isolation: 'process',
            dependencies: [],
            required: true,
            reloadable: true,
            contractFingerprint: 'a'.repeat(64),
            storageSchema: 1,
          },
          configuration: { mode, privateCanary: 'STOP_CONFIGURATION_CANARY' },
        },
        runtimeReadySchema,
        { timeoutMs: 2_000 },
      )
      await active.call('runtime.activate', { role: 'default' }, z.undefined(), { timeoutMs: 2_000 })
      if (mode === 'dispose-channel') {
        let failed = false
        try {
          await active.call('runtime.dispose', undefined, z.undefined(), { timeoutMs: 2_000 })
        } catch {
          failed = true
        }
        expect(failed).toBe(true)
      }
      let deadline: ReturnType<typeof setTimeout> | undefined
      let exitCode: number
      try {
        exitCode = await Promise.race([
          child.exited,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error('Child stop exit was not observed')), 3_000)
          }),
        ])
      } finally {
        clearTimeout(deadline)
      }
      expect(exitCode).toBe(76)
      const output = await stderr
      const prefix = '[hbar runtime stop] '
      const lines = output.split(/\r?\n/).filter((line) => line.startsWith(prefix))
      expect(lines).toHaveLength(1)
      const line = lines[0]
      if (!line) throw new Error('Child stop diagnostic is missing')
      const decoded: unknown = JSON.parse(line.slice(prefix.length))
      const diagnostic = stopDiagnostic.parse(decoded)
      expect(diagnostic).toMatchObject({
        unitId: remote.unitId,
        generation: remote.generation,
        incarnation: remote.incarnation,
        childPid: child.pid,
        reason: mode === 'dispose-channel' ? 'IPC_FAILURE' : 'UNCAUGHT_EXCEPTION',
        phase: mode === 'dispose-channel' ? 'disposed' : 'serving',
      })
      expect(output).not.toContain('[hbar runtime timeout] ')
      expect(output).not.toContain('STOP_ERROR_MESSAGE_CANARY')
      expect(output).not.toContain('STOP_CONFIGURATION_CANARY')
    } finally {
      active.close()
      if (child.exitCode === null) child.kill()
      await child.exited
      await stderr
    }
  }, 10_000)
}
