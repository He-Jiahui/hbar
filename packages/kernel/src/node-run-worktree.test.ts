import { expect, test } from 'bun:test'
import {
  acceptedWorkspaceFolderDigest,
  nodeWorktreeProvisioningAuthoritySchema,
} from '@hbar/contracts/node-worktree-provisioning'
import type { NodeManagedWorktree } from '@hbar/contracts/node-worktree'
import type { NodeRunWorktreeAdmission, NodeRunWorktreeBinding } from '@hbar/storage'
import type { NodeRunWorktreeStoragePort } from './node-run-worktree'
import { ensureNodeRunWorktree } from './node-run-worktree'
import type { NodeWorktreePort } from './node-worktree-port'

function admission(selection: NodeRunWorktreeAdmission['launchTarget']['selection']): NodeRunWorktreeAdmission {
  return {
    runId: 'run-remote-worktree',
    sessionId: 'session-remote-worktree',
    workspaceId: 'workspace-remote-worktree',
    launchTarget: {
      sessionId: 'session-remote-worktree',
      expectedRevision: 7,
      selection,
      targetPath: 'hbar-node://node-a/engine',
      branch:
        selection.mode === 'isolated-worktree'
          ? selection.branch.kind === 'derived'
            ? 'hbar/session-launch/derived'
            : selection.branch.name
          : selection.mode === 'shared-branch'
            ? selection.branch.ref.slice('refs/heads/'.length)
            : null,
      head: selection.mode === 'shared-branch' ? selection.branch.tipOid : null,
      boundRunId: 'run-remote-worktree',
      boundAt: 1,
    },
    workspaceFoldersSnapshot: {
      schemaVersion: 1,
      workspaceId: 'workspace-remote-worktree',
      revision: 3,
      folders: [{ id: 'folder-engine', alias: 'engine', path: 'hbar-node://node-a/engine' }],
    },
    originalWorkspaceLocation: { nodeId: 'node-a', rootId: 'engine', nodePath: '/srv/engine' },
  }
}

function fixture(
  accepted: NodeRunWorktreeAdmission,
  options: { existingBinding?: NodeRunWorktreeBinding; bindFails?: boolean } = {},
) {
  let binding = options.existingBinding ?? null
  let remote: NodeManagedWorktree | null = null
  const calls = { gets: [] as unknown[], creates: [] as unknown[], removes: [] as unknown[], binds: [] as unknown[] }
  const storage: NodeRunWorktreeStoragePort = {
    nodeRunWorktree: () => binding,
    nodeRunWorktreeBind: (request) => {
      calls.binds.push(request)
      if (options.bindFails) throw new Error('durable bind failed')
      const item = request.worktree
      binding = {
        runId: request.runId,
        sessionId: accepted.sessionId,
        workspaceId: accepted.workspaceId,
        nodeId: accepted.originalWorkspaceLocation.nodeId,
        parentRootId: accepted.originalWorkspaceLocation.rootId,
        worktreeRootId: item.worktreeRootId,
        worktreeId: item.worktreeId,
        worktreeCreatedByRunId: item.createdByRunId,
        worktreeTargetRevision: item.targetRevision,
        nodePath: item.nodePath,
        branch: item.branch,
        createdAt: item.createdAt,
        launchTargetRevision: request.launchTargetRevision,
        launchTarget: accepted.launchTarget,
        originalWorkspaceLocation: {
          rootId: accepted.originalWorkspaceLocation.rootId,
          nodePath: accepted.originalWorkspaceLocation.nodePath,
        },
      }
      return binding
    },
  }
  const worktrees: NodeWorktreePort = {
    create: async (nodeId, request) => {
      calls.creates.push({ nodeId, ...request })
      const provisioning = nodeWorktreeProvisioningAuthoritySchema.parse(request.provisioning)
      remote = {
        worktreeId: 'a'.repeat(32),
        sessionId: provisioning.sessionId,
        createdByRunId: provisioning.runId,
        targetRevision: request.provisioning.targetRevision,
        worktreeRootId: `wt_${'a'.repeat(32)}`,
        parentRootId: request.rootId,
        nodePath: '/srv/engine/.hbar-worktrees/a',
        branch: request.branch,
        createdAt: 20,
      }
      return remote
    },
    remove: async (nodeId, request) => {
      calls.removes.push({ nodeId, ...request })
    },
    get: async (nodeId, request) => {
      calls.gets.push({ nodeId, ...request })
      return remote
    },
  }
  return { ports: { storage, worktrees }, calls, setRemote: (value: NodeManagedWorktree) => (remote = value) }
}

test('creates and binds the B-derived worktree for the accepted target revision', async () => {
  const accepted = admission({ mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/remote' } })
  const { ports, calls } = fixture(accepted)
  const result = await ensureNodeRunWorktree(accepted, ports, AbortSignal.timeout(2_000))
  const folderSnapshot = accepted.workspaceFoldersSnapshot
  if (!folderSnapshot) throw new Error('The accepted worktree fixture has no folder snapshot')
  expect(result?.worktreeId).toBe('a'.repeat(32))
  expect(calls.gets).toHaveLength(1)
  expect(calls.gets[0]).toMatchObject({
    operationId: `${accepted.runId}:worktree-get`,
    provisioning: { runId: accepted.runId },
  })
  expect(calls.creates).toHaveLength(1)
  expect(calls.creates[0]).toMatchObject({
    operationId: `${accepted.runId}:worktree-create`,
    provisioning: { runId: accepted.runId },
  })
  expect(calls.binds).toHaveLength(1)
  expect(calls.removes).toHaveLength(0)
  expect(calls.creates[0]).toMatchObject({
    nodeId: 'node-a',
    operationId: `${accepted.runId}:worktree-create`,
    rootId: 'engine',
    expectedRoot: '/srv/engine',
    branch: 'feature/remote',
    createBranch: true,
    provisioning: {
      kind: 'launch-target',
      workspaceId: accepted.workspaceId,
      sessionId: accepted.sessionId,
      runId: accepted.runId,
      nodeId: accepted.originalWorkspaceLocation.nodeId,
      targetRevision: 7,
      selection: accepted.launchTarget.selection,
      workspaceFolderRevision: 3,
      workspaceFolderDigest: acceptedWorkspaceFolderDigest(folderSnapshot),
    },
  })
  expect(
    (calls.creates[0] as { provisioning?: { acceptedTargetDigest?: unknown } })?.provisioning?.acceptedTargetDigest,
  ).toMatch(/^[a-f0-9]{64}$/)
})

test('reuses B target returned by get and persists a new per-Run binding without creating a second target', async () => {
  const accepted = admission({ mode: 'isolated-worktree', branch: { kind: 'existing', name: 'feature/kept' } })
  const priorWorktree: NodeManagedWorktree = {
    worktreeId: 'b'.repeat(32),
    sessionId: accepted.sessionId,
    createdByRunId: 'earlier-run',
    targetRevision: 7,
    worktreeRootId: `wt_${'b'.repeat(32)}`,
    parentRootId: 'engine',
    nodePath: '/srv/engine/.hbar-worktrees/b',
    branch: 'feature/kept',
    createdAt: 21,
  }
  const { ports, calls, setRemote } = fixture(accepted)
  setRemote(priorWorktree)
  const result = await ensureNodeRunWorktree(accepted, ports, AbortSignal.timeout(2_000))
  expect(result?.worktreeId).toBe('b'.repeat(32))
  expect(calls.creates).toHaveLength(0)
  expect(calls.binds).toHaveLength(1)
})

test('does not allocate for shared-current and leaves shared B targets intact on bind failure', async () => {
  const shared = fixture(admission({ mode: 'shared-current' }))
  expect(
    await ensureNodeRunWorktree(admission({ mode: 'shared-current' }), shared.ports, AbortSignal.timeout(2_000)),
  ).toBeNull()
  expect(shared.calls.gets).toHaveLength(0)

  const accepted = admission({ mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/unbound' } })
  const { ports, calls } = fixture(accepted, { bindFails: true })
  await expect(ensureNodeRunWorktree(accepted, ports, AbortSignal.timeout(2_000))).rejects.toThrow(
    'durable bind failed',
  )
  expect(calls.creates).toHaveLength(1)
  expect(calls.removes).toHaveLength(0)
})
