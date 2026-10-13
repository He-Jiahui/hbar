import { isAbsolute } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import type { WorkspaceQueryProvider } from '@hbar/plugin-sdk'
import type {
  ParsedWorkspaceFindInput,
  ParsedWorkspaceSearchInput,
  WorkspaceSearchResult,
} from '@hbar/contracts/workspace-query'
import { compressSearchFolders, hiddenSearchFolders } from './search-pagination'

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
  assertLocalWorkspace(mount.root)
  for (const folder of mount.folders) assertLocalWorkspace(folder.path)
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
      assertLocalWorkspace(workspace)
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
      assertLocalWorkspace(workspace)
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
      const targets = scopes(mount, input.path).flatMap((target) => {
        const adjusted = options(input, target.folder.alias, mount)
        return adjusted ? [{ ...target, adjusted }] : []
      })
      let skipped = input.from_index
      let totalMatches = 0
      let scanComplete = true
      let cacheHit = targets.length > 0
      let cacheStored = targets.length > 0
      let cacheLimited = false
      const folders: NonNullable<WorkspaceSearchResult['pagination']>['folders'] = []
      let otherMatches = 0
      let foldersCompressed = false
      let pageClosed = false
      for (const [index, target] of targets.entries()) {
        deadline.throwIfAborted()
        const countOnly = pageClosed || combined.matches.length >= input.limit
        const result = await inner.search(
          target.folder.path,
          {
            ...target.adjusted,
            path: target.path,
            from_index: skipped,
            limit: countOnly ? 1 : input.limit - combined.matches.length,
          },
          deadline,
        )
        const page = result.pagination
        if (!page && (input.from_index || input.fully_scan))
          throw new HbarError(
            'UNSUPPORTED_TYPE',
            'Mounted workspace search requires pagination-capable query providers',
          )
        if (!countOnly)
          combined.matches.push(
            ...result.matches.map((match) => ({ ...match, path: `${target.folder.alias}/${match.path}` })),
          )
        combined.filesChecked += result.filesChecked
        combined.truncated ||= !countOnly && result.truncated
        for (const key of Object.keys(combined.cache) as (keyof WorkspaceSearchResult['cache'])[])
          combined.cache[key] += result.cache[key]
        totalMatches += page?.totalMatches ?? 0
        scanComplete &&= Boolean(page?.scanComplete)
        cacheHit &&= Boolean(page?.cacheHit)
        cacheStored &&= Boolean(page?.cacheStored)
        cacheLimited ||= Boolean(page?.cacheLimited)
        if (page?.scanComplete) {
          folders.push(
            ...page.folders.map((folder) => ({
              ...folder,
              path: folder.path === '.' ? target.folder.alias : `${target.folder.alias}/${folder.path}`,
            })),
          )
          if (countOnly)
            folders.push(
              ...hiddenSearchFolders(result.matches).map((folder) => ({
                ...folder,
                path: folder.path === '.' ? target.folder.alias : `${target.folder.alias}/${folder.path}`,
              })),
            )
          otherMatches += page.otherMatches
          foldersCompressed ||= page.foldersCompressed
        }
        skipped = Math.max(0, skipped - (page?.totalMatches ?? skipped))
        if (!countOnly && page?.nextIndex !== undefined) pageClosed = true
        // A byte-limited page must resume in this folder rather than skip to the next mount.
        if (!input.fully_scan && (result.truncated || combined.matches.length >= input.limit)) {
          if (index < targets.length - 1) scanComplete = false
          combined.truncated ||= !scanComplete
          break
        }
      }
      const nextIndex = input.from_index + combined.matches.length
      const remainingMatches = Math.max(0, totalMatches - nextIndex)
      const more = !scanComplete || remainingMatches > 0
      const summary = compressSearchFolders(folders, otherMatches)
      combined.truncated ||= more
      combined.pagination = {
        fromIndex: input.from_index,
        ...(more ? { nextIndex } : {}),
        scanComplete,
        ...(scanComplete ? { totalMatches, remainingMatches } : {}),
        cacheHit,
        cacheStored: scanComplete && cacheStored,
        cacheLimited,
        ...(scanComplete ? summary : { folders: [], otherMatches: 0, foldersCompressed: false }),
        foldersCompressed: scanComplete && (foldersCompressed || summary.foldersCompressed),
      }
      return combined
    },
    async readRange(workspace, path, startLine, lineCount, signal) {
      assertLocalWorkspace(workspace)
      const mount = access.get(workspace)
      if (!mount) return inner.readRange(workspace, path, startLine, lineCount, signal)
      await access.verify(mount, signal)
      const target = mountedPath(mount, path)
      return inner.readRange(target.folder.path, target.path, startLine, lineCount, signal)
    },
    async invalidate(workspace, path) {
      assertLocalWorkspace(workspace)
      const mount = access.get(workspace)
      if (!mount) return inner.invalidate(workspace, path)
      const target = mountedPath(mount, path)
      return inner.invalidate(target.folder.path, target.path)
    },
    dispose: () => inner.dispose(),
  }
}
