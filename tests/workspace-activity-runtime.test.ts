import { expect, test } from 'bun:test'
import { createAppRuntime, type ClientJsonValue, type ClientPersistencePort } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type {
  Session,
  SessionActivityCursor,
  SessionActivitySortBy,
  Workspace,
  WorkspaceActivitySortBy,
} from '@hbar/contracts/directory'
import type { SessionActivityExecution } from '@hbar/contracts/sidebar-directory'

const workspace: Workspace = {
  id: 'project',
  path: 'D:/projects/project',
  name: 'Project',
  createdAt: 1,
}

function session(index: number): Session {
  return {
    id: `session-${String(index).padStart(3, '0')}`,
    workspaceId: workspace.id,
    title: `Session ${index}`,
    archived: false,
    parentId: null,
    createdAt: 2_000 - index,
    updatedAt: 3_000 - index,
    seq: index,
  }
}

function fixture(
  sessions: readonly Session[],
  options: {
    readonly persistence?: ClientPersistencePort
    readonly onWorkspaceActivity?: (sortBy: WorkspaceActivitySortBy) => void
    readonly beforeSessionPage?: () => Promise<void>
    readonly executions?: () => Readonly<Record<string, SessionActivityExecution>>
  } = {},
) {
  const directory: CommandExecutor = {
    async execute(name, raw) {
      if (name === 'session.sidebar.list') {
        await options.beforeSessionPage?.()
        const input = raw as {
          readonly workspaceId: string
          readonly sortBy: SessionActivitySortBy
          readonly cursor?: SessionActivityCursor
          readonly limit: number
        }
        const cursorIndex = input.cursor ? sessions.findIndex((item) => item.id === input.cursor?.sessionId) + 1 : 0
        const start = Math.max(0, cursorIndex)
        const items = sessions.slice(start, start + input.limit)
        const last = items.at(-1)
        const nextCursor: SessionActivityCursor | null =
          last && start + items.length < sessions.length
            ? {
                workspaceId: input.workspaceId,
                sortBy: input.sortBy,
                revision: 1,
                timestamp: input.sortBy === 'createdAt' ? last.createdAt : last.updatedAt,
                sessionId: last.id,
              }
            : null
        return {
          revision: 1,
          items: items.map((session) => ({
            session,
            execution: options.executions?.()[session.id] ?? { state: 'idle', activeCount: 0, queuedCount: 0 },
          })),
          nextCursor,
        }
      }
      if (name === 'workspace.sidebar.list') {
        const input = raw as {
          readonly sortBy: WorkspaceActivitySortBy
          readonly locale: 'en-US' | 'zh-CN'
          readonly organization: 'project' | 'recentProject'
          readonly includeWorkspaceIds: readonly string[]
        }
        options.onWorkspaceActivity?.(input.sortBy)
        return {
          displayNamesRevision: 1,
          organizationRevision: 1,
          revision: 1,
          items: [
            { workspace, displayName: workspace.name, latestSessionCreatedAt: 2_000, latestSessionUpdatedAt: 3_000 },
          ],
          includedItems: [],
          nextCursor: null,
        }
      }
      if (name === 'workspace.list') return { items: [], nextCursor: null }
      if (name === 'workspace.get' || name === 'session.get') return null
      if (name === 'session.list') return { items: [], nextCursor: null }
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'workspace-activity-runtime',
    directory,
    ...(options.persistence ? { persistence: options.persistence } : {}),
  })
}

test('Session activity append preserves the accepted first page in canonical order', async () => {
  const sessions = Array.from({ length: 61 }, (_, index) => session(index))
  const runtime = fixture(sessions)
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
    expect(runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]?.sessionIds).toEqual(
      sessions.slice(0, 60).map((item) => item.id),
    )

    await runtime.view.commands.execute('workspaceActivity.loadMore', { scope: 'sessions', workspaceId: workspace.id })

    expect(runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]).toMatchObject({
      status: 'ready',
      hasMore: false,
      limitReached: false,
      sessionIds: sessions.map((item) => item.id),
    })
    expect(Object.keys(runtime.view.state.directory.getSnapshot().sessions)).toHaveLength(61)
  } finally {
    runtime.dispose()
  }
})

test('explicit refresh recovers a failed preference restore by reading the saved sort without writing', async () => {
  const preferencesKey = 'hbar:workspace-activity-runtime:preferences'
  const values = new Map<string, unknown>([
    [preferencesKey, { version: 99, revision: 4, value: { workspaceActivitySortBy: 'createdAt' } }],
  ])
  const writes: string[] = []
  let queriedSort: WorkspaceActivitySortBy | undefined
  const persistence: ClientPersistencePort = {
    read(key) {
      return Promise.resolve((values.get(key) as ClientJsonValue | undefined) ?? null)
    },
    write(key, value) {
      writes.push(key)
      values.set(key, value)
      return Promise.resolve()
    },
    remove(key) {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const runtime = fixture([], { persistence, onWorkspaceActivity: (sortBy) => (queriedSort = sortBy) })
  try {
    await runtime.ready
    expect(runtime.view.state.workspaceActivity.getSnapshot()).toMatchObject({
      sortBy: 'updatedAt',
      preferenceStatus: 'error',
      preferenceError: 'PERSISTENCE_RESTORE_FAILED',
    })

    values.set(preferencesKey, {
      version: 1,
      revision: 4,
      value: { workspaceActivitySortBy: 'createdAt' },
    })
    await runtime.view.commands.execute('workspaceActivity.refresh', {})

    expect(runtime.view.state.workspaceActivity.getSnapshot()).toMatchObject({
      sortBy: 'createdAt',
      preferenceStatus: 'ready',
      preferenceError: null,
    })
    expect(queriedSort).toBe('createdAt')
    expect(writes).toEqual([])
  } finally {
    runtime.dispose()
  }
})

test('grouped activity refresh keeps loaded rows and replaces execution summaries; failure exposes no false idle facts', async () => {
  const sessions = Array.from({ length: 61 }, (_, index) => session(index))
  const selected = sessions[60]
  if (!selected) throw new Error('Missing final fixture Session')
  let gate: Promise<void> | undefined
  let failed = false
  let executions: Record<string, SessionActivityExecution> = {}
  const runtime = fixture(sessions, {
    beforeSessionPage: async () => {
      if (gate) await gate
      if (failed) throw new Error('Fixture read unavailable')
    },
    executions: () => executions,
  })
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
    await runtime.view.commands.execute('workspaceActivity.loadMore', { scope: 'sessions', workspaceId: workspace.id })
    const pending = Promise.withResolvers<void>()
    gate = pending.promise
    executions = { [selected.id]: { state: 'running', activeCount: 1, queuedCount: 0 } }
    const refresh = runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
    await Bun.sleep(0)
    const during = runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]
    expect(during?.sessionIds).toHaveLength(61)
    expect(during?.status).toBe('loading')
    pending.resolve()
    await refresh
    gate = undefined
    const after = runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]
    expect(after?.sessionIds).toHaveLength(61)
    expect(after?.execution[selected.id]).toEqual({ state: 'running', activeCount: 1, queuedCount: 0 })
    expect(Object.keys(after?.execution ?? {})).toHaveLength(61)
    failed = true
    await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
    const error = runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]
    expect(error?.status).toBe('error')
    expect(error?.sessionIds).toHaveLength(61)
    expect(error?.execution).toEqual({})
    failed = false
    executions = {}
    await runtime.view.commands.execute('workspaceActivity.refresh', { workspaceId: workspace.id })
    expect(
      runtime.view.state.workspaceActivity.getSnapshot().sessions[workspace.id]?.execution[selected.id]?.state,
    ).toBe('idle')
  } finally {
    runtime.dispose()
  }
})
