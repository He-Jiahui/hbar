import { lstat, readdir, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface CleanupRuntime {
  readonly javascriptActive: boolean
  readonly previewActive: boolean
  readonly rustActive: boolean
}

export const CLEANUP_TARGETS = [
  { path: 'dist', kind: 'web-build' },
  { path: 'apps/hbar-app-ui-preview/dist', kind: 'web-build' },
  { path: 'packages/lumen-app-ui/dist', kind: 'web-build' },
  { path: 'target', kind: 'rust-build' },
  { path: 'apps/desktop/src-tauri/target', kind: 'rust-build' },
  { path: 'node_modules/.vite', kind: 'cache' },
  { path: 'node_modules/.cache', kind: 'cache' },
  { path: 'hbar-ui/.nx/cache', kind: 'cache' },
  { path: 'hbar-ui/docs/.next', kind: 'web-build' },
  { path: 'playwright-report', kind: 'test-output' },
  { path: 'test-results', kind: 'test-output' },
  { path: 'tsconfig.tsbuildinfo', kind: 'cache' },
  { path: 'apps/web/tsconfig.tsbuildinfo', kind: 'cache' },
  { path: 'packages/lumen-app-ui/tsconfig.tsbuildinfo', kind: 'cache' },
] as const

export type CleanupTarget = (typeof CLEANUP_TARGETS)[number]
export type CleanupProtection = 'active-runtime' | 'linked-path' | 'tracked-content' | 'not-ignored'
export interface CleanupEntry {
  readonly target: CleanupTarget
  readonly absolutePath: string
  readonly state: 'eligible' | 'protected' | 'missing'
  readonly protection?: CleanupProtection
  readonly bytes: number
  readonly files: number
}

function equalPath(first: string, second: string): boolean {
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second
}

function containedPath(root: string, target: string): string {
  const path = resolve(root, target)
  const child = relative(root, path)
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Cleanup target must stay inside its workspace: ${target}`)
  }
  return path
}

async function git(root: string, args: readonly string[]) {
  const child = Bun.spawn(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout: stdout.trim(), stderr: stderr.trim(), code }
}

export async function cleanupWorkspaceRoot(path: string): Promise<string> {
  const root = await realpath(resolve(path))
  const repository = await git(root, ['rev-parse', '--show-toplevel'])
  if (repository.code !== 0 || !equalPath(await realpath(repository.stdout), root)) {
    throw new Error('Cleanup requires the exact root of a Git workspace.')
  }
  return root
}

async function linkedPath(root: string, absolutePath: string): Promise<boolean> {
  let cursor = root
  for (const part of relative(root, absolutePath).split(sep)) {
    cursor = join(cursor, part)
    const information = await lstat(cursor)
    if (information.isSymbolicLink()) return true
  }
  return false
}

async function measure(path: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0
  let files = 0
  const pending = [path]
  while (pending.length) {
    const current = pending.pop()
    if (!current) break
    const information = await lstat(current)
    if (information.isSymbolicLink()) continue
    if (information.isDirectory()) {
      const children = await readdir(current)
      pending.push(...children.map((child) => join(current, child)))
    } else if (information.isFile()) {
      bytes += information.size
      files += 1
    }
  }
  return { bytes, files }
}

function activeRuntime(target: CleanupTarget, runtime: CleanupRuntime): boolean {
  if (target.kind === 'rust-build') return runtime.rustActive
  if (target.kind === 'web-build') return runtime.previewActive
  return runtime.javascriptActive
}

export async function inspectCleanupTarget(
  root: string,
  target: CleanupTarget,
  runtime: CleanupRuntime,
): Promise<CleanupEntry> {
  if (!CLEANUP_TARGETS.some((allowed) => allowed.path === target.path && allowed.kind === target.kind)) {
    throw new Error('Cleanup target is not in the build-output allowlist.')
  }
  const absolutePath = containedPath(root, target.path)
  try {
    await lstat(absolutePath)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { target, absolutePath, state: 'missing', bytes: 0, files: 0 }
    }
    throw error
  }
  const protectedEntry = (protection: CleanupProtection): CleanupEntry => ({
    target,
    absolutePath,
    state: 'protected',
    protection,
    bytes: 0,
    files: 0,
  })
  if (await linkedPath(root, absolutePath)) return protectedEntry('linked-path')
  if (activeRuntime(target, runtime)) return protectedEntry('active-runtime')
  // Inspect the owning repository too: an ignored submodule output is not a root Git file.
  const ownerResult = await git(dirname(absolutePath), ['rev-parse', '--show-toplevel'])
  if (ownerResult.code !== 0) throw new Error(ownerResult.stderr)
  const owner = await realpath(ownerResult.stdout)
  const ownerPath = relative(owner, absolutePath).replaceAll('\\', '/')
  const tracked = await git(owner, ['ls-files', '-z', '--', ownerPath])
  if (tracked.code !== 0) throw new Error(tracked.stderr)
  if (tracked.stdout.length) return protectedEntry('tracked-content')
  const ignored = await git(owner, ['check-ignore', '--quiet', '--', ownerPath])
  if (ignored.code === 1) return protectedEntry('not-ignored')
  if (ignored.code !== 0) throw new Error(ignored.stderr)
  return { target, absolutePath, state: 'eligible', ...(await measure(absolutePath)) }
}

export async function inspectWorkspaceCleanup(root: string, runtime: CleanupRuntime): Promise<readonly CleanupEntry[]> {
  const workspace = await cleanupWorkspaceRoot(root)
  const entries: CleanupEntry[] = []
  for (const target of CLEANUP_TARGETS) entries.push(await inspectCleanupTarget(workspace, target, runtime))
  return entries
}

/** Recheck the root, runtime, ignore rules and tracked files immediately before each removal. */
export async function applyWorkspaceCleanup(
  root: string,
  readRuntime: () => Promise<CleanupRuntime>,
): Promise<readonly CleanupEntry[]> {
  const workspace = await cleanupWorkspaceRoot(root)
  const removed: CleanupEntry[] = []
  for (const target of CLEANUP_TARGETS) {
    const entry = await inspectCleanupTarget(workspace, target, await readRuntime())
    if (entry.state !== 'eligible') continue
    if (!equalPath(await cleanupWorkspaceRoot(root), workspace))
      throw new Error('Workspace root changed during cleanup.')
    await rm(containedPath(workspace, target.path), { recursive: true, force: false })
    removed.push(entry)
  }
  return removed
}
