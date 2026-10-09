import { lstatSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { BigIntStats } from 'node:fs'
import { HbarError } from '@hbar/contracts'
import type { ChatDatabaseResource } from '@hbar/contracts/commands/chat-database'

function parts(root: string, target: string): string[] {
  const suffix = relative(resolve(root), resolve(target))
  if (isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..\\') || suffix.startsWith('../'))
    throw new HbarError('PATH_REDIRECTED', 'Resource path leaves its managed root')
  return suffix.split(/[\\/]/).filter(Boolean)
}
export function managedResourcePath(root: string, path: string): string {
  if (
    isAbsolute(path) ||
    path.includes('\0') ||
    path.includes(':') ||
    path.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')
  )
    throw new HbarError('PATH_REDIRECTED', 'Resource path is invalid')
  const target = join(root, path)
  parts(root, target)
  return target
}
export function verifyResourcePathSync(root: string, target: string, missingAllowed = false): void {
  let path = resolve(root)
  const segments = ['', ...parts(root, target)]
  for (let index = 0; index < segments.length; index++) {
    if (segments[index]) path = join(path, segments[index]!)
    try {
      const info = lstatSync(path)
      if (info.isSymbolicLink() || (index < segments.length - 1 && !info.isDirectory()))
        throw new HbarError('PATH_REDIRECTED', 'Resource path is a link or junction')
    } catch (reason) {
      if (!missingAllowed || !isMissingResource(reason)) throw reason
    }
  }
}
export async function verifyResourcePath(root: string, target: string): Promise<void> {
  let path = resolve(root)
  const segments = ['', ...parts(root, target)]
  for (let index = 0; index < segments.length; index++) {
    if (segments[index]) path = join(path, segments[index]!)
    const info = await lstat(path)
    if (info.isSymbolicLink() || (index < segments.length - 1 && !info.isDirectory()))
      throw new HbarError('PATH_REDIRECTED', 'Resource path is a link or junction')
  }
}
export function resourceIdentity(path: string, info: BigIntStats): ChatDatabaseResource {
  const size = Number(info.size)
  if (!Number.isSafeInteger(size) || size < 0)
    throw new HbarError('FILE_LIMIT', 'Resource size exceeds the supported byte range')
  return {
    path,
    device: info.dev.toString(),
    inode: info.ino.toString(),
    size,
    modifiedNs: info.mtimeNs.toString(),
    changedNs: info.ctimeNs.toString(),
  }
}
export function sameResource(left: ChatDatabaseResource, right: ChatDatabaseResource, moved = false): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedNs === right.modifiedNs &&
    (moved || left.changedNs === right.changedNs)
  )
}
export const isMissingResource = (reason: unknown): boolean =>
  reason instanceof Error && 'code' in reason && reason.code === 'ENOENT'
