import { describe, expect, test } from 'bun:test'
import {
  nodeManagedWorktreeSchema,
  nodeWorktreeCreateSchema,
  nodeWorktreeRemoveSchema,
} from '@hbar/contracts/node-worktree'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
} from '@hbar/contracts/node-worktree-provisioning'

const workspaceFolders = {
  schemaVersion: 1 as const,
  workspaceId: 'workspace-1',
  revision: 1,
  folders: [{ id: 'folder-1', alias: 'engine', path: 'D:/repo' }],
}
const target = {
  workspaceId: workspaceFolders.workspaceId,
  sessionId: 'session-1',
  runId: 'run-1',
  nodeId: 'node-1',
  targetRevision: 1,
  selection: {
    mode: 'isolated-worktree' as const,
    branch: { kind: 'new' as const, name: 'feature/remote-worktree', startPoint: 'main' },
  },
  workspaceFolderRevision: workspaceFolders.revision,
  workspaceFolderDigest: acceptedWorkspaceFolderDigest(workspaceFolders),
}
const provisioning = {
  kind: 'launch-target' as const,
  ...target,
  acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(target),
}

describe('remote node worktree contract', () => {
  test('keeps worktree identity and paths B-owned', () => {
    const input = nodeWorktreeCreateSchema.parse({
      operationId: 'run-1:worktree-create',
      rootId: 'engine',
      expectedRoot: 'D:/repo',
      branch: 'feature/remote-worktree',
      startPoint: 'main',
      createBranch: true,
      provisioning,
    })
    expect('worktreeId' in input).toBe(false)
    expect('path' in input).toBe(false)
  })

  test('rejects traversal identities, malformed branch names, and arbitrary remove paths', () => {
    const valid = {
      operationId: 'run-1:worktree-create',
      rootId: 'engine',
      expectedRoot: 'D:/repo',
      branch: 'feature/remote-worktree',
      startPoint: 'main',
      createBranch: true,
      provisioning,
    }
    expect(nodeWorktreeCreateSchema.safeParse({ ...valid, worktreeId: '../repo' }).success).toBe(false)
    expect(nodeWorktreeCreateSchema.safeParse({ ...valid, branch: 'feature/../escape' }).success).toBe(false)
    expect(nodeWorktreeCreateSchema.safeParse({ ...valid, path: '../../repo' }).success).toBe(false)
    expect(
      nodeWorktreeRemoveSchema.safeParse({
        operationId: 'run-1:worktree-remove',
        rootId: 'engine',
        expectedRoot: 'D:/repo',
        worktreeId: '0123456789abcdef0123456789abcdef',
        provisioning,
        path: '../../repo',
      }).success,
    ).toBe(false)
  })

  test('validates a B-returned canonical worktree path', () => {
    expect(
      nodeManagedWorktreeSchema.parse({
        worktreeId: '0123456789abcdef0123456789abcdef',
        sessionId: 'session-1',
        createdByRunId: 'run-1',
        targetRevision: 1,
        worktreeRootId: 'wt_0123456789abcdef0123456789abcdef',
        parentRootId: 'engine',
        nodePath: 'D:/repo/.hbar-worktrees/0123456789abcdef0123456789abcdef',
        branch: 'feature/remote-worktree',
        createdAt: 1,
      }).nodePath,
    ).toContain('.hbar-worktrees')
  })
})
