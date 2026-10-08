import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { HbarError } from '@hbar/contracts'
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
export async function branchRepository(git: BranchGit, path: string, signal: AbortSignal) {
  const canonical = await realpath(path)
  const top = branchGitOutput(await git(canonical, ['rev-parse', '--show-toplevel'], signal))
  const root = await realpath(isAbsolute(top) ? top : resolve(canonical, top))
  if (!insideBranchPath(root, canonical))
    throw new HbarError('GIT_REPOSITORY_SCOPE', 'The execution directory is outside its checkout')
  const commonValue = branchGitOutput(await git(canonical, ['rev-parse', '--git-common-dir'], signal))
  const common = await realpath(isAbsolute(commonValue) ? commonValue : resolve(canonical, commonValue))
  return { path: canonical, root, common }
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
