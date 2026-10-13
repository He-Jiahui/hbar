import { z } from 'zod'
import { sha256Hex } from './sha256'
import { sessionLaunchSelectionSchema, type SessionLaunchSelection } from './session-launch-selection'
import { nodeIdSchema } from './node-address'
import { workspaceFolderSnapshotSchema, type WorkspaceFolderSnapshot } from './commands/workspace-folders'

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sha256(value: unknown): string {
  return sha256Hex(canonicalJson(value))
}

export function acceptedWorkspaceFolderDigest(snapshot: WorkspaceFolderSnapshot): string {
  return sha256(workspaceFolderSnapshotSchema.parse(snapshot))
}

export interface AcceptedNodeWorktreeTargetDigestInput {
  readonly workspaceId: string
  readonly sessionId: string
  readonly targetRevision: number
  readonly selection: SessionLaunchSelection
  readonly workspaceFolderRevision: number
  readonly workspaceFolderDigest: string
}

/** Stable checkout identity. The per-Run folder snapshot is committed separately below. */
export function acceptedNodeWorktreeTargetDigest(input: AcceptedNodeWorktreeTargetDigestInput): string {
  return sha256({
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    targetRevision: input.targetRevision,
    selection: sessionLaunchSelectionSchema.parse(input.selection),
  })
}

/** Infrastructure-only authority. It is intentionally not a NodeCallAuthority. */
export const nodeWorktreeProvisioningAuthoritySchema = z
  .strictObject({
    kind: z.literal('launch-target'),
    workspaceId: z.string().min(1).max(160),
    sessionId: z.string().min(1).max(160),
    runId: z.string().min(1).max(160),
    nodeId: nodeIdSchema,
    targetRevision: z.number().int().nonnegative().safe(),
    selection: sessionLaunchSelectionSchema,
    acceptedTargetDigest: z.string().regex(/^[a-f0-9]{64}$/),
    workspaceFolderRevision: z.number().int().nonnegative().safe(),
    workspaceFolderDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((authority, context) => {
    if (authority.selection.mode !== 'isolated-worktree')
      context.addIssue({
        code: 'custom',
        path: ['selection'],
        message: 'Only an explicitly selected isolated worktree can be provisioned',
      })
    const expected = acceptedNodeWorktreeTargetDigest(authority)
    if (authority.acceptedTargetDigest !== expected)
      context.addIssue({
        code: 'custom',
        path: ['acceptedTargetDigest'],
        message: 'Accepted launch-target digest differs',
      })
  })

export type NodeWorktreeProvisioningAuthority = z.infer<typeof nodeWorktreeProvisioningAuthoritySchema>
