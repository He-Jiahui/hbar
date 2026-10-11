import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { definePlugin } from '@hbar/plugin-sdk'
import { providerSchema } from '@hbar/contracts'

test('an ownership or handoff gate preserves the queued user identity and does not start idle Goal continuation hooks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-idle-authority-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  let kernel: Kernel | undefined
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    await storage.call('saveProvider', providerSchema.parse({ id: 'fixture', name: 'Fixture', protocol: 'mock', model: 'fixture', baseUrl: 'http://127.0.0.1' }))
    let idle = 0, allowed = false
    const observer = definePlugin({ manifest: { id: 'idle.observer', name: 'Idle observer', description: 'Verify authority',
      version: '1.0.0', apiVersion: '^1.0.0', scope: 'host', permissions: [] },
      apply(context) { context.hbar.api.hooks.on('session.idle', () => { idle++ }) },
    })
    const port: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
    kernel = await Kernel.create({ home: join(root, 'data'), lifecycle: 'managed', demo: true, secrets: new MemorySecrets(),
      profile: { createStorage: async () => port, plugins: [observer] },
      execution: { claim: async () => null, canIdle: async () => allowed, release: async () => {},
        call: (lease, method, ...args) => storage.callOwned(lease, method, ...args) },
    })
    const run = await kernel.submit(session.id, 'same-user-identity', { text: 'queued original input', images: [] }, 'fixture')
    await kernel.activate()
    await kernel.waitForIdle()
    expect(idle).toBe(0)
    expect(await storage.call('nextQueuedRun', session.id)).toMatchObject({ id: run.id, requestId: 'same-user-identity', status: 'queued' })
    allowed = true
    kernel.wake(session.id)
    await kernel.waitForIdle()
    expect(idle).toBe(1)
    expect((await storage.call('run', run.id)).status).toBe('queued')
  } finally { await kernel?.close(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})
