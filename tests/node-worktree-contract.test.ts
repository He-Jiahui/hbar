import { describe, expect, test } from 'bun:test'
import {
  nodeManagedWorktreeSchema,
  nodeWorktreeCreateSchema,
  nodeWorktreeRemoveSchema,
} from '@hbar/contracts/node-worktree'

const authority = {
  sessionId: 'session-1',
  runId: 'run-1',
  callId: 'call-1',
  sandbox: null,
  admission: { kind: 'allow' as const },
}

describe('remote node worktree contract', () => {
  test('keeps worktree identity and paths B-owned', () => {
    const input = nodeWorktreeCreateSchema.parse({
      operationId: 'run-1:call-1',
      rootId: 'engine',
      expectedRoot: 'D:/repo',
      targetRevision: 1,
      branch: 'feature/remote-worktree',
      createBranch: true,
      authority,
    })
    expect('worktreeId' in input).toBe(false)
    expect('path' in input).toBe(false)
  })

  test('rejects traversal identities, malformed branch names, and arbitrary remove paths', () => {
    const valid = {
      operationId: 'run-1:call-1',
      rootId: 'engine',
      expectedRoot: 'D:/repo',
      targetRevision: 1,
      branch: 'main',
      authority,
    }
    expect(nodeWorktreeCreateSchema.safeParse({ ...valid, worktreeId: '../repo' }).success).toBe(false)
    expect(nodeWorktreeCreateSchema.safeParse({ ...valid, branch: 'feature/../escape' }).success).toBe(false)
    expect(nodeWorktreeRemoveSchema.safeParse({ ...valid, path: '../../repo' }).success).toBe(false)
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
