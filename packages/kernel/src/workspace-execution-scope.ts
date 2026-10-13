import { AsyncLocalStorage } from 'node:async_hooks'
import { posix, win32 } from 'node:path'
import { HbarError, type Workspace } from '@hbar/contracts'
import { nodeRelativePathSchema } from '@hbar/contracts/node'
import { isPathWithin } from '@hbar/contracts/path-containment'
import type { ExecutionProvider, WorkspaceExecutionScope } from '@hbar/plugin-sdk'
import type { SandboxPathPort } from '@hbar/sandbox'
export type { WorkspaceExecutionScope } from '@hbar/plugin-sdk'

export interface RemoteSandboxPathPort extends SandboxPathPort {
  canonicalMany(paths: readonly string[], signal?: AbortSignal): Promise<readonly string[]>
}

export class WorkspaceExecutionScopes {
  private readonly storage = new AsyncLocalStorage<WorkspaceExecutionScope>()

  current(): WorkspaceExecutionScope | undefined {
    return this.storage.getStore()
  }

  run<T>(scope: WorkspaceExecutionScope, operation: () => T): T {
    return this.storage.run(scope, operation)
  }
}

/** Build a sandbox path port from canonical metadata supplied by the execution owner. */
export async function remoteSandboxPathPort(
  execution: ExecutionProvider,
  workspace: Pick<Workspace, 'path' | 'location'>,
  signal: AbortSignal,
): Promise<{ readonly root: string; readonly port: RemoteSandboxPathPort }> {
  const canonicalize = execution.canonicalize
  if (workspace.location?.kind !== 'node' || !canonicalize)
    throw new HbarError('WORKSPACE_CANONICALIZATION_UNAVAILABLE', 'Workspace owner path metadata is unavailable')

  const metadata = await canonicalize.call(execution, workspace.path, ['.'], signal)
  if (metadata.paths.length !== 1)
    throw new HbarError('NODE_INVALID_RESPONSE', 'Workspace node returned the wrong number of canonical paths')
  if (metadata.root !== workspace.location.nodePath)
    throw new HbarError('NODE_ROOT_CHANGED', 'Workspace node root changed; select the workspace again')
  const paths = metadata.dialect === 'win32' ? win32 : posix
  if (metadata.paths[0] !== metadata.root)
    throw new HbarError(
      'NODE_INVALID_RESPONSE',
      'Workspace node returned a canonical root path that does not match its binding',
    )
  const separator = metadata.dialect === 'win32' ? '\\' : '/'
  const isWithinExactRoot = (path: string) => isPathWithin(metadata.root, path, { separator, caseInsensitive: false })
  const relativeToRoot = (path: string): string => {
    const normalizedRoot = paths.normalize(metadata.root)
    const normalizedPath = paths.normalize(path)
    if (
      paths.isAbsolute(normalizedPath) &&
      !isPathWithin(normalizedRoot, normalizedPath, {
        separator,
        caseInsensitive: false,
      })
    )
      throw new HbarError('PATH_DENIED', 'Workspace node path leaves its exact shared root')
    const relative = paths.isAbsolute(normalizedPath) ? paths.relative(normalizedRoot, normalizedPath) : normalizedPath
    const parsed = nodeRelativePathSchema.safeParse(relative || '.')
    if (!parsed.success) throw new HbarError('PATH_DENIED', 'Workspace node path leaves its shared root')
    return parsed.data
  }
  const canonicalMany = async (
    absolutePaths: readonly string[],
    requestSignal = signal,
  ): Promise<readonly string[]> => {
    const relatives = absolutePaths.map(relativeToRoot)
    const canonicalPaths: string[] = []
    for (let offset = 0; offset < relatives.length; offset += 256) {
      requestSignal.throwIfAborted()
      const batch = relatives.slice(offset, offset + 256)
      const result = await canonicalize.call(execution, workspace.path, batch, requestSignal)
      if (
        result.root !== metadata.root ||
        result.dialect !== metadata.dialect ||
        result.caseInsensitive !== metadata.caseInsensitive
      )
        throw new HbarError('NODE_ROOT_CHANGED', 'Workspace node path metadata changed during sandbox admission')
      if (result.paths.length !== batch.length)
        throw new HbarError('NODE_INVALID_RESPONSE', 'Workspace node returned the wrong number of canonical paths')
      for (const canonicalPath of result.paths) {
        if (!paths.isAbsolute(canonicalPath) || !isWithinExactRoot(canonicalPath))
          throw new HbarError(
            'NODE_INVALID_RESPONSE',
            'Workspace node canonicalized a path outside its exact bound root',
          )
        canonicalPaths.push(canonicalPath)
      }
    }
    return canonicalPaths
  }
  const port: RemoteSandboxPathPort = {
    canonicalMany,
    canonical: async (path) => {
      const [canonical] = await canonicalMany([path])
      if (!canonical) throw new HbarError('NODE_INVALID_RESPONSE', 'Workspace node omitted a canonical path')
      return canonical
    },
    resolve: (...parts) => paths.resolve(metadata.root, ...parts),
    relative: (from, to) => paths.relative(from, to),
    isAbsolute: (path) => paths.isAbsolute(path),
    separator: metadata.dialect === 'win32' ? '\\' : '/',
    caseInsensitive: metadata.caseInsensitive,
  }
  return { root: metadata.root, port }
}
