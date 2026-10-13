import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Workspace } from '@hbar/contracts/directory'
import type { NodeListInput, NodeListPage } from '@hbar/contracts/node-management'
import type { WorkspaceCreateInput } from '@hbar/contracts/commands/workspaces'
import { nodeExecutionTargetSchema } from '@hbar/contracts/node-execution-target'
import { HbarApprovalExecutionTarget } from '../packages/app-react/src/approval-execution-target'
import { HbarWorkspaceNodeBadge } from '../packages/app-react/src/workspace-location-picker'
import {
  createWorkspaceLocationPickerModel,
  createWorkspaceNodeRegistryModel,
  type WorkspaceLocationPickerPort,
} from '../apps/web/src/workspace-location-picker-model'
import { approvalExecutionTargetCopy } from '../apps/web/src/approval-execution-target-copy'
import { workspaceLocationPickerCopy } from '../apps/web/src/workspace-location-picker-copy'

function node(
  index: number,
  options: { online?: boolean; capabilities?: boolean; access?: 'read' | 'write' } = {},
): NodeListPage['items'][number] {
  const nodeId = `node-${index}`
  return {
    nodeId,
    publicKey: 'A'.repeat(43),
    name: `节点 ${index} build host with a deliberately long translated name for wrapping`,
    createdAt: 1,
    lastSeenAt: 2,
    revokedAt: null,
    online: options.online ?? true,
    capabilities:
      options.capabilities === false
        ? null
        : {
            protocol: 1,
            nodeId,
            platform: 'linux',
            evaluator: 'a'.repeat(64),
            roots: [
              {
                rootId: 'engine',
                name: 'engine',
                nodePath: '/srv/very-long-workspace-path-that-wraps/engine',
                access: options.access ?? 'write',
              },
            ],
            sandbox: { backends: ['bwrap'], filesystem: 'enforced', network: 'enforced' },
            floor: {
              process: true,
              network: false,
              terminal: false,
              osConfinement: 'required',
              backend: 'auto',
              maxConcurrentProcesses: 4,
              maxTimeoutMs: 600_000,
              onLinkLost: { action: 'terminate', graceMs: 30_000 },
              localConfirm: 'none',
            },
          },
  }
}

function page(items: readonly NodeListPage['items'][number][], nextCursor: string | null = null): NodeListPage {
  return { items: [...items], nextCursor }
}

function workspace(input: WorkspaceCreateInput): Workspace {
  return input.node
    ? {
        id: 'workspace-remote',
        path: `hbar-node://${input.node}/${input.rootId}`,
        name: input.name ?? 'engine',
        createdAt: 10,
        location: { kind: 'node', nodeId: input.node, rootId: input.rootId ?? 'engine', nodePath: '/srv/engine' },
      }
    : {
        id: 'workspace-local',
        path: input.path ?? '/workspace',
        name: input.name ?? 'workspace',
        createdAt: 10,
        location: { kind: 'local' },
      }
}

function createPort(
  listNodes: (input: NodeListInput, options?: { readonly signal?: AbortSignal | undefined }) => Promise<NodeListPage>,
  createWorkspace: (input: WorkspaceCreateInput) => Promise<Workspace>,
): WorkspaceLocationPickerPort {
  return { listNodes, createWorkspace }
}

test('remote workspace selection uses live paged node IDs and creates against the exact selected root', async () => {
  const calls: WorkspaceCreateInput[] = []
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async (input) =>
        input.after
          ? page([node(20)], null)
          : page(
              Array.from({ length: 20 }, (_, index) => node(index)),
              'node-19',
            ),
      async (input) => {
        calls.push(input)
        return workspace(input)
      },
    ),
    true,
    true,
  )
  model.setMode('node')
  await model.refresh()
  expect(model.store.getState().page?.items).toHaveLength(20)
  await model.loadMore()
  expect(model.store.getState().page?.items).toHaveLength(21)
  model.selectNode('node-20')
  model.selectRoot('node-20', 'engine')
  model.setName('Build workspace')
  const created = await model.create()
  expect(calls).toEqual([{ node: 'node-20', rootId: 'engine', name: 'Build workspace' }])
  expect(created?.location).toEqual({ kind: 'node', nodeId: 'node-20', rootId: 'engine', nodePath: '/srv/engine' })
  model.dispose()
})

test('offline, unverified, disconnected, and observer targets cannot create', async () => {
  let createCount = 0
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async () => page([node(1, { online: false }), node(2, { capabilities: false })]),
      async (input) => {
        createCount++
        return workspace(input)
      },
    ),
    true,
    true,
  )
  model.setMode('node')
  await model.refresh()
  model.selectNode('node-1')
  model.selectRoot('node-1', 'engine')
  expect(await model.create()).toBeNull()
  model.selectNode('node-2')
  model.selectRoot('node-2', 'engine')
  expect(await model.create()).toBeNull()
  model.setConnection(true, false)
  expect(await model.create()).toBeNull()
  model.setConnection(false, true)
  expect(await model.create()).toBeNull()
  expect(createCount).toBe(0)
  model.dispose()
})

test('a live read-only root remains selectable and creates a node-pinned workspace', async () => {
  const calls: WorkspaceCreateInput[] = []
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async () => page([node(7, { access: 'read' })]),
      async (input) => {
        calls.push(input)
        return workspace(input)
      },
    ),
    true,
    true,
  )
  model.setMode('node')
  await model.refresh()
  model.selectNode('node-7')
  model.selectRoot('node-7', 'engine')
  const created = await model.create()
  expect(calls).toEqual([{ node: 'node-7', rootId: 'engine' }])
  expect(created?.location).toEqual({ kind: 'node', nodeId: 'node-7', rootId: 'engine', nodePath: '/srv/engine' })
  model.dispose()
})

test('cancelled stale node pages and failed creates preserve safe state and error codes', async () => {
  let resolveList: ((result: NodeListPage) => void) | undefined
  let requestSignal: AbortSignal | undefined
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async (_input, options) => {
        requestSignal = options?.signal
        return await new Promise<NodeListPage>((resolve) => {
          resolveList = resolve
        })
      },
      async () => {
        throw { code: 'NODE_OFFLINE' }
      },
    ),
    true,
    true,
  )
  const pending = model.refresh()
  model.cancelLoad()
  expect(requestSignal?.aborted).toBe(true)
  resolveList?.(page([node(1)]))
  await pending
  expect(model.store.getState().page).toBeNull()
  expect(model.store.getState().loading).toBe(false)
  model.setMode('node')
  // Exercise the failure path with a current capability page.
  model.dispose()

  const failed = createWorkspaceLocationPickerModel(
    createPort(
      async () => page([node(1)]),
      async () => {
        throw { code: 'NODE_OFFLINE' }
      },
    ),
    true,
    true,
  )
  failed.setMode('node')
  await failed.refresh()
  failed.selectNode('node-1')
  failed.selectRoot('node-1', 'engine')
  expect(await failed.create()).toBeNull()
  expect(failed.store.getState().error).toBe('NODE_OFFLINE')
  failed.dispose()
})

test('failed and cancelled node reads wait for an explicit retry instead of auto-refreshing', async () => {
  let calls = 0
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async () => {
        calls++
        if (calls === 1) throw { code: 'NODE_OFFLINE' }
        return page([node(1)])
      },
      async (input) => workspace(input),
    ),
    true,
    true,
  )
  model.setMode('node')
  expect(calls).toBe(0)
  await model.refresh()
  expect(calls).toBe(1)
  expect(model.store.getState().error).toBe('NODE_OFFLINE')

  let resolveList: ((result: NodeListPage) => void) | undefined
  const pendingModel = createWorkspaceLocationPickerModel(
    createPort(
      async () => {
        calls++
        return await new Promise<NodeListPage>((resolve) => {
          resolveList = resolve
        })
      },
      async (input) => workspace(input),
    ),
    true,
    true,
  )
  pendingModel.setMode('node')
  const pending = pendingModel.refresh()
  pendingModel.cancelLoad()
  resolveList?.(page([node(2)]))
  await pending
  await Promise.resolve()
  expect(calls).toBe(2)
  expect(pendingModel.store.getState().page).toBeNull()

  await model.refresh()
  expect(calls).toBe(3)
  expect(model.store.getState().page?.items[0]?.nodeId).toBe('node-1')
  model.dispose()
  pendingModel.dispose()
})

test('immediate retain after effect cleanup keeps the same picker model usable', async () => {
  let calls = 0
  const model = createWorkspaceLocationPickerModel(
    createPort(
      async () => {
        calls++
        return page([node(1)])
      },
      async (input) => workspace(input),
    ),
    true,
    true,
  )
  const releaseStrictModeSetup = model.retain()
  releaseStrictModeSetup()
  const releaseReplaySetup = model.retain()
  await Promise.resolve()
  await model.refresh()
  expect(calls).toBe(1)
  expect(model.store.getState().page?.items[0]?.nodeId).toBe('node-1')

  releaseReplaySetup()
  await Promise.resolve()
  await model.refresh()
  expect(calls).toBe(1)
})

test('workspace badge uses host-owned localized labels and preserves the complete node name', () => {
  const labels = workspaceLocationPickerCopy('zh-CN')
  const html = renderToStaticMarkup(<HbarWorkspaceNodeBadge labels={labels} nodeName={node(1).name} />)
  expect(html).toContain('节点：')
  expect(html).toContain(node(1).name)
})

test('approval target shows the captured selected backend separately from available isolation and floor facts', () => {
  const labels = approvalExecutionTargetCopy('en-US')
  const target = nodeExecutionTargetSchema.parse({
    kind: 'node',
    nodeId: 'node-a',
    nodeName: 'Build node A',
    rootId: 'source',
    nodePath: '/srv/source',
    rootAccess: 'read',
    capabilitySummary: {
      backends: ['bwrap', 'container'],
      selectedBackend: 'bwrap',
      filesystem: 'enforced',
      network: 'enforced',
      floor: { process: true, network: false, terminal: false, osConfinement: 'required' },
      observedAt: 1_791_763_200_000,
    },
  })
  const html = renderToStaticMarkup(<HbarApprovalExecutionTarget target={target} labels={labels} />)
  expect(html).toContain('Node: Build node A')
  expect(html).toContain('Workspace path: /srv/source (node shared as read only)')
  expect(html).toContain('Node-reported available isolation backends: bubblewrap · Container')
  expect(html).toContain('Selected isolation backend: bubblewrap')
  expect(html).toContain('Filesystem isolation capability: enforced')
  expect(html).toContain('Network isolation capability: enforced')
  expect(html).toContain('Processes available; terminal disabled; network disabled; OS confinement required')
})

test('approval target reports selected backend as unknown for older saved observations', () => {
  const labels = approvalExecutionTargetCopy('zh-CN')
  const target = nodeExecutionTargetSchema.parse({
    kind: 'node',
    nodeId: 'node-a',
    nodeName: 'Build node A',
    rootId: 'source',
    nodePath: '/srv/source',
    rootAccess: 'write',
    capabilitySummary: {
      backends: ['bwrap'],
      filesystem: 'enforced',
      network: 'none',
      floor: { process: true, network: false, terminal: false, osConfinement: 'required' },
      observedAt: 1_791_763_200_000,
    },
  })
  const html = renderToStaticMarkup(<HbarApprovalExecutionTarget target={target} labels={labels} />)
  expect(html).toContain('节点报告的可用隔离后端：bubblewrap')
  expect(html).toContain('实际使用的隔离后端：未知（旧审批记录未保存）')
  expect(html).not.toContain('实际使用的隔离后端：bubblewrap')
})

test('node registry ignores late pages from a previous Host identity', async () => {
  const pending: Array<(result: NodeListPage) => void> = []
  const model = createWorkspaceNodeRegistryModel({
    listNodes: async () => await new Promise<NodeListPage>((resolve) => pending.push(resolve)),
  })
  model.setIdentity('host-a', true, 'operator')
  const oldHostRead = model.refresh()
  model.setIdentity('host-b', true, 'operator')
  const newHostRead = model.refresh()
  pending[1]?.(page([node(2)]))
  await newHostRead
  pending[0]?.(page([node(1)]))
  await oldHostRead
  expect(model.store.getState().hostId).toBe('host-b')
  expect(Object.keys(model.store.getState().registry)).toEqual(['node-2'])
  model.dispose()
})

test('node registry rejects repeated pagination cursors without exposing a partial registry', async () => {
  let calls = 0
  const model = createWorkspaceNodeRegistryModel({
    listNodes: async (input) => {
      calls++
      return input.after ? page([node(2)], 'cursor-1') : page([node(1)], 'cursor-1')
    },
  })
  model.setIdentity('host-a', true, 'operator')
  await model.refresh()
  expect(calls).toBe(2)
  expect(model.store.getState().error).toBe('NODE_CURSOR_STALLED')
  expect(model.store.getState().registry).toEqual({})
  model.dispose()
})

test('node registry paging is bounded at 100 pages and 10,000 unique nodes', async () => {
  let calls = 0
  const model = createWorkspaceNodeRegistryModel({
    listNodes: async () => {
      const pageIndex = calls++
      return page(
        Array.from({ length: 100 }, (_, index) => node(pageIndex * 100 + index)),
        `cursor-${String(pageIndex + 1).padStart(3, '0')}`,
      )
    },
  })
  model.setIdentity('host-a', true, 'operator')
  await model.refresh()
  expect(calls).toBe(100)
  expect(Object.keys(model.store.getState().registry)).toHaveLength(10_000)
  expect(model.store.getState().error).toBe('NODE_REGISTRY_LIMIT')
  expect(model.store.getState().complete).toBe(false)
  model.dispose()
})

test('node registry retain survives immediate StrictMode cleanup replay', async () => {
  let calls = 0
  const model = createWorkspaceNodeRegistryModel({
    listNodes: async () => {
      calls++
      return page([node(1)])
    },
  })
  model.setIdentity('host-a', true, 'operator')
  const releaseFirstSetup = model.retain()
  releaseFirstSetup()
  const releaseReplaySetup = model.retain()
  await Promise.resolve()
  await model.refresh()
  expect(calls).toBe(1)
  expect(Object.keys(model.store.getState().registry)).toEqual(['node-1'])
  releaseReplaySetup()
  await Promise.resolve()
  await model.refresh()
  expect(calls).toBe(1)
})
