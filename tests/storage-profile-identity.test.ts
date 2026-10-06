import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  applyStorageLocations,
  createPathLayout,
  ensurePathLayout,
  getStorageLocations,
  resolvePathLayout,
  writePathPointer,
} from '@hbar/storage'
async function cleanup(root: string) {
  const path = await realpath(root)
  if (
    dirname(path).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(path).startsWith('hbar-storage-profile-')
  )
    throw new Error('Invalid profile test root')
  await rm(path, { recursive: true, force: true })
}
test('Desktop follows a saved location for its own identity while explicit foreign profiles retain ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-storage-profile-'))
  try {
    const pointerFile = join(root, 'bootstrap', 'paths.json')
    const profile = createPathLayout(join(root, 'profile-a'), join(root, 'cache-a'), pointerFile)
    await ensurePathLayout(profile)
    await writePathPointer(profile)
    const foreignLegacy = await resolvePathLayout({ home: join(root, 'profile-b'), pointerFile, preferPointer: true })
    expect(foreignLegacy.dataRoot).toBe(join(root, 'profile-b'))
    expect((await getStorageLocations(foreignLegacy)).restartRequired).toBe(false)
    const initial = await getStorageLocations(profile)
    const roots = {
      dataRoot: join(root, 'relocated'),
      cacheRoot: join(root, 'cache-new'),
      settingsRoot: join(root, 'configuration-new'),
      sessionsRoot: join(root, 'history-new'),
      skillsRoot: join(root, 'skills-new'),
    }
    await applyStorageLocations(profile, { roots, expectedRevision: initial.revision, operationId: 'profile-move' })
    const foreign = await resolvePathLayout({ home: join(root, 'profile-b'), pointerFile, preferPointer: true })
    expect(foreign.dataRoot).toBe(join(root, 'profile-b'))
    expect((await getStorageLocations(foreign)).saved.dataRoot).toBe(foreign.dataRoot)
    expect((await getStorageLocations(foreign)).lastWrite).toBeNull()
    const migrated = await resolvePathLayout({
      dataRoot: profile.dataRoot,
      cacheRoot: profile.cacheRoot,
      pointerFile,
      preferPointer: true,
    })
    expect(migrated.dataRoot).toBe(roots.dataRoot)
    expect(migrated.settings).toBe(roots.settingsRoot)
    expect(migrated.identityRoot).toBe(profile.identityRoot)
    expect((await getStorageLocations(migrated)).restartRequired).toBe(false)
  } finally {
    await cleanup(root)
  }
})
