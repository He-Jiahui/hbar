import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { assertLocalWorkspace } from '@hbar/contracts/local-workspace'
import type { SessionBranchExecutionRoot } from '@hbar/storage'

export interface BranchGitResult {
  code: number
  stdout: string
  stderr: string
}
export type BranchGit = (cwd: string, args: string[], signal: AbortSignal) => Promise<BranchGitResult>
export function sameBranchPath(left: string, right: string): boolean {
  const a = resolve(left).replace(/[\\/]+$/, '')
  const b = resolve(right).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}
export function insideBranchPath(root: string, path: string): boolean {
  const value = relative(root, path)
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value))
}
export function branchGitOutput(result: BranchGitResult): string {
  if (result.code !== 0) throw new HbarError('GIT_OPERATION_FAILED', 'Git could not verify the session branch target')
  return result.stdout.trim()
}
async function hasBranchMetadata(path: string, signal: AbortSignal): Promise<boolean> {
  let directory = path
  for (let depth = 0; depth < 256; depth++) {
    signal.throwIfAborted()
    try {
      await lstat(join(directory, '.git'))
      return true
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error
    }
    const parent = dirname(directory)
    if (parent === directory) return false
    directory = parent
  }
  throw new HbarError('GIT_REPOSITORY_SCOPE', 'Repository ancestry exceeds its supported bound')
}

/** A missing repository is a capability fact; existing invalid metadata remains an error. */
export async function inspectBranchRepository(git: BranchGit, path: string, signal: AbortSignal) {
  assertLocalWorkspace(path)
  const canonical = await realpath(path)
  const probe = await git(canonical, ['rev-parse', '--show-toplevel'], signal)
  signal.throwIfAborted()
  if (
    probe.code === 128 &&
    probe.stdout.trim() === '' &&
    /^fatal: not a git repository(?: \(or any of the parent directories\))?: \.git$/u.test(
      probe.stderr.trim().split(/\r?\n/u)[0] ?? '',
    ) &&
    !(await hasBranchMetadata(canonical, signal))
  )
    return { kind: 'plain' as const, path: canonical }
  const top = branchGitOutput(probe)
  if (!top) throw new HbarError('INVALID_OUTPUT', 'Git returned an empty checkout root')
  const root = await realpath(isAbsolute(top) ? top : resolve(canonical, top))
  if (!insideBranchPath(root, canonical))
    throw new HbarError('GIT_REPOSITORY_SCOPE', 'The execution directory is outside its checkout')
  const commonValue = branchGitOutput(await git(canonical, ['rev-parse', '--git-common-dir'], signal))
  if (!commonValue) throw new HbarError('INVALID_OUTPUT', 'Git returned an empty common directory')
  const common = await realpath(isAbsolute(commonValue) ? commonValue : resolve(canonical, commonValue))
  return { kind: 'git' as const, path: canonical, root, common }
}

export async function branchRepository(git: BranchGit, path: string, signal: AbortSignal) {
  const repository = await inspectBranchRepository(git, path, signal)
  if (repository.kind === 'plain')
    throw new HbarError('GIT_OPERATION_FAILED', 'Git could not verify the session branch target')
  return repository
}
export function branchWorktrees(output: string): { path: string; ref: string | null }[] {
  const entries: { path: string; ref: string | null }[] = []
  let entry: { path: string; ref: string | null } | null = null
  for (const field of output.split('\0')) {
    if (field.startsWith('worktree ')) {
      entry = { path: resolve(field.slice(9)), ref: null }
      entries.push(entry)
    } else if (field.startsWith('branch ') && entry) entry.ref = field.slice(7)
  }
  return entries
}
/** Directory identity is pinned; AI Git tools may create/switch branches in that checkout. */
export async function verifyBranchExecutionRoot(
  git: BranchGit,
  target: SessionBranchExecutionRoot,
  signal: AbortSignal,
) {
  const repository = await branchRepository(git, target.targetPath, signal)
  if (!sameBranchPath(repository.path, target.targetPath) || !sameBranchPath(repository.common, target.commonPath))
    throw new HbarError(
      'SESSION_BRANCH_TARGET_CHANGED',
      'The execution directory no longer belongs to its selected repository',
    )
  const worktrees = branchWorktrees(
    branchGitOutput(await git(repository.root, ['worktree', 'list', '--porcelain', '-z'], signal)),
  )
  if (!worktrees.some((entry) => sameBranchPath(entry.path, repository.root)))
    throw new HbarError('SESSION_BRANCH_TARGET_CHANGED', 'The execution worktree is no longer registered locally')
  return repository.path
}
