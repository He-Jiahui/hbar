import { afterEach, describe, expect, it } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitRuntime, gitConfigSchema } from '../plugins/git/src/index'
import { createNodeGitRunner, withNodeGitAdmission } from '../packages/node-core/src/git-service'
import { WorkspaceNodeService } from '../packages/node-core/src/service'
import { LocalExecution } from '../plugins/local-tools/src/index'
import { NodeStateStorage } from '../packages/storage/src/node-state'
import { nodeFloorSchema } from '../packages/contracts/src/node'
import type { NodeExecutionBackend, NodeExecutionBackendOptions } from '../packages/node-core/src/execution-backend'

const roots: string[] = []
const teardowns: Array<() => Promise<void>> = []

async function git(cwd: string, ...args: string[]) {
  const child = Bun.spawn(['git', ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(stderr || stdout || `git exited with ${code}`)
}

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-node-git-'))
  roots.push(root)
  await git(root, 'init', '--initial-branch=main')
  await git(root, 'config', 'user.name', 'Node Git Test')
  await git(root, 'config', 'user.email', 'node-git-test@example.invalid')
  await writeFile(join(root, 'tracked.txt'), 'before\n')
  await git(root, 'add', '--', 'tracked.txt')
  await git(root, 'commit', '-m', 'initial')
  return root
}

async function createProductionGitFixture() {
  const root = await createRepository()
  await mkdir(join(root, '.hbar-worktrees'))
  await writeFile(
    join(root, '.git', 'info', 'exclude'),
    `${await readFile(join(root, '.git', 'info', 'exclude'), 'utf8')}\n.hbar-worktrees/\n`,
  )
  const dataRoot = await mkdtemp(join(tmpdir(), 'hbar-node-git-data-'))
  roots.push(dataRoot)
  const state = new NodeStateStorage(join(dataRoot, 'state.sqlite'))
  await state.call('ready', {})
  const floor = nodeFloorSchema.parse({
    roots: [{ rootId: 'repo', name: 'repo', path: root, access: 'write' }],
    process: true,
    network: false,
    backend: 'auto',
    osConfinement: 'required',
    environmentAllowlist: ['PATH'],
  })
  await state.call('floor.set', floor)
  const argvCalls: string[][] = []
  let shellCalls = 0
  const backend: NodeExecutionBackend = {
    name: 'bwrap',
    filesystem: true,
    network: true,
    processTree: true,
    exec: async () => {
      shellCalls += 1
      return { text: '', details: { code: 0 } }
    },
    async execArgv(cwd, argv, signal, options: NodeExecutionBackendOptions) {
      argvCalls.push([...argv])
      signal.throwIfAborted()
      const environment: Record<string, string> = {}
      if (process.env.PATH) environment.PATH = process.env.PATH
      Object.assign(environment, options.environment)
      const child = Bun.spawn([...argv], {
        cwd,
        env: environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
      })
      const abort = () => child.kill('SIGKILL')
      signal.addEventListener('abort', abort, { once: true })
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        return { stdout, stderr, exitCode, truncated: false }
      } finally {
        signal.removeEventListener('abort', abort)
      }
    },
  }
  const node = await WorkspaceNodeService.open('node-test', dataRoot, state, new LocalExecution([dataRoot]), backend)
  node.installGit((registeredRoot) => new GitRuntime(registeredRoot, gitConfigSchema.parse({}), createNodeGitRunner()))
  teardowns.push(async () => {
    await node.dispose()
    await state.close()
  })
  const call = (callId: string) => ({
    operationId: `run:${callId}`,
    rootId: 'repo',
    expectedRoot: root,
    cwd: '.',
    authority: {
      sessionId: 'session',
      runId: 'run',
      callId,
      sandbox: null,
      admission: { kind: 'approved' as const, approvalId: `approval-${callId}` },
    },
  })
  return { root, dataRoot, state, node, backend, argvCalls, call, shellCalls: () => shellCalls }
}

afterEach(async () => {
  await Promise.all(teardowns.splice(0).map((action) => action()))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected refusal')
}

describe('node Git admission runner', () => {
  it('runs status, diff, stage, commit, and log against one admitted temporary repository', async () => {
    const root = await createRepository()
    const calls: string[][] = []
    const runner = createNodeGitRunner()
    const runtime = new GitRuntime(root, gitConfigSchema.parse({}), runner)
    const signal = new AbortController().signal
    const admission = {
      rootPath: root,
      cwd: root,
      async run(
        args: readonly string[],
        callSignal: AbortSignal,
        limits: { timeoutMs: number; maxOutputBytes: number },
      ) {
        callSignal.throwIfAborted()
        expect(limits.timeoutMs).toBeGreaterThan(0)
        expect(limits.maxOutputBytes).toBeGreaterThan(0)
        calls.push([...args])
        const child = Bun.spawn(['git', ...args], {
          cwd: root,
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            PATH: process.env.PATH ?? '',
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
            GIT_TERMINAL_PROMPT: '0',
            GIT_PAGER: 'cat',
          },
        })
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        return { stdout, stderr, code, truncated: false }
      },
    }

    await writeFile(join(root, 'tracked.txt'), 'after\n')
    const status = await withNodeGitAdmission(admission, signal, () => runtime.status(root, signal))
    expect(status.dirty).toBe(true)
    const diff = await withNodeGitAdmission(admission, signal, () => runtime.diff(root, {}, signal))
    expect(diff.diff).toContain('+after')
    const staged = await withNodeGitAdmission(admission, signal, () => runtime.stage(root, ['tracked.txt'], signal))
    expect(staged.paths).toEqual(['tracked.txt'])
    const commit = await withNodeGitAdmission(admission, signal, () =>
      runtime.commit(
        root,
        {
          message: 'node commit',
          provenance: { source: 'manual', sessionId: 'session', runId: 'run', operationId: 'call' },
        },
        signal,
      ),
    )
    const log = await withNodeGitAdmission(admission, signal, () => runtime.log(root, 2, signal))

    expect(commit.subject).toBe('node commit')
    expect(log[0]?.sha).toBe(commit.sha)
    expect(calls.length).toBeGreaterThan(8)
    expect(await readFile(join(root, 'tracked.txt'), 'utf8')).toBe('after\n')
  })

  it('rejects a missing admission and a cwd outside the admitted root', async () => {
    const root = await createRepository()
    const runner = createNodeGitRunner()
    const signal = new AbortController().signal

    await expect(
      runner.run(root, ['status'], signal, { timeoutMs: 1_000, maxOutputBytes: 1_024 }),
    ).rejects.toMatchObject({
      code: 'NODE_GIT_ADMISSION_REQUIRED',
    })
    expect(() =>
      withNodeGitAdmission(
        {
          rootPath: root,
          cwd: join(root, '..', 'outside'),
          run: async () => ({ stdout: '', stderr: '', code: 0, truncated: false }),
        },
        signal,
        async () => undefined,
      ),
    ).toThrow(expect.objectContaining({ code: 'NODE_DENIED' }))
  })

  it('allows a ..cache child while rejecting a path that differs only by case', async () => {
    const root = await createRepository()
    const cache = join(root, '..cache')
    await mkdir(cache)
    const signal = new AbortController().signal
    const runner = createNodeGitRunner()
    let calls = 0
    const admission = {
      rootPath: root,
      cwd: cache,
      async run() {
        calls += 1
        return { stdout: '', stderr: '', code: 0, truncated: false }
      },
    }

    await withNodeGitAdmission(admission, signal, () =>
      runner.run(cache, ['status'], signal, { timeoutMs: 1_000, maxOutputBytes: 1_024 }),
    )
    expect(calls).toBe(1)

    const wrongCase = root.replace('hbar-node-git-', 'Hbar-node-git-')
    expect(() => withNodeGitAdmission({ ...admission, cwd: wrongCase }, signal, async () => undefined)).toThrow(
      expect.objectContaining({ code: 'NODE_DENIED' }),
    )
  })

  it('uses one durable Git receipt and prevents configured filters and commit hooks from running', async () => {
    const f = await createProductionGitFixture()
    const signal = new AbortController().signal
    const hookMarker = join(f.root, 'hook-ran')
    const filterMarker = join(f.root, 'filter-ran')
    const hookPath = join(f.root, '.git', 'hooks', 'pre-commit')
    const hook = `#!/bin/sh\ntouch '${hookMarker.replaceAll('\\', '/')}'\n`
    await writeFile(hookPath, hook)
    await chmod(hookPath, 0o755)
    await writeFile(join(f.root, 'tracked.txt'), 'hook should not execute\n')

    const stage = f.call('stage')
    await f.node.git('git.stage', { ...stage, paths: ['tracked.txt'] }, signal)
    const commit = f.call('commit')
    await f.node.git(
      'git.commit',
      { ...commit, message: 'safe commit', paths: [], stage: false, source: 'auto' },
      signal,
    )
    const argvAfterCommit = f.argvCalls.length
    await f.node.git(
      'git.commit',
      { ...commit, message: 'safe commit', paths: [], stage: false, source: 'auto' },
      signal,
    )
    expect(f.argvCalls).toHaveLength(argvAfterCommit)
    expect(await Bun.file(hookMarker).exists()).toBe(false)

    await writeFile(join(f.root, '.gitattributes'), '*.txt filter=evil\n')
    await writeFile(join(f.root, 'filtered.txt'), 'filter must not run\n')
    await git(f.root, 'config', 'filter.evil.clean', `touch '${filterMarker.replaceAll('\\', '/')}'`)
    const filteredStage = f.call('filtered-stage')
    const rejected = await failure(f.node.git('git.stage', { ...filteredStage, paths: ['filtered.txt'] }, signal))
    expect(rejected).toMatchObject({ code: 'GIT_FILTER_DENIED' })
    expect(await Bun.file(filterMarker).exists()).toBe(false)
    await git(f.root, 'config', '--unset', 'filter.evil.clean')
    await writeFile(join(f.root, '.gitattributes'), '*.txt filter=unspecified\nattribute-only.bin filter=external\n')
    await writeFile(join(f.root, 'attribute-only.bin'), 'external filter must be rejected\n')
    const attributeStage = f.call('attribute-stage')
    const attributeRejected = await failure(
      f.node.git('git.stage', { ...attributeStage, paths: ['attribute-only.bin'] }, signal),
    )
    expect(attributeRejected).toMatchObject({ code: 'GIT_FILTER_DENIED' })
    expect(await Bun.file(filterMarker).exists()).toBe(false)

    const status = f.call('status')
    await f.node.git('git.status', status, signal)
    const callsAfterFirst = f.argvCalls.length
    expect(callsAfterFirst).toBeGreaterThan(3)
    await f.node.git('git.status', status, signal)
    expect(f.argvCalls).toHaveLength(callsAfterFirst)
    expect(await f.state.call('operation.get', { operationId: status.operationId })).toMatchObject({
      kind: 'git',
      receipt: { state: 'settled', result: { isError: false } },
    })
  })

  it('rechecks root identity, process permission and concrete backend floor before accepting Git', async () => {
    const f = await createProductionGitFixture()
    const changedFloor = nodeFloorSchema.parse({ ...f.node.policy, backend: 'container' })
    await f.state.call('floor.set', changedFloor)
    const changedNode = await WorkspaceNodeService.open(
      'node-mismatch',
      f.dataRoot,
      f.state,
      new LocalExecution([f.dataRoot]),
      f.backend,
    )
    changedNode.installGit(
      (registeredRoot) => new GitRuntime(registeredRoot, gitConfigSchema.parse({}), createNodeGitRunner()),
    )
    teardowns.push(async () => changedNode.dispose())
    const request = f.call('floor-mismatch')
    const mismatch = await failure(changedNode.git('git.status', request, new AbortController().signal))
    expect(mismatch).toMatchObject({ code: 'NODE_BACKEND_CHANGED' })
    expect(f.argvCalls).toEqual([])

    const shellRequest = {
      operationId: 'run:shell-floor-mismatch',
      rootId: 'repo',
      expectedRoot: f.root,
      sessionId: 'session',
      runId: 'run',
      callId: 'shell-floor-mismatch',
      sandbox: null,
      admission: { kind: 'approved' as const, approvalId: 'approval-shell-floor-mismatch' },
      cwd: '.',
      command: 'echo should-not-start',
      timeoutMs: 5_000,
    }
    const shellMismatch = await failure(changedNode.start(shellRequest, new AbortController().signal))
    expect(shellMismatch).toMatchObject({ code: 'NODE_BACKEND_CHANGED' })
    expect(f.shellCalls()).toBe(0)
    expect(await f.state.call('operation.get', { operationId: shellRequest.operationId })).toBeNull()
  })
})
