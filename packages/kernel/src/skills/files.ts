import { constants } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'

export const SKILL_LIMITS = Object.freeze({
  entries: 4_096,
  skills: 1_024,
  depth: 5,
  metadataBytes: 16_384,
  fileBytes: 262_144,
  pageCharacters: 24_000,
  files: 100,
  resourcePathCharacters: 8_000,
  concurrency: 4,
  cachedWorkspaces: 16,
  cacheMilliseconds: 2_000,
})

export function checkSkillSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new HbarError('CANCELLED', 'Skill operation was cancelled')
}
export function withinSkillRoot(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}
export function skillFileSegments(path: string): string[] {
  const segments = path.split(/[\\/]/)
  if (
    !path ||
    path.length > 4_000 ||
    isAbsolute(path) ||
    segments.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        part.startsWith('.') ||
        part === 'node_modules' ||
        part.includes(':') ||
        [...part].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
    )
  )
    throw new HbarError('FORBIDDEN', 'Skill resources must use a contained relative path')
  return segments
}
export async function canonicalSkillRoot(path: string, boundary?: string): Promise<string | null> {
  assertLocalWorkspace(path)
  if (boundary !== undefined) assertLocalWorkspace(boundary)
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isDirectory()) return null
    const canonical = await realpath(path)
    if (boundary && !withinSkillRoot(boundary, canonical)) return null
    return canonical
  } catch (error) {
    if (fsCode(error) === 'ENOENT') return null
    throw new HbarError('SKILL_DISCOVERY_FAILED', 'Skill root cannot be read')
  }
}
function fsCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

/** Never resolve model-supplied absolute paths or follow resource symlinks. */
export async function readSkillText(
  directory: string,
  path: string,
  signal?: AbortSignal,
  prefixBytes?: number,
): Promise<string> {
  checkSkillSignal(signal)
  assertLocalWorkspace(directory)
  const segments = skillFileSegments(path)
  let target = directory
  for (const part of segments) {
    target = join(target, part)
    const info = await lstat(target)
    if (info.isSymbolicLink()) throw new HbarError('FORBIDDEN', 'Skill resource links are not readable')
  }
  const canonicalDirectory = await realpath(directory)
  if (canonicalDirectory !== resolve(directory) || (await lstat(directory)).isSymbolicLink())
    throw new HbarError('FORBIDDEN', 'Skill directory changed after discovery')
  if (!withinSkillRoot(canonicalDirectory, await realpath(target)))
    throw new HbarError('FORBIDDEN', 'Skill resource escaped its directory')
  const before = await lstat(target)
  if (!before.isFile()) throw new HbarError('UNSUPPORTED_TYPE', 'Skill resource is not a regular text file')
  if (!prefixBytes && before.size > SKILL_LIMITS.fileBytes)
    throw new HbarError('SKILL_FILE_TOO_LARGE', 'Skill resource exceeds the readable size limit')
  const handle = await open(target, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW))
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino)
      throw new HbarError('SKILL_CHANGED', 'Skill resource changed while opening')
    const limit = prefixBytes ?? SKILL_LIMITS.fileBytes
    const bytes = Buffer.alloc(Math.min(opened.size, limit) + (prefixBytes ? 0 : 1))
    let length = 0
    while (length < bytes.length) {
      checkSkillSignal(signal)
      const result = await handle.read(bytes, length, bytes.length - length, length)
      if (!result.bytesRead) break
      length += result.bytesRead
    }
    if (!prefixBytes && length > limit)
      throw new HbarError('SKILL_FILE_TOO_LARGE', 'Skill resource grew beyond the size limit')
    const after = await lstat(target)
    if (
      after.isSymbolicLink() ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.mtimeMs !== opened.mtimeMs ||
      after.size !== opened.size ||
      (await realpath(directory)) !== canonicalDirectory ||
      !withinSkillRoot(canonicalDirectory, await realpath(target))
    )
      throw new HbarError('SKILL_CHANGED', 'Skill resource changed while reading')
    checkSkillSignal(signal)
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: !prefixBytes }).decode(bytes.subarray(0, length))
    } catch {
      throw new HbarError('UNSUPPORTED_TYPE', 'Skill resources must contain UTF-8 text')
    }
    if (text.includes('\u0000'))
      throw new HbarError('UNSUPPORTED_TYPE', 'Binary skill resources cannot be read as text')
    return text
  } finally {
    await handle.close()
  }
}

export async function skillDirectoryEntries(path: string, remaining: number, signal?: AbortSignal) {
  assertLocalWorkspace(path)
  const entries = []
  const directory = await opendir(path)
  try {
    for await (const entry of directory) {
      checkSkillSignal(signal)
      entries.push(entry)
      if (entries.length >= remaining) break
    }
  } finally {
    await directory.close().catch(() => {})
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

export async function skillResourceFiles(directory: string, signal?: AbortSignal) {
  assertLocalWorkspace(directory)
  const files: string[] = []
  let scanned = 0
  let pathCharacters = 0
  let truncated = false
  async function visit(path: string, depth: number): Promise<void> {
    if (depth > SKILL_LIMITS.depth || scanned >= SKILL_LIMITS.entries || files.length >= SKILL_LIMITS.files) {
      truncated = true
      return
    }
    if ((await canonicalSkillRoot(path, directory)) !== resolve(path))
      throw new HbarError('FORBIDDEN', 'Skill resource directory changed after discovery')
    const entries = await skillDirectoryEntries(path, SKILL_LIMITS.entries - scanned, signal)
    if ((await canonicalSkillRoot(path, directory)) !== resolve(path))
      throw new HbarError('FORBIDDEN', 'Skill resource directory changed while scanning')
    scanned += entries.length
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
      const child = join(path, entry.name)
      if (entry.isDirectory()) await visit(child, depth + 1)
      else if (entry.isFile()) {
        const resource = relative(directory, child).split(sep).join('/')
        if (pathCharacters + resource.length > SKILL_LIMITS.resourcePathCharacters) {
          truncated = true
          break
        }
        files.push(resource)
        pathCharacters += resource.length
      }
      if (truncated || files.length >= SKILL_LIMITS.files) {
        truncated = true
        break
      }
    }
  }
  await visit(resolve(directory), 0)
  return { files, truncated }
}
