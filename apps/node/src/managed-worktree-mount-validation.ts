import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path/posix'
import { HbarError } from '@hbar/contracts'
import type { NodeExecutionInternalMount } from '@hbar/node-core'

/** Rechecks Git's reciprocal worktree markers immediately before an OS mount is rendered. */
export async function verifyManagedWorktreeMounts(mounts: readonly NodeExecutionInternalMount[]): Promise<void> {
  if (mounts.length === 0) return
  const byKind = new Map(mounts.map((mount) => [mount.kind, mount]))
  const child = byKind.get('managed-worktree')
  const common = byKind.get('common-git')
  const metadata = byKind.get('worktree-metadata')
  if (!child || !common || !metadata || mounts.length !== 3)
    throw new HbarError('NODE_DENIED', 'Managed worktree mounts have incomplete B provenance')
  const parent = dirname(dirname(child.sourcePath))
  const expectedCommon = resolve(parent, '.git')
  const expectedMetadata = resolve(expectedCommon, 'worktrees', child.worktreeId)
  if (
    child.sourcePath !== resolve(parent, '.hbar-worktrees', child.worktreeId) ||
    common.sourcePath !== expectedCommon ||
    metadata.sourcePath !== expectedMetadata
  )
    throw new HbarError('NODE_DENIED', 'Managed worktree mounts do not match generated B paths')
  for (const path of [child.sourcePath, common.sourcePath, metadata.sourcePath]) {
    if (
      (await realpath(path).catch(() => '')) !== path ||
      !(await stat(path).then(
        (value) => value.isDirectory(),
        () => false,
      ))
    )
      throw new HbarError('NODE_ROOT_CHANGED', 'A managed worktree mount changed after B validated its registration')
  }
  const marker = join(child.sourcePath, '.git')
  const markerInfo = await lstat(marker).catch(() => null)
  if (!markerInfo?.isFile() || markerInfo.isSymbolicLink())
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed checkout .git marker must be a regular file')
  const markerMatch = /^gitdir: (.+)\r?\n?$/.exec(await readFile(marker, 'utf8'))
  if (
    !markerMatch?.[1] ||
    (await realpath(resolve(child.sourcePath, markerMatch[1])).catch(() => '')) !== metadata.sourcePath
  )
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed checkout no longer points to its exact B metadata directory')
  const reciprocalPath = join(metadata.sourcePath, 'gitdir')
  const reciprocal = /^(.+?)\r?\n?$/.exec(await readFile(reciprocalPath, 'utf8'))
  if (!reciprocal?.[1] || (await realpath(resolve(metadata.sourcePath, reciprocal[1])).catch(() => '')) !== marker)
    throw new HbarError('NODE_WORKTREE_METADATA', 'Managed Git metadata no longer points back to its exact checkout')
  const commonDirPath = join(metadata.sourcePath, 'commondir')
  const commonDir = await readFile(commonDirPath, 'utf8').catch(() => '')
  if (
    !commonDir.trim() ||
    (await realpath(resolve(metadata.sourcePath, commonDir.trim())).catch(() => '')) !== common.sourcePath
  )
    throw new HbarError(
      'NODE_WORKTREE_METADATA',
      'Managed Git metadata no longer resolves to its registered common directory',
    )
  const worktrees = join(common.sourcePath, 'worktrees')
  if ((await realpath(worktrees).catch(() => '')) !== worktrees)
    throw new HbarError('NODE_WORKTREE_METADATA', 'Common Git worktree metadata directory changed through a link')
  for (const protectedPath of [join(common.sourcePath, 'hooks'), worktrees]) {
    const actual = await realpath(protectedPath).catch(() => null)
    if (actual !== null && actual !== protectedPath)
      throw new HbarError('NODE_ROOT_CHANGED', 'A protected common Git path changed through a link')
  }
}
