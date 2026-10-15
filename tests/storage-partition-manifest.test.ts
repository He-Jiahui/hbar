import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import {
  assertPartitionPathSafe,
  createPartitionLayout,
  partitionDatabasePath,
} from '../packages/storage/src/partition-layout'
import {
  partitionManifestSchema,
  partitionSourceVersionSchema,
  assertPartitionCompatibility,
  readPartitionManifest,
  switchPartitionManifest,
  type PartitionManifest,
} from '../packages/storage/src/partition-manifest'

const generationA = '11111111-1111-4111-8111-111111111111'
const generationB = '22222222-2222-4222-8222-222222222222'
const storageId = '33333333-3333-4333-8333-333333333333'
const projectId = '44444444-4444-4444-8444-444444444444'
const sessionId = '55555555-5555-4555-8555-555555555555'
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-partition-manifest-'))
  roots.push(root)
  return createPartitionLayout(root)
}
function manifest(generation = generationA): PartitionManifest {
  return {
    schema: 'hbar.storage-partitions',
    formatVersion: 1,
    minimumReaderVersion: 1,
    activeGeneration: generation,
    storageIdentity: storageId,
    activatedAt: 1,
    ownership: { global: 'global', project: 'project', session: 'session' },
  }
}

test('missing means legacy, but malformed, oversize and unsupported files never fall back to legacy', async () => {
  const layout = await fixture()
  expect(await readPartitionManifest(layout)).toEqual({ kind: 'legacy' })
  for (const body of ['{', '{}', 'x'.repeat(65_537), JSON.stringify({ ...manifest(), rawMessages: [] })]) {
    await writeFile(layout.manifest, body)
    await expect(readPartitionManifest(layout)).rejects.toMatchObject({ code: 'PARTITION_MANIFEST_CORRUPT' })
  }
  await writeFile(layout.manifest, JSON.stringify({ ...manifest(), formatVersion: 2 }))
  await expect(readPartitionManifest(layout)).rejects.toMatchObject({ code: 'PARTITION_READER_UNSUPPORTED' })
  await writeFile(layout.manifest, JSON.stringify({ ...manifest(), minimumReaderVersion: 2 }))
  await expect(readPartitionManifest(layout, 1)).rejects.toMatchObject({ code: 'PARTITION_READER_UNSUPPORTED' })
  expect((await readPartitionManifest(layout, 2)).kind).toBe('partitioned')
})

test('a directory in place of manifest rejects instead of authorizing a legacy SQLite open', async () => {
  const layout = await fixture()
  await mkdir(layout.manifest)
  await expect(readPartitionManifest(layout)).rejects.toBeInstanceOf(Error)
})

test('exclusive CAS switches preserve old bytes on conflict and expose a complete next generation', async () => {
  const layout = await fixture()
  await switchPartitionManifest(layout, null, manifest())
  const before = await readFile(layout.manifest, 'utf8')
  await expect(switchPartitionManifest(layout, null, manifest(generationB))).rejects.toMatchObject({
    code: 'PARTITION_SWITCH_CONFLICT',
  })
  expect(await readFile(layout.manifest, 'utf8')).toBe(before)
  await expect(
    switchPartitionManifest(layout, generationA, { ...manifest(generationB), storageIdentity: sessionId }),
  ).rejects.toMatchObject({ code: 'PARTITION_IDENTITY_CONFLICT' })
  expect(await readFile(layout.manifest, 'utf8')).toBe(before)
  const switched = await switchPartitionManifest(layout, generationA, manifest(generationB))
  expect(switched.manifest.activeGeneration).toBe(generationB)
  expect(await readPartitionManifest(layout)).toEqual({ kind: 'partitioned', manifest: manifest(generationB) })
  expect(await readdir(layout.root)).toEqual(['storage-active.json'])
  // A replay with stale expected generation cannot republish or roll the pointer back.
  await expect(switchPartitionManifest(layout, generationA, manifest())).rejects.toMatchObject({
    code: 'PARTITION_SWITCH_CONFLICT',
  })
})

test('concurrent publishers cannot both win and an interrupted writer lock is never stolen', async () => {
  const layout = await fixture()
  const results = await Promise.allSettled([
    switchPartitionManifest(layout, null, manifest()),
    switchPartitionManifest(layout, null, manifest(generationB)),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  await writeFile(layout.switchLock, 'interrupted-owner')
  const before = await readFile(layout.manifest, 'utf8')
  await expect(switchPartitionManifest(layout, generationA, manifest(generationB))).rejects.toMatchObject({
    code: 'PARTITION_SWITCH_BUSY',
  })
  expect(await readFile(layout.switchLock, 'utf8')).toBe('interrupted-owner')
  expect(await readFile(layout.manifest, 'utf8')).toBe(before)
})

test('an interrupted first publication blocks legacy admission and leaves unrelated staging files intact', async () => {
  const layout = await fixture()
  await writeFile(layout.switchLock, 'interrupted-first-switch')
  const staged = join(layout.root, 'storage-active.json.previous-attempt.tmp')
  await writeFile(staged, JSON.stringify(manifest()))
  await expect(
    assertPartitionCompatibility(layout, { readerVersion: 1, partitionedStorage: false }),
  ).rejects.toMatchObject({ code: 'PARTITION_SWITCH_BUSY' })
  expect(await readFile(staged, 'utf8')).toBe(JSON.stringify(manifest()))
  await expect(switchPartitionManifest(layout, null, manifest())).rejects.toMatchObject({
    code: 'PARTITION_SWITCH_BUSY',
  })
})

test('destination corruption leaves destination intact and only removes this attempt lock', async () => {
  const layout = await fixture()
  // Directory corruption fails the read gate before a publish; caller-owned debris is retained.
  await mkdir(layout.manifest)
  const foreign = join(layout.root, 'storage-active.json.foreign.tmp')
  await writeFile(foreign, 'preserve')
  await expect(switchPartitionManifest(layout, null, manifest())).rejects.toBeInstanceOf(Error)
  expect(await readFile(foreign, 'utf8')).toBe('preserve')
  expect((await readdir(layout.root)).sort()).toEqual(['storage-active.json', 'storage-active.json.foreign.tmp'])
})

test('UUID ownership prevents path and title injection and namespaces session identity under its project', async () => {
  const layout = await fixture()
  const path = partitionDatabasePath(layout, generationA, {
    kind: 'session',
    projectPartitionId: projectId,
    sessionPartitionId: sessionId,
  })
  expect(relative(layout.root, path).replaceAll('\\', '/')).toBe(
    `partition-generations/${generationA}/projects/${projectId}/sessions/${sessionId}.sqlite`,
  )
  for (const attack of [
    '..',
    '../escape',
    'C:/escape',
    '/absolute',
    'name',
    projectId + ':stream',
    projectId + '\\other',
  ]) {
    expect(() => partitionDatabasePath(layout, attack, { kind: 'global' })).toThrow()
    expect(() => partitionDatabasePath(layout, generationA, { kind: 'project', projectPartitionId: attack })).toThrow()
    expect(() =>
      partitionDatabasePath(layout, generationA, {
        kind: 'session',
        projectPartitionId: projectId,
        sessionPartitionId: attack,
      }),
    ).toThrow()
  }
})

test('source marker accepts only epoch/revision/cursor; manifest rejects any directory rows', () => {
  const snapshot = { sourceEpoch: generationA, sourceRevision: 4, eventCursor: 10 }
  expect(partitionSourceVersionSchema.safeParse(snapshot).success).toBe(true)
  expect(partitionSourceVersionSchema.safeParse({ ...snapshot, messages: [] }).success).toBe(false)
  expect(partitionSourceVersionSchema.safeParse({ ...snapshot, sourceRevision: -1 }).success).toBe(false)
  expect(partitionManifestSchema.safeParse({ ...manifest(), shallowSnapshots: [snapshot] }).success).toBe(false)
  expect(partitionManifestSchema.safeParse({ ...manifest(), sessions: [sessionId] }).success).toBe(false)
})

test('legacy-only entrypoint refuses a valid partition generation before any database work', async () => {
  const layout = await fixture()
  expect(await assertPartitionCompatibility(layout, { readerVersion: 1, partitionedStorage: false })).toEqual({
    kind: 'legacy',
  })
  await switchPartitionManifest(layout, null, manifest())
  await expect(
    assertPartitionCompatibility(layout, { readerVersion: 1, partitionedStorage: false }),
  ).rejects.toMatchObject({ code: 'PARTITION_ENTRYPOINT_UNSUPPORTED' })
  expect((await assertPartitionCompatibility(layout, { readerVersion: 1, partitionedStorage: true })).kind).toBe(
    'partitioned',
  )
})

test('symlink or Windows junction ancestors and linked manifest or lock fail closed without touching target', async () => {
  const layout = await fixture()
  const outside = await fixture()
  await writeFile(outside.manifest, JSON.stringify(manifest()))
  const alias = join(layout.root, 'alias')
  await symlink(outside.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(readPartitionManifest(createPartitionLayout(alias))).rejects.toBeInstanceOf(Error)
  await expect(switchPartitionManifest(createPartitionLayout(alias), null, manifest())).rejects.toBeInstanceOf(Error)
  const decoded: unknown = JSON.parse(await readFile(outside.manifest, 'utf8'))
  expect(decoded).toEqual(manifest())
  // A link in place of the manifest is also rejected; no follow then legacy fallback.
  await symlink(outside.root, layout.manifest, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(readPartitionManifest(layout)).rejects.toBeInstanceOf(Error)
  const lockLayout = await fixture()
  await symlink(outside.root, lockLayout.switchLock, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(switchPartitionManifest(lockLayout, null, manifest())).rejects.toBeInstanceOf(Error)
  expect(await readFile(outside.manifest, 'utf8')).toBe(JSON.stringify(manifest()))
})

test('ordinary temporary ancestors permit missing descendants but never escape the configured root', async () => {
  const layout = await fixture()
  await expect(assertPartitionPathSafe(layout, layout.root)).resolves.toBeUndefined()
  const target = partitionDatabasePath(layout, generationA, { kind: 'global' })
  await expect(assertPartitionPathSafe(layout, target, true)).resolves.toBeUndefined()
  await expect(assertPartitionPathSafe(layout, join(layout.root, '..', 'escaped.sqlite'), true)).rejects.toThrow(
    'PARTITION_PATH_ESCAPE',
  )
  if (process.platform === 'win32') {
    // Windows path identity is case-insensitive; spelling alone is not a reparse point.
    const alternate = createPartitionLayout(layout.root.toUpperCase())
    await expect(assertPartitionPathSafe(alternate, alternate.manifest, true)).resolves.toBeUndefined()
  }
})

test('a linked child under an ordinary configured root is rejected before missing-tail admission', async () => {
  const layout = await fixture()
  const outside = await fixture()
  const alias = join(layout.root, 'partition-generations')
  await symlink(outside.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await expect(
    assertPartitionPathSafe(layout, partitionDatabasePath(layout, generationA, { kind: 'global' }), true),
  ).rejects.toThrow('PARTITION_LINK_FORBIDDEN')
  expect(await readdir(outside.root)).toEqual([])
})
