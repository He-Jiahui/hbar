import { z } from 'zod'
import { sandboxSnapshotRefSchema } from './sandbox'
import { nodeWorkspaceMountManifestSchema } from './node-workspace-mount-plan'

const entityId = z.string().min(1).max(160)

/** A pins completed admission to one durable tool call before dispatching to B. */
export const nodeAdmissionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('allow') }),
  z.strictObject({ kind: z.literal('approved'), approvalId: entityId }),
])

export const nodeCallAuthoritySchema = z.strictObject({
  sessionId: entityId,
  runId: entityId,
  callId: entityId,
  sandbox: sandboxSnapshotRefSchema.nullable(),
  admission: nodeAdmissionSchema,
  workspaceMounts: nodeWorkspaceMountManifestSchema.optional(),
  managedWorktree: z
    .strictObject({
      worktreeId: z.string().regex(/^[a-f0-9]{32}$/),
      targetRevision: z.number().int().nonnegative().safe(),
    })
    .optional(),
})

export type NodeCallAuthority = z.output<typeof nodeCallAuthoritySchema>
