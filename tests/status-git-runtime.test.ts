import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { GitCommitInfo, GitStatsReport, GitStatus } from '@hbar/contracts'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const otherWorkspace = { id: 'other-workspace', path: 'D:/other', name: 'Other workspace', createdAt: 2 }
const report: GitStatsReport = {
  accountingVersion: 'git-stats-v1',
  repoId: 'D:/workspace',
  head: 'a'.repeat(40),
  observedAt: 172_800_000,
  from: 0,
  to: 172_800_000,
  bucketMs: 86_400_000,
  sources: ['auto', 'manual', 'external'],
  timeBasis: 'committer',
  timezone: 'UTC',
  historyPolicy: 'first-parent',
  renamePolicy: 'separate',
  binaryLineChanges: { value: null, availability: 'unavailable', reason: 'BINARY_CONTENT' },
  totals: {
    commits: 3,
    autoCommits: 1,
    manualCommits: 1,
    externalCommits: 1,
    filesChanged: 5,
    additions: 20,
    deletions: 4,
    renames: 1,
    binaryFiles: 1,
  },
  points: [
    {
      start: 0,
      end: 86_400_000,
      commits: 1,
      autoCommits: 1,
      manualCommits: 0,
      externalCommits: 0,
      filesChanged: 2,
      additions: 10,
      deletions: 1,
      renames: 0,
      binaryFiles: 0,
    },
    {
      start: 86_400_000,
      end: 172_800_000,
      commits: 2,
      autoCommits: 0,
      manualCommits: 1,
      externalCommits: 1,
      filesChanged: 3,
      additions: 10,
      deletions: 3,
      renames: 1,
      binaryFiles: 1,
    },
  ],
  scannedCommits: 3,
  indexMode: 'full',
  indexComplete: true,
  gap: false,
}
const repositoryStatus: GitStatus = {
  cwd: workspace.path,
  root: workspace.path,
  branch: 'main',
  head: 'a'.repeat(40),
  upstream: 'origin/main',
  ahead: 1,
  behind: 2,
  dirty: true,
  entries: [{ index: 'M', worktree: ' ', path: 'src/index.ts' }],
  originUrl: null,
}
const commits: GitCommitInfo[] = [
  {
    sha: 'a'.repeat(40),
    shortSha: 'a'.repeat(7),
    author: 'Hbar',
    authoredAt: new Date(Date.now() - 86_400_000).toISOString(),
    committedAt: new Date(Date.now() - 86_400_000).toISOString(),
    subject: 'Automatic checkpoint',
    provenance: {
      source: 'auto',
      recordedAt: Date.now() - 86_400_000,
      sessionId: 'session',
      runId: 'run',
      operationId: 'operation',
    },
  },
  {
    sha: 'b'.repeat(40),
    shortSha: 'b'.repeat(7),
    author: 'User',
    authoredAt: new Date(Date.now() - 86_400_000).toISOString(),
    committedAt: new Date(Date.now() - 86_400_000).toISOString(),
    subject: 'Manual change',
    provenance: { source: 'manual', recordedAt: 1, sessionId: null, runId: null, operationId: null },
  },
  {
    sha: 'c'.repeat(40),
    shortSha: 'c'.repeat(7),
    author: 'External user',
    authoredAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    committedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    subject: 'Older external change',
    provenance: { source: 'external', recordedAt: null, sessionId: null, runId: null, operationId: null },
  },
]
for (let index = 0; index < 97; index += 1) {
  const sha = (index + 16).toString(16).padStart(40, '0')
  commits.push({
    sha,
    shortSha: sha.slice(0, 7),
    author: 'Manual user',
    authoredAt: new Date(Date.now() - 86_400_000).toISOString(),
    committedAt: new Date(Date.now() - 86_400_000).toISOString(),
    subject: `Manual history ${index}`,
    provenance: { source: 'manual', recordedAt: 1, sessionId: null, runId: null, operationId: null },
  })
}

test('status Git workspace owns repository, source, and time filters with bounded commit details', async () => {
  const inputs = new Map<string, unknown[]>()
  const runtime = createAppRuntime({
    instanceId: 'status-git',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'workspace.get') return workspace
        if (name === 'workspace.list') return { items: [workspace, otherWorkspace], nextCursor: null }
        if (name === 'session.list') return { items: [], nextCursor: null }
        return null
      },
    },
    git: {
      async execute(name: string, value: unknown) {
        inputs.set(name, [...(inputs.get(name) ?? []), value])
        const cwd = (value as { cwd: string }).cwd
        if (name === 'git.stats') return { ...report, repoId: cwd }
        if (name === 'git.status') return { ...repositoryStatus, cwd, root: cwd }
        if (name === 'git.log') return commits
        throw new Error(`Unsupported Git command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    await runtime.view.commands.execute('app.setWorkspace', { workspaceId: workspace.id })
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'git' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    const initial = inputs.get('git.stats')?.[0] as Record<string, unknown>
    expect(initial).toMatchObject({
      cwd: workspace.path,
      bucketMs: 86_400_000,
      maxBuckets: 30,
      sources: ['auto', 'manual', 'external'],
    })
    expect((initial.to as number) - (initial.from as number)).toBe(2_592_000_000)
    expect(inputs.get('git.status')?.[0]).toEqual({ cwd: workspace.path })
    expect(inputs.get('git.log')?.[0]).toEqual({ cwd: workspace.path, limit: 100 })
    await runtime.view.commands.execute('workspace.list', { limit: 100 })
    await runtime.view.commands.execute('statusWorkspace.setGitQuery', {
      instanceId: panel.instanceId,
      workspaceId: otherWorkspace.id,
      window: '7d',
      sources: ['auto', 'external'],
    })
    const filtered = inputs.get('git.stats')?.[1] as Record<string, unknown>
    expect(filtered).toMatchObject({
      cwd: otherWorkspace.path,
      bucketMs: 86_400_000,
      maxBuckets: 7,
      sources: ['auto', 'external'],
    })
    expect((filtered.to as number) - (filtered.from as number)).toBe(604_800_000)
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]).toMatchObject({
      section: 'git',
      status: 'ready',
      gitWorkspaceId: otherWorkspace.id,
      git: { totals: { commits: 3 }, historyPolicy: 'first-parent' },
      gitStatus: { branch: 'main', dirty: true, entries: [{ path: 'src/index.ts' }] },
      gitQuery: { workspaceId: otherWorkspace.id, window: '7d', sources: ['auto', 'external'] },
      gitCommits: [{ subject: 'Automatic checkpoint', provenance: { source: 'auto' } }],
      gitHistoryTruncated: true,
    })
  } finally {
    runtime.dispose()
  }
})
