import { expect, test } from 'bun:test'
import type { GitStatus } from '@hbar/contracts'
import { sessionGitStatusEntrySchema, sessionGitStatusSchema } from '@hbar/contracts/commands/git'
import { projectSessionGitStatus } from '../packages/kernel/src/session-git-projection'

const target = { workspaceId: 'workspace-1', sessionId: 'session-1', expectedRevision: 3 }

function status(
  root: string | null,
  entries: GitStatus['entries'],
  dirty = entries.length > 0,
  cwd = root ?? '/repo',
): GitStatus {
  return {
    cwd,
    root,
    branch: 'feature/scope',
    head: 'a'.repeat(40),
    upstream: 'origin/feature/scope',
    ahead: 2,
    behind: 1,
    dirty,
    originUrl: 'https://example.invalid/repo.git',
    entries,
  }
}

test('projects root and shared-subdirectory status paths without leaking execution roots', () => {
  const repository = status('/repo', [
    { path: 'src/main.ts', index: ' ', worktree: 'M' },
    { path: 'packages/editor/space and 名字.ts', index: 'M', worktree: ' ' },
    { path: 'packages/editor/nested/new/', index: '?', worktree: '?' },
    { path: 'packages/editors/not-in-scope.ts', index: ' ', worktree: 'M' },
    { path: 'README.md', index: ' ', worktree: 'M' },
  ])

  expect(projectSessionGitStatus(target, repository, '/repo')).toMatchObject({
    target,
    branch: 'feature/scope',
    head: 'a'.repeat(40),
    upstream: 'origin/feature/scope',
    ahead: 2,
    behind: 1,
    isRepository: true,
    dirty: true,
    repositoryDirty: true,
    entries: [
      { kind: 'path', path: 'src/main.ts', index: ' ', worktree: 'M' },
      { kind: 'path', path: 'packages/editor/space and 名字.ts', index: 'M', worktree: ' ' },
      { kind: 'path', path: 'packages/editor/nested/new', directory: true, index: '?', worktree: '?' },
      { kind: 'path', path: 'packages/editors/not-in-scope.ts', index: ' ', worktree: 'M' },
      { kind: 'path', path: 'README.md', index: ' ', worktree: 'M' },
    ],
  })

  const subdirectoryStatus = status('/repo', repository.entries, true, '/repo/packages/editor')
  expect(projectSessionGitStatus(target, subdirectoryStatus, '/repo/packages/editor')).toMatchObject({
    dirty: true,
    repositoryDirty: true,
    entries: [
      { kind: 'path', path: 'space and 名字.ts', index: 'M', worktree: ' ' },
      { kind: 'path', path: 'nested/new', directory: true, index: '?', worktree: '?' },
    ],
  })
  expect(projectSessionGitStatus(target, subdirectoryStatus, '/repo/packages/editor').entries).toHaveLength(2)
})

test('a new untracked directory equal to the selected subdirectory is represented as its root', () => {
  const projected = projectSessionGitStatus(
    target,
    status('/repo', [{ path: 'new-workspace/', index: '?', worktree: '?' }], true, '/repo/new-workspace'),
    '/repo/new-workspace',
  )
  expect(projected.entries).toEqual([{ kind: 'path', path: '.', directory: true, index: '?', worktree: '?' }])
})

test('POSIX roots retain case-sensitive path components and reject backslash path remapping', () => {
  const projected = projectSessionGitStatus(
    target,
    status(
      '/repo',
      [
        { path: 'pkg/inside.txt', index: ' ', worktree: 'M' },
        { path: 'PKG/outside-by-case.txt', index: ' ', worktree: 'M' },
      ],
      true,
      '/repo/pkg',
    ),
    '/repo/pkg',
  )
  expect(projected.entries).toEqual([{ kind: 'path', path: 'inside.txt', index: ' ', worktree: 'M' }])
  expect(() =>
    projectSessionGitStatus(
      target,
      status('/repo', [{ path: 'pkg\\outside.txt', index: ' ', worktree: 'M' }], true, '/repo/pkg'),
      '/repo/pkg',
    ),
  ).toThrow('unsupported backslash character')
})

test('renames preserve both scoped endpoints and expose only the in-scope side at the boundary', () => {
  const projected = projectSessionGitStatus(
    target,
    status(
      '/repo',
      [
        { path: 'pkg/new name.ts', originalPath: 'pkg/old name.ts', index: 'R', worktree: ' ' },
        { path: 'pkg/arrived.ts', originalPath: 'outside/incoming-secret.ts', index: 'R', worktree: ' ' },
        { path: 'outside/outgoing-secret.ts', originalPath: 'pkg/departed.ts', index: 'R', worktree: ' ' },
        { path: 'pkg2/outside.ts', originalPath: 'elsewhere/source.ts', index: 'R', worktree: ' ' },
      ],
      true,
      '/repo/pkg',
    ),
    '/repo/pkg',
  )
  expect(projected.entries).toEqual([
    { kind: 'rename', from: 'old name.ts', to: 'new name.ts', index: 'R', worktree: ' ' },
    { kind: 'rename', from: null, to: 'arrived.ts', index: 'R', worktree: ' ' },
    { kind: 'rename', from: 'departed.ts', to: null, index: 'R', worktree: ' ' },
  ])
})

test('copies count only when their destination is in scope, not when a source is copied out', () => {
  const projected = projectSessionGitStatus(
    target,
    status(
      '/repo',
      [
        { path: 'pkg/copied-in.ts', originalPath: 'outside/source-secret.ts', index: 'C', worktree: ' ' },
        { path: 'outside/copied-out.ts', originalPath: 'pkg/source.ts', index: 'C', worktree: ' ' },
        { path: 'outside/fully-external.ts', originalPath: 'elsewhere/source.ts', index: 'C', worktree: ' ' },
      ],
      true,
      '/repo/pkg',
    ),
    '/repo/pkg',
  )
  expect(projected.entries).toEqual([{ kind: 'copy', from: null, to: 'copied-in.ts', index: 'C', worktree: ' ' }])
  expect(projected.dirty).toBeTrue()
  expect(projected.repositoryDirty).toBeTrue()

  const copyOutOnly = projectSessionGitStatus(
    target,
    status(
      '/repo',
      [{ path: 'outside/copied-out.ts', originalPath: 'pkg/source.ts', index: 'C', worktree: ' ' }],
      true,
      '/repo/pkg',
    ),
    '/repo/pkg',
  )
  expect(copyOutOnly.entries).toEqual([])
  expect(copyOutOnly.dirty).toBeFalse()
  expect(copyOutOnly.repositoryDirty).toBeTrue()
})

test('Windows drive and UNC roots compare case-insensitively and return slash-relative paths', () => {
  const drive = projectSessionGitStatus(
    target,
    status(
      'D:\\Repo',
      [
        { path: 'PKG/Space 名称.txt', index: ' ', worktree: 'M' },
        { path: 'pkg2/outside.txt', index: ' ', worktree: 'M' },
      ],
      true,
      'd:/repo/pkg',
    ),
    'd:/repo/pkg',
  )
  expect(drive.entries).toEqual([{ kind: 'path', path: 'Space 名称.txt', index: ' ', worktree: 'M' }])

  const unc = projectSessionGitStatus(
    target,
    status(
      '\\\\server\\share\\repo',
      [{ path: 'PKG/inside.txt', index: ' ', worktree: 'M' }],
      true,
      '//SERVER/SHARE/repo/pkg',
    ),
    '//SERVER/SHARE/repo/pkg',
  )
  expect(unc.entries).toEqual([{ kind: 'path', path: 'inside.txt', index: ' ', worktree: 'M' }])
})

test('outside roots and malformed porcelain paths fail closed; non-Git sessions remain path-free', () => {
  expect(() => projectSessionGitStatus(target, status('/repo/elsewhere', [], false, '/repo/pkg'), '/repo/pkg')).toThrow(
    'does not own the resolved session execution root',
  )
  expect(() =>
    projectSessionGitStatus(
      target,
      status('/repo', [{ path: '../escape.txt', index: ' ', worktree: 'M' }], true, '/repo'),
      '/repo',
    ),
  ).toThrow('malformed repository-relative status path')

  const nonGit = projectSessionGitStatus(target, status(null, [], false, '/outside/not-a-repo'), '/outside/not-a-repo')
  expect(nonGit).toMatchObject({ target, isRepository: false, dirty: false, repositoryDirty: false, entries: [] })
  expect(nonGit).not.toHaveProperty('cwd')
  expect(nonGit).not.toHaveProperty('root')
  expect(nonGit).not.toHaveProperty('originUrl')
})

test('session schemas are strict, omit raw filesystem metadata, and require touched rename endpoints', () => {
  const validTarget = target
  expect(
    sessionGitStatusSchema.safeParse({
      target: validTarget,
      branch: 'main',
      head: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      isRepository: true,
      dirty: true,
      repositoryDirty: true,
      entries: [{ kind: 'path', path: '.', directory: true, index: '?', worktree: '?' }],
    }).success,
  ).toBeTrue()
  expect(
    sessionGitStatusSchema.safeParse({
      target: validTarget,
      cwd: '/repo/pkg',
      root: '/repo',
      originUrl: null,
      branch: 'main',
      head: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      isRepository: true,
      dirty: true,
      repositoryDirty: true,
      entries: [],
    }).success,
  ).toBeFalse()
  expect(
    sessionGitStatusEntrySchema.safeParse({ kind: 'rename', from: null, to: null, index: 'R', worktree: ' ' }).success,
  ).toBeFalse()
  expect(
    sessionGitStatusEntrySchema.safeParse({ kind: 'path', path: '../outside', index: ' ', worktree: 'M' }).success,
  ).toBeFalse()
  expect(
    sessionGitStatusEntrySchema.safeParse({ kind: 'path', path: 'folder\\name', index: ' ', worktree: 'M' }).success,
  ).toBeFalse()
})
