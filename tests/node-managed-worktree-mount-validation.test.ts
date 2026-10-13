import { describe, expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { verifyManagedWorktreeMounts } from '../apps/node/src/managed-worktree-mount-validation'

describe('B managed worktree mount validation', () => {
  it.skipIf(process.platform === 'win32')(
    'requires reciprocal Git markers to resolve to the registered checkout and common directory',
    async () => {
      const temp = await mkdtemp(join(tmpdir(), 'hbar-worktree-mount-'))
      try {
        const id = '0123456789abcdef0123456789abcdef'
        const parent = join(temp, 'repo')
        const child = join(parent, '.hbar-worktrees', id)
        const common = join(parent, '.git')
        const metadata = join(common, 'worktrees', id)
        const marker = join(child, '.git')
        await Promise.all([mkdir(child, { recursive: true }), mkdir(metadata, { recursive: true })])
        await writeFile(marker, `gitdir: ${relative(child, metadata)}\n`)
        await writeFile(join(metadata, 'gitdir'), `${relative(metadata, marker)}\n`)
        await writeFile(join(metadata, 'commondir'), '../..\n')
        const mounts = [
          {
            kind: 'managed-worktree' as const,
            worktreeId: id,
            parentRootId: 'engine',
            sourcePath: child,
            targetPath: child,
            access: 'write' as const,
          },
          {
            kind: 'common-git' as const,
            worktreeId: id,
            parentRootId: 'engine',
            sourcePath: common,
            targetPath: common,
            access: 'read' as const,
          },
          {
            kind: 'worktree-metadata' as const,
            worktreeId: id,
            parentRootId: 'engine',
            sourcePath: metadata,
            targetPath: metadata,
            access: 'read' as const,
          },
        ]
        await expect(verifyManagedWorktreeMounts(mounts)).resolves.toBeUndefined()
        await writeFile(marker, `gitdir: ${resolve(temp, 'forged')}\n`)
        await expect(verifyManagedWorktreeMounts(mounts)).rejects.toMatchObject({ code: 'NODE_WORKTREE_METADATA' })
      } finally {
        await rm(temp, { recursive: true, force: true })
      }
    },
  )
})
