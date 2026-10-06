import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  applyStorageLocations,
  createPathLayout,
  ensurePathLayout,
  getStorageLocations,
  resolvePathLayout,
  Storage,
  writePathPointer,
  pathPointerSchema,
} from '@hbar/storage'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { HbarClient, createSystemCommandClient } from '@hbar/client'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-locations-'))
  const layout = createPathLayout(
    join(root, 'old-data'),
    join(root, 'old-cache'),
    join(root, 'bootstrap', 'paths.json'),
  )
  cleanups.push(() => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  await ensurePathLayout(layout)
  const roots = {
    dataRoot: join(root, 'new-data'),
    cacheRoot: join(root, 'new-cache'),
    settingsRoot: join(root, 'configuration'),
    sessionsRoot: join(root, 'history'),
    skillsRoot: join(root, 'global-skills'),
  }
  return { root, layout, roots }
}
test('v1 pointers retain compatibility and independent roots migrate records before SQLite opens', async () => {
  const { layout, roots } = await fixture()
  await writePathPointer(layout)
  const legacy = await resolvePathLayout({ pointerFile: layout.pointerFile })
  expect(legacy.globalSkills).toBe(join(layout.skills, 'global'))
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', layout.dataRoot, 'retained workspace')
  const session = await storage.call('createSession', workspace.id, 'retained session')
  await storage.call('commit', session.id, 'migration-run', 'user', [{ type: 'text', text: 'retained record' }])
  await storage.close()
  await mkdir(join(layout.globalSkills, 'example'))
  await writeFile(join(layout.globalSkills, 'example', 'SKILL.md'), '# Preserved skill')
  await writeFile(join(layout.cache.models, 'disposable'), 'cache')
  const current = await getStorageLocations(layout)
  const input = { roots, expectedRevision: current.revision, operationId: 'migration-1' }
  const saved = await applyStorageLocations(layout, input)
  expect(saved.active).toEqual(current.active)
  expect(saved.saved).toEqual(roots)
  expect(saved.restartRequired).toBe(true)
  expect(await applyStorageLocations(layout, input)).toEqual(saved)
  const migrated = await resolvePathLayout({ pointerFile: layout.pointerFile })
  expect(migrated.identityRoot).toBe(layout.identityRoot)
  expect(migrated.sessions).toBe(resolve(roots.sessionsRoot))
  expect(migrated.settings).toBe(resolve(roots.settingsRoot))
  expect(migrated.globalSkills).toBe(resolve(roots.skillsRoot))
  expect(await readFile(join(migrated.globalSkills, 'example', 'SKILL.md'), 'utf8')).toBe('# Preserved skill')
  expect(await readFile(join(layout.globalSkills, 'example', 'SKILL.md'), 'utf8')).toBe('# Preserved skill')
  expect(pathPointerSchema.parse(JSON.parse(await readFile(layout.pointerFile, 'utf8')))).toMatchObject({
    migration: null,
  })
  const restored = new Storage(migrated.database, migrated)
  try {
    await restored.call('ready')
    const snapshot = await restored.call('snapshot', session.id)
    expect(snapshot.messages[0]?.content[0]).toEqual({ type: 'text', text: 'retained record' })
    expect((await getStorageLocations(migrated)).restartRequired).toBe(false)
  } finally {
    await restored.close()
  }
})
test('stale revisions, duplicate IDs and overlapping/relative locations fail without changing the pointer', async () => {
  const { layout, roots } = await fixture()
  const current = await getStorageLocations(layout)
  const input = { roots, expectedRevision: current.revision, operationId: 'save-once' }
  await applyStorageLocations(layout, input)
  const pointer = await readFile(layout.pointerFile, 'utf8')
  await expect(applyStorageLocations(layout, { ...input, operationId: 'stale' })).rejects.toThrow('changed')
  await expect(
    applyStorageLocations(layout, { ...input, roots: { ...roots, cacheRoot: join(roots.cacheRoot, 'different') } }),
  ).rejects.toThrow('different input')
  const revision = (await getStorageLocations(layout)).revision
  for (const next of [
    { ...roots, sessionsRoot: 'relative' },
    { ...roots, skillsRoot: roots.sessionsRoot },
    { ...roots, cacheRoot: roots.dataRoot },
    { ...roots, sessionsRoot: join(layout.sessions, 'nested') },
  ])
    await expect(
      applyStorageLocations(layout, { roots: next, expectedRevision: revision, operationId: crypto.randomUUID() }),
    ).rejects.toThrow()
  expect(await readFile(layout.pointerFile, 'utf8')).toBe(pointer)
})
test('conflicting destination data prevents migration and leaves a recoverable intent', async () => {
  const { layout, roots } = await fixture()
  await writeFile(join(layout.settings, 'custom.json'), 'source data')
  const input = { roots, expectedRevision: (await getStorageLocations(layout)).revision, operationId: 'conflict' }
  await applyStorageLocations(layout, input)
  await writeFile(join(roots.settingsRoot, 'custom.json'), 'destination data')
  await expect(resolvePathLayout({ pointerFile: layout.pointerFile })).rejects.toThrow('different data')
  expect(await readFile(join(layout.settings, 'custom.json'), 'utf8')).toBe('source data')
  const pointer = pathPointerSchema.parse(JSON.parse(await readFile(layout.pointerFile, 'utf8')))
  expect(pointer.version === 2 && pointer.migration !== null).toBe(true)
  await rm(join(roots.settingsRoot, 'custom.json'))
  const resumed = await resolvePathLayout({ pointerFile: layout.pointerFile })
  expect(await readFile(join(resumed.settings, 'custom.json'), 'utf8')).toBe('source data')
})
test('a running source Host is never copied', async () => {
  const { layout, roots } = await fixture()
  await applyStorageLocations(layout, {
    roots,
    expectedRevision: (await getStorageLocations(layout)).revision,
    operationId: 'live-host',
  })
  await writeFile(layout.hostLock, JSON.stringify({ pid: process.pid }))
  await expect(resolvePathLayout({ pointerFile: layout.pointerFile })).rejects.toThrow('Stop the source Host')
})
test('real Host commands save independent roots, preserve current ownership and reject stale edits', async () => {
  const { root, layout, roots } = await fixture()
  const kernel = await Kernel.create({ layout, workspace: root, demo: true, secrets: new MemorySecrets() })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
  })
  await client.pair(host.pairing.code, 'storage locations test')
  const commands = createSystemCommandClient(client)
  const before = await commands.execute('system.storage.get', {})
  const input = { roots, expectedRevision: before.revision, operationId: 'host-save' }
  const saved = await commands.execute('system.storage.apply', input, { idempotencyKey: input.operationId })
  expect(saved.restartRequired).toBe(true)
  expect(kernel.options.layout.settings).toBe(layout.settings)
  expect(await commands.execute('system.storage.apply', input, { idempotencyKey: input.operationId })).toEqual(saved)
  await expect(
    commands.execute('system.storage.apply', { ...input, operationId: 'stale-client' }),
  ).rejects.toMatchObject({ code: 'STORAGE_CONFLICT' })
})
