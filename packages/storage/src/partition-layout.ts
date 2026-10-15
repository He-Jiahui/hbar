import { lstat, realpath } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { basename, dirname, join, parse, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

/** UUIDs only: the general contract ID alone also permits names and path separators. */
export const partitionIdSchema = z.uuid().transform((value) => value.toLowerCase())
export const partitionOwnerSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('global') }),
  z.strictObject({ kind: z.literal('project'), projectPartitionId: partitionIdSchema }),
  z.strictObject({
    kind: z.literal('session'),
    projectPartitionId: partitionIdSchema,
    sessionPartitionId: partitionIdSchema,
  }),
])
export type PartitionOwner = z.infer<typeof partitionOwnerSchema>

export interface PartitionLayout {
  readonly root: string
  readonly manifest: string
  readonly switchLock: string
}

export function createPartitionLayout(databasesRoot: string): PartitionLayout {
  const root = resolve(databasesRoot)
  return { root, manifest: join(root, 'storage-active.json'), switchLock: join(root, '.storage-active.lock') }
}

export function partitionDatabasePath(layout: PartitionLayout, generation: string, owner: PartitionOwner): string {
  const generationId = partitionIdSchema.parse(generation)
  const target = partitionOwnerSchema.parse(owner)
  const root = join(layout.root, 'partition-generations', generationId)
  if (target.kind === 'global') return join(root, 'global.sqlite')
  if (target.kind === 'project') return join(root, 'projects', `${target.projectPartitionId}.sqlite`)
  return join(root, 'projects', target.projectPartitionId, 'sessions', `${target.sessionPartitionId}.sqlite`)
}

/** Checks all existing components, including ancestors; missing tails are allowed only explicitly. */
export async function assertPartitionPathSafe(
  layout: PartitionLayout,
  target: string,
  allowMissing = false,
): Promise<void> {
  const root = resolve(layout.root)
  const path = resolve(target)
  const part = relative(root, path)
  if (
    part === '..' ||
    part.startsWith(`..${sep}`) ||
    part.startsWith(sep) ||
    relative(parse(path).root, parse(root).root) !== ''
  )
    throw new Error('PARTITION_PATH_ESCAPE')
  const ancestors: string[] = []
  let cursor = path
  for (;;) {
    ancestors.push(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  let canonicalParent: string | undefined
  for (const component of ancestors.reverse()) {
    let info: Stats
    try {
      info = await lstat(component)
    } catch (error) {
      if (allowMissing && error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    if (info.isSymbolicLink() || (component !== path && !info.isDirectory()))
      throw new Error('PARTITION_LINK_FORBIDDEN')
    const resolvedComponent = await realpath(component)
    // Bun 1.4 on Windows returns "C:" for realpath("C:\\"). A bare drive
    // resolves against that drive's working directory, so never use it as an anchor.
    // Accept this normalization only for the same filesystem drive root; arbitrary
    // drive-relative paths and different drives remain forbidden.
    const bareDriveRoot =
      process.platform === 'win32' &&
      canonicalParent === undefined &&
      /^[a-z]:$/i.test(resolvedComponent) &&
      /^[a-z]:[\\/]$/i.test(component) &&
      resolvedComponent.toLowerCase() === component.slice(0, 2).toLowerCase()
    const canonical = bareDriveRoot ? `${resolvedComponent}${sep}` : resolvedComponent
    if (canonicalParent === undefined && relative(component, canonical) !== '')
      throw new Error('PARTITION_REPARSE_FORBIDDEN')
    // Anchor once at the filesystem root returned by the platform. Check each child
    // against its already checked canonical parent, rather than comparing Bun's
    // root spelling (for example a Windows extended-length prefix) with resolve().
    // lstat still rejects actual junctions/symlinks, including the configured root.
    if (canonicalParent !== undefined && relative(join(canonicalParent, basename(component)), canonical) !== '')
      throw new Error('PARTITION_REPARSE_FORBIDDEN')
    canonicalParent = canonical
  }
}
