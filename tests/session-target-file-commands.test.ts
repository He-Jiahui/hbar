import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { HbarClient, createFileCommandClient, createGitCommandClient } from '@hbar/client'
import type { SessionFileTarget } from '@hbar/contracts/commands/files'
import { sessionFileTargetSchema } from '@hbar/contracts/commands/files'
import { sessionGitTargetSchema } from '@hbar/contracts/commands/git'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server'

const cleanups: (() => Promise<void>)[] = []
const prefix = 'hbar-session-target-files-'

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
  if (code !== 0) throw new Error(`Fixture Git failed: ${stderr || stdout}`)
  return stdout.trim()
}

async function expectCode(operation: Promise<unknown>, code: string) {
  let error: unknown
  try {
    await operation
  } catch (caught) {
    error = caught
  }
  expect(error).toMatchObject({ code })
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'same.txt'), 'shared baseline')
  await git(repository, ['add', 'same.txt'])
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
      throw new Error('Refusing to remove an unowned test directory')
    await rm(absoluteRoot, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'session-target file test')
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  return {
    root,
    repository,
    workspace,
    kernel,
    client,
    files: createFileCommandClient(client),
    git: createGitCommandClient(client),
  }
}

async function bindIsolated(kernel: Kernel, sessionId: string) {
  await kernel.setSessionLaunchTarget({
    actorId: 'fixture-actor',
    idempotencyKey: crypto.randomUUID(),
    sessionId,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: `codex/test-${sessionId}` } },
  })
  await kernel.submit(sessionId, crypto.randomUUID(), { text: 'fixture', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  const runtime = await kernel.storage.call('sessionLaunchTargetRuntime', sessionId)
  expect(runtime.binding).not.toBeNull()
  return { path: runtime.binding!.targetPath, sessionTarget: { sessionId, expectedRevision: 1 } }
}

test('session file targets cannot contain a client-selected root or an unsafe revision', () => {
  expect(sessionFileTargetSchema.safeParse({ sessionId: 'session-a', expectedRevision: 0 }).success).toBeTrue()
  expect(
    sessionFileTargetSchema.safeParse({ sessionId: 'session-a', expectedRevision: 0, targetPath: 'C:/foreign' })
      .success,
  ).toBeFalse()
  expect(sessionFileTargetSchema.safeParse({ sessionId: 'session-a', expectedRevision: -1 }).success).toBeFalse()
  expect(
    sessionFileTargetSchema.safeParse({ sessionId: 'session-a', expectedRevision: Number.MAX_SAFE_INTEGER + 1 })
      .success,
  ).toBeFalse()
})

test('paired file API resolves the exact bound session checkout for list/find/read/write without changing shared files', async () => {
  const f = await fixture()
  const session = await f.kernel.createSession(f.workspace.id, 'isolated')
  const isolated = await bindIsolated(f.kernel, session.id)
  await writeFile(join(isolated.path, 'same.txt'), 'isolated baseline')
  await writeFile(join(isolated.path, 'only-isolated.txt'), 'session only')
  const target = { workspaceId: f.workspace.id, sessionTarget: isolated.sessionTarget }

  const page = await f.files.execute('file.list', { ...target, path: '.' })
  expect(page.items.some((item) => item.path === 'only-isolated.txt')).toBeTrue()
  expect(await f.files.execute('file.find', { ...target, query: 'only-isolated' })).toMatchObject({
    paths: ['only-isolated.txt'],
    truncated: false,
  })
  const before = await f.files.execute('file.read', { ...target, path: 'same.txt' })
  expect(before).toMatchObject({ ...target, text: 'isolated baseline' })
  expect(await f.files.execute('file.read', { workspaceId: f.workspace.id, path: 'same.txt' })).toMatchObject({
    text: 'shared baseline',
  })
  const changed = await f.files.execute('file.write', {
    ...target,
    path: 'same.txt',
    text: 'edited isolated',
    expectedSha256: before.sha256,
  })
  expect(changed).toMatchObject({ ...target, beforeSha256: before.sha256, created: false })
  expect(await readFile(join(isolated.path, 'same.txt'), 'utf8')).toBe('edited isolated')
  expect(await readFile(join(f.repository, 'same.txt'), 'utf8')).toBe('shared baseline')
  expect(await git(f.repository, ['branch', '--show-current'])).toBe('main')
  await expectCode(f.files.execute('file.read', { ...target, path: '../outside.txt' }), 'PATH_DENIED')
  await expectCode(
    f.files.execute('file.write', { ...target, path: 'same.txt', text: 'stale edit', expectedSha256: before.sha256 }),
    'FILE_CONFLICT',
  )
})

test('cross-workspace, stale revisions and prepared-but-unbound isolated targets fail without writes or fallback', async () => {
  const f = await fixture()
  const session = await f.kernel.createSession(f.workspace.id, 'unbound')
  const sessionTarget: SessionFileTarget = { sessionId: session.id, expectedRevision: 0 }
  await mkdir(join(f.root, 'foreign'))
  const foreign = await f.kernel.createWorkspace(join(f.root, 'foreign'))
  await expectCode(
    f.files.execute('file.read', { workspaceId: foreign.id, sessionTarget, path: 'same.txt' }),
    'STALE_TARGET',
  )
  await f.kernel.setSessionLaunchTarget({
    actorId: 'fixture-actor',
    idempotencyKey: crypto.randomUUID(),
    sessionId: session.id,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'codex/unbound-files' } },
  })
  await f.kernel.prepareSessionLaunchTarget(session.id, 1)
  await expectCode(
    f.files.execute('file.write', {
      workspaceId: f.workspace.id,
      sessionTarget,
      path: 'same.txt',
      text: 'must not write to shared',
      expectedSha256: null,
    }),
    'COMMAND_CONFLICT',
  )
  const current = { ...sessionTarget, expectedRevision: 1 }
  await expectCode(
    f.files.execute('file.read', { workspaceId: f.workspace.id, sessionTarget: current, path: 'same.txt' }),
    'SESSION_LAUNCH_TARGET_UNRESOLVED',
  )
  expect(await readFile(join(f.repository, 'same.txt'), 'utf8')).toBe('shared baseline')
  expect((await f.kernel.storage.call('sessionLaunchTargetRuntime', session.id)).binding).toBeNull()
})

test('different shared session targets still compare-and-write against one physical checkout', async () => {
  const f = await fixture()
  const sessions = await Promise.all([
    f.kernel.createSession(f.workspace.id, 'shared A'),
    f.kernel.createSession(f.workspace.id, 'shared B'),
  ])
  const baseline = await f.files.execute('file.read', { workspaceId: f.workspace.id, path: 'same.txt' })
  const results = await Promise.allSettled(
    sessions.map((session, index) =>
      f.files.execute('file.write', {
        workspaceId: f.workspace.id,
        sessionTarget: { sessionId: session.id, expectedRevision: 0 },
        path: 'same.txt',
        text: `writer ${index}`,
        expectedSha256: baseline.sha256,
      }),
    ),
  )
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'FILE_CONFLICT' } })
})

test('paired session Git info/status/diff read the same bound checkout as Files, including its separate index', async () => {
  const f = await fixture()
  const session = await f.kernel.createSession(f.workspace.id, 'Git isolated')
  const isolated = await bindIsolated(f.kernel, session.id)
  const target = { workspaceId: f.workspace.id, ...isolated.sessionTarget }
  await writeFile(join(isolated.path, 'same.txt'), 'staged isolated only')
  const info = await f.git.execute('sessionGit.info', target)
  expect(info.branch).toBe(`codex/test-${session.id}`)
  const status = await f.git.execute('sessionGit.status', target)
  expect(resolve(status.cwd)).toBe(resolve(isolated.path))
  expect(status.entries).toEqual([{ index: ' ', worktree: 'M', path: 'same.txt' }])
  const working = await f.git.execute('sessionGit.diff', { ...target, paths: ['same.txt'] })
  expect(working.diff).toContain('+staged isolated only')
  expect((await f.git.execute('git.diff', { cwd: f.repository })).diff).toBe('')

  await git(isolated.path, ['add', 'same.txt'])
  await writeFile(join(isolated.path, 'same.txt'), 'unstaged isolated only')
  const staged = await f.git.execute('sessionGit.diff', { ...target, cached: true, paths: ['same.txt'] })
  expect(staged.cached).toBeTrue()
  expect(staged.diff).toContain('+staged isolated only')
  expect(staged.diff).not.toContain('+unstaged isolated only')
  expect((await f.git.execute('git.diff', { cwd: f.repository, cached: true })).diff).toBe('')
  expect(await readFile(join(f.repository, 'same.txt'), 'utf8')).toBe('shared baseline')
})

test('session Git queries reject root injection, wrong owners, stale versions and unbound targets without fallback', async () => {
  const f = await fixture()
  const session = await f.kernel.createSession(f.workspace.id, 'Git unbound')
  const target = { workspaceId: f.workspace.id, sessionId: session.id, expectedRevision: 0 }
  expect(sessionGitTargetSchema.safeParse({ ...target, cwd: f.root }).success).toBeFalse()
  expect((await f.git.execute('sessionGit.info', target)).branch).toBe('main')
  await mkdir(join(f.root, 'foreign'))
  const foreign = await f.kernel.createWorkspace(join(f.root, 'foreign'))
  await expectCode(f.git.execute('sessionGit.status', { ...target, workspaceId: foreign.id }), 'STALE_TARGET')
  await f.kernel.setSessionLaunchTarget({
    actorId: 'fixture-actor',
    idempotencyKey: crypto.randomUUID(),
    sessionId: session.id,
    expectedRevision: 0,
    selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: 'codex/unbound-git' } },
  })
  await expectCode(f.git.execute('sessionGit.info', target), 'COMMAND_CONFLICT')
  await expectCode(
    f.git.execute('sessionGit.diff', { ...target, expectedRevision: 1 }),
    'SESSION_LAUNCH_TARGET_UNRESOLVED',
  )
  expect(await git(f.repository, ['branch', '--show-current'])).toBe('main')
  expect((await f.kernel.storage.call('sessionLaunchTargetRuntime', session.id)).binding).toBeNull()
  const descriptor = await f.client.call('command.describe', { commandId: 'sessionGit.diff' })
  expect(descriptor.metadata).toMatchObject({
    kind: 'query',
    scope: 'session',
    stateEffect: 'none',
    visibility: 'internal',
  })
})
