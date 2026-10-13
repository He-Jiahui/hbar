import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, posix } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { NodeFloor } from '@hbar/contracts/node'
import {
  nodeWorkspaceMountManifestSchema,
  type NodeWorkspaceMountManifest,
} from '@hbar/contracts/node-workspace-mount-plan'
import { isPathWithin } from '@hbar/contracts/path-containment'
import { nodeOwnedPath, nodeProtectedPaths } from './paths'

export interface NodeWorkspaceMountPlanEntry {
  readonly rootId: string
  readonly expectedRoot: string
  readonly sourceRoot: string
  readonly alias: string
  readonly target: string
  readonly access: 'read' | 'write'
  readonly writePaths: readonly { readonly sourcePath: string; readonly targetPath: string }[]
  readonly readOnlyPaths: readonly { readonly sourcePath: string; readonly targetPath: string }[]
  readonly protectedPaths: readonly { readonly sourcePath: string; readonly targetPath: string }[]
}

export interface NodeWorkspaceMountPlan {
  readonly workspaceId: string
  readonly revision: number
  readonly digest: string
  readonly nodeId: string
  readonly primaryRootId: string
  readonly primaryTarget: string
  readonly mounts: readonly NodeWorkspaceMountPlanEntry[]
  readonly protectedPaths: readonly string[]
}

export interface NodeWorkspaceMountPlanOptions {
  readonly nodeId: string
  readonly dataRoot: string
  readonly floor: NodeFloor
  readonly manifest: NodeWorkspaceMountManifest
  /** B-only generated checkout path for a managed primary; the manifest still pins its parent root. */
  readonly sourceRootOverrides?: ReadonlyMap<string, string>
  /** Re-evaluates the pinned snapshot for this root using B's canonical filesystem. */
  readonly snapshotPermissions: (
    rootId: string,
    alias: string,
    root: string,
    signal: AbortSignal,
  ) => Promise<{
    readonly writableRoots: readonly string[]
    readonly readOnlyPaths: readonly string[]
    readonly protectedPaths: readonly string[]
  }>
  readonly signal: AbortSignal
}

export function nodeWorkspaceMountManifestDigest(input: Omit<NodeWorkspaceMountManifest, 'digest'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function within(root: string, path: string): boolean {
  return isPathWithin(root, path, { separator: sep, caseInsensitive: process.platform === 'win32' })
}

function overlaps(left: string, right: string): boolean {
  return within(left, right) || within(right, left)
}

/** Build the B-owned private-view plan from pinned IDs, B registrations and B's snapshot evaluation. */
export async function createNodeWorkspaceMountPlan(
  options: NodeWorkspaceMountPlanOptions,
): Promise<NodeWorkspaceMountPlan> {
  const manifest = nodeWorkspaceMountManifestSchema.parse(options.manifest)
  if (manifest.nodeId !== options.nodeId)
    throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Workspace mount manifest targets a different node')
  const unsigned = {
    schemaVersion: manifest.schemaVersion,
    workspaceId: manifest.workspaceId,
    revision: manifest.revision,
    nodeId: manifest.nodeId,
    primaryRootId: manifest.primaryRootId,
    roots: manifest.roots,
  }
  if (nodeWorkspaceMountManifestDigest(unsigned) !== manifest.digest)
    throw new HbarError('NODE_MOUNT_MANIFEST_INVALID', 'Workspace mount manifest digest does not match its contents')
  if (options.floor.roots.length > 64)
    throw new HbarError('NODE_INVALID_RESPONSE', 'The node floor contains more than 64 shared roots')

  const protectedPaths = nodeProtectedPaths(options.floor, options.dataRoot)
  const mounts: NodeWorkspaceMountPlanEntry[] = []
  const physicalRoots: string[] = []
  for (const requested of manifest.roots) {
    options.signal.throwIfAborted()
    const registration = options.floor.roots.find((root) => root.rootId === requested.rootId)
    if (!registration) throw new HbarError('NODE_DENIED', `Mounted root ${requested.rootId} is not shared by B`)
    if (registration.path !== requested.expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', `Mounted root ${requested.rootId} no longer matches its pinned path`)
    const target = await nodeOwnedPath(options.floor, options.dataRoot, requested.rootId, '.')
    if (target.root !== requested.expectedRoot || target.registration.path !== requested.expectedRoot)
      throw new HbarError('NODE_ROOT_CHANGED', `Mounted root ${requested.rootId} no longer matches its pinned path`)
    if (!isAbsolute(target.root) || target.root !== resolve(target.root))
      throw new HbarError('NODE_ROOT_CHANGED', `Mounted root ${requested.rootId} is not canonical`)
    if (protectedPaths.some((path) => within(path, target.root)))
      throw new HbarError('NODE_DENIED', `Mounted root ${requested.rootId} overlaps protected node data`)
    const sourceRoot = options.sourceRootOverrides?.get(requested.rootId) ?? target.root
    if (!isAbsolute(sourceRoot) || sourceRoot !== resolve(sourceRoot) || !within(target.root, sourceRoot))
      throw new HbarError('NODE_ROOT_CHANGED', 'A mounted source override must remain inside its pinned B root')
    if (sourceRoot !== target.root) {
      const actual = await realpath(sourceRoot).catch(() => '')
      if (
        actual !== sourceRoot ||
        !(await stat(sourceRoot).then(
          (info) => info.isDirectory(),
          () => false,
        ))
      )
        throw new HbarError('NODE_ROOT_CHANGED', 'The B-owned managed mount source is no longer canonical')
    }
    if (physicalRoots.some((path) => overlaps(path, sourceRoot)))
      throw new HbarError('NODE_DENIED', 'Mounted roots must not overlap each other')
    physicalRoots.push(sourceRoot)

    const snapshotPermissions = await options.snapshotPermissions(
      requested.rootId,
      requested.alias,
      sourceRoot,
      options.signal,
    )
    options.signal.throwIfAborted()
    const checkedPath = (path: string, label: string) => {
      const resolved = resolve(path)
      if (!within(sourceRoot, resolved))
        throw new HbarError('NODE_PERMISSION_UNSUPPORTED', `A ${label} leaves mounted root ${requested.rootId}`)
      return resolved
    }
    const writableRoots = snapshotPermissions.writableRoots.map((path) => checkedPath(path, 'write grant'))
    const readOnlyPaths = snapshotPermissions.readOnlyPaths
      .filter((path) => within(sourceRoot, resolve(path)))
      .map((path) => checkedPath(path, 'read-only grant'))
    const protectedUnderRoot = [
      ...protectedPaths.filter((path) => within(sourceRoot, resolve(path))),
      ...snapshotPermissions.protectedPaths.filter((path) => within(sourceRoot, resolve(path))),
    ]
      .map((path) => checkedPath(path, 'protected path'))
      .filter((path) => path !== target.root)
    if (target.registration.access === 'read' && writableRoots.length > 0)
      throw new HbarError('NODE_PERMISSION_UNSUPPORTED', 'Snapshot grants cannot widen a read-only B root')
    const access: 'read' | 'write' =
      target.registration.access === 'write' && writableRoots.includes(sourceRoot) ? 'write' : 'read'
    const toSubpath = (sourcePath: string) => ({
      sourcePath,
      targetPath: posix.resolve(
        `/workspace/${requested.alias}`,
        relative(sourceRoot, sourcePath).split(sep).join(posix.sep),
      ),
    })
    mounts.push(
      Object.freeze({
        rootId: requested.rootId,
        expectedRoot: requested.expectedRoot,
        sourceRoot,
        alias: requested.alias,
        target: `/workspace/${requested.alias}`,
        access,
        writePaths: Object.freeze(writableRoots.filter((path) => path !== sourceRoot).map(toSubpath)),
        readOnlyPaths: Object.freeze(readOnlyPaths.map(toSubpath)),
        protectedPaths: Object.freeze(protectedUnderRoot.map(toSubpath)),
      }),
    )
  }
  const primary = mounts.find((mount) => mount.rootId === manifest.primaryRootId)
  if (!primary)
    throw new HbarError('NODE_MOUNT_MANIFEST_INVALID', 'Primary workspace root is missing from the mount plan')
  const mountedProtectedPaths = mounts.flatMap((mount) => mount.protectedPaths.map((path) => path.targetPath))
  options.signal.throwIfAborted()
  return Object.freeze({
    workspaceId: manifest.workspaceId,
    revision: manifest.revision,
    digest: manifest.digest,
    nodeId: manifest.nodeId,
    primaryRootId: manifest.primaryRootId,
    primaryTarget: primary.target,
    mounts: Object.freeze(mounts),
    protectedPaths: Object.freeze(mountedProtectedPaths),
  })
}
