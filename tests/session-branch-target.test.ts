import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'
import { SessionLaunchTargetService } from '@hbar/kernel'
import { SessionBranchTargetService } from '../packages/kernel/src/session-branch-target-service'
import type { BranchGit } from '../packages/kernel/src/session-branch-git'
import { sessionBranchTargetSelectInputSchema } from '@hbar/contracts/commands/session-branch-target'

const prefix = 'hbar-session-branch-target-'
const resources: {
  root: string
  storage: Storage
  launch: SessionLaunchTargetService
  service: SessionBranchTargetService
}[] = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.service.close()
    await resource.launch.close()
    await resource.storage.close()
    const root = resolve(resource.root)
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
      throw new Error('Refusing to remove an unowned fixture')
    await rm(root, { recursive: true, force: true })
  }
})
const git: BranchGit = async (cwd, args, signal) => {
  const process = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
    signal,
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { stdout, stderr, code }
}
async function gitOk(cwd: string, args: string[]) {
  const result = await git(cwd, args, new AbortController().signal)
  if (result.code) throw new Error(result.stderr)
  return result.stdout.trim()
}
async function fixture(
  execute: BranchGit = git,
  guard: (path: string, signal: AbortSignal) => Promise<void> = async () => undefined,
) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await gitOk(repository, ['init', '-q', '-b', 'main'])
  await gitOk(repository, ['config', 'user.name', 'hbar test'])
  await gitOk(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'file.txt'), 'main\n')
  await gitOk(repository, ['add', '.'])
  await gitOk(repository, ['commit', '-q', '-m', 'initial'])
  const oid = await gitOk(repository, ['rev-parse', 'HEAD'])
  await gitOk(repository, ['branch', 'feature/target'])
  const layout = createPathLayout(join(root, 'host-data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', repository, 'fixture')
  const session = await storage.call('createSession', workspace.id, 'branch target')
  const launch = new SessionLaunchTargetService(storage, layout, execute)
  const service = new SessionBranchTargetService(storage, layout, launch.branchTargetGit.bind(launch), guard)
  resources.push({ root, storage, launch, service })
  const base = { sessionId: session.id, workspaceId: workspace.id, expectedRevision: 0 }
  const identity = { actorId: 'fixture-actor', idempotencyKey: crypto.randomUUID() }
  return { root, repository, layout, storage, workspace, session, launch, service, oid, base, identity }
}
async function accept(f: Awaited<ReturnType<typeof fixture>>, key = crypto.randomUUID()) {
  const run = await f.storage.call(
    'enqueue',
    f.session.id,
    key,
    { text: 'run', images: [] },
    'test-model',
    undefined,
    await f.launch.bindForRun(f.session.id),
  )
  return run
}
async function expectCode(promise: Promise<unknown>, expected: string) {
  let error: unknown
  try {
    await promise
  } catch (failure) {
    error = failure
  }
  expect(error).toHaveProperty('code', expected)
}

test('an established session can choose another branch and its next Run uses that checkout', async () => {
  const f = await fixture()
  const first = await accept(f)
  await f.storage.call('setRun', first.id, 'completed')
  const result = await f.service.select(
    { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: f.oid } },
    f.identity,
    new AbortController().signal,
  )
  expect(result).toMatchObject({
    status: 'ready',
    revision: 1,
    execution: { path: f.repository, branch: 'feature/target', kind: 'checkout' },
  })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('feature/target')
  expect((await f.launch.bindForRun(f.session.id)).targetPath).toBe(f.repository)
  expect((await accept(f)).status).toBe('queued')
})

test('a branch checked out in a local worktree switches the execution directory without switching the original checkout', async () => {
  const f = await fixture()
  const worktree = join(f.root, 'existing-worktree')
  await gitOk(f.repository, ['worktree', 'add', worktree, 'feature/target'])
  const page = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id },
    new AbortController().signal,
  )
  expect(page.branches.find((branch) => branch.name === 'feature/target')?.worktreePath).toBe(worktree)
  const first = await accept(f)
  await f.storage.call('setRun', first.id, 'completed')
  const result = await f.service.select(
    { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: f.oid } },
    f.identity,
    new AbortController().signal,
  )
  expect(result).toMatchObject({ status: 'ready', execution: { path: worktree, kind: 'worktree' } })
  expect(await f.launch.workspaceForRun(f.session.id, f.workspace.path)).toBe(worktree)
  expect((await f.launch.bindForRun(f.session.id)).targetPath).toBe(worktree)
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  await writeFile(
    join(await f.launch.workspaceForRun(f.session.id, f.workspace.path), 'execution.txt'),
    'selected worktree\n',
  )
  expect(await readFile(join(worktree, 'execution.txt'), 'utf8')).toBe('selected worktree\n')
})

test('branch/worktree creation is captured, idempotent, and recognized after AI Git commands', async () => {
  const f = await fixture()
  const request = {
    ...f.base,
    choice: { kind: 'new-branch' as const, name: 'codex/created', baseRef: 'refs/heads/main', expectedBaseOid: f.oid },
  }
  const first = await f.service.select(request, f.identity, new AbortController().signal)
  expect(first.status).toBe('ready')
  expect(await f.service.select(request, f.identity, new AbortController().signal)).toEqual(first)
  const run = await accept(f)
  await gitOk(f.repository, ['switch', '-c', 'codex/ai-created'])
  await f.storage.call('setRun', run.id, 'completed')
  expect(await f.service.observeRunBranch(f.session.id, run.id, 1, f.repository, new AbortController().signal)).toBe(
    true,
  )
  const page = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id },
    new AbortController().signal,
  )
  expect(page.execution.branch).toBe('codex/ai-created')
  expect(page.branches.find((branch) => branch.name === 'codex/ai-created')?.current).toBe(true)
  expect(await f.launch.workspaceForRun(f.session.id, f.workspace.path)).toBe(f.repository)
  await gitOk(f.repository, ['switch', 'main'])
  await f.service.prepareForRun(f.session.id, new AbortController().signal)
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('codex/ai-created')
})

test('the selected task branch is restored when another session changed a shared checkout', async () => {
  const f = await fixture()
  await f.service.select(
    { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: f.oid } },
    f.identity,
    new AbortController().signal,
  )
  await gitOk(f.repository, ['switch', 'main'])
  const page = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id },
    new AbortController().signal,
  )
  expect(page.execution.branch).toBe('feature/target')
  await f.service.prepareForRun(f.session.id, new AbortController().signal)
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('feature/target')
})

test('a new worktree uses Host-owned storage and binds the first Run to its branch directory', async () => {
  const f = await fixture()
  const result = await f.service.select(
    {
      ...f.base,
      choice: { kind: 'new-worktree', name: 'codex/worktree', baseRef: 'refs/heads/main', expectedBaseOid: f.oid },
    },
    f.identity,
    new AbortController().signal,
  )
  expect(result.status).toBe('ready')
  expect(result.execution?.kind).toBe('worktree')
  expect(result.execution?.path.startsWith(f.layout.worktrees)).toBe(true)
  expect(await gitOk(result.execution!.path, ['branch', '--show-current'])).toBe('codex/worktree')
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  const binding = await f.launch.bindForRun(f.session.id, undefined, 1)
  expect(binding.targetPath).toBe(result.execution!.path)
  await f.storage.call(
    'enqueue',
    f.session.id,
    'worktree-run',
    { text: 'worktree', images: [] },
    'test-model',
    undefined,
    binding,
  )
  expect(await f.launch.isBoundWorktreeExecutionRoot(result.execution!.path)).toBe(true)
})

test('dirty conflicts preserve edits and leave the previous execution target unchanged', async () => {
  const f = await fixture()
  await gitOk(f.repository, ['switch', 'feature/target'])
  await writeFile(join(f.repository, 'file.txt'), 'feature\n')
  await gitOk(f.repository, ['add', '.'])
  await gitOk(f.repository, ['commit', '-q', '-m', 'different contents'])
  const tip = await gitOk(f.repository, ['rev-parse', 'HEAD'])
  await gitOk(f.repository, ['switch', 'main'])
  await writeFile(join(f.repository, 'file.txt'), 'uncommitted edits\n')
  const result = await f.service.select(
    { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: tip } },
    f.identity,
    new AbortController().signal,
  )
  expect(result).toMatchObject({ status: 'failed', revision: 0, error: { code: 'GIT_SWITCH_BLOCKED' } })
  expect(await readFile(join(f.repository, 'file.txt'), 'utf8')).toBe('uncommitted edits\n')
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  expect((await f.storage.call('sessionLaunchTarget', f.session.id)).revision).toBe(0)
})

test('active Runs and stale branch tips reject a switch before changing the checkout', async () => {
  const f = await fixture()
  await accept(f)
  await expectCode(
    f.service.select(
      { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: f.oid } },
      f.identity,
      new AbortController().signal,
    ),
    'BUSY',
  )
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  await expectCode(
    f.service.select(
      { ...f.base, choice: { kind: 'branch', ref: 'refs/heads/feature/target', expectedOid: 'f'.repeat(40) } },
      { ...f.identity, idempotencyKey: crypto.randomUUID() },
      new AbortController().signal,
    ),
    'COMMAND_CONFLICT',
  )
  expect(
    sessionBranchTargetSelectInputSchema.safeParse({
      ...f.base,
      choice: { kind: 'branch', ref: 'refs/heads/main', expectedOid: f.oid, path: 'C:/arbitrary' },
    }).success,
  ).toBe(false)
})

test('an interrupted successful Git switch blocks Run admission until the original intent is reconciled', async () => {
  let interrupted = false
  const execute: BranchGit = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (args.includes('switch') && !interrupted) {
      interrupted = true
      throw new Error('Lost Git acknowledgement')
    }
    return result
  }
  const f = await fixture(execute)
  const request = {
    ...f.base,
    choice: { kind: 'branch' as const, ref: 'refs/heads/feature/target', expectedOid: f.oid },
  }
  const result = await f.service.select(request, f.identity, new AbortController().signal)
  expect(result.status).toBe('unknown')
  const recovery = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id },
    new AbortController().signal,
    f.identity.actorId,
  )
  expect(recovery.pending).toMatchObject({ owned: true, idempotencyKey: f.identity.idempotencyKey, request })
  const otherActor = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id },
    new AbortController().signal,
    'another-actor',
  )
  expect(otherActor.pending).toEqual({ operationId: result.operationId, owned: false })
  await expectCode(f.launch.bindForRun(f.session.id), 'RESULT_UNKNOWN')
  const resolved = await f.service.reconcile({ ...f.identity, sessionId: f.session.id }, new AbortController().signal)
  expect(resolved.status).toBe('ready')
  expect(resolved.operationId).toBe(result.operationId)
  expect((await f.launch.bindForRun(f.session.id)).branch).toBe('feature/target')
  await expectCode(
    f.service.select(
      { ...request, choice: { kind: 'branch', ref: 'refs/heads/main', expectedOid: f.oid } },
      f.identity,
      new AbortController().signal,
    ),
    'IDEMPOTENCY_CONFLICT',
  )
})

test('bounded branch pages reject a cursor when AI creates a branch between pages', async () => {
  const f = await fixture()
  const page = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id, limit: 1 },
    new AbortController().signal,
  )
  expect(page.branches).toHaveLength(1)
  expect(page.nextCursor).not.toBeNull()
  const next = await f.service.list(
    { sessionId: f.session.id, workspaceId: f.workspace.id, limit: 1, cursor: page.nextCursor! },
    new AbortController().signal,
  )
  expect(next.branches[0]?.name).not.toBe(page.branches[0]?.name)
  await gitOk(f.repository, ['branch', 'new-ai-branch'])
  await expectCode(
    f.service.list(
      { sessionId: f.session.id, workspaceId: f.workspace.id, limit: 1, cursor: page.nextCursor! },
      new AbortController().signal,
    ),
    'STALE_CURSOR',
  )
})
