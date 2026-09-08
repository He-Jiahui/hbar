import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index.ts'

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
  expect((await runtime.log(root, 1))[0]?.subject).toBe('initial')
})

test('Git mutations emit an observational change notification after success', async () => {
  const { root } = await fixture()
  const changed: string[] = []
  const runtime = new GitRuntime(root, gitConfigSchema.parse({}), undefined, false, (cwd) => {
    changed.push(cwd)
  })
  await writeFile(join(root, 'notify.txt'), 'change\n')
  await runtime.commit(root, { message: 'notify', paths: ['notify.txt'], stage: true })
  expect(changed).toHaveLength(1)
  expect(changed[0]?.replaceAll('\\', '/')).toBe(root.replaceAll('\\', '/'))
})

test('Git commit, branch, and worktree operations use validated paths', async () => {
  const { root, runtime } = await fixture()
  await writeFile(join(root, 'change.txt'), 'change\n')
  const commit = await runtime.commit(root, { message: 'add change', paths: ['change.txt'], stage: true })
  expect(commit.subject).toBe('add change')
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
