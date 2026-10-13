import { z } from 'zod'
import { nodeWorkspaceLocator, parseNodeWorkspaceLocator } from './node-address'

function isNodeWorkspaceLocator(value: string): boolean {
  try {
    return parseNodeWorkspaceLocator(value) !== null
  } catch {
    return false
  }
}

/** Each mounted remote directory must be shared by B as its own registered root. */
export const nodeWorkspaceMountSchema = z.strictObject({
  id: z.string().min(1).max(160),
  alias: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u),
  path: z.string().min(1).max(160).refine(isNodeWorkspaceLocator),
})

/** A remote workspace can mount at most 32 folders, all on its owning node. */
export const nodeWorkspaceMountsSchema = z
  .array(nodeWorkspaceMountSchema)
  .min(1)
  .max(32)
  .superRefine((mounts, context) => {
    for (const field of ['id', 'alias'] as const) {
      const values = mounts.map((mount) => mount[field].toLocaleLowerCase())
      if (new Set(values).size !== values.length)
        context.addIssue({ code: 'custom', message: `Node workspace mount ${field} values must be unique` })
    }
  })

export type NodeWorkspaceMount = z.infer<typeof nodeWorkspaceMountSchema>
export type NodeWorkspaceMounts = z.infer<typeof nodeWorkspaceMountsSchema>

/** Build a stored folder path without ever accepting a caller-provided B filesystem path. */
export function nodeWorkspaceMountPath(nodeId: string, rootId: string): string {
  return nodeWorkspaceLocator(nodeId, rootId)
}
