import { existsSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ChatDatabaseSkipReason } from '@hbar/contracts/commands/chat-database'
import { managedResourcePath, verifyResourcePathSync } from './chat-database-resource-paths'

export const CHAT_DATABASE_CACHE_CATEGORIES = new Set([
  'models',
  'plugin-build',
  'plugin-extract',
  'markdown',
  'mermaid',
  'attachments',
  'tmp',
])
const protectedName = /^(?:\.git|\.hbar-reclaims|locks?|workspace-sandboxes|disabled-branch-hooks)$/i
const contained = (root: string, target: string) => {
  const path = relative(resolve(root), resolve(target))
  return !isAbsolute(path) && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../')
}
/** Used both while previewing and immediately before a guarded cache removal. */
export function chatDatabaseCacheProtection(
  root: string,
  path: string,
  protectedRoots: readonly string[] = [],
): ChatDatabaseSkipReason | null {
  const segments = path.split(/[\\/]/)
  if (
    !CHAT_DATABASE_CACHE_CATEGORIES.has(segments[0] ?? '') ||
    segments.some((segment) => protectedName.test(segment) || /\.(?:lock|lck)$/i.test(segment))
  )
    return 'unknownCategory'
  const target = managedResourcePath(root, path)
  if (protectedRoots.some((protectedRoot) => contained(protectedRoot, target) || contained(target, protectedRoot)))
    return 'inUse'
  verifyResourcePathSync(root, target, true)
  let directory = dirname(target)
  while (contained(root, directory) && directory !== resolve(root)) {
    for (const marker of ['.git', '.lock', '.in-use', 'LOCK', 'lock', 'locks']) {
      const lock = join(directory, marker)
      if (existsSync(lock)) {
        if (lstatSync(lock).isSymbolicLink()) return 'redirected'
        return 'inUse'
      }
    }
    directory = dirname(directory)
  }
  return null
}
