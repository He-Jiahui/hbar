import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarStatusWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { GitCommitInfo, GitStatsReport, GitStatus } from '@hbar/contracts'
import { getShellCopy } from '../apps/web/src/shell-copy'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const totals = {
  commits: 3,
  autoCommits: 1,
  manualCommits: 1,
  externalCommits: 1,
  filesChanged: 5,
  additions: 20,
  deletions: 4,
  renames: 1,
  binaryFiles: 1,
}
const report: GitStatsReport = {
  accountingVersion: 'git-stats-v1',
  repoId: workspace.path,
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
  totals,
  points: [
    { start: 0, end: 86_400_000, ...totals },
    { start: 86_400_000, end: 172_800_000, ...totals, commits: 1, additions: 5, deletions: 2 },
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
  behind: 0,
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
]

test('Git status renders workspace provenance, changes, bounded series, and policies', async () => {
  const runtime = createAppRuntime({
    instanceId: 'status-git-react',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'workspace.get') return workspace
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.list') return { items: [], nextCursor: null }
        return null
      },
    },
    git: {
      async execute(name: string) {
        if (name === 'git.stats') return report
        if (name === 'git.status') return repositoryStatus
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
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarStatusWorkspace labels={getShellCopy('en-US').status} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Git repository')
    expect(html).toContain('Git query filters')
    expect(html).toContain('More filters')
    expect(html).not.toContain('<select')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('Last 30 days')
    expect(html).toContain('Automatic commits')
    expect(html).toContain('Activity summary')
    expect(html).toContain('origin/main')
    expect(html).toContain('Uncommitted changes')
    expect(html).toContain('Files changed')
    expect(html).toContain('BINARY_CONTENT')
    expect(html).toContain('Commit and line-change timeline')
    expect(html).toContain('role="img" aria-label="Commits"')
    expect(html).toContain('Files changed trend')
    expect(html).toContain('role="img" aria-label="Files changed trend"')
    expect(html).toContain('first-parent')
    expect(html).toContain('Repository and accounting details')
    expect(html).toContain('Recent commit details')
    expect(html).toContain('Automatic checkpoint')
    expect(html).toMatch(
      /<dt[^>]*data-text-context="detail.term"[^>]*>Session<\/dt><dd[^>]*data-text-context="detail.value"[^>]*>session<\/dd>/,
    )
    expect(html).toContain('lumen-compact-metrics')
    expect(html).toMatch(/<small[^>]*>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<\/small>/)
    expect(html).toContain('role="img" aria-label="File and line changes"')
    expect(html).not.toContain('hbar-app-ui-metric-strip')
  } finally {
    runtime.dispose()
  }
})

test('Git status keeps repository selection available for a non-repository workspace', async () => {
  const runtime = createAppRuntime({
    instanceId: 'status-git-no-repository',
    hostId: 'host',
    directory: {
      async execute(name: string) {
        if (name === 'workspace.get') return workspace
        if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
        if (name === 'session.list') return { items: [], nextCursor: null }
        return null
      },
    },
    git: {
      async execute(name: string) {
        if (name === 'git.stats')
          return {
            ...report,
            head: null,
            totals: { ...totals, commits: 0 },
            points: [],
            scannedCommits: 0,
            indexMode: 'empty' as const,
          }
        if (name === 'git.status') return { ...repositoryStatus, root: null, head: null, entries: [], dirty: false }
        if (name === 'git.log') return []
        throw new Error(`Unsupported Git command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    await runtime.view.commands.execute('app.setWorkspace', { workspaceId: workspace.id })
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'git' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarStatusWorkspace labels={getShellCopy('en-US').status} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('The selected workspace is not a Git repository.')
    expect(html).toContain('Repository')
    expect(html).not.toContain('Activity summary')
  } finally {
    runtime.dispose()
  }
})
