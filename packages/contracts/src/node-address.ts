import { z } from 'zod'

export const nodeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
export const nodeRootIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
/** This is a protocol path, never a shell argument or an OS absolute path. */
export const nodeRelativePathSchema = z
  .string()
  .max(4_000)
  .refine(
    (value) =>
      !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
      !/^([\\/]|[a-z]:)/i.test(value) &&
      !value.split(/[\\/]+/).includes('..') &&
      !value.includes(':'),
    'Node paths must remain relative to a shared root',
  )
export const workspaceLocationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('local') }),
  z.strictObject({
    kind: z.literal('node'),
    nodeId: nodeIdSchema,
    rootId: nodeRootIdSchema,
    nodePath: z.string().min(1).max(4_000),
  }),
])
export type WorkspaceLocation = z.infer<typeof workspaceLocationSchema>
export type NodeWorkspaceLocation = Extract<WorkspaceLocation, { kind: 'node' }>

export function nodeWorkspaceLocator(nodeId: string, rootId: string): string {
  return `hbar-node://${nodeIdSchema.parse(nodeId)}/${nodeRootIdSchema.parse(rootId)}`
}
export function parseNodeWorkspaceLocator(path: string): { nodeId: string; rootId: string } | null {
  if (!path.toLowerCase().startsWith('hbar-node:')) return null
  const match = /^hbar-node:\/\/([^/]+)\/([^/]+)$/.exec(path)
  if (!match) throw new Error('Invalid remote workspace locator')
  return { nodeId: nodeIdSchema.parse(match[1]), rootId: nodeRootIdSchema.parse(match[2]) }
}
/** Guard before resolve(), stat(), spawn(), or another local filesystem operation. */
export function isNodeWorkspacePath(path: string): boolean {
  return path.toLowerCase().startsWith('hbar-node:')
}

export function workspaceLocationOf(workspace: {
  path: string
  location?: WorkspaceLocation | undefined
}): WorkspaceLocation {
  const location = workspace.location ?? { kind: 'local' }
  const address = parseNodeWorkspaceLocator(workspace.path)
  if (location.kind === 'node') {
    if (!address || address.nodeId !== location.nodeId || address.rootId !== location.rootId)
      throw new Error('Workspace location and locator disagree')
  } else if (address) throw new Error('A node locator requires a node workspace location')
  return location
}
