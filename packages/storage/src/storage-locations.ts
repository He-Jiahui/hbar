import { access, copyFile, link, lstat, mkdir, open, opendir, readFile, realpath, rename, rm } from 'node:fs/promises'
import { constants, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
import {
  storageRootsSchema,
  type StorageLocationApply,
  type StorageLocationSnapshot,
  type StorageRoots,
} from '@hbar/contracts/commands/storage-locations'
import type { PathLayout } from './path-layout.ts'
import { pathPointerSchema, type PathPointer } from './path-pointer.ts'

export function storageRoots(layout: PathLayout): StorageRoots {
  return {
    dataRoot: layout.dataRoot,
    cacheRoot: layout.cacheRoot,
    settingsRoot: layout.settings,
    sessionsRoot: layout.sessions,
    skillsRoot: layout.globalSkills,
  }
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function contains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path))
}
async function pointerText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
async function atomicPointer(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`)
    await file.sync()
  } finally {
    await file.close()
  }
  try {
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}
async function withPointerLock<T>(path: string, action: () => Promise<T>, attempt = 0): Promise<T> {
  if (attempt > 1) throw new HbarError('STORAGE_BUSY', 'Storage lock changed repeatedly')
  await mkdir(dirname(path), { recursive: true })
  const lock = `${path}.lock`
  let file
  try {
    file = await open(lock, 'wx', 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const previous: unknown = JSON.parse(await readFile(lock, 'utf8'))
    if (!previous || typeof previous !== 'object' || !('pid' in previous) || typeof previous.pid !== 'number')
      throw new HbarError('STORAGE_BUSY', 'Storage locations are locked')
    try {
      process.kill(previous.pid, 0)
    } catch (check) {
      if ((check as NodeJS.ErrnoException).code !== 'ESRCH') throw check
      await rm(lock)
      return withPointerLock(path, action, attempt + 1)
    }
    throw new HbarError('STORAGE_BUSY', 'Another storage operation is in progress')
  }
  try {
    await file.writeFile(JSON.stringify({ pid: process.pid }))
    return await action()
  } finally {
    await file.close()
    await rm(lock, { force: true })
  }
}
export async function getStorageLocations(layout: PathLayout): Promise<StorageLocationSnapshot> {
  const text = await pointerText(layout.pointerFile)
  const pointer = text === null ? null : pathPointerSchema.parse(JSON.parse(text))
  const active = storageRoots(layout)
  const saved =
    pointer === null
      ? active
      : {
          dataRoot: resolve(pointer.dataRoot),
          cacheRoot: resolve(pointer.cacheRoot),
          settingsRoot: resolve(pointer.version === 2 ? pointer.settingsRoot : join(pointer.dataRoot, 'settings')),
          sessionsRoot: resolve(pointer.version === 2 ? pointer.sessionsRoot : join(pointer.dataRoot, 'sessions')),
          skillsRoot: resolve(pointer.version === 2 ? pointer.skillsRoot : join(pointer.dataRoot, 'skills', 'global')),
        }
  return {
    pointerFile: layout.pointerFile,
    revision: fingerprint(text),
    active,
    saved,
    restartRequired: fingerprint(active) !== fingerprint(saved),
    lastWrite: pointer?.version === 2 ? pointer.lastWrite : null,
    receipts: pointer?.version === 2 ? pointer.receipts : [],
  }
}
async function normalizedRoots(roots: StorageRoots, source: StorageRoots, pointerFile: string): Promise<StorageRoots> {
  const { dataRoot, cacheRoot, settingsRoot, sessionsRoot, skillsRoot } = roots
  const normalized = storageRootsSchema.parse(
    Object.fromEntries(
      Object.entries({ dataRoot, cacheRoot, settingsRoot, sessionsRoot, skillsRoot }).map(([name, path]) => {
        if (!isAbsolute(path) || path.includes('\0'))
          throw new HbarError('STORAGE_PATH_INVALID', 'Storage directories must be absolute paths')
        return [name, resolve(path)]
      }),
    ),
  )
  const durable = [normalized.dataRoot, normalized.settingsRoot, normalized.sessionsRoot, normalized.skillsRoot]
  if (durable.some((path) => contains(normalized.cacheRoot, path) || contains(path, normalized.cacheRoot)))
    throw new HbarError('STORAGE_PATH_OVERLAP', 'Cache and durable storage must be separate')
  const independent = [normalized.settingsRoot, normalized.sessionsRoot, normalized.skillsRoot]
  if (
    independent.some((left, i) =>
      independent.some((right, j) => i !== j && (contains(left, right) || contains(right, left))),
    )
  )
    throw new HbarError('STORAGE_PATH_OVERLAP', 'Configuration, sessions and skills must have separate directories')
  if (durable.some((path) => contains(path, pointerFile)))
    throw new HbarError('STORAGE_PATH_OVERLAP', 'The bootstrap pointer must stay outside movable storage')
  for (const [name, path] of Object.entries(normalized)) {
    if (name === 'cacheRoot' || path === source[name as keyof StorageRoots]) continue
    if (
      [source.dataRoot, source.settingsRoot, source.sessionsRoot, source.skillsRoot].some((old) => contains(old, path))
    )
      throw new HbarError('STORAGE_PATH_OVERLAP', 'A migration destination cannot be inside its source')
  }
  for (const path of Object.values(normalized)) {
    await mkdir(path, { recursive: true })
    await access(path, constants.R_OK | constants.W_OK)
  }
  // Resolve aliases/junctions before accepting paths; a cache alias must not expose durable files.
  const actual = await Promise.all(Object.values(normalized).map((path) => realpath(path)))
  const cache = actual[1]!
  if (actual.filter((_, index) => index !== 1).some((path) => contains(cache, path) || contains(path, cache)))
    throw new HbarError('STORAGE_PATH_OVERLAP', 'Cache resolves inside durable storage')
  const independentActual = actual.slice(2)
  if (
    independentActual.some((left, i) =>
      independentActual.some((right, j) => i !== j && (contains(left, right) || contains(right, left))),
    )
  )
    throw new HbarError('STORAGE_PATH_OVERLAP', 'Storage directories resolve to overlapping locations')
  const oldActual = await Promise.all(
    [source.dataRoot, source.settingsRoot, source.sessionsRoot, source.skillsRoot].map((path) => realpath(path)),
  )
  for (const [index, path] of actual.entries()) {
    const key = Object.keys(normalized)[index] as keyof StorageRoots
    if (key === 'cacheRoot' || normalized[key] === source[key]) continue
    if (oldActual.some((old) => contains(old, path)))
      throw new HbarError('STORAGE_PATH_OVERLAP', 'A destination resolves inside its source')
  }
  return storageRootsSchema.parse(
    Object.fromEntries(Object.keys(normalized).map((name, index) => [name, actual[index]])),
  )
}
export async function applyStorageLocations(
  layout: PathLayout,
  input: StorageLocationApply,
): Promise<StorageLocationSnapshot> {
  return withPointerLock(layout.pointerFile, async () => {
    const current = await getStorageLocations(layout)
    const signature = fingerprint(input)
    const prior = current.receipts.find((receipt) => receipt.operationId === input.operationId)
    if (prior) {
      if (prior.fingerprint !== signature)
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Operation ID has different input')
      return current
    }
    if (current.revision !== input.expectedRevision)
      throw new HbarError('STORAGE_CONFLICT', 'Storage locations changed; reload before saving')
    const roots = await normalizedRoots(input.roots, current.active, layout.pointerFile)
    await atomicPointer(layout.pointerFile, {
      version: 2,
      identityRoot: layout.identityRoot,
      receipts: [...current.receipts, { operationId: input.operationId, fingerprint: signature }].slice(-128),
      ...roots,
      lastWrite: { operationId: input.operationId, fingerprint: signature },
      migration: fingerprint(roots) === fingerprint(current.active) ? null : { source: current.active },
    })
    return getStorageLocations(layout)
  })
}

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const value of createReadStream(path)) {
    const chunk: unknown = value
    if (!(chunk instanceof Uint8Array)) throw new HbarError('STORAGE_MIGRATION_FILE', 'Invalid file stream')
    hash.update(chunk)
  }
  return hash.digest('hex')
}
/** Runs before opening SQLite. Copying is resumable and never removes or overwrites source data. */
export async function migrateStoredPaths(
  pointerFile: string,
  pointer: Extract<PathPointer, { version: 2 }>,
): Promise<void> {
  if (!pointer.migration) return
  await withPointerLock(pointerFile, async () => {
    const currentText = await pointerText(pointerFile)
    if (currentText === null || fingerprint(pathPointerSchema.parse(JSON.parse(currentText))) !== fingerprint(pointer))
      throw new HbarError('STORAGE_CONFLICT', 'Storage pointer changed during startup')
    const source = pointer.migration!.source
    const lockText = await pointerText(join(source.settingsRoot, 'host.lock'))
    if (lockText) {
      const lock: unknown = JSON.parse(lockText)
      if (!lock || typeof lock !== 'object' || !('pid' in lock) || typeof lock.pid !== 'number')
        throw new HbarError('STORAGE_BUSY', 'Cannot determine whether the source Host has stopped')
      try {
        process.kill(lock.pid, 0)
        throw new HbarError('STORAGE_BUSY', 'Stop the source Host before migrating storage')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
    const target = await normalizedRoots(pointer, source, pointerFile)
    let files = 0
    let bytes = 0
    const copy = async (from: string, to: string, depth: number): Promise<void> => {
      if (depth > 64 || ++files > 100_000)
        throw new HbarError('STORAGE_MIGRATION_LIMIT', 'Storage migration exceeds its file/depth limit')
      let info
      try {
        info = await lstat(from)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        throw error
      }
      if (info.isSymbolicLink())
        throw new HbarError('STORAGE_MIGRATION_LINK', 'Migration does not follow symbolic links')
      const existing = await lstat(to).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (existing?.isSymbolicLink())
        throw new HbarError('STORAGE_MIGRATION_LINK', 'Migration destination contains a symbolic link')
      if (info.isDirectory()) {
        if (existing && !existing.isDirectory())
          throw new HbarError('STORAGE_MIGRATION_CONFLICT', 'Destination contains a conflicting file')
        await mkdir(to, { recursive: true })
        for await (const entry of await opendir(from)) {
          const child = join(from, entry.name)
          if (child === source.cacheRoot) continue
          if (
            child === join(source.settingsRoot, 'host.lock') ||
            child === join(source.settingsRoot, 'connection.json')
          )
            continue
          await copy(child, join(to, entry.name), depth + 1)
        }
      } else if (info.isFile()) {
        bytes += info.size
        if (bytes > 16 * 1024 ** 3) throw new HbarError('STORAGE_MIGRATION_LIMIT', 'Storage migration exceeds 16 GiB')
        if (existing) {
          if (!existing.isFile() || existing.size !== info.size || (await fileHash(from)) !== (await fileHash(to)))
            throw new HbarError(
              'STORAGE_MIGRATION_CONFLICT',
              'Destination contains different data; source is preserved',
            )
          return
        }
        const temporary = `${to}.hbar-migrate-${crypto.randomUUID()}.tmp`
        try {
          await copyFile(from, temporary, constants.COPYFILE_EXCL)
          await link(temporary, to)
        } finally {
          await rm(temporary, { force: true })
        }
      } else throw new HbarError('STORAGE_MIGRATION_FILE', 'Migration requires regular files')
    }
    for (const key of ['dataRoot', 'settingsRoot', 'sessionsRoot', 'skillsRoot'] as const) {
      if (resolve(source[key]) !== resolve(target[key])) await copy(source[key], target[key], 0)
    }
    await atomicPointer(pointerFile, { ...pointer, migration: null })
  })
}
