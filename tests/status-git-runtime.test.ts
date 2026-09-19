import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { GitStatsReport } from '@hbar/contracts'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
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

test('status Git workspace binds statistics to the selected workspace path', async () => {
  let input: unknown
  const runtime = createAppRuntime({
    instanceId: 'status-git',
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
      async execute(name: string, value: unknown) {
        if (name !== 'git.stats') throw new Error(`Unsupported Git command: ${name}`)
        input = value
        return report
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    await runtime.view.commands.execute('app.setWorkspace', { workspaceId: workspace.id })
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'git' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    expect(input).toEqual({
      cwd: workspace.path,
      bucketMs: 86_400_000,
      maxBuckets: 120,
      sources: ['auto', 'manual', 'external'],
    })
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]).toMatchObject({
      section: 'git',
      status: 'ready',
      gitWorkspaceId: workspace.id,
      git: { totals: { commits: 3 }, historyPolicy: 'first-parent' },
    })
  } finally {
    runtime.dispose()
  }
})
