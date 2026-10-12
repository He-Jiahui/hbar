import { HbarError, type Run, type Session, type Workspace } from '@hbar/contracts'
import { workspaceLocationOf } from '@hbar/contracts/node-address'
import { nodeCapabilitiesSchema, type NodeCapabilities } from '@hbar/contracts/node'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import type { NodeExecutionTarget } from '@hbar/contracts/node-execution-target'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type {
  NodeWorkspaceInspectionPort,
  NodeWorkspaceInspectionRequest,
} from '@hbar/kernel/node-workspace-inspection'

interface ApprovalBinding {
  readonly session: Session
  readonly run: Run
  readonly workspace: Workspace
}

export interface RuntimeNodeWorkspaceInspectionStoragePort {
  readonly findSession: (sessionId: string) => Promise<Session | null>
  readonly run: (runId: string) => Promise<Run>
  readonly findWorkspace: (workspaceId: string) => Promise<Workspace | null>
  readonly node: (nodeId: string) => Promise<RegisteredNode | null>
}

export interface RuntimeNodeWorkspaceCapabilitiesPort {
  readonly read: (nodeId: string, signal: AbortSignal) => Promise<NodeCapabilities>
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
  return { session, run, workspace }
}

function locationOf(binding: ApprovalBinding) {
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
    JSON.stringify(firstLocation) !== JSON.stringify(nextLocation)
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
  return {
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
      const registeredRoot = registered.capabilities.roots.find((root) => root.rootId === location.rootId)
      if (!pinnedRoot || pinnedRoot.nodePath !== location.nodePath)
        throw new HbarError('NODE_ROOT_CHANGED', 'The pinned workspace root no longer matches the live node path')
      if (!registeredRoot || registeredRoot.nodePath !== location.nodePath)
        throw new HbarError('NODE_ROOT_STALE', 'The live node root differs from the Host-verified registry snapshot')

      signal.throwIfAborted()
      const after = await readBinding(options.storage, request)
      assertSameBinding(before, after)
      const registeredAfter = await options.storage.node(location.nodeId)
      if (
        !registeredAfter ||
        registeredAfter.revokedAt !== null ||
        registeredAfter.name !== registered.name ||
        registeredAfter.capabilities?.evaluator !== capabilities.evaluator ||
        registeredAfter.capabilities.roots.find((root) => root.rootId === location.rootId)?.nodePath !==
          location.nodePath
      )
        throw new HbarError(
          'NODE_CAPABILITIES_STALE',
          'Node trust or its root binding changed during capability inspection',
        )

      return {
        kind: 'node',
        nodeId: location.nodeId,
        nodeName: registered.name,
        rootId: location.rootId,
        nodePath: location.nodePath,
        rootAccess: pinnedRoot.access,
        capabilitySummary: capabilitySummary(capabilities, (options.now ?? Date.now)()),
      }
    },
  }
}
