import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'

async function removeOwned(root: string): Promise<void> {
  const path = relative(resolve(tmpdir()), resolve(root))
  if (path.startsWith('..') || !path.startsWith('hbar-automation-paging-'))
    throw new Error('Refuse unowned automation fixture removal')
  await rm(root, { recursive: true, force: true })
}

test('Kernel restoration reads past two thousand canonical events and retains the latest automation controls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-automation-paging-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  let kernel: Kernel | undefined
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'automation replay')
    const session = await storage.call('createSession', workspace.id)
    await storage.call('append', session.id, 'automation.changed', {
      sessionId: session.id,
      unattended: true,
      goalEnabled: true,
    })
    for (let index = 0; index < 2_001; index++)
      await storage.call('append', session.id, 'automation.historyMarker', { index })
    const last = await storage.call('append', session.id, 'automation.changed', {
      sessionId: session.id,
      unattended: true,
      goalEnabled: false,
    })
    expect(last.seq).toBeGreaterThan(2_000)
    const batches: number[] = []
    const port: StoragePort = {
      async call(method, ...args) {
        if (method === 'events') batches.push(typeof args[1] === 'number' ? args[1] : -1)
        return storage.call(method, ...args)
      },
      close: async () => {},
    }
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port },
    })
    expect(await kernel.automationGet(session.id)).toMatchObject({ unattended: true, goalEnabled: false })
    expect(batches.some((cursor) => cursor > 0)).toBe(true)
    expect(kernel.active.size).toBe(0)
    expect(await storage.call('events', session.id, last.seq, 128)).toHaveLength(0)
  } finally {
    await kernel?.close()
    await storage.close()
    await removeOwned(root)
  }
}, 60_000)
