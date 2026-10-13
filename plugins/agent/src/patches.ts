import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { HbarError, MAX_AGENT_PATCH_FILES } from '@hbar/contracts'
import type { AgentPatchFile, WorkflowScope } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'

const MAX_SCANNED_FILES = 4_096
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_BYTES = 64 * 1024 * 1024
const INTERNAL_DIRECTORIES = new Set(['.git', '.hbar-worktrees'])

export interface FileSnapshot {
  path: string
  sha256: string
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function safePath(root: string, path: string) {
  assertLocalWorkspace(root)
  const target = resolve(root, path)
  const relation = relative(root, target)
  if (
    relation === '..' ||
    relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(relation)
  )
    throw new HbarError('AGENT_PATCH_SCOPE', `Path escapes the workspace: ${path}`)
  return target
}

function portable(root: string, path: string) {
  return relative(root, path).replaceAll('\\', '/') || '.'
}

function ignored(path: string) {
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => INTERNAL_DIRECTORIES.has(segment))
}

async function status(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function collectScopeFiles(
  root: string,
  entries: readonly string[],
  limit = MAX_SCANNED_FILES,
): Promise<Map<string, FileSnapshot>> {
  assertLocalWorkspace(root)
  const files = new Map<string, FileSnapshot>()
  let bytes = 0
  const visit = async (absolute: string): Promise<void> => {
    const path = portable(root, absolute)
    if (ignored(path)) return
    const metadata = await status(absolute)
    if (!metadata) return
    if (metadata.isSymbolicLink()) throw new HbarError('AGENT_PATCH_SYMLINK', `Symbolic links are not allowed: ${path}`)
    if (metadata.isDirectory()) {
      for (const entry of await readdir(absolute, { withFileTypes: true })) await visit(resolve(absolute, entry.name))
      return
    }
    if (!metadata.isFile()) throw new HbarError('AGENT_PATCH_FILE', `Unsupported filesystem entry: ${path}`)
    if (metadata.size > MAX_FILE_BYTES)
      throw new HbarError('AGENT_PATCH_LIMIT', `Scoped file exceeds ${MAX_FILE_BYTES} bytes: ${path}`)
    if (files.size >= limit) throw new HbarError('AGENT_PATCH_LIMIT', `Scope contains more than ${limit} files`)
    bytes += metadata.size
    if (bytes > MAX_TOTAL_BYTES)
      throw new HbarError('AGENT_PATCH_LIMIT', `Scoped files exceed ${MAX_TOTAL_BYTES} total bytes`)
    const content = await readFile(absolute)
    files.set(path, { path, sha256: sha256(content) })
  }
  for (const entry of [...new Set(entries)]) await visit(safePath(root, entry))
  return new Map([...files.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

export async function synchronizeScope(sourceRoot: string, targetRoot: string, entries: readonly string[]) {
  assertLocalWorkspace(sourceRoot)
  assertLocalWorkspace(targetRoot)
  const source = await collectScopeFiles(sourceRoot, entries)
  const target = await collectScopeFiles(targetRoot, entries)
  for (const path of target.keys()) if (!source.has(path)) await unlink(safePath(targetRoot, path))
  for (const path of source.keys()) {
    const from = safePath(sourceRoot, path)
    const to = safePath(targetRoot, path)
    await mkdir(resolve(to, '..'), { recursive: true })
    await writeFile(to, await readFile(from))
  }
}

export async function buildPatchFiles(
  root: string,
  scope: WorkflowScope,
  baseline: readonly FileSnapshot[],
): Promise<AgentPatchFile[]> {
  const before = new Map(baseline.map((file) => [file.path, file.sha256]))
  const after = await collectScopeFiles(root, scope.writePaths)
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  const files = paths.flatMap((path): AgentPatchFile[] => {
    const beforeSha256 = before.get(path) ?? null
    const afterSha256 = after.get(path)?.sha256 ?? null
    if (beforeSha256 === afterSha256) return []
    return [
      {
        path,
        operation: beforeSha256 === null ? 'add' : afterSha256 === null ? 'delete' : 'update',
        beforeSha256,
        afterSha256,
      },
    ]
  })
  if (files.length > MAX_AGENT_PATCH_FILES)
    throw new HbarError('AGENT_PATCH_LIMIT', `Patch changes more than ${MAX_AGENT_PATCH_FILES} files`)
  return files
}

export async function fileHash(root: string, path: string): Promise<string | null> {
  const absolute = safePath(root, path)
  const metadata = await status(absolute)
  if (!metadata) return null
  if (metadata.isSymbolicLink()) throw new HbarError('AGENT_PATCH_SYMLINK', `Symbolic links are not allowed: ${path}`)
  if (!metadata.isFile()) throw new HbarError('AGENT_PATCH_FILE', `Expected a regular file: ${path}`)
  if (metadata.size > MAX_FILE_BYTES)
    throw new HbarError('AGENT_PATCH_LIMIT', `Patch file exceeds ${MAX_FILE_BYTES} bytes: ${path}`)
  return sha256(await readFile(absolute))
}

export async function applyFiles(parentRoot: string, isolatedRoot: string, files: readonly AgentPatchFile[]) {
  assertLocalWorkspace(parentRoot)
  assertLocalWorkspace(isolatedRoot)
  const backups = new Map<string, Uint8Array | null>()
  for (const file of files) {
    const current = await fileHash(parentRoot, file.path)
    if (current !== file.beforeSha256)
      throw new HbarError('AGENT_PATCH_CONFLICT', `Parent file changed since delegation: ${file.path}`)
    const isolated = await fileHash(isolatedRoot, file.path)
    if (isolated !== file.afterSha256)
      throw new HbarError('AGENT_PATCH_INTEGRITY', `Isolated patch content changed after capture: ${file.path}`)
  }
  try {
    for (const file of files) {
      const parent = safePath(parentRoot, file.path)
      backups.set(file.path, file.beforeSha256 === null ? null : new Uint8Array(await readFile(parent)))
      if (file.operation === 'delete') await unlink(parent)
      else {
        await mkdir(resolve(parent, '..'), { recursive: true })
        await writeFile(parent, await readFile(safePath(isolatedRoot, file.path)))
      }
    }
    for (const file of files)
      if ((await fileHash(parentRoot, file.path)) !== file.afterSha256)
        throw new HbarError('AGENT_PATCH_INTEGRITY', `Applied patch hash does not match: ${file.path}`)
  } catch (error) {
    for (const [path, content] of [...backups.entries()].reverse()) {
      const parent = safePath(parentRoot, path)
      if (content === null) await rm(parent, { force: true })
      else {
        await mkdir(resolve(parent, '..'), { recursive: true })
        await writeFile(parent, content)
      }
    }
    throw error
  }
}

export function pathAllowed(path: string, allowed: readonly string[]) {
  return allowed.some((entry) => {
    const normalized = entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
    return normalized === '.' || path === normalized || path.startsWith(`${normalized}/`)
  })
}

function relativeToolPath(workspace: string, value: string) {
  assertLocalWorkspace(workspace)
  const absolute = resolve(workspace, value)
  const path = relative(workspace, absolute).replaceAll('\\', '/') || '.'
  if (path === '..' || path.startsWith('../') || isAbsolute(path))
    throw new HbarError('AGENT_PATCH_SCOPE', `Tool path is outside the isolated workspace: ${value}`)
  return path
}

export function argumentPaths(workspace: string, value: unknown, key = ''): string[] {
  if (typeof value === 'string' && ['path', 'paths', 'cwd', 'root', 'directory'].includes(key.toLowerCase()))
    return [relativeToolPath(workspace, value)]
  if (Array.isArray(value)) return value.flatMap((entry) => argumentPaths(workspace, entry, key))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([childKey, entry]) => argumentPaths(workspace, entry, childKey))
}

export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  )
}

export function hashValue(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}
