import { pathToFileURL } from 'node:url'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'
import { diagnosticEventSchema } from '@hbar/contracts/diagnostics'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'

for (const method of ['driver.callback', 'kernel.plugins.invoke', 'private-method-canary']) {
  test(`real entry outbound ${method} deadline writes safe timeout metadata before fail-closed stop and actual exit76`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-entry-outbound-timeout-'))
    const modulePath = join(root, 'service.ts')
    const secret = 'private-callback-body-credential-canary'
    const entry = join(process.cwd(), 'packages/runtime/src/process-entry.ts')
    await writeFile(
      modulePath,
      `import { z } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'node_modules/zod/index.js')).href)};
export function create(context) {
 return {
  prepare: async input => ({contractFingerprint:input.descriptor.contractFingerprint,storageSchema:input.descriptor.storageSchema,capabilities:[]}),
  activate: async () => { setTimeout(()=> { context.peer.call(${JSON.stringify(method)},{body:'${secret}'},z.unknown(),{timeoutMs:75}).catch(()=>{}) },10) },
  drain: async () => ({requests:0,runs:0,resources:0}),dispose:async()=>{}
 }
}`,
    )
    const parent = { unitId: 'base', generation: 1, incarnation: 'outbound-parent' }
    const owner = { unitId: 'driver.pi', generation: 1, incarnation: 'outbound-child' }
    let peer: IpcPeer | undefined
    const child = Bun.spawn([process.execPath, entry], {
      env: {
        ...process.env,
        HBAR_RUNTIME_SELF: JSON.stringify(owner),
        HBAR_RUNTIME_PARENT: JSON.stringify(parent),
        HBAR_RUNTIME_MODULE: modulePath,
      },
      ipc: (message) => {
        peer?.receive(message)
      },
      stdout: 'ignore',
      stderr: 'pipe',
      windowsHide: true,
    })
    peer = new IpcPeer({ owner: parent, remote: owner, transport: { send: (frame) => child.send(frame) } })
    let callbackReceived = false
    peer.register(
      method,
      procedure(z.unknown(), z.unknown(), () => {
        callbackReceived = true
        return new Promise<never>(() => {})
      }),
    )
    const stderr = new Response(child.stderr).text()
    const deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
    let bodyFailed = false
    let bodyError: unknown
    try {
      await peer.call(
        'runtime.prepare',
        {
          descriptor: {
            id: 'driver.pi',
            kind: 'driver',
            isolation: 'process',
            dependencies: [],
            required: true,
            reloadable: true,
            contractFingerprint: 'a'.repeat(64),
            storageSchema: STORAGE_SCHEMA_VERSION,
          },
          configuration: {},
        },
        z.unknown(),
      )
      await peer.call('runtime.activate', { role: 'default' }, z.undefined())
      expect(await child.exited).toBe(76)
      expect(callbackReceived).toBe(true)
      const text = await stderr
      const events = text.split('\n').flatMap((line) => {
        try {
          const parsed = diagnosticEventSchema.safeParse(JSON.parse(line))
          return parsed.success ? [parsed.data] : []
        } catch {
          return []
        }
      })
      const timeout = events[0]
      expect(timeout?.event).toBe('host.runtime_entry_call_timeout')
      expect(timeout?.method).toBe(method === 'private-method-canary' ? 'runtime.other' : method)
      expect(timeout?.phase).toBe('dispatched')
      expect(timeout?.requestId).toBe(owner.incarnation)
      expect(typeof timeout?.callId).toBe('string')
      expect(timeout?.durationMs).toBeGreaterThanOrEqual(60)
      expect(timeout?.durationMs).toBeLessThan(5000)
      expect(typeof timeout?.pending).toBe('number')
      expect(typeof timeout?.recordsIn).toBe('number')
      expect(typeof timeout?.bytesIn).toBe('number')
      expect(typeof timeout?.bytesOut).toBe('number')
      expect(events.find((event) => event.event === 'host.runtime_entry_stop')).toMatchObject({
        phase: 'dispatched_timeout',
        exitCode: 76,
        errorCode: 'RUNTIME_STOP_DISPATCHED_TIMEOUT',
      })
      expect(text).not.toContain(secret)
      if (method === 'private-method-canary') expect(text).not.toContain(method)
    } catch (error: unknown) {
      bodyFailed = true
      bodyError = error
    }
    {
      const cleanupErrors: unknown[] = []
      try {
        clearTimeout(deadline)
        peer.close()
        if (child.exitCode === null) {
          child.kill('SIGKILL')
          await child.exited
        }
        await stderr
        const owned = await realpath(root)
        if (
          dirname(owned) !== (await realpath(tmpdir())) ||
          !basename(owned).startsWith('hbar-entry-outbound-timeout-')
        )
          throw new Error('Refusing to remove non-owned timeout fixture')
        await rm(owned, { recursive: true, force: true })
      } catch (error: unknown) {
        cleanupErrors.push(error)
      }
      if (bodyFailed && cleanupErrors.length)
        throw new AggregateError([bodyError, ...cleanupErrors], 'Outbound timeout body and cleanup failed', {
          cause: bodyError,
        })
      if (bodyFailed) throw bodyError
      if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Outbound timeout cleanup failed')
    }
  }, 10000)
}
