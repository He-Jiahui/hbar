import { HbarError } from './index'
import { isNodeWorkspacePath, type WorkspaceLocation } from './node-address'

/** Call before local path resolution, filesystem access, native queries or process creation. */
export function assertLocalWorkspace(
  workspace: string | { readonly path: string; readonly location?: WorkspaceLocation | undefined },
): string {
  const path = typeof workspace === 'string' ? workspace : workspace.path
  if (isNodeWorkspacePath(path) || (typeof workspace !== 'string' && workspace.location?.kind === 'node'))
    throw new HbarError('WORKSPACE_REMOTE', 'Workspace belongs to a remote node; use its execution route')
  return path
}
