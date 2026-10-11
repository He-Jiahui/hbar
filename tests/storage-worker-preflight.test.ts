import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { Storage, createPathLayout, ensurePathLayout, scanSessionLogs, STORAGE_SCHEMA_VERSION } from '@hbar/storage'

async function removeOwned(root: string) {
  const path = relative(resolve(tmpdir()), resolve(root))
  if (path.startsWith('..') || !path.startsWith('hbar-worker-preflight-'))
    throw new Error('Worker fixture cleanup escaped its owned directory')
  await rm(resolve(root), { recursive: true, force: true })
}
async function hashFile(path: string) {
  if (!existsSync(path)) return null
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

test('actual Worker preflight constructs its full method table without a database file, and accepts readiness and disposal only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const probe = new Storage(layout.database, layout, { preflight: true })
  try {
    expect(await probe.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await probe.call('setSetting', 'forbidden', 'must-not-write').catch((error: unknown) => error)).toMatchObject({
      code: 'RUNTIME_PREPARING',
    })
    expect(existsSync(layout.database)).toBe(false)
    expect(await readdir(root)).toEqual([])
    await probe.close()
    expect(await readdir(root)).toEqual([])
  } finally {
    await probe.close()
    await removeOwned(root)
  }
})

test('a readonly actual Worker probe leaves the database, WAL and canonical receipts intact while the existing writer continues serving', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-worker-preflight-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const writer = new Storage(layout.database, layout)
  let probe: Storage | undefined
  try {
    await writer.call('ready')
    const workspace = await writer.call('createWorkspace', root, 'probe verification')
    const session = await writer.call('createSession', workspace.id)
    await writer.call(
      'commit',
      session.id,
      'preflight-receipt',
      'user',
      [{ type: 'text', text: 'Confirmed context' }],
      'preflight-committed-message',
    )
    const before = await Promise.all([hashFile(layout.database), hashFile(layout.database + '-wal')])
    const logs = scanSessionLogs(layout.sessions).events.map((event) => event.hash)
    probe = new Storage(layout.database, layout, { preflight: true })
    expect(await probe.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
    expect(await probe.call('setSetting', 'forbidden', 'must-not-write').catch((error: unknown) => error)).toMatchObject({
      code: 'RUNTIME_PREPARING',
    })
    await probe.close()
    expect(await Promise.all([hashFile(layout.database), hashFile(layout.database + '-wal')])).toEqual(before)
    expect(scanSessionLogs(layout.sessions).events.map((event) => event.hash)).toEqual(logs)
    expect(await writer.call('getSetting', 'forbidden')).toBeNull()
    await writer.call('setSetting', 'writer-still-serving', 'still-serving')
    expect(await writer.call('getSetting', 'writer-still-serving')).toBe('still-serving')
  } finally {
    await probe?.close()
    await writer.close()
    await removeOwned(root)
  }
})
