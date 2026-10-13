import { z } from 'zod'
import { nodeIdSchema, nodeRootIdSchema } from './node-address'

const mountBindingSchema = z.strictObject({
  rootId: nodeRootIdSchema,
  /** B compares this against its own current registration before every use. */
  expectedRoot: z.string().min(1).max(4_000),
  alias: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u),
})

/** Pinned per-Run projection of a durable same-node workspace-folder revision. */
export const nodeWorkspaceMountManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    workspaceId: z.string().min(1).max(160),
    revision: z.number().int().nonnegative().safe(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    nodeId: nodeIdSchema,
    primaryRootId: nodeRootIdSchema,
    roots: z.array(mountBindingSchema).min(1).max(32),
  })
  .superRefine((manifest, context) => {
    for (const field of ['rootId', 'alias'] as const) {
      const values = manifest.roots.map((root) => root[field].toLocaleLowerCase())
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', path: ['roots'], message: `Mounted ${field} values must be unique` })
    }
    if (!manifest.roots.some((root) => root.rootId === manifest.primaryRootId))
      context.addIssue({ code: 'custom', path: ['primaryRootId'], message: 'Primary root must be mounted' })
  })

export type NodeWorkspaceMountManifest = z.infer<typeof nodeWorkspaceMountManifestSchema>
