import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitCommandClient, type ClientTransport } from '@hbar/client'
import { HbarError } from '@hbar/contracts'
import { createGitCommands } from '@hbar/kernel'
import type { GitService } from '@hbar/plugin-sdk'
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
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`${args.join(' ')}: ${stderr || stdout}`)
  return stdout.trim()
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-git-commands-'))
  roots.push(root)
  await runGit(root, ['init', '-q'])
  await runGit(root, ['config', 'user.name', 'hbar test'])
  await runGit(root, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(root, 'README.md'), 'initial\n')
  await runGit(root, ['add', 'README.md'])
  await runGit(root, ['commit', '-q', '-m', 'initial'])
  return { root, commands: createGitCommands(new GitRuntime(root, gitConfigSchema.parse({}))) }
}

function service(overrides: Partial<GitService> = {}): GitService {
  const commit = {
    sha: 'a'.repeat(40),
    shortSha: 'a'.repeat(7),
    author: 'test',
    authoredAt: '2026-01-01T00:00:00Z',
    subject: 'test',
    provenance: {
      source: 'manual' as const,
      recordedAt: 1,
      sessionId: null,
      runId: null,
      operationId: 'operation-1',
    },
  }
  return {
    info: async () => ({ sha: commit.sha, branch: 'main', originUrl: null }),
    status: async () => ({
      cwd: 'C:/repo',
      root: 'C:/repo',
      branch: 'main',
      head: commit.sha,
      upstream: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      entries: [],
      originUrl: null,
    }),
    diff: async () => ({ cwd: 'C:/repo', diff: '', cached: false, truncated: false }),
    log: async () => [commit],
    stats: async () => ({
      accountingVersion: 'git-stats-v1',
      repoId: 'C:/repo/.git',
      head: commit.sha,
      observedAt: 1,
      from: 0,
      to: 1,
      bucketMs: 60_000,
      sources: ['auto', 'manual', 'external'],
      timeBasis: 'committer',
      timezone: 'UTC',
      historyPolicy: 'first-parent',
      renamePolicy: 'separate',
      binaryLineChanges: { value: 0, availability: 'available', reason: null },
      totals: {
        commits: 0,
        autoCommits: 0,
        manualCommits: 0,
        externalCommits: 0,
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        renames: 0,
        binaryFiles: 0,
      },
      points: [],
      scannedCommits: 0,
      indexMode: 'empty',
      indexComplete: true,
      gap: false,
    }),
    commit: async () => commit,
    branch: async () => [],
    worktree: async () => [],
    diffToRemote: async () => null,
    ...overrides,
  }
}

test('git command adapter queries and mutates one validated repository service', async () => {
  const { root, commands } = await fixture()
  try {
    expect(commands.list().items.map((item) => item.metadata.id)).toEqual([
      'git.branch',
      'git.commit',
      'git.diff',
      'git.diffToRemote',
      'git.info',
      'git.log',
      'git.stats',
      'git.status',
      'git.worktree',
    ])
    expect(commands.describe('git.commit').metadata).toMatchObject({
      execution: 'host',
      kind: 'command',
      stateEffect: 'external',
      scope: 'workspace',
    })
    expect((await commands.execute('git.status', {})).root?.replaceAll('\\', '/')).toBe(root.replaceAll('\\', '/'))
    expect((await commands.execute('git.log', { limit: 1 }))[0]?.subject).toBe('initial')
    expect(await commands.execute('git.diffToRemote', {})).toBeNull()

    await writeFile(join(root, 'change.txt'), 'change\n')
    expect((await commands.execute('git.diff', {})).diff).not.toContain('change.txt')
    const committed = await commands.execute(
      'git.commit',
      { message: 'command commit', paths: ['change.txt'], stage: true, sessionId: 'session-1', runId: 'run-1' },
      { actorId: 'paired-device', requestId: 'manual-operation-1' },
    )
    expect(committed.subject).toBe('command commit')
    expect(committed.provenance).toMatchObject({
      source: 'manual',
      sessionId: 'session-1',
      runId: 'run-1',
      operationId: 'manual-operation-1',
    })
    const now = Date.now()
    const statistics = await commands.execute('git.stats', {
      from: now - 86_400_000,
      to: now + 86_400_000,
      bucketMs: 86_400_000,
      maxBuckets: 2,
      sources: ['manual', 'external'],
    })
    expect(statistics.totals).toMatchObject({ commits: 2, manualCommits: 1, externalCommits: 1 })
    expect((await commands.execute('git.log', { limit: 1 }))[0]?.sha).toBe(committed.sha)
    const branches = await commands.execute('git.branch', { operation: 'list' }, { actorId: 'paired-device' })
    expect(Array.isArray(branches)).toBe(true)
    const worktrees = await commands.execute('git.worktree', { operation: 'list' }, { actorId: 'paired-device' })
    expect(Array.isArray(worktrees)).toBe(true)
  } finally {
    commands.dispose()
  }
})

test('git mutations propagate cancellation and preserve unknown external outcomes', async () => {
  const entered = Promise.withResolvers<void>()
  let calls = 0
  let aborted = false
  const commands = createGitCommands(
    service({
      commit(_cwd, _options, signal) {
        calls++
        entered.resolve()
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              aborted = true
              reject(signal.reason)
            },
            { once: true },
          )
        })
      },
    }),
  )
  try {
    await expect(
      commands.execute(
        'git.commit',
        { message: 'cancelled' },
        { actorId: 'paired-device', signal: AbortSignal.abort() },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(calls).toBe(0)
    const controller = new AbortController()
    const pending = commands.execute(
      'git.commit',
      { message: 'pending' },
      { actorId: 'paired-device', signal: controller.signal },
    )
    await entered.promise
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await Bun.sleep(0)
    expect(aborted).toBe(true)
  } finally {
    commands.dispose()
  }

  const timedOut = createGitCommands(
    service({
      commit: async () => {
        throw new HbarError('GIT_TIMEOUT', 'git timed out')
      },
    }),
  )
  try {
    await expect(
      timedOut.execute('git.commit', { message: 'timeout' }, { actorId: 'paired-device' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  } finally {
    timedOut.dispose()
  }
})

test('git command client treats lost mutation responses as unknown without masking queries', async () => {
  const disconnected = {
    call: async () => {
      throw new HbarError('DISCONNECTED', 'lost response')
    },
  } as unknown as ClientTransport
  const client = createGitCommandClient(disconnected)
  await expect(client.execute('git.commit', { message: 'lost' })).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(client.execute('git.status', {})).rejects.toMatchObject({ code: 'DISCONNECTED' })
})
