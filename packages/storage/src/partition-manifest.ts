import { randomUUID } from 'node:crypto'
import { lstat, open, rename, unlink } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { z } from 'zod'
import { assertPartitionPathSafe, partitionIdSchema, type PartitionLayout } from './partition-layout'

export const PARTITION_READER_VERSION = 1
const MAX_MANIFEST_BYTES = 64 * 1024
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Reusable source marker only; entity rows and locators live in parent SQLite tables. */
export const partitionSourceVersionSchema = z.strictObject({
  sourceEpoch: partitionIdSchema,
  sourceRevision: counter,
  eventCursor: counter,
})

export const partitionManifestSchema = z.strictObject({
  schema: z.literal('hbar.storage-partitions'),
  formatVersion: z.literal(1),
  minimumReaderVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  activeGeneration: partitionIdSchema,
  storageIdentity: partitionIdSchema,
  activatedAt: counter,
  ownership: z.strictObject({
    global: z.literal('global'),
    project: z.literal('project'),
    session: z.literal('session'),
  }),
})
export type PartitionManifest = z.infer<typeof partitionManifestSchema>
export type PartitionManifestState =
  { readonly kind: 'legacy' } | { readonly kind: 'partitioned'; readonly manifest: PartitionManifest }
export type PartitionManifestErrorCode =
  | 'PARTITION_MANIFEST_CORRUPT'
  | 'PARTITION_READER_UNSUPPORTED'
  | 'PARTITION_SWITCH_BUSY'
  | 'PARTITION_SWITCH_CONFLICT'
  | 'PARTITION_IDENTITY_CONFLICT'
  | 'PARTITION_ENTRYPOINT_UNSUPPORTED'
export class PartitionManifestError extends Error {
  constructor(readonly code: PartitionManifestErrorCode) {
    super(code)
    this.name = 'PartitionManifestError'
  }
}

function parseManifest(value: unknown, readerVersion: number): PartitionManifest {
  if (!Number.isSafeInteger(readerVersion) || readerVersion < 1)
    throw new RangeError('Invalid partition reader version')
  if (value && typeof value === 'object' && 'formatVersion' in value && value.formatVersion !== 1)
    throw new PartitionManifestError('PARTITION_READER_UNSUPPORTED')
  const parsed = partitionManifestSchema.safeParse(value)
  if (!parsed.success) throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
  if (parsed.data.minimumReaderVersion > readerVersion) throw new PartitionManifestError('PARTITION_READER_UNSUPPORTED')
  return parsed.data
}

/** MUST be awaited before any SQLite open/DDL. Only genuine manifest ENOENT permits legacy. */
export async function readPartitionManifest(
  layout: PartitionLayout,
  readerVersion = PARTITION_READER_VERSION,
): Promise<PartitionManifestState> {
  return readManifest(layout, readerVersion, false)
}

async function readManifest(
  layout: PartitionLayout,
  readerVersion: number,
  switchOwner: boolean,
): Promise<PartitionManifestState> {
  if (!Number.isSafeInteger(readerVersion) || readerVersion < 1)
    throw new RangeError('Invalid partition reader version')
  await assertPartitionPathSafe(layout, layout.manifest, true)
  let file: FileHandle
  try {
    file = await open(layout.manifest, 'r')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // A crashed initial switch must not authorize a new legacy database.
      if (!switchOwner) {
        await assertPartitionPathSafe(layout, layout.switchLock, true)
        try {
          await lstat(layout.switchLock)
        } catch (lockError) {
          if (lockError instanceof Error && 'code' in lockError && lockError.code === 'ENOENT')
            return { kind: 'legacy' }
          throw lockError
        }
        throw new PartitionManifestError('PARTITION_SWITCH_BUSY')
      }
      return { kind: 'legacy' }
    }
    throw error
  }
  try {
    const info = await file.stat()
    const pathInfo = await lstat(layout.manifest)
    await assertPartitionPathSafe(layout, layout.manifest)
    if (
      !info.isFile() ||
      pathInfo.isSymbolicLink() ||
      info.ino !== pathInfo.ino ||
      info.dev !== pathInfo.dev ||
      info.size > MAX_MANIFEST_BYTES
    )
      throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
    const bytes = Buffer.alloc(MAX_MANIFEST_BYTES + 1)
    let offset = 0
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) break
      offset += result.bytesRead
    }
    if (offset > MAX_MANIFEST_BYTES) throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
    const after = await file.stat()
    if (offset !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs)
      throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
    let value: unknown
    try {
      value = JSON.parse(bytes.subarray(0, offset).toString('utf8'))
    } catch {
      throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
    }
    return { kind: 'partitioned', manifest: parseManifest(value, readerVersion) }
  } finally {
    await file.close()
  }
}

export interface PartitionSwitchResult {
  readonly manifest: PartitionManifest
  readonly directoryDurability: 'synced' | 'unsupported-on-windows'
}

/** Legacy entrypoints must pass false until they actually implement partition routing. */
export async function assertPartitionCompatibility(
  layout: PartitionLayout,
  capabilities: { readonly readerVersion: number; readonly partitionedStorage: boolean },
): Promise<PartitionManifestState> {
  const state = await readPartitionManifest(layout, capabilities.readerVersion)
  if (state.kind === 'partitioned' && !capabilities.partitionedStorage)
    throw new PartitionManifestError('PARTITION_ENTRYPOINT_UNSUPPORTED')
  return state
}

/** Cooperative exclusive switch; existing DB generation validation/writer retirement is caller-owned. */
export async function switchPartitionManifest(
  layout: PartitionLayout,
  expectedGeneration: string | null,
  input: PartitionManifest,
): Promise<PartitionSwitchResult> {
  const expected = expectedGeneration === null ? null : partitionIdSchema.parse(expectedGeneration)
  const manifest = parseManifest(input, PARTITION_READER_VERSION)
  const bytes = Buffer.from(JSON.stringify(manifest) + '\n')
  if (bytes.length > MAX_MANIFEST_BYTES) throw new PartitionManifestError('PARTITION_MANIFEST_CORRUPT')
  await assertPartitionPathSafe(layout, layout.root)
  await assertPartitionPathSafe(layout, layout.switchLock, true)
  let lock: FileHandle
  try {
    lock = await open(layout.switchLock, 'wx', 0o600)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new PartitionManifestError('PARTITION_SWITCH_BUSY')
    throw error
  }
  const temporary = `${layout.manifest}.${randomUUID()}.tmp`
  let lockIdentity: Stats | undefined
  let temporaryIdentity: Stats | undefined
  async function removeOwned(path: string, identity: Stats): Promise<void> {
    await assertPartitionPathSafe(layout, path)
    const current = await lstat(path)
    if (current.dev !== identity.dev || current.ino !== identity.ino)
      throw new PartitionManifestError('PARTITION_SWITCH_CONFLICT')
    await unlink(path)
  }
  try {
    lockIdentity = await lock.stat()
    await lock.writeFile(JSON.stringify({ schema: 'hbar.partition-switch-lock.v1', token: randomUUID() }) + '\n')
    await lock.sync()
    const current = await readManifest(layout, PARTITION_READER_VERSION, true)
    const generation = current.kind === 'legacy' ? null : current.manifest.activeGeneration
    if (generation !== expected) throw new PartitionManifestError('PARTITION_SWITCH_CONFLICT')
    if (current.kind === 'partitioned') {
      if (current.manifest.storageIdentity !== manifest.storageIdentity)
        throw new PartitionManifestError('PARTITION_IDENTITY_CONFLICT')
      if (current.manifest.activeGeneration === manifest.activeGeneration)
        throw new PartitionManifestError('PARTITION_SWITCH_CONFLICT')
    }
    await assertPartitionPathSafe(layout, temporary, true)
    const file = await open(temporary, 'wx', 0o600)
    try {
      temporaryIdentity = await file.stat()
      await file.writeFile(bytes)
      await file.sync()
    } finally {
      await file.close()
    }
    await assertPartitionPathSafe(layout, layout.switchLock)
    const currentLock = await lstat(layout.switchLock)
    if (currentLock.dev !== lockIdentity.dev || currentLock.ino !== lockIdentity.ino)
      throw new PartitionManifestError('PARTITION_SWITCH_CONFLICT')
    await assertPartitionPathSafe(layout, layout.manifest, true)
    await assertPartitionPathSafe(layout, temporary)
    const currentTemporary = await lstat(temporary)
    if (currentTemporary.dev !== temporaryIdentity.dev || currentTemporary.ino !== temporaryIdentity.ino)
      throw new PartitionManifestError('PARTITION_SWITCH_CONFLICT')
    await rename(temporary, layout.manifest)
    temporaryIdentity = undefined
    if (process.platform === 'win32') return { manifest, directoryDurability: 'unsupported-on-windows' }
    const directory = await open(layout.root, 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
    return { manifest, directoryDurability: 'synced' }
  } finally {
    try {
      if (temporaryIdentity) await removeOwned(temporary, temporaryIdentity)
    } finally {
      await lock.close()
      if (lockIdentity) await removeOwned(layout.switchLock, lockIdentity)
    }
  }
}
