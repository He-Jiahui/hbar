import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionSearchCommands } from '@hbar/kernel/session-search-commands'
import { Storage, createPathLayout, ensurePathLayout, type StorageMethods } from '@hbar/storage'

test('search preflight performs no index writes or scheduled recovery until explicitly activated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-search-lifecycle-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const original = storage.call.bind(storage)
  let calls = 0
  storage.call = async <K extends keyof StorageMethods>(method: K, ...args: Parameters<StorageMethods[K]>): Promise<ReturnType<StorageMethods[K]>> => {
    calls++
    return original(method, ...args)
  }
  const commands = createSessionSearchCommands(storage, { start: false })
  try {
    expect(commands.list().items).toHaveLength(2)
    await Bun.sleep(30)
    expect(calls).toBe(0)
    commands.start()
    const deadline = Date.now() + 5_000
    while (!calls) { if (Date.now() > deadline) throw new Error('Activated search did not start its bounded index step'); await Bun.sleep(5) }
    await commands.pause()
    const paused = calls
    await Bun.sleep(30)
    expect(calls).toBe(paused)
    expect(paused).toBeGreaterThan(0)
  } finally { await commands.dispose(); await storage.close(); await rm(root, { recursive: true, force: true }) }
})
