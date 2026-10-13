import type { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { posix, win32 } from 'node:path'
import { HbarError, idSchema, type SessionEvent } from '@hbar/contracts'
import { nodeCapabilitiesSchema } from '@hbar/contracts/node'
import {
  nodeWorkspaceMountManifestSchema,
  type NodeWorkspaceMountManifest,
} from '@hbar/contracts/node-workspace-mount-plan'
import { isPathWithin } from '@hbar/contracts/path-containment'
import { nodeWorkspaceLocator, parseNodeWorkspaceLocator } from '@hbar/contracts/node-address'
import { workspaceFolderSnapshotSchema } from '@hbar/contracts/commands/workspace-folders'
import { z } from 'zod'
import { createWorkspaceFolderStorage } from './workspace-folders'
import { nodeRunWorktreeBindingSchema } from './node-run-worktrees'
import { sessionLaunchTargetBindingSchema } from './session-launch-target'

export const NODE_RUN_WORKSPACE_MOUNTS_SQL = `
CREATE TABLE node_run_workspace_mounts(
  runId TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nodeId TEXT NOT NULL,
  revision INTEGER NOT NULL,
  digest TEXT NOT NULL,
  manifestJson TEXT NOT NULL
) STRICT;
CREATE INDEX node_run_workspace_mounts_session ON node_run_workspace_mounts(sessionId,runId);
`

const bindInputSchema = z.strictObject({ runId: idSchema, manifest: nodeWorkspaceMountManifestSchema })
export type NodeRunWorkspaceMountBindInput = z.infer<typeof bindInputSchema>
export type NodeRunWorkspaceMount = NodeWorkspaceMountManifest

type AppendEvent = (sessionId: string, type: string, data: unknown, runId?: string) => SessionEvent

function digest(unsigned: Omit<NodeWorkspaceMountManifest, 'digest'>): string {
  return createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function overlaps(left: string, right: string, platform: 'linux' | 'darwin' | 'win32'): boolean {
  const path = platform === 'win32' ? win32 : posix
  const separator = platform === 'win32' ? ('\\' as const) : ('/' as const)
  const caseInsensitive = platform === 'win32'
  const normalize = (value: string) => path.normalize(value)
  const a = normalize(left)
  const b = normalize(right)
  return isPathWithin(a, b, { separator, caseInsensitive }) || isPathWithin(b, a, { separator, caseInsensitive })
}

export function createNodeRunWorkspaceMountStorage(db: Database, appendEvent: AppendEvent) {
  const workspaceFolders = createWorkspaceFolderStorage(db)
  function accepted(runId: string) {
    const saved = db
      .query<{ data: string; sessionId: string }, [string]>(
        "SELECT data,sessionId FROM events WHERE runId=? AND type IN ('run.queued','run.recoveryQueued') ORDER BY seq LIMIT 1",
      )
      .get(runId)
    if (!saved) throw new HbarError('RUN_JOURNAL_MISSING', 'Workspace mount binding has no accepted Run record')
    const event = z
      .object({
        run: z.object({ id: idSchema, sessionId: idSchema }),
        workspaceId: idSchema.optional(),
        nodeWorkspaceLocation: z
          .strictObject({ nodeId: z.string(), rootId: z.string(), nodePath: z.string() })
          .optional(),
        launchTarget: sessionLaunchTargetBindingSchema.optional(),
        workspaceFoldersSnapshot: workspaceFolderSnapshotSchema.optional(),
      })
      .parse(JSON.parse(saved.data) as unknown)
    if (event.run.id !== runId || event.run.sessionId !== saved.sessionId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted workspace mount Run identity is inconsistent')
    return { ...event, sessionId: event.run.sessionId }
  }

  function rootPins(value: ReturnType<typeof accepted>): NodeWorkspaceMountManifest['roots'] {
    const location = value.nodeWorkspaceLocation
    const folders = value.workspaceFoldersSnapshot
    if (!location || !value.workspaceId || !value.launchTarget || !folders)
      throw new HbarError(
        'NODE_MOUNT_ADMISSION_MISSING',
        'Accepted Run has no durable remote workspace-folder snapshot for mount binding',
      )
    if (folders.workspaceId !== value.workspaceId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted folder snapshot belongs to another workspace')
    const node = db
      .query<{ revokedAt: number | null; capabilities: string | null }, [string]>(
        'SELECT revokedAt,capabilities FROM workspace_nodes WHERE nodeId=?',
      )
      .get(location.nodeId)
    if (!node || node.revokedAt !== null || node.capabilities === null)
      throw new HbarError('NODE_REVOKED', 'Workspace node is unavailable for mount binding')
    const capabilities = nodeCapabilitiesSchema.parse(JSON.parse(node.capabilities) as unknown)
    if (capabilities.nodeId !== location.nodeId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Workspace mount node capability identity is inconsistent')
    const roots = new Map(capabilities.roots.map((root) => [root.rootId, root]))
    const resolved: NodeWorkspaceMountManifest['roots'] = []
    const physicalPaths: string[] = []
    for (const folder of folders.folders) {
      let locator: ReturnType<typeof parseNodeWorkspaceLocator>
      try {
        locator = parseNodeWorkspaceLocator(folder.path)
      } catch {
        throw new HbarError(
          'WORKSPACE_NODE_MISMATCH',
          'Remote workspace folders must use exact same-node root locators',
        )
      }
      if (
        !locator ||
        locator.nodeId !== location.nodeId ||
        nodeWorkspaceLocator(locator.nodeId, locator.rootId) !== folder.path
      )
        throw new HbarError(
          'WORKSPACE_NODE_MISMATCH',
          'Remote workspace folders must use exact same-node root locators',
        )
      const root = roots.get(locator.rootId)
      if (!root) throw new HbarError('NODE_ROOT_CHANGED', `Workspace node no longer shares root ${locator.rootId}`)
      if (locator.rootId === location.rootId && root.nodePath !== location.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', 'The registered primary root differs from its original workspace pin')
      const pathApi = capabilities.platform === 'win32' ? win32 : posix
      if (!pathApi.isAbsolute(root.nodePath) || pathApi.normalize(root.nodePath) !== root.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', `Workspace node root ${locator.rootId} is not canonical`)
      for (const prior of physicalPaths)
        if (overlaps(prior, root.nodePath, capabilities.platform))
          throw new HbarError('WORKSPACE_NODE_MISMATCH', 'Remote workspace roots cannot overlap')
      physicalPaths.push(root.nodePath)
      resolved.push({ rootId: root.rootId, expectedRoot: root.nodePath, alias: folder.alias })
    }
    if (!resolved.some((root) => root.rootId === location.rootId))
      throw new HbarError('STALE_TARGET', 'The accepted workspace folders no longer include the primary root')
    const workspace = db
      .query<{ path: string }, [string]>('SELECT path FROM workspaces WHERE id=?')
      .get(value.workspaceId)
    const original = db
      .query<{ nodeId: string; rootId: string; nodePath: string }, [string]>(
        'SELECT nodeId,rootId,nodePath FROM node_workspace_locations WHERE workspaceId=?',
      )
      .get(value.workspaceId)
    const primaryLocator = nodeWorkspaceLocator(location.nodeId, location.rootId)
    if (
      !workspace ||
      workspace.path !== primaryLocator ||
      !original ||
      original.nodeId !== location.nodeId ||
      original.rootId !== location.rootId ||
      original.nodePath !== location.nodePath
    )
      throw new HbarError('WORKSPACE_SCOPE', 'Accepted primary workspace locator changed')
    if (value.launchTarget.sessionId !== value.sessionId || value.launchTarget.targetPath !== primaryLocator)
      throw new HbarError('WORKSPACE_SCOPE', 'Accepted launch target differs from the original remote workspace')
    const currentFolders = workspaceFolderSnapshotSchema.parse(workspaceFolders.read(value.workspaceId))
    if (stableJson(currentFolders) !== stableJson(folders))
      throw new HbarError('STALE_TARGET', 'Workspace folders changed after this Run was accepted')
    return resolved
  }

  function expectedManifest(runId: string): Omit<NodeWorkspaceMountManifest, 'digest'> {
    const value = accepted(runId)
    const location = value.nodeWorkspaceLocation
    const folders = value.workspaceFoldersSnapshot
    if (!location || !folders || !value.workspaceId)
      throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Accepted Run has no remote folder declaration snapshot')
    const roots = rootPins(value)
    return {
      schemaVersion: 1,
      workspaceId: value.workspaceId,
      revision: folders.revision,
      nodeId: location.nodeId,
      primaryRootId: location.rootId,
      roots,
    }
  }

  function validateReplayManifest(runId: string, manifestInput: unknown): NodeWorkspaceMountManifest {
    const manifest = nodeWorkspaceMountManifestSchema.parse(manifestInput)
    const value = accepted(runId)
    const location = value.nodeWorkspaceLocation
    const folders = value.workspaceFoldersSnapshot
    if (!location || !folders || !value.workspaceId)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Mount journal has no accepted remote folder snapshot')
    const expectedRoots = folders.folders.map((folder) => {
      const locator = parseNodeWorkspaceLocator(folder.path)
      if (
        !locator ||
        locator.nodeId !== location.nodeId ||
        nodeWorkspaceLocator(locator.nodeId, locator.rootId) !== folder.path
      )
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted folder snapshot contains an invalid remote root locator')
      return { rootId: locator.rootId, alias: folder.alias }
    })
    if (
      manifest.workspaceId !== value.workspaceId ||
      manifest.revision !== folders.revision ||
      manifest.nodeId !== location.nodeId ||
      manifest.primaryRootId !== location.rootId ||
      manifest.roots.length !== expectedRoots.length ||
      manifest.roots.some(
        (root, index) => root.rootId !== expectedRoots[index]?.rootId || root.alias !== expectedRoots[index]?.alias,
      ) ||
      (value.launchTarget && value.launchTarget.targetPath !== nodeWorkspaceLocator(location.nodeId, location.rootId))
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Mount journal differs from the accepted workspace-folder snapshot')
    const { digest: savedDigest, ...unsigned } = manifest
    if (digest(unsigned) !== savedDigest)
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Mount journal digest is invalid')
    return manifest
  }

  function read(runId: string): NodeWorkspaceMountManifest | null {
    const stored = db
      .query<
        {
          sessionId: string
          workspaceId: string
          nodeId: string
          revision: number
          digest: string
          manifestJson: string
        },
        [string]
      >('SELECT sessionId,workspaceId,nodeId,revision,digest,manifestJson FROM node_run_workspace_mounts WHERE runId=?')
      .get(runId)
    if (!stored) return null
    const manifest = validateReplayManifest(runId, JSON.parse(stored.manifestJson) as unknown)
    const acceptedRun = accepted(runId)
    if (
      stored.sessionId !== acceptedRun.sessionId ||
      stored.workspaceId !== manifest.workspaceId ||
      stored.nodeId !== manifest.nodeId ||
      stored.revision !== manifest.revision ||
      stored.digest !== manifest.digest
    )
      throw new HbarError('SESSION_LOG_CORRUPTED', 'Workspace mount columns conflict with the durable manifest')
    return manifest
  }

  function persist(runId: string, manifest: NodeWorkspaceMountManifest, replay: boolean): void {
    const existing = read(runId)
    if (existing) {
      if (stableJson(existing) === stableJson(manifest)) return
      throw new HbarError(
        replay ? 'SESSION_LOG_CORRUPTED' : 'IDEMPOTENCY_CONFLICT',
        'Accepted Run already has a different workspace mount manifest',
      )
    }
    const value = accepted(runId)
    if (!value.workspaceId) throw new HbarError('SESSION_LOG_CORRUPTED', 'Accepted Run has no workspace identity')
    db.query(
      'INSERT INTO node_run_workspace_mounts(runId,sessionId,workspaceId,nodeId,revision,digest,manifestJson) VALUES(?,?,?,?,?,?,?)',
    ).run(
      runId,
      value.sessionId,
      manifest.workspaceId,
      manifest.nodeId,
      manifest.revision,
      manifest.digest,
      stableJson(manifest),
    )
  }

  return {
    bind(raw: unknown): NodeWorkspaceMountManifest {
      return db
        .transaction(() => {
          const input = bindInputSchema.parse(raw)
          const already = read(input.runId)
          if (already) {
            const candidate = validateReplayManifest(input.runId, input.manifest)
            if (stableJson(already) === stableJson(candidate)) return already
            throw new HbarError('IDEMPOTENCY_CONFLICT', 'Accepted Run already has another workspace mount manifest')
          }
          const value = accepted(input.runId)
          const current = db
            .query<{ workspaceId: string; status: string }, [string, string]>(
              'SELECT s.workspaceId,r.status FROM sessions s JOIN runs r ON r.sessionId=s.id WHERE s.id=? AND r.id=?',
            )
            .get(value.sessionId, input.runId)
          if (!current || !['queued', 'running', 'waiting_approval', 'interrupted'].includes(current.status))
            throw new HbarError('INVALID_STATE', 'Workspace mounts require an active accepted Run')
          if (current.workspaceId !== value.workspaceId)
            throw new HbarError('WORKSPACE_SCOPE', 'Session moved away from its accepted workspace')
          const expected = expectedManifest(input.runId)
          const { digest: _ignored, ...candidateUnsigned } = input.manifest
          if (stableJson(candidateUnsigned) !== stableJson(expected) || input.manifest.digest !== digest(expected))
            throw new HbarError(
              'NODE_MOUNT_MANIFEST_INVALID',
              'Mount manifest differs from accepted folders and current roots',
            )

          if (!value.launchTarget)
            throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Accepted Run has no launch-target binding')
          const worktree = db
            .query<{ bindingJson: string }, [string]>('SELECT bindingJson FROM node_run_worktrees WHERE runId=?')
            .get(input.runId)
          if (value.launchTarget.selection.mode === 'shared-current') {
            if (worktree)
              throw new HbarError('WORKSPACE_SCOPE', 'Shared-current Run cannot use a managed child worktree')
          } else {
            if (!worktree)
              throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Managed Run worktree must be bound before mounts')
            const binding = nodeRunWorktreeBindingSchema.parse(JSON.parse(worktree.bindingJson) as unknown)
            if (
              binding.sessionId !== value.sessionId ||
              binding.workspaceId !== value.workspaceId ||
              binding.nodeId !== expected.nodeId ||
              binding.parentRootId !== expected.primaryRootId ||
              binding.launchTargetRevision !== value.launchTarget.expectedRevision
            )
              throw new HbarError(
                'WORKSPACE_SCOPE',
                'Managed Run worktree provenance differs from accepted primary root',
              )
          }
          const manifest = nodeWorkspaceMountManifestSchema.parse({ ...expected, digest: digest(expected) })
          persist(input.runId, manifest, false)
          appendEvent(value.sessionId, 'run.workspaceMountsBound', { runId: input.runId, manifest }, input.runId)
          return manifest
        })
        .immediate()
    },
    read(rawRunId: string) {
      return read(idSchema.parse(rawRunId))
    },
    restore(raw: unknown, event: SessionEvent): void {
      const parsed = z.strictObject({ runId: idSchema, manifest: nodeWorkspaceMountManifestSchema }).parse(raw)
      if (
        event.type !== 'run.workspaceMountsBound' ||
        event.runId !== parsed.runId ||
        event.sessionId !== accepted(parsed.runId).sessionId
      )
        throw new HbarError('SESSION_LOG_CORRUPTED', 'Workspace mount event identity is inconsistent')
      const manifest = validateReplayManifest(parsed.runId, parsed.manifest)
      persist(parsed.runId, manifest, true)
    },
  }
}
