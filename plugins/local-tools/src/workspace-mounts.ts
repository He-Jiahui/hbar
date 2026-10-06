import { isAbsolute } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type { WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import type {
  ParsedWorkspaceFindInput,
  ParsedWorkspaceSearchInput,
  WorkspaceSearchResult,
} from '@hbar/contracts/workspace-query'

export interface WorkspaceMount {
  readonly root: string
  readonly folders: readonly { readonly alias: string; readonly path: string }[]
}
/** Host-owned, verified immutable mappings. No client-supplied physical roots. */
export interface WorkspaceMountAccess {
  get(root: string): WorkspaceMount | undefined
  verify(mount: WorkspaceMount, signal?: AbortSignal): Promise<void>
}
export function mountedPath(mount: WorkspaceMount, requested: string) {
  const clean = requested.replaceAll('\\', '/')
  if (isAbsolute(requested) || /^[a-z]:/i.test(clean) || clean.startsWith('/') || clean.split('/').includes('..'))
    throw new HbarError('PATH_DENIED', 'Virtual workspace paths must remain inside their mounted folder')
  const segments = clean.split('/').filter((part) => part && part !== '.')
  const named = mount.folders.find((folder) => folder.alias.toLowerCase() === segments[0]?.toLowerCase())
  const folder = named ?? mount.folders[0]
  if (!folder) throw new HbarError('INVALID_STATE', 'Virtual workspace has no folders')
  return { folder, path: (named ? segments.slice(1) : segments).join('/') || '.' }
}

/** Queries fan out serially under one deadline, and retain each mount's logical path. */
export function mountedWorkspaceQuery(
  inner: WorkspaceQueryProvider,
  access: WorkspaceMountAccess,
): WorkspaceQueryProvider {
  const scopes = (mount: WorkspaceMount, path: string) =>
    path === '.' ? mount.folders.map((folder) => ({ folder, path: '.' })) : [mountedPath(mount, path)]
  const options = <Input extends ParsedWorkspaceFindInput | ParsedWorkspaceSearchInput>(
    input: Input,
    alias: string,
    mount: WorkspaceMount,
  ) => {
    const adjust = (patterns: readonly string[]) =>
      patterns.flatMap((pattern) => {
        if (pattern.startsWith(`${alias}/`)) return [pattern.slice(alias.length + 1)]
        if (mount.folders.some((folder) => pattern.startsWith(`${folder.alias}/`))) return []
        return [pattern]
      })
    const include = adjust(input.include)
    return input.include.length && !include.length ? null : { ...input, include, exclude: adjust(input.exclude) }
  }
  return {
    async find(workspace, input, signal) {
      const mount = access.get(workspace)
      if (!mount) return inner.find(workspace, input, signal)
      await access.verify(mount, signal)
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      const paths: string[] = []
      let filesChecked = 0
      let truncated = false
      const targets = scopes(mount, input.path)
      for (const [index, target] of targets.entries()) {
        deadline.throwIfAborted()
        const adjusted = options(input, target.folder.alias, mount)
        if (!adjusted) continue
        const result = await inner.find(
          target.folder.path,
          { ...adjusted, path: target.path, limit: input.limit - paths.length },
          deadline,
        )
        paths.push(...result.paths.map((path) => `${target.folder.alias}/${path}`))
        filesChecked += result.filesChecked
        truncated ||= result.truncated
        if (paths.length >= input.limit) {
          truncated ||= index < targets.length - 1
          break
        }
      }
      return { paths, filesChecked, truncated }
    },
    async search(workspace, input, signal) {
      const mount = access.get(workspace)
      if (!mount) return inner.search(workspace, input, signal)
      await access.verify(mount, signal)
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      const combined: WorkspaceSearchResult = {
        matches: [],
        filesChecked: 0,
        truncated: false,
        cache: { contentHits: 0, contentMisses: 0, matchHits: 0, matchMisses: 0, bytesRead: 0 },
      }
      const targets = scopes(mount, input.path)
      for (const [index, target] of targets.entries()) {
        deadline.throwIfAborted()
        const adjusted = options(input, target.folder.alias, mount)
        if (!adjusted) continue
        const result = await inner.search(
          target.folder.path,
          { ...adjusted, path: target.path, limit: input.limit - combined.matches.length },
          deadline,
        )
        combined.matches.push(
          ...result.matches.map((match) => ({ ...match, path: `${target.folder.alias}/${match.path}` })),
        )
        combined.filesChecked += result.filesChecked
        combined.truncated ||= result.truncated
        for (const key of Object.keys(combined.cache) as (keyof WorkspaceSearchResult['cache'])[])
          combined.cache[key] += result.cache[key]
        if (combined.matches.length >= input.limit) {
          combined.truncated ||= index < targets.length - 1
          break
        }
      }
      return combined
    },
    async readRange(workspace, path, startLine, lineCount, signal) {
      const mount = access.get(workspace)
      if (!mount) return inner.readRange(workspace, path, startLine, lineCount, signal)
      await access.verify(mount, signal)
      const target = mountedPath(mount, path)
      return inner.readRange(target.folder.path, target.path, startLine, lineCount, signal)
    },
    async invalidate(workspace, path) {
      const mount = access.get(workspace)
      if (!mount) return inner.invalidate(workspace, path)
      const target = mountedPath(mount, path)
      return inner.invalidate(target.folder.path, target.path)
    },
    dispose: () => inner.dispose(),
  }
}
