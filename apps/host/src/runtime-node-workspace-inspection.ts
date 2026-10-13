import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError, type Run, type Session, type Workspace } from '@hbar/contracts'
import { workspaceLocationOf } from '@hbar/contracts/node-address'
import { nodeCapabilitiesSchema, type NodeCapabilities } from '@hbar/contracts/node'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import { nodeWorktreeMethods, type NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  nodeWorktreeProvisioningAuthoritySchema,
  type NodeWorktreeProvisioningAuthority,
} from '@hbar/contracts/node-worktree-provisioning'
import type { NodeRunWorktreeAdmission } from '@hbar/storage'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import {
  workspaceFolderSnapshotSchema,
  type WorkspaceFolder,
  type WorkspaceFolderSnapshot,
} from '@hbar/contracts/commands/workspace-folders'
import { nodeWorkspaceMountManifestSchema } from '@hbar/contracts/node-workspace-mount-plan'
import { nodeWorkspaceMountsSchema } from '@hbar/contracts/node-workspace-mounts'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type {
  NodeWorkspaceInspectionPort,
  NodeWorkspaceInspectionRequest,
} from '@hbar/kernel/node-workspace-inspection'
import { resolveNodeWorkspaceMounts } from '@hbar/kernel/node-workspace-mounts'
import type { NodeRunWorktreeBinding } from '@hbar/storage'

interface ApprovalBinding {
  readonly session: Session
  readonly run: Run
  readonly workspace: Workspace
  readonly managedWorktree: NodeRunWorktreeBinding | null
}

export interface RuntimeNodeWorkspaceInspectionStoragePort {
  readonly findSession: (sessionId: string) => Promise<Session | null>
  readonly run: (runId: string) => Promise<Run>
  readonly findWorkspace: (workspaceId: string) => Promise<Workspace | null>
  readonly node: (nodeId: string) => Promise<RegisteredNode | null>
  readonly nodeRunWorktree: (runId: string) => NodeRunWorktreeBinding | null | Promise<NodeRunWorktreeBinding | null>
  readonly nodeRunWorktreeAdmission: (
    runId: string,
  ) => NodeRunWorktreeAdmission | null | Promise<NodeRunWorktreeAdmission | null>
  readonly workspaceFolders?: (workspaceId: string) => Promise<WorkspaceFolderSnapshot>
}

export interface RuntimeNodeWorkspaceCapabilitiesPort {
  readonly read: (nodeId: string, signal: AbortSignal) => Promise<NodeCapabilities>
  readonly canonicalize?: (nodeId: string, rootId: string, expectedRoot: string, signal: AbortSignal) => Promise<string>
  readonly readWorktree?: (
    nodeId: string,
    target: z.input<(typeof nodeWorktreeMethods)['worktree.get']['input']>,
    signal: AbortSignal,
  ) => Promise<NodeManagedWorktree | null>
}

function provisioningFor(admission: NodeRunWorktreeAdmission): NodeWorktreeProvisioningAuthority {
  const folders = admission.workspaceFoldersSnapshot
  if (!folders || folders.workspaceId !== admission.workspaceId)
    throw new HbarError('NODE_MOUNT_ADMISSION_MISSING', 'Accepted Run has no matching workspace-folder snapshot')
  const workspaceFolderDigest = acceptedWorkspaceFolderDigest(folders)
  const fields = {
    workspaceId: admission.workspaceId,
    sessionId: admission.sessionId,
    targetRevision: admission.launchTarget.expectedRevision,
    selection: admission.launchTarget.selection,
    workspaceFolderRevision: folders.revision,
    workspaceFolderDigest,
  }
  return nodeWorktreeProvisioningAuthoritySchema.parse({
    kind: 'launch-target',
    ...fields,
    runId: admission.runId,
    nodeId: admission.originalWorkspaceLocation.nodeId,
    acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(fields),
  })
}

async function readBinding(
  storage: RuntimeNodeWorkspaceInspectionStoragePort,
  request: NodeWorkspaceInspectionRequest,
): Promise<ApprovalBinding> {
  const session = await storage.findSession(request.sessionId)
  if (!session) throw new HbarError('SESSION_NOT_FOUND', 'The approval Session no longer exists')
  const [run, workspace] = await Promise.all([storage.run(request.runId), storage.findWorkspace(request.workspaceId)])
  if (!workspace) throw new HbarError('WORKSPACE_NOT_FOUND', 'The execution workspace no longer exists')
  if (
    run.id !== request.runId ||
    run.sessionId !== session.id ||
    session.workspaceId !== request.workspaceId ||
    !['running', 'waiting_approval'].includes(run.status)
  )
    throw new HbarError('EXECUTION_TARGET_STALE', 'The execution workspace no longer belongs to the captured Run')
  const managedWorktree = (await storage.nodeRunWorktree(request.runId)) ?? null
  return { session, run, workspace, managedWorktree }
}

function locationOf(binding: ApprovalBinding) {
  if (binding.managedWorktree)
    return {
      kind: 'node' as const,
      nodeId: binding.managedWorktree.nodeId,
      rootId: binding.managedWorktree.worktreeRootId,
      nodePath: binding.managedWorktree.nodePath,
    }
  return workspaceLocationOf(binding.workspace)
}

function assertSameBinding(before: ApprovalBinding, after: ApprovalBinding): void {
  const firstLocation = locationOf(before)
  const nextLocation = locationOf(after)
  if (
    before.session.id !== after.session.id ||
    before.session.workspaceId !== after.session.workspaceId ||
    before.run.id !== after.run.id ||
    before.run.sessionId !== after.run.sessionId ||
    JSON.stringify(firstLocation) !== JSON.stringify(nextLocation) ||
    JSON.stringify(before.managedWorktree) !== JSON.stringify(after.managedWorktree)
  )
    throw new HbarError('EXECUTION_TARGET_STALE', 'The workspace or Run changed during capability inspection')
}

function capabilitySummary(
  capabilities: NodeCapabilities,
  observedAt: number,
): Extract<NodeExecutionTarget, { kind: 'node' }>['capabilitySummary'] {
  const selectedBackend = capabilities.sandbox.backends[0]
  if (!selectedBackend)
    throw new HbarError('NODE_CAPABILITIES_UNAVAILABLE', 'The workspace node has no observed active execution backend')
  return {
    backends: capabilities.sandbox.backends,
    selectedBackend,
    filesystem: capabilities.sandbox.filesystem,
    network: capabilities.sandbox.network,
    floor: {
      process: capabilities.floor.process,
      network: capabilities.floor.network,
      terminal: capabilities.floor.terminal,
      osConfinement: capabilities.floor.osConfinement,
      backend: capabilities.floor.backend,
    },
    observedAt,
  }
}

/** A stable-Host adapter. Registry names come from A; capability facts come from the authenticated B link. */
export function createRuntimeNodeWorkspaceInspection(options: {
  readonly storage: RuntimeNodeWorkspaceInspectionStoragePort
  readonly nodeCapabilities: RuntimeNodeWorkspaceCapabilitiesPort
  readonly now?: (() => number) | undefined
}): NodeWorkspaceInspectionPort {
  const resolveWorkspaceRoots = async (
    nodeId: string,
    folderValues: readonly WorkspaceFolder[],
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted()
    const mounts = nodeWorkspaceMountsSchema.parse(folderValues)
    const registered = await options.storage.node(nodeId)
    if (!registered || registered.nodeId !== nodeId || registered.revokedAt !== null || !registered.capabilities)
      throw new HbarError('NODE_REVOKED', 'Workspace folder node is no longer trusted by this Host')
    const capabilities = nodeCapabilitiesSchema.parse(await options.nodeCapabilities.read(nodeId, signal))
    if (
      capabilities.nodeId !== nodeId ||
      capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT ||
      registered.capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT
    )
      throw new HbarError('NODE_CAPABILITIES_STALE', 'Workspace node capabilities are not Host-verified')
    if (capabilities.roots.length > 64)
      throw new HbarError('NODE_INVALID_RESPONSE', 'Workspace node exceeded its root limit')
    const resolved = await resolveNodeWorkspaceMounts(
      nodeId,
      mounts,
      capabilities,
      {
        canonicalRoot: async (rootId, expectedRoot, requestSignal) => {
          requestSignal.throwIfAborted()
          const live = capabilities.roots.find((root) => root.rootId === rootId)
          const pinned = registered.capabilities?.roots.find((root) => root.rootId === rootId)
          if (!live || !pinned || live.nodePath !== pinned.nodePath || live.access !== pinned.access)
            throw new HbarError('NODE_ROOT_CHANGED', `Workspace node root ${rootId} is no longer pinned`)
          if (!options.nodeCapabilities.canonicalize)
            throw new HbarError('NODE_CAPABILITIES_UNAVAILABLE', 'B canonical-root verification is unavailable')
          return await options.nodeCapabilities.canonicalize(nodeId, rootId, expectedRoot, requestSignal)
        },
      },
      signal,
    )
    signal.throwIfAborted()
    if (
      resolved.length !== mounts.length ||
      new Set(resolved.map((mount) => mount.rootId.toLocaleLowerCase())).size !== resolved.length
    )
      throw new HbarError('DUPLICATE_FOLDER', 'Workspace mount resolution is incomplete or repeats a registered root')
    return { mounts, resolved }
  }
  return {
    async verifyWorkspaceFolders(nodeId, folderValues, signal) {
      const { mounts } = await resolveWorkspaceRoots(nodeId, folderValues, signal)
      return mounts as readonly WorkspaceFolder[]
    },
    async resolveWorkspaceMountManifest(request, foldersValue, primary, signal) {
      signal.throwIfAborted()
      const folders = workspaceFolderSnapshotSchema.parse(foldersValue)
      const before = await readBinding(options.storage, request)
      const original = workspaceLocationOf(before.workspace)
      if (
        original.kind !== 'node' ||
        original.nodeId !== primary.nodeId ||
        original.rootId !== primary.rootId ||
        original.nodePath !== primary.nodePath ||
        folders.workspaceId !== before.workspace.id
      )
        throw new HbarError('WORKSPACE_SCOPE', 'Workspace mount snapshot or primary root differs from its accepted Run')
      const latestFolders = await options.storage.workspaceFolders?.(folders.workspaceId)
      if (
        latestFolders &&
        JSON.stringify(workspaceFolderSnapshotSchema.parse(latestFolders)) !== JSON.stringify(folders)
      )
        throw new HbarError('STALE_TARGET', 'Workspace folders changed after this Run accepted its revision')
      const { resolved } = await resolveWorkspaceRoots(primary.nodeId, folders.folders, signal)
      const roots = resolved.map((mount) => ({
        rootId: mount.rootId,
        expectedRoot: mount.nodePath,
        alias: mount.alias,
      }))
      if (!roots.some((root) => root.rootId === primary.rootId))
        throw new HbarError('STALE_TARGET', 'The accepted primary node root is no longer mounted')
      const unsigned = {
        schemaVersion: 1 as const,
        workspaceId: folders.workspaceId,
        revision: folders.revision,
        nodeId: primary.nodeId,
        primaryRootId: primary.rootId,
        roots,
      }
      const manifest = nodeWorkspaceMountManifestSchema.parse({
        ...unsigned,
        digest: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),
      })
      const after = await readBinding(options.storage, request)
      assertSameBinding(before, after)
      signal.throwIfAborted()
      return manifest
    },
    async captureExecutionTarget(request, signal) {
      signal.throwIfAborted()
      const before = await readBinding(options.storage, request)
      const location = locationOf(before)
      if (location.kind === 'local') {
        const after = await readBinding(options.storage, request)
        assertSameBinding(before, after)
        return { kind: 'local' }
      }

      const registered = await options.storage.node(location.nodeId)
      if (!registered || registered.nodeId !== location.nodeId || registered.revokedAt !== null)
        throw new HbarError('NODE_REVOKED', 'The approval workspace node is no longer trusted by this Host')
      if (!registered.capabilities)
        throw new HbarError(
          'NODE_CAPABILITIES_UNAVAILABLE',
          'The Host has no verified capability snapshot for this node',
        )

      signal.throwIfAborted()
      const capabilities = nodeCapabilitiesSchema.parse(await options.nodeCapabilities.read(location.nodeId, signal))
      if (capabilities.nodeId !== location.nodeId)
        throw new HbarError('NODE_IDENTITY_MISMATCH', 'Live node capabilities do not match the pinned workspace node')
      if (
        registered.capabilities.nodeId !== location.nodeId ||
        registered.capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT ||
        capabilities.evaluator !== SANDBOX_EVALUATOR_FINGERPRINT
      )
        throw new HbarError(
          'NODE_CAPABILITIES_STALE',
          'The live node evaluator differs from the Host-verified registry snapshot',
        )
      const pinnedRoot = capabilities.roots.find((root) => root.rootId === location.rootId)
      const originalLocation = workspaceLocationOf(before.workspace)
      if (originalLocation.kind !== 'node')
        throw new HbarError('WORKSPACE_SCOPE', 'A managed B worktree must retain its original node workspace')
      const registeredRoot = capabilities.roots.find((root) => root.rootId === originalLocation.rootId)
      const registeredOriginalRoot = registered.capabilities.roots.find(
        (root) => root.rootId === originalLocation.rootId,
      )
      if (!registeredRoot || registeredRoot.nodePath !== originalLocation.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', 'The pinned workspace root no longer matches the live node path')
      if (!registeredOriginalRoot || registeredOriginalRoot.nodePath !== originalLocation.nodePath)
        throw new HbarError('NODE_ROOT_STALE', 'The live node root differs from the Host-verified registry snapshot')
      if (before.managedWorktree) {
        if (!options.nodeCapabilities.readWorktree)
          throw new HbarError('NODE_CAPABILITIES_UNAVAILABLE', 'Managed B worktree verification is unavailable')
        const binding = before.managedWorktree
        if (
          binding.runId !== before.run.id ||
          binding.sessionId !== before.session.id ||
          binding.workspaceId !== before.workspace.id ||
          binding.nodeId !== originalLocation.nodeId ||
          binding.parentRootId !== originalLocation.rootId ||
          binding.originalWorkspaceLocation.nodePath !== originalLocation.nodePath
        )
          throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree differs from its durable Run binding')
        const admission = await options.storage.nodeRunWorktreeAdmission(request.runId)
        if (
          !admission ||
          admission.runId !== before.run.id ||
          admission.sessionId !== before.session.id ||
          admission.workspaceId !== before.workspace.id ||
          admission.originalWorkspaceLocation.nodeId !== originalLocation.nodeId ||
          admission.originalWorkspaceLocation.rootId !== originalLocation.rootId ||
          admission.originalWorkspaceLocation.nodePath !== originalLocation.nodePath ||
          admission.launchTarget.expectedRevision !== binding.launchTarget.expectedRevision ||
          JSON.stringify(admission.launchTarget) !== JSON.stringify(binding.launchTarget)
        )
          throw new HbarError('WORKSPACE_SCOPE', 'Managed worktree provisioning differs from the accepted Run target')
        const provisioning = provisioningFor(admission)
        const selection = admission.launchTarget.selection
        const startPoint =
          selection.mode === 'isolated-worktree'
            ? selection.branch.kind === 'new'
              ? selection.branch.startPoint
              : selection.branch.kind === 'derived'
                ? selection.branch.baseRef.slice('refs/heads/'.length)
                : undefined
            : undefined
        const getRequest = {
          operationId: `${admission.runId}:worktree-get`,
          rootId: binding.parentRootId,
          expectedRoot: binding.originalWorkspaceLocation.nodePath,
          branch: binding.branch,
          createBranch: selection.mode === 'isolated-worktree' && selection.branch.kind !== 'existing',
          ...(startPoint ? { startPoint } : {}),
          provisioning,
        } satisfies z.input<(typeof nodeWorktreeMethods)['worktree.get']['input']>
        const reopened = await options.nodeCapabilities.readWorktree(location.nodeId, getRequest, signal)
        if (
          !reopened ||
          reopened.worktreeId !== binding.worktreeId ||
          reopened.worktreeRootId !== binding.worktreeRootId ||
          reopened.nodePath !== binding.nodePath ||
          reopened.targetRevision !== binding.worktreeTargetRevision ||
          reopened.createdByRunId !== binding.worktreeCreatedByRunId
        )
          throw new HbarError('NODE_WORKTREE_MISSING', 'B worktree no longer matches its durable Run binding')
      } else if (!pinnedRoot || pinnedRoot.nodePath !== location.nodePath) {
        throw new HbarError('NODE_ROOT_CHANGED', 'The pinned workspace root no longer matches the live node path')
      }

      signal.throwIfAborted()
      const after = await readBinding(options.storage, request)
      assertSameBinding(before, after)
      const registeredAfter = await options.storage.node(location.nodeId)
      if (
        !registeredAfter ||
        registeredAfter.revokedAt !== null ||
        registeredAfter.name !== registered.name ||
        registeredAfter.capabilities?.evaluator !== capabilities.evaluator ||
        registeredAfter.capabilities.roots.find((root) => root.rootId === originalLocation.rootId)?.nodePath !==
          originalLocation.nodePath
      )
        throw new HbarError(
          'NODE_CAPABILITIES_STALE',
          'Node trust or its root binding changed during capability inspection',
        )

      let rootAccess: 'read' | 'write'
      if (before.managedWorktree) {
        rootAccess = 'write'
      } else {
        if (!pinnedRoot) throw new HbarError('NODE_ROOT_CHANGED', 'The pinned workspace root is no longer registered')
        rootAccess = pinnedRoot.access
      }

      return {
        kind: 'node',
        nodeId: location.nodeId,
        nodeName: registered.name,
        rootId: location.rootId,
        nodePath: location.nodePath,
        rootAccess,
        capabilitySummary: capabilitySummary(capabilities, (options.now ?? Date.now)()),
      }
    },
  }
}
