import { describe, expect, test } from 'bun:test'
import {
  acceptedNodeWorktreeTargetDigest,
  acceptedWorkspaceFolderDigest,
  nodeWorktreeProvisioningAuthoritySchema,
} from '@hbar/contracts/node-worktree-provisioning'
import { nodeStoredOperationSchema, nodeStateMethods } from '@hbar/contracts/node-state'
import { nodeLaunchTargetAuditEntrySchema } from '@hbar/contracts/node'

describe('launch-target worktree provisioning authority', () => {
  test('separates stable checkout identity from each Run folder snapshot', () => {
    const workspaceFolders = {
      schemaVersion: 1 as const,
      workspaceId: 'workspace-1',
      revision: 4,
      folders: [{ id: 'folder-1', alias: 'engine', path: 'D:/repo' }],
    }
    const accepted = {
      kind: 'launch-target' as const,
      workspaceId: workspaceFolders.workspaceId,
      sessionId: 'session-1',
      runId: 'run-1',
      nodeId: 'node-1',
      targetRevision: 8,
      selection: {
        mode: 'isolated-worktree' as const,
        branch: { kind: 'new' as const, name: 'feature/session-1', startPoint: 'main' },
      },
      workspaceFolderRevision: workspaceFolders.revision,
      workspaceFolderDigest: acceptedWorkspaceFolderDigest(workspaceFolders),
    }
    const authority = nodeWorktreeProvisioningAuthoritySchema.parse({
      ...accepted,
      acceptedTargetDigest: acceptedNodeWorktreeTargetDigest(accepted),
    })
    expect(authority.kind).toBe('launch-target')
    expect(
      nodeWorktreeProvisioningAuthoritySchema.safeParse({ ...authority, admission: { kind: 'allow' } }).success,
    ).toBe(false)
    const nextFolderSnapshot = { ...workspaceFolders, revision: 5 }
    const nextRunAuthority = nodeWorktreeProvisioningAuthoritySchema.parse({
      ...authority,
      runId: 'run-2',
      workspaceFolderRevision: nextFolderSnapshot.revision,
      workspaceFolderDigest: acceptedWorkspaceFolderDigest(nextFolderSnapshot),
      acceptedTargetDigest: acceptedNodeWorktreeTargetDigest({
        ...authority,
        workspaceFolderRevision: nextFolderSnapshot.revision,
        workspaceFolderDigest: acceptedWorkspaceFolderDigest(nextFolderSnapshot),
      }),
    })
    expect(nextRunAuthority.acceptedTargetDigest).toBe(authority.acceptedTargetDigest)
    expect(nextRunAuthority.workspaceFolderRevision).toBe(5)
    expect(
      nodeWorktreeProvisioningAuthoritySchema.safeParse({
        ...authority,
        selection: { mode: 'isolated-worktree', branch: { kind: 'existing', name: 'main' } },
      }).success,
    ).toBe(false)
    expect(
      nodeWorktreeProvisioningAuthoritySchema.safeParse({
        ...authority,
        selection: { mode: 'shared-current' },
      }).success,
    ).toBe(false)
    expect(
      nodeWorktreeProvisioningAuthoritySchema.safeParse({
        ...authority,
        selection: { mode: 'shared-branch', branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(40) } },
      }).success,
    ).toBe(false)
    const storedOperation = {
      operationId: `${authority.runId}:worktree-create`,
      argumentsDigest: 'a'.repeat(64),
      kind: 'git' as const,
      target: { rootId: 'engine', path: '.', nodePath: 'D:/repo' },
      authority,
      receipt: { state: 'accepted' as const, acceptedAt: 1 },
      versions: null,
    }
    expect(nodeStoredOperationSchema.safeParse(storedOperation).success).toBe(true)
    expect(nodeStoredOperationSchema.safeParse({ ...storedOperation, kind: 'exec' }).success).toBe(false)
    const auditEntry = {
      operationId: storedOperation.operationId,
      source: 'launch-target' as const,
      sessionId: authority.sessionId,
      runId: authority.runId,
      workspaceId: authority.workspaceId,
      nodeId: authority.nodeId,
      targetRevision: authority.targetRevision,
      acceptedTargetDigest: authority.acceptedTargetDigest,
      workspaceFolderRevision: authority.workspaceFolderRevision,
      workspaceFolderDigest: authority.workspaceFolderDigest,
      rootId: 'engine',
      rootPath: 'D:/repo',
      tool: 'git.worktree',
      argumentsDigest: storedOperation.argumentsDigest,
      decision: 'allow' as const,
      backend: 'bwrap' as const,
      code: 0,
    }
    expect(nodeLaunchTargetAuditEntrySchema.safeParse({ seq: 1, time: 1, ...auditEntry }).success).toBe(true)
    expect(nodeStateMethods['audit.append'].input.safeParse(auditEntry).success).toBe(true)
  })
})
