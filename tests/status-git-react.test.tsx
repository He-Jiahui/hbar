import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarStatusWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { GitStatsReport } from '@hbar/contracts'
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
      async execute() {
        return report
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
    expect(html).toContain('Automatic commits')
    expect(html).toContain('Files changed')
    expect(html).toContain('BINARY_CONTENT')
    expect(html).toContain('Commit and line-change timeline')
    expect(html).toContain('first-parent')
  } finally {
    runtime.dispose()
  }
})
