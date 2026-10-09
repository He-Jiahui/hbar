import { lstat, opendir } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'
import { HbarError } from '@hbar/contracts'
import type {
  ChatDatabaseCacheCategory,
  ChatDatabaseDiskUsage,
  ChatDatabaseScope,
} from '@hbar/contracts/commands/chat-database'
import type { PathLayout } from './path-layout'

export interface ChatDatabaseFileReferences {
  artifacts(after: string | null): Promise<{ ids: string[]; next: string | null }>
  logs(after: string | null): Promise<{ paths: string[]; next: string | null }>
}
export interface ChatDatabaseFilesPort {
  scan(
    scope: ChatDatabaseScope,
    references: ChatDatabaseFileReferences,
    signal: AbortSignal,
    onProgress?: (usage: ChatDatabaseDiskUsage) => void,
  ): Promise<ChatDatabaseDiskUsage>
}
export function emptyChatDatabaseDiskUsage(): ChatDatabaseDiskUsage {
  return {
    databaseBytes: 0,
    walBytes: 0,
    shmBytes: 0,
    logBytes: 0,
    attachmentBytes: 0,
    cacheBytes: 0,
    scopedLogBytes: 0,
    scopedAttachmentBytes: 0,
    cacheCategories: [],
    complete: false,
    issues: [],
  }
}
function errno(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'FILE_SCAN_FAILED'
}

/** Streaming async I/O bounds memory/handles and never traverses links or junctions. */
export function createChatDatabaseFileScanner(layout: PathLayout): ChatDatabaseFilesPort {
  return {
    async scan(scope, references, signal, onProgress) {
      const usage = emptyChatDatabaseDiskUsage()
      let failed = false
      let entries = 0
      const totals: Record<ChatDatabaseCacheCategory, number> = {
        models: 0,
        pluginBuild: 0,
        pluginExtract: 0,
        markdown: 0,
        mermaid: 0,
        attachments: 0,
        tmp: 0,
        protected: 0,
      }
      const categoryPaths = Object.entries(layout.cache)
        .filter(([key]) => key !== 'locks')
        .map(([id, path]) => ({ id, name: basename(path) }))
      const categories = () =>
        Object.entries(totals).map(([id, bytes]) => ({
          id: id as ChatDatabaseCacheCategory,
          bytes,
          clearable: id !== 'protected',
        }))
      const issue = (category: ChatDatabaseDiskUsage['issues'][number]['category'], code: string) => {
        failed = true
        if (usage.issues.length < 32 && !usage.issues.some((item) => item.category === category && item.code === code))
          usage.issues.push({ category, code })
      }
      const progress = () => {
        usage.cacheCategories = categories()
        onProgress?.({ ...usage, cacheCategories: [...usage.cacheCategories], issues: [...usage.issues] })
      }
      async function fileBytes(
        path: string,
        category: ChatDatabaseDiskUsage['issues'][number]['category'],
        missingAllowed = true,
        managedRoot?: string,
      ): Promise<number> {
        signal.throwIfAborted()
        try {
          if (managedRoot) {
            const suffix = relative(managedRoot, path)
            const parts = suffix.split(/[\\/]/)
            if (isAbsolute(suffix) || parts.some((part) => part === '..' || part === '.')) {
              issue(category, 'PATH_REDIRECTED')
              return 0
            }
            let current = managedRoot
            for (const part of ['', ...parts.slice(0, -1)]) {
              signal.throwIfAborted()
              if (part) current = join(current, part)
              const parent = await lstat(current)
              if (parent.isSymbolicLink() || !parent.isDirectory()) {
                issue(category, 'PATH_REDIRECTED')
                return 0
              }
            }
          }
          const info = await lstat(path)
          if (info.isSymbolicLink() || !info.isFile()) {
            issue(category, 'PATH_REDIRECTED')
            return 0
          }
          return info.size
        } catch (reason) {
          if (errno(reason) !== 'ENOENT' || !missingAllowed) issue(category, errno(reason))
          return 0
        }
      }
      async function* files(
        root: string,
        category: ChatDatabaseDiskUsage['issues'][number]['category'],
        depth = 0,
      ): AsyncGenerator<{ path: string; size: number }> {
        signal.throwIfAborted()
        if (depth > 64) {
          issue(category, 'DIRECTORY_DEPTH_EXCEEDED')
          return
        }
        try {
          const info = await lstat(root)
          if (info.isSymbolicLink()) {
            issue(category, 'PATH_REDIRECTED')
            return
          }
          if (!info.isDirectory()) {
            issue(category, 'INVALID_DIRECTORY')
            return
          }
          const directory = await opendir(root)
          for await (const entry of directory) {
            signal.throwIfAborted()
            const path = join(root, entry.name)
            const child = await lstat(path)
            if (child.isSymbolicLink()) continue
            if (child.isDirectory()) yield* files(path, category, depth + 1)
            else if (child.isFile()) yield { path, size: child.size }
            if (++entries % 128 === 0) progress()
          }
        } catch (reason) {
          signal.throwIfAborted()
          if (errno(reason) !== 'ENOENT') issue(category, errno(reason))
        }
      }
      usage.databaseBytes = await fileBytes(layout.database, 'database', false)
      usage.walBytes = await fileBytes(`${layout.database}-wal`, 'database')
      usage.shmBytes = await fileBytes(`${layout.database}-shm`, 'database')
      for await (const file of files(layout.sessions, 'logs')) {
        usage.logBytes += file.size
        if (scope.kind === 'global') usage.scopedLogBytes += file.size
      }
      if (scope.kind !== 'global') {
        let after: string | null = null
        do {
          const page = await references.logs(after)
          for (const path of page.paths)
            usage.scopedLogBytes += await fileBytes(join(layout.sessions, path), 'logs', false, layout.sessions)
          if (page.next !== null && page.next === after)
            throw new HbarError('INVALID_CURSOR', 'Log cursor did not advance')
          after = page.next
        } while (after !== null)
      }
      for await (const file of files(layout.artifacts, 'attachments')) usage.attachmentBytes += file.size
      if (scope.kind === 'global') usage.scopedAttachmentBytes = usage.attachmentBytes
      else {
        let after: string | null = null
        do {
          signal.throwIfAborted()
          const page = await references.artifacts(after)
          for (const id of page.ids) {
            if (!/^[a-f0-9]{64}$/.test(id)) throw new HbarError('INVALID_OUTPUT', 'Invalid attachment identity')
            usage.scopedAttachmentBytes += await fileBytes(
              join(layout.artifacts, id),
              'attachments',
              false,
              layout.artifacts,
            )
          }
          if (page.next !== null && page.next === after)
            throw new HbarError('INVALID_CURSOR', 'Attachment cursor did not advance')
          after = page.next
        } while (after !== null)
      }
      for await (const file of files(layout.cacheRoot, 'cache')) {
        const name = relative(layout.cacheRoot, file.path).replaceAll('\\', '/').split('/')[0]
        const category = categoryPaths.find((item) => item.name === name)?.id
        const id = category && Object.hasOwn(totals, category) ? (category as ChatDatabaseCacheCategory) : 'protected'
        totals[id] += file.size
        usage.cacheBytes += file.size
      }
      usage.cacheCategories = categories()
      usage.complete = !failed
      progress()
      return usage
    },
  }
}
