import { afterEach, expect, test } from 'bun:test'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { HbarClient, createGitCommandClient } from '@hbar/client'
import { createGitCommands, Kernel, MemorySecrets } from '@hbar/kernel'
import type { GitService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
const prefix = 'hbar-session-git-scope-'

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function git(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Temporary Git fixture failed: ${stderr || stdout}`)
  return stdout.trim()
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  const scope = join(repository, 'pkg')
  const outside = join(repository, 'outside')
  await mkdir(scope, { recursive: true })
  await mkdir(outside, { recursive: true })
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await git(repository, ['config', 'status.renames', 'copies'])

  const initialFiles: Record<string, string> = {
    'pkg/alpha.txt': 'alpha baseline\n',
    'pkg/beta.txt': 'beta baseline\n',
    'pkg/[ab].txt': 'bracket baseline\n',
    'pkg/rename-internal-old.txt': 'rename internal payload\n',
    'pkg/rename-outgoing.txt': 'rename outgoing payload\n',
    'pkg/copy-source-out.txt': 'copy from inside unique payload\n',
    'outside/rename-incoming.txt': 'rename incoming unique payload\n',
    'outside/copy-source-in.txt': 'copy from outside unique payload\n',
    'outside/outside-only.txt': 'outside baseline\n',
  }
  for (const [relative, text] of Object.entries(initialFiles)) {
    const file = join(repository, relative)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  await git(repository, ['add', '.'])
  await git(repository, ['commit', '-q', '-m', 'initial'])

  const kernel = await Kernel.create({
    home: join(root, 'host-data'),
    workspace: repository,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    const absoluteRoot = resolve(root)
    if (dirname(absoluteRoot) !== resolve(tmpdir()) || !basename(absoluteRoot).startsWith(prefix))
      throw new Error('Refusing to remove an unowned session Git test directory')
    await rm(absoluteRoot, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'session Git scope test')
  const workspace = await kernel.createWorkspace(scope)
  const session = await kernel.createSession(workspace.id, 'Scoped Git')
  return {
    root,
    repository,
    scope,
    outside,
    kernel,
    git: createGitCommandClient(client),
    target: { workspaceId: workspace.id, sessionId: session.id, expectedRevision: 0 },
  }
}

test('paired Host projects real rename/copy edges into a shared subdirectory and contains literal diffs', async () => {
  const f = await fixture()
  try {
    await git(f.repository, ['mv', 'pkg/rename-internal-old.txt', 'pkg/rename-internal-new.txt'])
    await git(f.repository, ['mv', 'outside/rename-incoming.txt', 'pkg/rename-incoming.txt'])
    await git(f.repository, ['mv', 'pkg/rename-outgoing.txt', 'outside/rename-outgoing.txt'])
    await copyFile(join(f.outside, 'copy-source-in.txt'), join(f.scope, 'copy-in.txt'))
    await copyFile(join(f.scope, 'copy-source-out.txt'), join(f.outside, 'copy-out.txt'))
    await git(f.repository, ['add', 'pkg/copy-in.txt', 'outside/copy-out.txt'])
    await writeFile(join(f.outside, 'outside-only.txt'), 'outside-only-sentinel-9b3ec42a\n')
    await writeFile(join(f.scope, 'alpha.txt'), 'alpha staged version\n')
    await git(f.repository, ['add', 'pkg/alpha.txt'])
    await writeFile(join(f.scope, 'alpha.txt'), 'alpha working version\n')
    await writeFile(join(f.scope, '[ab].txt'), 'bracket literal version\n')
    await writeFile(join(f.scope, 'a.txt'), 'glob a version\n')
    await writeFile(join(f.scope, 'b.txt'), 'glob b version\n')
    await git(f.repository, ['add', 'pkg/a.txt', 'pkg/b.txt'])

    const status = await f.git.execute('sessionGit.status', f.target)
    expect(status).toMatchObject({ target: f.target, isRepository: true, dirty: true, repositoryDirty: true })
    expect(status).not.toHaveProperty('cwd')
    expect(status).not.toHaveProperty('root')
    expect(status).not.toHaveProperty('originUrl')
    expect(status.entries).toContainEqual({
      kind: 'rename',
      from: 'rename-internal-old.txt',
      to: 'rename-internal-new.txt',
      index: 'R',
      worktree: ' ',
    })
    expect(status.entries).toContainEqual({
      kind: 'rename',
      from: null,
      to: 'rename-incoming.txt',
      index: 'R',
      worktree: ' ',
    })
    expect(status.entries).toContainEqual({
      kind: 'rename',
      from: 'rename-outgoing.txt',
      to: null,
      index: 'R',
      worktree: ' ',
    })
    expect(
      status.entries.some(
        (entry) =>
          (entry.kind === 'path' && entry.path === 'copy-in.txt' && entry.index === 'A') ||
          (entry.kind === 'copy' && entry.to === 'copy-in.txt'),
      ),
    ).toBeTrue()
    expect(
      status.entries.some(
        (entry) =>
          (entry.kind === 'path' && entry.path === 'copy-out.txt') ||
          (entry.kind === 'copy' && entry.to === 'copy-out.txt'),
      ),
    ).toBeFalse()
    expect(status.entries.some((entry) => JSON.stringify(entry).includes('outside'))).toBeFalse()

    const working = await f.git.execute('sessionGit.diff', f.target)
    expect(working).toMatchObject({ target: f.target, cached: false, truncated: false })
    expect(working).not.toHaveProperty('cwd')
    expect(working.diff).toContain('alpha working version')
    expect(working.diff).toContain('-alpha staged version')
    expect(working.diff).toContain('[ab].txt')
    expect(working.diff).not.toContain('outside-only-sentinel-9b3ec42a')
    expect(working.diff).not.toContain('outside/')

    const staged = await f.git.execute('sessionGit.diff', { ...f.target, cached: true, paths: ['alpha.txt'] })
    expect(staged.diff).toContain('alpha staged version')
    expect(staged.diff).not.toContain('alpha working version')

    const bracketLiteral = await f.git.execute('sessionGit.diff', { ...f.target, paths: ['[ab].txt'] })
    expect(bracketLiteral.diff).toContain('bracket literal version')
    expect(bracketLiteral.diff).not.toContain('glob a version')
    expect(bracketLiteral.diff).not.toContain('glob b version')

    const wildcardIsLiteral = await f.git.execute('sessionGit.diff', { ...f.target, paths: ['*.txt'] })
    expect(wildcardIsLiteral.diff).toBe('')
    const magicIsLiteral = await f.git.execute('sessionGit.diff', {
      ...f.target,
      paths: [':(top)outside/outside-only.txt'],
    })
    expect(magicIsLiteral.diff).toBe('')
    await expect(
      f.git.execute('sessionGit.diff', { ...f.target, paths: ['../outside/outside-only.txt'] }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
  } finally {
    await f.kernel.waitForIdle()
  }
}, 60_000)

test('paired Host represents an untracked selected root and a non-Git workspace without absolute paths', async () => {
  const f = await fixture()
  try {
    const untrackedRoot = join(f.repository, 'fresh-root')
    await mkdir(untrackedRoot)
    await writeFile(join(untrackedRoot, 'draft.txt'), 'fresh root draft\n')
    const freshWorkspace = await f.kernel.createWorkspace(untrackedRoot)
    const freshSession = await f.kernel.createSession(freshWorkspace.id, 'Untracked root')
    const freshTarget = { workspaceId: freshWorkspace.id, sessionId: freshSession.id, expectedRevision: 0 }
    const untracked = await f.git.execute('sessionGit.status', freshTarget)
    expect(untracked.entries).toEqual([{ kind: 'path', path: '.', directory: true, index: '?', worktree: '?' }])
    expect(untracked.dirty).toBeTrue()
    expect(untracked.repositoryDirty).toBeTrue()

    const nonRepository = join(f.root, 'non-repository')
    await mkdir(nonRepository)
    const workspace = await f.kernel.createWorkspace(nonRepository)
    const session = await f.kernel.createSession(workspace.id, 'No Git')
    const nonGit = await f.git.execute('sessionGit.status', {
      workspaceId: workspace.id,
      sessionId: session.id,
      expectedRevision: 0,
    })
    expect(nonGit).toMatchObject({ isRepository: false, dirty: false, repositoryDirty: false, entries: [] })
    expect(nonGit).not.toHaveProperty('cwd')
    expect(nonGit).not.toHaveProperty('root')
    expect(nonGit).not.toHaveProperty('originUrl')
  } finally {
    await f.kernel.waitForIdle()
  }
}, 60_000)

test('session Git rechecks the expected target revision after a pending status query', async () => {
  const f = await fixture()
  const gate = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const service = f.kernel.plugins.get<GitService>('git')
  const delayed: GitService = {
    info: (cwd, signal) => service.info(cwd, signal),
    async status(cwd, signal) {
      started.resolve()
      await gate.promise
      return service.status(cwd, signal)
    },
    diff: (cwd, options, signal) => service.diff(cwd, options, signal),
    log: (cwd, limit, signal) => service.log(cwd, limit, signal),
    stats: (cwd, options, signal) => service.stats(cwd, options, signal),
    commit: (cwd, options, signal) => service.commit(cwd, options, signal),
    branch: (cwd, operation, signal) => service.branch(cwd, operation, signal),
    worktree: (cwd, operation, signal) => service.worktree(cwd, operation, signal),
    diffToRemote: (cwd, signal) => service.diffToRemote(cwd, signal),
  }
  const commands = createGitCommands(delayed, {
    storage: f.kernel.storage,
    resolveSessionPath: async (_sessionId, workspacePath, signal) => {
      signal.throwIfAborted()
      return workspacePath
    },
  })
  try {
    const pending = commands.execute('sessionGit.status', f.target).then(
      () => ({ kind: 'resolved' as const }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), 5_000)
    })
    const entered = await Promise.race([started.promise.then(() => ({ kind: 'started' as const })), pending, timeout])
    if (timer !== undefined) clearTimeout(timer)
    expect(entered).toEqual({ kind: 'started' })
    await f.kernel.setSessionLaunchTarget({
      actorId: 'scope-test',
      idempotencyKey: crypto.randomUUID(),
      sessionId: f.target.sessionId,
      expectedRevision: f.target.expectedRevision,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'codex/stale-scope-read' } },
    })
    gate.resolve()
    const result = await pending
    expect(result).toMatchObject({ kind: 'error', error: { code: 'COMMAND_CONFLICT' } })
  } finally {
    gate.resolve()
    commands.dispose()
  }
}, 60_000)
