import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = {
  id: 'unopened-project',
  path: 'D:/projects/unopened-project',
  name: 'Project',
  createdAt: 1,
}

function makeSession(index: number): Session {
  return {
    id: `timeline-${String(index).padStart(3, '0')}`,
    workspaceId: workspace.id,
    title: `Session ${index}`,
    archived: false,
    parentId: null,
    createdAt: 1_000 + index,
    updatedAt: 2_000 + 100 - index,
    seq: index,
  }
}

test('sidebar mode round-trips, keeps a loaded timeline and canonical Workspace context, and leaves navigation and drafts alone', async () => {
  const sessions = Array.from({ length: 75 }, (_, index) => makeSession(index + 1))
  const activities = sessions.map((session, index) => ({
    session,
    workspace,
    displayName: 'Project Alias',
    execution: {
      state: index === 0 ? ('running' as const) : ('idle' as const),
      activeCount: index === 0 ? 1 : 0,
      queuedCount: 0,
    },
  }))
  const globalLimits: number[] = []
  const sidebarReads: Array<{ organization: string; locale: string }> = []
  const listeners = new Set<() => void>()
  const directory: CommandExecutor = {
    async execute(name, raw) {
      if (name === 'workspace.sidebar.list') {
        const input = raw as { organization: string; locale: string; includeWorkspaceIds: readonly string[] }
        sidebarReads.push({ organization: input.organization, locale: input.locale })
        return {
          revision: 1,
          displayNamesRevision: 2,
          organizationRevision: 3,
          items: [
            { workspace, displayName: 'Project Alias', latestSessionCreatedAt: 1_074, latestSessionUpdatedAt: 2_074 },
          ],
          includedItems: [],
          nextCursor: null,
        }
      }
      if (name === 'session.activity.global.list') {
        const input = raw as {
          readonly cursor?: { readonly sessionId: string }
          readonly limit: number
        }
        globalLimits.push(input.limit)
        const cursorIndex = input.cursor
          ? activities.findIndex((item) => item.session.id === input.cursor?.sessionId) + 1
          : 0
        const start = Math.max(0, cursorIndex)
        const items = activities.slice(start, start + input.limit)
        const last = items.at(-1)
        const nextCursor =
          last && start + items.length < activities.length
            ? {
                revision: 1,
                displayNamesRevision: 2,
                organizationRevision: 3,
                active: last.execution.activeCount > 0,
                updatedAt: last.session.updatedAt,
                sessionId: last.session.id,
              }
            : null
        return { revision: 1, displayNamesRevision: 2, organizationRevision: 3, items, nextCursor }
      }
      if (name === 'workspace.get') return workspace
      if (name === 'session.get') {
        const input = raw as { readonly sessionId: string }
        return sessions.find((item) => item.id === input.sessionId) ?? null
      }
      if (name === 'workspace.list') return { items: [], nextCursor: null }
      if (name === 'session.list') return { items: [], nextCursor: null }
      throw new Error(`Unexpected query: ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: 'runtime-sidebar-activity',
    directory,
    sidebarActivityEvents: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      onConnection(listener) {
        listener(true)
        return () => undefined
      },
    },
  })
  const draftId = crypto.randomUUID()
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    expect(runtime.view.state.workspaceActivity.getSnapshot()).toMatchObject({
      organization: 'recentProject',
      workspaces: { status: 'ready' },
    })

    await runtime.view.commands.execute('workspaceActivity.setOrganization', { organization: 'project' })
    await runtime.view.commands.execute('workspaceActivity.setLocale', { locale: 'zh-CN' })
    expect(sidebarReads.at(-1)).toEqual({ organization: 'project', locale: 'zh-CN' })

    await runtime.view.commands.execute('preSessionDraft.open', { draftId, workspaceId: null })
    await runtime.view.commands.execute('preSessionDraft.setText', {
      draftId,
      text: 'keep this draft',
      expectedRevision: 0,
    })
    await runtime.view.commands.execute('workspaceActivity.toggleTime', {})
    const initialTimeState = runtime.view.state.workspaceActivity.getSnapshot()
    expect(initialTimeState.organization).toBe('time')
    expect(initialTimeState.previousGroupedOrganization).toBe('project')
    expect(initialTimeState.timeline.status).toBe('ready')
    expect(initialTimeState.timeline.hasMore).toBe(true)
    expect(initialTimeState.timeline.items).toHaveLength(60)

    const firstSessionId = runtime.view.state.workspaceActivity.getSnapshot().timeline.items[0]?.sessionId
    if (!firstSessionId) throw new Error('Expected a Session in the Time page')
    expect(runtime.view.state.directory.getSnapshot().workspaces[workspace.id]).toEqual(workspace)
    await runtime.view.commands.execute('app.setSession', { sessionId: firstSessionId, workspaceId: workspace.id })
    await runtime.view.commands.execute('workspaceActivity.loadMore', { scope: 'timeline' })
    expect(runtime.view.state.workspaceActivity.getSnapshot().timeline.items).toHaveLength(75)

    const timeIds = runtime.view.state.workspaceActivity.getSnapshot().timeline.items.map((item) => item.sessionId)
    const readCountBeforeSort = globalLimits.length
    await runtime.view.commands.execute('workspaceActivity.setSort', { sortBy: 'createdAt' })
    expect(runtime.view.state.workspaceActivity.getSnapshot().sortBy).toBe('createdAt')
    expect(runtime.view.state.workspaceActivity.getSnapshot().organization).toBe('time')
    expect(runtime.view.state.workspaceActivity.getSnapshot().timeline.items.map((item) => item.sessionId)).toEqual(
      timeIds,
    )
    expect(globalLimits).toHaveLength(readCountBeforeSort)

    for (const notify of listeners) notify()
    await Bun.sleep(350)
    expect(runtime.view.state.workspaceActivity.getSnapshot().timeline).toMatchObject({
      status: 'ready',
      stale: false,
    })
    expect(runtime.view.state.workspaceActivity.getSnapshot().timeline.items).toHaveLength(75)
    expect(globalLimits.at(-1)).toBe(75)

    const navigation = runtime.view.state.navigation.getSnapshot()
    await runtime.view.commands.execute('workspaceActivity.toggleTime', {})
    expect(runtime.view.state.workspaceActivity.getSnapshot()).toMatchObject({
      organization: 'project',
      previousGroupedOrganization: 'project',
      sortBy: 'createdAt',
    })
    expect(runtime.view.state.navigation.getSnapshot()).toEqual(navigation)
    expect(runtime.view.state.preSessionDrafts.getSnapshot()[draftId]).toMatchObject({
      text: 'keep this draft',
      revision: 1,
    })
    expect(runtime.view.state.directory.getSnapshot().workspaces[workspace.id]).toEqual(workspace)
  } finally {
    runtime.dispose()
  }
})
