import { expect, test } from 'bun:test'
import type { Run, Session, Workspace } from '@hbar/contracts'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import { nodeCapabilitiesSchema, type NodeCapabilities } from '@hbar/contracts/node'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
import type { NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import type { NodeRunWorktreeAdmission, NodeRunWorktreeBinding } from '@hbar/storage'
import {
  createRuntimeNodeWorkspaceInspection,
  type RuntimeNodeWorkspaceInspectionStoragePort,
} from '../apps/host/src/runtime-node-workspace-inspection'

function capabilities(patch: Partial<NodeCapabilities> = {}): NodeCapabilities {
  return nodeCapabilitiesSchema.parse({
    protocol: 1,
    nodeId: 'build-box',
    platform: 'linux',
    evaluator: SANDBOX_EVALUATOR_FINGERPRINT,
    roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' }],
    sandbox: { backends: ['bwrap'], filesystem: 'enforced', network: 'enforced' },
    floor: {
      process: true,
      network: false,
      terminal: false,
      osConfinement: 'required',
      backend: 'auto',
    },
    ...patch,
  })
}

const session: Session = {
  id: 'session-1',
  workspaceId: 'workspace-1',
  title: 'Session',
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 2,
  seq: 3,
}
const run: Run = {
  id: 'run-1',
  sessionId: session.id,
  requestId: 'request-1',
  input: { text: 'final command', images: [], approval: 'ask' },
  modelId: 'model-1',
  status: 'waiting_approval',
  createdAt: 1,
  startedAt: 1,
  endedAt: null,
  error: null,
}
const workspace: Workspace = {
  id: 'workspace-1',
  path: 'hbar-node://build-box/engine',
  name: 'Engine',
  createdAt: 0,
  location: { kind: 'node', nodeId: 'build-box', rootId: 'engine', nodePath: '/srv/engine' },
}

function makeRegistry(
  capabilitySnapshot: NodeCapabilities = capabilities(),
  patch: Partial<RegisteredNode> = {},
): RegisteredNode {
  return {
    nodeId: 'build-box',
    publicKey: 'A'.repeat(43),
    name: 'A-owned Build Host',
    createdAt: 1,
    lastSeenAt: 2,
    revokedAt: null,
    capabilities: capabilitySnapshot,
    ...patch,
  }
}

function makeStorage(
  options: {
    readonly getWorkspace?: () => Workspace | null
    readonly getNode?: () => RegisteredNode | null
    readonly getManagedWorktree?: () => NodeRunWorktreeBinding | null
    readonly getWorktreeAdmission?: () => NodeRunWorktreeAdmission | null
  } = {},
): RuntimeNodeWorkspaceInspectionStoragePort {
  return {
    findSession: async () => session,
    run: async () => run,
    findWorkspace: async () => options.getWorkspace?.() ?? workspace,
    node: async () => options.getNode?.() ?? makeRegistry(),
    nodeRunWorktree: () => options.getManagedWorktree?.() ?? null,
    nodeRunWorktreeAdmission: () => options.getWorktreeAdmission?.() ?? null,
    workspaceFolders: async (workspaceId) => ({
      schemaVersion: 1,
      workspaceId,
      revision: 4,
      folders: [
        { id: 'primary', alias: 'src', path: 'hbar-node://build-box/engine' },
        { id: 'docs', alias: 'docs', path: 'hbar-node://build-box/docs' },
      ],
    }),
  }
}

test('admission target describes A-owned node name and exact live B capability snapshot before Approval exists', async () => {
  let observed = 0
  const model = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage(),
    nodeCapabilities: {
      read: async () => {
        observed++
        return capabilities()
      },
    },
    now: () => 1234,
  })
  expect(
    await model.captureExecutionTarget(
      { sessionId: session.id, runId: run.id, workspaceId: workspace.id },
      new AbortController().signal,
    ),
  ).toEqual({
    kind: 'node',
    nodeId: 'build-box',
    nodeName: 'A-owned Build Host',
    rootId: 'engine',
    nodePath: '/srv/engine',
    rootAccess: 'write',
    capabilitySummary: {
      backends: ['bwrap'],
      selectedBackend: 'bwrap',
      filesystem: 'enforced',
      network: 'enforced',
      floor: { process: true, network: false, terminal: false, osConfinement: 'required', backend: 'auto' },
      observedAt: 1234,
    },
  })
  expect(observed).toBe(1)
})

test('mount manifest pins only same-node registered roots after B canonical-root checks', async () => {
  const snapshot = {
    schemaVersion: 1 as const,
    workspaceId: workspace.id,
    revision: 4,
    folders: [
      { id: 'primary', alias: 'src', path: 'hbar-node://build-box/engine' },
      { id: 'docs', alias: 'docs', path: 'hbar-node://build-box/docs' },
    ],
  }
  const rootSnapshot = capabilities({
    roots: [
      { rootId: 'engine', name: 'Engine', nodePath: '/srv/engine', access: 'write' },
      { rootId: 'docs', name: 'Docs', nodePath: '/srv/docs', access: 'read' },
    ],
  })
  const model = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage({ getNode: () => makeRegistry(rootSnapshot) }),
    nodeCapabilities: {
      read: async () => rootSnapshot,
      canonicalize: async (_nodeId, _rootId, expectedRoot) => expectedRoot,
    },
  })
  const manifest = await model.resolveWorkspaceMountManifest!(
    { sessionId: session.id, runId: run.id, workspaceId: workspace.id },
    snapshot,
    { nodeId: 'build-box', rootId: 'engine', nodePath: '/srv/engine' },
    new AbortController().signal,
  )
  expect(manifest).toMatchObject({
    workspaceId: workspace.id,
    revision: 4,
    nodeId: 'build-box',
    primaryRootId: 'engine',
    roots: [
      { rootId: 'engine', alias: 'src', expectedRoot: '/srv/engine' },
      { rootId: 'docs', alias: 'docs', expectedRoot: '/srv/docs' },
    ],
  })
  const crossNode = {
    ...snapshot,
    folders: [...snapshot.folders, { id: 'bad', alias: 'bad', path: 'hbar-node://other/docs' }],
  }
  await expect(
    model.verifyWorkspaceFolders!('build-box', crossNode.folders, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'WORKSPACE_NODE_MISMATCH' })
})

test('inspection fails closed on evaluator or root mismatch and rechecks a changed workspace pin', async () => {
  const request = { sessionId: session.id, runId: run.id, workspaceId: workspace.id }
  const evaluatorChanged = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage(),
    nodeCapabilities: { read: async () => capabilities({ evaluator: 'b'.repeat(64) }) },
  })
  await expect(evaluatorChanged.captureExecutionTarget(request, new AbortController().signal)).rejects.toMatchObject({
    code: 'NODE_CAPABILITIES_STALE',
  })

  const rootChanged = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage(),
    nodeCapabilities: {
      read: async () =>
        capabilities({ roots: [{ rootId: 'engine', name: 'Engine', nodePath: '/other/engine', access: 'write' }] }),
    },
  })
  await expect(rootChanged.captureExecutionTarget(request, new AbortController().signal)).rejects.toMatchObject({
    code: 'NODE_ROOT_CHANGED',
  })

  let readCount = 0
  const moved = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage({
      getWorkspace: () =>
        ++readCount < 2 ? workspace : { ...workspace, path: 'D:/work/engine', location: { kind: 'local' } },
    }),
    nodeCapabilities: { read: async () => capabilities() },
  })
  await expect(moved.captureExecutionTarget(request, new AbortController().signal)).rejects.toMatchObject({
    code: 'EXECUTION_TARGET_STALE',
  })
})

test('local execution is identified as local without consulting a node or guessing isolation', async () => {
  const localWorkspace: Workspace = { ...workspace, path: 'D:/work/engine', location: { kind: 'local' } }
  const model = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage({ getWorkspace: () => localWorkspace }),
    nodeCapabilities: {
      read: async () => {
        throw new Error('local execution does not query the node link')
      },
    },
  })
  expect(
    await model.captureExecutionTarget(
      { sessionId: session.id, runId: run.id, workspaceId: workspace.id },
      new AbortController().signal,
    ),
  ).toEqual({ kind: 'local' })
})

test('managed Run inspection reopens the exact B target while keeping capabilities pinned to its parent root', async () => {
  const managed: NodeManagedWorktree = {
    worktreeId: 'd'.repeat(32),
    sessionId: session.id,
    createdByRunId: 'run-original',
    targetRevision: 4,
    worktreeRootId: `wt_${'d'.repeat(32)}`,
    parentRootId: 'engine',
    nodePath: '/srv/engine/.hbar-worktrees/d',
    branch: 'feature/managed',
    createdAt: 10,
  }
  const binding = {
    runId: run.id,
    sessionId: session.id,
    workspaceId: workspace.id,
    nodeId: 'build-box',
    parentRootId: 'engine',
    worktreeRootId: managed.worktreeRootId,
    worktreeId: managed.worktreeId,
    worktreeCreatedByRunId: managed.createdByRunId,
    worktreeTargetRevision: managed.targetRevision,
    nodePath: managed.nodePath,
    branch: managed.branch,
    createdAt: managed.createdAt,
    launchTargetRevision: 4,
    launchTarget: {
      sessionId: session.id,
      expectedRevision: 4,
      selection: { mode: 'isolated-worktree', branch: { kind: 'existing', name: 'feature/managed' } },
      targetPath: workspace.path,
      branch: 'feature/managed',
      head: null,
      boundRunId: run.id,
      boundAt: 11,
    },
    originalWorkspaceLocation: { rootId: 'engine', nodePath: '/srv/engine' },
  } satisfies NodeRunWorktreeBinding
  const admission = {
    runId: run.id,
    sessionId: session.id,
    workspaceId: workspace.id,
    launchTarget: binding.launchTarget,
    workspaceFoldersSnapshot: {
      schemaVersion: 1,
      workspaceId: workspace.id,
      revision: 4,
      folders: [
        { id: 'primary', alias: 'src', path: 'hbar-node://build-box/engine' },
        { id: 'docs', alias: 'docs', path: 'hbar-node://build-box/docs' },
      ],
    },
    originalWorkspaceLocation: {
      nodeId: 'build-box',
      rootId: 'engine',
      nodePath: '/srv/engine',
    },
  } satisfies NodeRunWorktreeAdmission
  let getInput: unknown
  const model = createRuntimeNodeWorkspaceInspection({
    storage: makeStorage({ getManagedWorktree: () => binding, getWorktreeAdmission: () => admission }),
    nodeCapabilities: {
      read: async () => capabilities(),
      readWorktree: async (_nodeId, target) => {
        getInput = target
        return managed
      },
    },
  })
  expect(
    await model.captureExecutionTarget(
      { sessionId: session.id, runId: run.id, workspaceId: workspace.id },
      new AbortController().signal,
    ),
  ).toMatchObject({
    kind: 'node',
    rootId: managed.worktreeRootId,
    nodePath: managed.nodePath,
    rootAccess: 'write',
  })
  expect(getInput).toMatchObject({
    operationId: 'run-1:worktree-get',
    rootId: 'engine',
    expectedRoot: '/srv/engine',
    branch: 'feature/managed',
    createBranch: false,
    provisioning: {
      kind: 'launch-target',
      runId: run.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      nodeId: 'build-box',
      targetRevision: 4,
      selection: { mode: 'isolated-worktree', branch: { kind: 'existing', name: 'feature/managed' } },
      workspaceFolderRevision: 4,
    },
  })
  expect(getInput).not.toHaveProperty('authority')
})
