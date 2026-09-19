import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GitCommitInfo } from '@hbar/contracts'
import type { ToolContext } from '@hbar/plugin-sdk'
import { GitRuntime, ProcessGitRunner, gitConfigSchema, gitTools } from '../plugins/git/src/index.ts'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function runGit(cwd: string, args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
  })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error(`${args.join(' ')}: ${stderr || stdout}`)
  return stdout.trim()
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-'))
  roots.push(root)
  await runGit(root, ['init', '-q'])
  await runGit(root, ['config', 'user.name', 'hbar test'])
  await runGit(root, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(root, 'README.md'), 'initial\n')
  await runGit(root, ['add', 'README.md'])
  await runGit(root, ['commit', '-q', '-m', 'initial'])
  const trees = join(root, 'trees')
  await mkdir(trees)
  return { root, runtime: new GitRuntime(root, gitConfigSchema.parse({ worktreeRoot: trees })) }
}

test('Git status, history, and remote metadata are bounded and sanitized', async () => {
  const { root, runtime } = await fixture()
  await runGit(root, ['remote', 'add', 'origin', 'https://user:secret@example.invalid/hbar.git'])
  await writeFile(join(root, 'dirty.txt'), 'change\n')
  const status = await runtime.status()
  expect(status.root?.replaceAll('\\', '/')).toBe(root.replaceAll('\\', '/'))
  expect(status.head).toMatch(/^[0-9a-f]{40}$/)
  expect(status.dirty).toBeTrue()
  expect(status.entries.some((entry) => entry.path === 'dirty.txt')).toBeTrue()
  expect(status.originUrl).toBe('https://example.invalid/hbar.git')
  expect(await runtime.info()).toEqual({
    sha: status.head,
    branch: status.branch,
    originUrl: status.originUrl,
  })
  expect((await runtime.log(root, 1))[0]).toMatchObject({
    subject: 'initial',
    provenance: { source: 'external', recordedAt: null },
  })
})

test('Git mutations emit an observational change notification after success', async () => {
  const { root } = await fixture()
  const changed: string[] = []
  const runtime = new GitRuntime(root, gitConfigSchema.parse({}), undefined, false, (cwd) => {
    changed.push(cwd)
  })
  await writeFile(join(root, 'notify.txt'), 'change\n')
  await runtime.commit(root, {
    message: 'notify',
    paths: ['notify.txt'],
    stage: true,
    provenance: { source: 'manual', operationId: 'notify-operation' },
  })
  expect(changed).toHaveLength(1)
  expect(changed[0]?.replaceAll('\\', '/')).toBe(root.replaceAll('\\', '/'))
})

test('Git commit, branch, and worktree operations use validated paths', async () => {
  const { root, runtime } = await fixture()
  await writeFile(join(root, 'change.txt'), 'change\n')
  const commit = await runtime.commit(root, {
    message: 'add change',
    paths: ['change.txt'],
    stage: true,
    provenance: {
      source: 'auto',
      sessionId: 'session-1',
      runId: 'run-1',
      operationId: 'tool-call-1',
    },
  })
  expect(commit.subject).toBe('add change')
  expect(commit.committedAt).toMatch(/T/)
  expect(commit.provenance).toMatchObject({
    source: 'auto',
    sessionId: 'session-1',
    runId: 'run-1',
    operationId: 'tool-call-1',
  })
  expect((await runtime.log(root, 2)).map((entry) => entry.provenance.source)).toEqual(['auto', 'external'])
  const baseBranch = await runGit(root, ['branch', '--show-current'])
  const created = await runtime.branch(root, { operation: 'create', name: 'feature/hbar' })
  expect(Array.isArray(created)).toBeFalse()
  expect((created as { name: string }).name).toBe('feature/hbar')
  await runtime.branch(root, { operation: 'switch', name: baseBranch })
  const tree = await runtime.worktree(root, { operation: 'add', path: 'feature-tree', branch: 'feature/hbar' })
  expect((tree as { path: string }).path.endsWith('feature-tree')).toBeTrue()
  await runtime.worktree(root, { operation: 'remove', path: 'feature-tree', force: true })
  try {
    await runtime.diff(root, { paths: ['../outside'] })
    throw new Error('expected path validation to reject traversal')
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toContain('escape')
  }
})

test('AI Git commits persist tool-owned session, run, and operation provenance', async () => {
  const { root, runtime } = await fixture()
  await writeFile(join(root, 'automatic.txt'), 'automatic\n')
  const tool = gitTools(runtime).find((candidate) => candidate.name === 'git_commit')
  expect(tool).toBeDefined()
  const result = await tool!.execute(
    { message: 'automatic commit', paths: ['automatic.txt'], stage: true },
    {
      session: { id: 'session-tool' },
      workspace: { id: 'workspace-tool', path: root },
      run: { id: 'run-tool' },
      signal: new AbortController().signal,
      callId: 'call-tool',
    } as ToolContext,
  )
  expect((result.details as GitCommitInfo).provenance).toMatchObject({
    source: 'auto',
    sessionId: 'session-tool',
    runId: 'run-tool',
    operationId: 'call-tool',
  })
  expect((await runtime.log(root, 1))[0]?.provenance.source).toBe('auto')
})

test('Git statistics use first-parent history, explicit sources, and refresh after fast-forward and rewrite', async () => {
  const { root, runtime } = await fixture()
  const baseBranch = await runGit(root, ['branch', '--show-current'])
  await writeFile(join(root, 'manual.txt'), 'one\ntwo\n')
  await runtime.commit(root, {
    message: 'manual statistics commit',
    paths: ['manual.txt'],
    stage: true,
    provenance: { source: 'manual', operationId: 'stats-manual' },
  })
  await runGit(root, ['mv', 'README.md', 'README-renamed.md'])
  await runGit(root, ['commit', '-q', '-m', 'rename readme'])
  await writeFile(join(root, 'binary.dat'), Uint8Array.from([0, 1, 2, 3]))
  await runGit(root, ['add', 'binary.dat'])
  await runGit(root, ['commit', '-q', '-m', 'binary data'])
  await runGit(root, ['switch', '-q', '-c', 'statistics-feature'])
  await writeFile(join(root, 'feature.txt'), 'feature\n')
  await runGit(root, ['add', 'feature.txt'])
  await runGit(root, ['commit', '-q', '-m', 'feature side commit'])
  await runGit(root, ['switch', '-q', baseBranch])
  await writeFile(join(root, 'main.txt'), 'main\n')
  await runGit(root, ['add', 'main.txt'])
  await runGit(root, ['commit', '-q', '-m', 'main commit'])
  await runGit(root, ['merge', '-q', '--no-ff', 'statistics-feature', '-m', 'merge feature'])

  const now = Date.now()
  const options = {
    from: now - 86_400_000,
    to: now + 86_400_000,
    bucketMs: 3_600_000,
    maxBuckets: 48,
    sources: ['auto', 'manual', 'external'] as ('auto' | 'manual' | 'external')[],
  }
  const initial = await runtime.stats(root, options)
  expect(initial).toMatchObject({
    indexMode: 'full',
    indexComplete: true,
    gap: false,
    historyPolicy: 'first-parent',
    renamePolicy: 'separate',
    totals: {
      commits: 6,
      autoCommits: 0,
      manualCommits: 1,
      externalCommits: 5,
      renames: 1,
      binaryFiles: 1,
    },
    binaryLineChanges: { value: null, availability: 'unavailable', reason: 'BINARY_CONTENT' },
  })
  expect(initial.totals.filesChanged).toBeGreaterThanOrEqual(6)
  expect(initial.points.reduce((sum, point) => sum + point.commits, 0)).toBe(6)
  expect((await runtime.stats(root, options)).indexMode).toBe('hit')
  const manualOnly = await runtime.stats(root, { ...options, sources: ['manual'] })
  expect(manualOnly.totals).toMatchObject({ commits: 1, manualCommits: 1, externalCommits: 0 })

  await writeFile(join(root, 'fast-forward.txt'), 'fast forward\n')
  await runGit(root, ['add', 'fast-forward.txt'])
  await runGit(root, ['commit', '-q', '-m', 'fast forward commit'])
  const incremental = await runtime.stats(root, options)
  expect(incremental.indexMode).toBe('incremental')
  expect(incremental.totals.commits).toBe(7)

  await runGit(root, ['commit', '--amend', '-q', '-m', 'rewritten commit'])
  const reindexed = await runtime.stats(root, options)
  expect(reindexed.indexMode).toBe('reindexed')
  expect(reindexed.totals.commits).toBe(7)
  expect(reindexed.totals.externalCommits).toBe(6)

  const bounded = new GitRuntime(root, gitConfigSchema.parse({ maxStatsCommits: 2 }))
  expect(await bounded.stats(root, options)).toMatchObject({
    scannedCommits: 2,
    indexComplete: false,
    gap: true,
  })
})

test('Git statistics scan observes cancellation after its managed process starts', async () => {
  const { root } = await fixture()
  const entered = Promise.withResolvers<void>()
  const processRunner = new ProcessGitRunner()
  const runtime = new GitRuntime(root, gitConfigSchema.parse({}), {
    run(cwd, args, signal, limits) {
      if (args[0] === 'log' && args.includes('--numstat')) {
        entered.resolve()
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      }
      return processRunner.run(cwd, args, signal, limits)
    },
  })
  const controller = new AbortController()
  const now = Date.now()
  const pending = runtime.stats(
    root,
    {
      from: now - 60_000,
      to: now + 60_000,
      bucketMs: 60_000,
      maxBuckets: 2,
      sources: ['external'],
    },
    controller.signal,
  )
  await entered.promise
  controller.abort()
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

test('Git command runner never turns a path into shell syntax', async () => {
  const calls: string[][] = []
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-runner-'))
  roots.push(root)
  const runtime = new GitRuntime(root, gitConfigSchema.parse({}), {
    run: async (_cwd, args) => {
      calls.push(args)
      return { stdout: '', stderr: '', code: 0, truncated: false }
    },
  })
  await runtime.diff(root, { paths: ['name;touch-owned-file'] })
  expect(calls[0]).toContain('name;touch-owned-file')
})

test('Git command timeout is surfaced distinctly from repository failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-timeout-'))
  roots.push(root)
  const runtime = new GitRuntime(root, gitConfigSchema.parse({ timeoutMs: 10 }), {
    run: async () => ({ stdout: '', stderr: '', code: 143, truncated: false, timedOut: true }),
  })
  try {
    await runtime.diff(root)
    throw new Error('expected git timeout')
  } catch (error) {
    expect((error as { code?: string }).code).toBe('GIT_TIMEOUT')
  }
})

test('Git branch tracking keeps exact ahead and behind counts', async () => {
  const { root, runtime } = await fixture()
  const remote = await mkdtemp(join(tmpdir(), 'hbar-git-remote-'))
  roots.push(remote)
  await runGit(remote, ['init', '--bare', '-q'])
  await runGit(root, ['remote', 'add', 'origin', remote])
  await runGit(root, ['push', '-u', 'origin', 'HEAD'])
  for (const number of [1, 2]) {
    await writeFile(join(root, `ahead-${number}.txt`), `${number}\n`)
    await runGit(root, ['add', `ahead-${number}.txt`])
    await runGit(root, ['commit', '-q', '-m', `ahead ${number}`])
  }
  const current = (await runtime.branch(root, { operation: 'list' }) as { name: string; current: boolean; ahead: number; behind: number }[])
    .find((entry) => entry.current)
  expect(current?.ahead).toBe(2)
  expect(current?.behind).toBe(0)
})

test('Git diff to remote reports the remote base and includes working-tree files', async () => {
  const { root, runtime } = await fixture()
  const remote = await mkdtemp(join(tmpdir(), 'hbar-git-remote-'))
  roots.push(remote)
  await runGit(remote, ['init', '--bare', '-q'])
  await runGit(root, ['remote', 'add', 'origin', remote])
  await runGit(root, ['push', '-u', 'origin', 'HEAD'])
  const base = await runGit(root, ['rev-parse', 'HEAD'])
  await writeFile(join(root, 'README.md'), 'changed\n')
  await writeFile(join(root, 'untracked.txt'), 'new\n')
  const diff = await runtime.diffToRemote()
  expect(diff?.sha).toBe(base)
  expect(diff?.diff).toContain('README.md')
  expect(diff?.diff).toContain('untracked.txt')
})
