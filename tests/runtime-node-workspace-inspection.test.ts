import { expect, test } from 'bun:test'
import type { Run, Session, Workspace } from '@hbar/contracts'
import type { RegisteredNode } from '@hbar/contracts/node-registry'
import { nodeCapabilitiesSchema, type NodeCapabilities } from '@hbar/contracts/node'
import { SANDBOX_EVALUATOR_FINGERPRINT } from '@hbar/sandbox'
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
  } = {},
): RuntimeNodeWorkspaceInspectionStoragePort {
  return {
    findSession: async () => session,
    run: async () => run,
    findWorkspace: async () => options.getWorkspace?.() ?? workspace,
    node: async () => options.getNode?.() ?? makeRegistry(),
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
