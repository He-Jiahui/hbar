import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, relative, resolve, sep, join } from 'node:path'
import { describeCommand } from '@hbar/commands'
import type { GitLaunchBranchSnapshot } from '@hbar/plugin-sdk'
import {
  sessionLaunchBranchesCommands,
  sessionLaunchBranchesInputSchema,
  sessionLaunchBranchesPageSchema,
} from '@hbar/contracts/commands/session-launch-branches'
import type { SessionLaunchBranchesRequest } from '@hbar/contracts/commands/session-launch-branches'
import { createSessionLaunchBranchesCommands } from '@hbar/kernel'
import { Storage } from '@hbar/storage'
import { GitRuntime, ProcessGitRunner, gitConfigSchema } from '@hbar/git'

const fixturePrefix = 'hbar-session-launch-branches-'
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

function assertOwnedFixturePath(path: string) {
  const absolutePath = resolve(path)
  const relativePath = relative(resolve(tmpdir()), absolutePath)
  if (
    !basename(absolutePath).startsWith(fixturePrefix) ||
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  )
    throw new Error('Refusing to remove an unowned session-launch-branches fixture')
  return absolutePath
}

async function git(cwd: string, args: string[], input?: string) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: input === undefined ? 'ignore' : 'pipe',
    windowsHide: true,
  })
  if (input !== undefined) {
    if (!child.stdin) throw new Error('Fixture Git stdin was not created')
    await child.stdin.write(input)
    await child.stdin.end()
  }
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Fixture Git failed: ${args.join(' ')}: ${stderr || stdout}`)
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
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  const absoluteRoot = resolve(root)
  cleanups.push(async () => rm(assertOwnedFixturePath(absoluteRoot), { recursive: true, force: true }))
  const repository = join(root, 'repository')
  const plain = join(root, 'plain')
  await mkdir(repository)
  await mkdir(plain)
  await git(repository, ['init', '-q', '-b', 'main'])
  await git(repository, ['config', 'user.name', 'hbar test'])
  await git(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'initial\n')
  await git(repository, ['add', 'README.md'])
  await git(repository, ['commit', '-q', '-m', 'initial'])

  const storage = new Storage(join(root, 'storage.sqlite'))
  cleanups.push(() => storage.close())
  const repositoryWorkspace = await storage.call('createWorkspace', repository, 'repository')
  const plainWorkspace = await storage.call('createWorkspace', plain, 'plain')
  const service = new GitRuntime(repository, gitConfigSchema.parse({}), undefined, true)
  const commands = createSessionLaunchBranchesCommands(storage, service)
  cleanups.push(async () => commands.dispose())
  return { root, repository, plain, repositoryWorkspace, plainWorkspace, storage, service, commands }
}

function execute(
  commands: ReturnType<typeof createSessionLaunchBranchesCommands>,
  input: SessionLaunchBranchesRequest,
  actorId = 'paired-device',
) {
  return commands.execute('sessionLaunchBranches.list', input, { actorId })
}

function requiredCursor(cursor: string | null): string {
  if (!cursor) throw new Error('Expected another branch discovery page')
  return cursor
}

test('branch discovery is a strict read-only workspace query with explicit target-mode availability', () => {
  const definition = sessionLaunchBranchesCommands['sessionLaunchBranches.list']
  expect(describeCommand(definition).metadata).toMatchObject({
    execution: 'host',
    kind: 'query',
    version: 2,
    stateEffect: 'none',
    scope: 'workspace',
    owner: 'hbar.session-launch-branches',
    visibility: 'internal',
    surfaces: ['api'],
    timeoutMs: 15_000,
    maxConcurrent: 4,
  })
  expect(sessionLaunchBranchesInputSchema.parse({ workspaceId: 'workspace-a' })).toEqual({
    workspaceId: 'workspace-a',
    search: '',
    limit: 25,
  })
  expect(
    sessionLaunchBranchesInputSchema.safeParse({ workspaceId: 'workspace-a', cwd: 'C:/outside' }).success,
  ).toBeFalse()
  expect(
    sessionLaunchBranchesInputSchema.safeParse({ workspaceId: 'workspace-a', sessionId: 'session-a' }).success,
  ).toBeFalse()
  expect(
    sessionLaunchBranchesPageSchema.safeParse({
      workspaceId: 'workspace-a',
      repository: { kind: 'not-repository' },
      branches: [],
      nextCursor: null,
      incomplete: false,
    }).success,
  ).toBeTrue()
  expect(
    sessionLaunchBranchesPageSchema.safeParse({
      workspaceId: 'workspace-a',
      repository: { kind: 'not-repository' },
      branches: [{ name: 'main', path: 'C:/private/repo' }],
      nextCursor: null,
      incomplete: false,
    }).success,
  ).toBeFalse()
})

test('real Git discovery distinguishes current, detached, unborn, and non-repository roots', async () => {
  const f = await fixture()
  await git(f.repository, ['branch', 'feature/held'])
  const head = await git(f.repository, ['rev-parse', 'HEAD'])
  await git(f.repository, ['update-ref', 'refs/remotes/origin/remote-only', head])
  const heldPath = join(f.root, 'held-worktree')
  await git(f.repository, ['worktree', 'add', '-q', heldPath, 'feature/held'])

  const current = await f.service.launchBranchSnapshot(f.repository)
  expect(current.repository).toMatchObject({
    kind: 'repository',
    workspaceScope: 'repository-root',
    head: { kind: 'branch', ref: 'refs/heads/main', name: 'main' },
  })
  expect(current.branches.find((branch) => branch.name === 'main')).toMatchObject({
    current: true,
    worktree: 'current',
  })
  expect(current.branches.find((branch) => branch.name === 'feature/held')).toMatchObject({
    current: false,
    worktree: 'elsewhere',
  })
  expect(current.branches.some((branch) => branch.name === 'remote-only')).toBeFalse()

  const refsBeforeQuery = await git(f.repository, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'])
  const page = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, search: 'HELD' })
  expect(page).toMatchObject({
    workspaceId: f.repositoryWorkspace.id,
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', ref: 'refs/heads/main', name: 'main' },
    },
    branches: [
      {
        name: 'feature/held',
        ref: 'refs/heads/feature/held',
        current: false,
        availability: {
          sharedCurrent: { state: 'disabled', reason: 'checked-out-elsewhere' },
          isolatedBase: { state: 'available' },
        },
      },
    ],
    nextCursor: null,
    incomplete: false,
  })
  expect(JSON.stringify(page)).not.toContain(f.repository)
  expect(await git(f.repository, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'])).toBe(
    refsBeforeQuery,
  )
  expect(await git(f.repository, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/main')

  const processRunner = new ProcessGitRunner()
  const unreadableRoot = new GitRuntime(
    f.repository,
    gitConfigSchema.parse({}),
    {
      run(cwd, args, signal, limits) {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel')
          return Promise.resolve({
            stdout: '',
            stderr: 'fatal: detected dubious ownership in repository',
            code: 128,
            truncated: false,
          })
        return processRunner.run(cwd, args, signal, limits)
      },
    },
    true,
  )
  await expect(unreadableRoot.launchBranchSnapshot(f.repository)).rejects.toMatchObject({
    code: 'GIT_REPOSITORY_UNAVAILABLE',
  })

  const worktreeInspectionUnavailable = new GitRuntime(
    f.repository,
    gitConfigSchema.parse({}),
    {
      run(cwd, args, signal, limits) {
        if (args[0] === 'worktree' && args[1] === 'list')
          return Promise.resolve({ stdout: '', stderr: 'fixture unavailable', code: 1, truncated: false })
        return processRunner.run(cwd, args, signal, limits)
      },
    },
    true,
  )
  const unavailableSnapshot = await worktreeInspectionUnavailable.launchBranchSnapshot(f.repository)
  expect(unavailableSnapshot.branches.find((branch) => branch.name === 'feature/held')).toMatchObject({
    worktree: 'unknown',
  })

  await git(f.repository, ['checkout', '--detach', 'HEAD'])
  expect((await f.service.launchBranchSnapshot(f.repository)).repository).toMatchObject({
    kind: 'repository',
    head: { kind: 'detached' },
  })

  const unborn = join(f.root, 'unborn')
  await mkdir(unborn)
  await git(unborn, ['init', '-q', '-b', 'empty'])
  const unbornSnapshot = await f.service.launchBranchSnapshot(unborn)
  expect(unbornSnapshot).toMatchObject({
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'unborn', ref: 'refs/heads/empty', name: 'empty' },
    },
    branches: [],
  })
  expect(unbornSnapshot.repository.kind === 'repository' && unbornSnapshot.repository.head.kind === 'unborn').toBeTrue()
  if (unbornSnapshot.repository.kind === 'repository' && unbornSnapshot.repository.head.kind === 'unborn')
    expect('oid' in unbornSnapshot.repository.head).toBeFalse()

  expect(await f.service.launchBranchSnapshot(f.plain)).toEqual({
    repository: { kind: 'not-repository' },
    branches: [],
    incomplete: false,
  })
  const nonRepositoryPage = await execute(f.commands, { workspaceId: f.plainWorkspace.id })
  expect(nonRepositoryPage).toMatchObject({
    repository: { kind: 'not-repository' },
    branches: [],
    nextCursor: null,
    incomplete: false,
  })

  const unicodeRepository = join(f.root, 'workspace Δ with spaces')
  await mkdir(unicodeRepository)
  await git(unicodeRepository, ['init', '-q', '-b', 'main'])
  await git(unicodeRepository, ['config', 'user.name', 'hbar test'])
  await git(unicodeRepository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(unicodeRepository, 'README.md'), 'unicode workspace\n')
  await git(unicodeRepository, ['add', 'README.md'])
  await git(unicodeRepository, ['commit', '-q', '-m', 'unicode workspace'])
  const unicodeWorkspace = await f.storage.call('createWorkspace', unicodeRepository, 'unicode workspace')
  const unicodePage = await execute(f.commands, { workspaceId: unicodeWorkspace.id })
  expect(unicodePage.repository).toMatchObject({
    kind: 'repository',
    workspaceScope: 'repository-root',
    head: { kind: 'branch', ref: 'refs/heads/main' },
  })
  expect(JSON.stringify(unicodePage)).not.toContain(unicodeRepository)

  const restrictedCommands = createSessionLaunchBranchesCommands(
    f.storage,
    new GitRuntime(f.plain, gitConfigSchema.parse({}), undefined, false),
  )
  cleanups.push(async () => restrictedCommands.dispose())
  await expectCode(execute(restrictedCommands, { workspaceId: f.repositoryWorkspace.id }), 'PATH_DENIED')
})

test('registered subdirectories fail closed for isolated bases while canonical-root aliases stay available', async () => {
  const f = await fixture()
  await git(f.repository, ['branch', 'feature/isolated-base'])
  const nested = join(f.repository, 'packages', 'nested')
  await mkdir(nested, { recursive: true })
  const nestedWorkspace = await f.storage.call('createWorkspace', nested, 'nested')
  const rootAlias = join(f.root, 'repository-root-alias')
  await symlink(f.repository, rootAlias, 'junction')
  const aliasWorkspace = await f.storage.call('createWorkspace', rootAlias, 'root alias')

  const headBefore = await git(f.repository, ['symbolic-ref', 'HEAD'])
  const tipBefore = await git(f.repository, ['rev-parse', 'HEAD'])
  const refsBefore = await git(f.repository, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'])
  expect(await realpath(rootAlias)).toBe(await realpath(f.repository))

  const rootPage = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id })
  expect(rootPage.repository).toMatchObject({ kind: 'repository', workspaceScope: 'repository-root' })
  expect(rootPage.branches.every((branch) => branch.availability.isolatedBase.state === 'available')).toBeTrue()

  const nestedPage = await execute(f.commands, { workspaceId: nestedWorkspace.id })
  expect(nestedPage.repository).toMatchObject({ kind: 'repository', workspaceScope: 'repository-subdirectory' })
  expect(nestedPage.branches.length).toBeGreaterThan(0)
  expect(
    nestedPage.branches.every(
      (branch) =>
        branch.availability.isolatedBase.state === 'disabled' &&
        branch.availability.isolatedBase.reason === 'repository-root-required',
    ),
  ).toBeTrue()

  const aliasPage = await execute(f.commands, { workspaceId: aliasWorkspace.id })
  expect(aliasPage.repository).toMatchObject({ kind: 'repository', workspaceScope: 'repository-root' })
  expect(aliasPage.branches.every((branch) => branch.availability.isolatedBase.state === 'available')).toBeTrue()
  for (const page of [rootPage, nestedPage, aliasPage]) expect(JSON.stringify(page)).not.toContain(f.repository)
  expect(await f.storage.call('sessions')).toEqual([])
  expect(await git(f.repository, ['symbolic-ref', 'HEAD'])).toBe(headBefore)
  expect(await git(f.repository, ['rev-parse', 'HEAD'])).toBe(tipBefore)
  expect(await git(f.repository, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads'])).toBe(
    refsBefore,
  )
})

test('literal case-insensitive search and bounded pages use a workspace and Git snapshot cursor', async () => {
  const f = await fixture()
  const branchNames = Array.from({ length: 61 }, (_, index) => `topic/Blue-${String(index).padStart(3, '0')}`)
  const longUnicodeName = `long/${'界'.repeat(45)}`
  branchNames.push('topic/Ωmega-🛰️', 'topic/ωmega-two', 'blueprint/literal-star', longUnicodeName)
  for (const name of branchNames) await git(f.repository, ['branch', name])
  await git(f.repository, ['branch', 'feature/🚀-蓝色'])

  const first = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id })
  expect(first.branches).toHaveLength(25)
  expect(first.nextCursor).toBeString()
  const second = await execute(f.commands, {
    workspaceId: f.repositoryWorkspace.id,
    cursor: requiredCursor(first.nextCursor),
  })
  expect(second.branches).toHaveLength(25)
  expect(second.nextCursor).toBeString()
  const third = await execute(f.commands, {
    workspaceId: f.repositoryWorkspace.id,
    cursor: requiredCursor(second.nextCursor),
  })
  expect(third.branches.length).toBeGreaterThan(0)
  expect(third.nextCursor).toBeNull()
  const names = [...first.branches, ...second.branches, ...third.branches].map((branch) => branch.name)
  expect(new Set(names).size).toBe(names.length)
  expect(names).toContain('topic/Ωmega-🛰️')
  expect(names).toContain(longUnicodeName)

  const matchingNames = branchNames.filter((name) => name.toLowerCase().includes('blue-0')).sort()
  const middle = await execute(f.commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: 'bLuE-0',
    limit: 50,
  })
  expect(middle.branches.map((branch) => branch.name)).toEqual(matchingNames.slice(0, 50))
  expect(middle.nextCursor).toBeString()
  const finalMatches = await execute(f.commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: 'BLUE-0',
    limit: 50,
    cursor: requiredCursor(middle.nextCursor),
  })
  expect(finalMatches.branches.map((branch) => branch.name)).toEqual(matchingNames.slice(50))
  expect(finalMatches.nextCursor).toBeNull()
  expect((await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, search: '🛰' })).branches).toMatchObject([
    { name: 'topic/Ωmega-🛰️' },
  ])
  const greekFirst = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, search: 'ΩMEGA', limit: 1 })
  expect(greekFirst.branches).toHaveLength(1)
  expect(greekFirst.nextCursor).toBeString()
  const greekSecond = await execute(f.commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: 'ωmega',
    limit: 1,
    cursor: requiredCursor(greekFirst.nextCursor),
  })
  expect(greekSecond.branches).toHaveLength(1)
  expect(greekSecond.nextCursor).toBeNull()
  expect((await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, search: '*' })).branches).toEqual([])

  const stale = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, limit: 1 })
  expect(stale.nextCursor).toBeString()
  await git(f.repository, ['branch', 'cursor-snapshot-changed'])
  await expectCode(
    execute(f.commands, {
      workspaceId: f.repositoryWorkspace.id,
      limit: 1,
      cursor: requiredCursor(stale.nextCursor),
    }),
    'INVALID_CURSOR',
  )
  await expectCode(
    execute(f.commands, {
      workspaceId: f.repositoryWorkspace.id,
      search: 'other',
      cursor: requiredCursor(first.nextCursor),
    }),
    'INVALID_CURSOR',
  )
  await expectCode(execute(f.commands, { workspaceId: 'unregistered-workspace' }), 'NOT_FOUND')
  const invalidPathInput: unknown = { workspaceId: f.repositoryWorkspace.id, cwd: f.plain }
  await expectCode(
    f.commands.dispatch(
      {
        protocol: 1,
        requestId: crypto.randomUUID(),
        commandId: 'sessionLaunchBranches.list',
        commandVersion: 2,
        input: invalidPathInput,
      },
      'paired-device',
    ),
    'INVALID_INPUT',
  )

  const legacyGit = new Proxy(f.service, {
    get(target, property, receiver) {
      if (property === 'launchBranchSnapshot') return undefined
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  const unavailableCommands = createSessionLaunchBranchesCommands(f.storage, legacyGit)
  cleanups.push(async () => unavailableCommands.dispose())
  await expectCode(execute(unavailableCommands, { workspaceId: f.repositoryWorkspace.id }), 'CAPABILITY_UNAVAILABLE')
})

test('cursor normalization supports maximum-length Unicode searches and equivalent spellings', async () => {
  const f = await fixture()
  const prefix = 'İ'.repeat(256)
  const names = [`${prefix}-one`, `${prefix}-two`]
  const oid = 'a'.repeat(40)
  const snapshot: GitLaunchBranchSnapshot = {
    repository: {
      kind: 'repository',
      workspaceScope: 'repository-root',
      head: { kind: 'branch', ref: `refs/heads/${names[0]}`, name: names[0]!, oid },
    },
    branches: names.map((name, index) => ({
      name,
      ref: `refs/heads/${name}`,
      oid,
      current: index === 0,
      worktree: index === 0 ? 'current' : 'available',
    })),
    incomplete: false,
  }
  const snapshotGit = new Proxy(f.service, {
    get(target, property, receiver) {
      if (property === 'launchBranchSnapshot') return async () => snapshot
      return Reflect.get(target, property, receiver) as unknown
    },
  })
  const commands = createSessionLaunchBranchesCommands(f.storage, snapshotGit)
  cleanups.push(async () => commands.dispose())

  const maximumSearchPage = await execute(commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: prefix,
    limit: 1,
  })
  const maximumSearchContinuation = await execute(commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: prefix,
    limit: 1,
    cursor: requiredCursor(maximumSearchPage.nextCursor),
  })
  expect(maximumSearchContinuation.branches).toHaveLength(1)

  const composedSearch = 'İ'.repeat(128)
  const equivalentPage = await execute(commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: composedSearch,
    limit: 1,
  })
  const equivalentContinuation = await execute(commands, {
    workspaceId: f.repositoryWorkspace.id,
    search: 'i\u0307'.repeat(128),
    limit: 1,
    cursor: requiredCursor(equivalentPage.nextCursor),
  })
  expect(equivalentContinuation.branches).toHaveLength(1)
})

test('a branch cursor is invalidated when repository-root topology changes', async () => {
  const f = await fixture()
  await git(f.repository, ['branch', 'feature/topology-cursor'])
  const rootSnapshot = await f.service.launchBranchSnapshot(f.repository)
  if (rootSnapshot.repository.kind !== 'repository') throw new Error('Expected repository fixture')
  const subdirectorySnapshot: GitLaunchBranchSnapshot = {
    ...rootSnapshot,
    repository: { ...rootSnapshot.repository, workspaceScope: 'repository-subdirectory' },
  }
  let reads = 0
  const changingGit = {
    async launchBranchSnapshot() {
      return reads++ === 0 ? rootSnapshot : subdirectorySnapshot
    },
  }
  const commands = createSessionLaunchBranchesCommands(f.storage, changingGit)
  cleanups.push(async () => commands.dispose())
  const firstPage = await execute(commands, { workspaceId: f.repositoryWorkspace.id, limit: 1 })
  expect(firstPage.nextCursor).toBeString()
  await expectCode(
    execute(commands, {
      workspaceId: f.repositoryWorkspace.id,
      limit: 1,
      cursor: requiredCursor(firstPage.nextCursor),
    }),
    'INVALID_CURSOR',
  )
})

test('the local-ref scan and result page stay capped and signal an unscanned tail', async () => {
  const f = await fixture()
  const head = await git(f.repository, ['rev-parse', 'HEAD'])
  const resets = Array.from(
    { length: 5_001 },
    (_, index) => `reset refs/heads/b${String(index).padStart(4, '0')}\nfrom ${head}\n\n`,
  )
  await git(f.repository, ['fast-import', '--quiet'], resets.join(''))
  await git(f.repository, ['pack-refs', '--all', '--prune'])

  const snapshot = await f.service.launchBranchSnapshot(f.repository)
  expect(snapshot.branches).toHaveLength(5_000)
  expect(snapshot.incomplete).toBeTrue()
  const first = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id })
  expect(first.branches).toHaveLength(25)
  expect(first.nextCursor).toBeString()
  expect(first.incomplete).toBeTrue()
  const beyondScannedSnapshot = await execute(f.commands, { workspaceId: f.repositoryWorkspace.id, search: 'main' })
  expect(beyondScannedSnapshot.branches).toEqual([])
  expect(beyondScannedSnapshot.incomplete).toBeTrue()
}, 60_000)

test('Kernel rejects legacy, malformed, oversized, duplicate-ref, and path-bearing Git snapshots', async () => {
  const f = await fixture()
  const valid = await f.service.launchBranchSnapshot(f.repository)
  if (valid.repository.kind !== 'repository') throw new Error('Expected repository fixture')
  const branch = valid.branches[0]
  if (!branch) throw new Error('Expected local branch fixture')
  const malformed: unknown[] = [
    { ...valid, repository: { kind: 'repository', head: valid.repository.head } },
    { ...valid, repository: { ...valid.repository, workspaceScope: 'unknown' } },
    { ...valid, repository: { ...valid.repository, privateRoot: f.repository } },
    { ...valid, branches: [{ ...branch, checkoutPath: f.repository }] },
    { ...valid, branches: [branch, branch] },
    {
      ...valid,
      branches: Array.from({ length: 5_001 }, (_, index) => ({
        ...branch,
        name: `oversized-${index}`,
        ref: `refs/heads/oversized-${index}`,
      })),
    },
  ]

  for (const snapshot of malformed) {
    // Deliberately bypasses GitService's static type to simulate an incompatible or malformed plugin reply.
    const legacyGit = new Proxy(f.service, {
      get(target, property, receiver) {
        if (property === 'launchBranchSnapshot') return async () => snapshot
        return Reflect.get(target, property, receiver) as unknown
      },
    })
    const commands = createSessionLaunchBranchesCommands(f.storage, legacyGit)
    cleanups.push(async () => commands.dispose())
    await expectCode(execute(commands, { workspaceId: f.repositoryWorkspace.id }), 'INVALID_OUTPUT')
  }
})
