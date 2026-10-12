import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type { Session, Workspace } from '@hbar/contracts/directory'
import { appPageIds, isAppPageId } from '@hbar/contracts/commands/surfaces'
import { webSurfaceOutlets } from '../apps/web/src/surface-manifest'
import { GlobalFeaturePage } from '../apps/web/src/GlobalFeaturePage'
import { globalFeatureCopy, globalFeaturePageIds } from '../apps/web/src/global-feature-copy'

const workspace: Workspace = { id: 'w1', name: 'Project', path: 'D:/project', createdAt: 1 }
const sessions: Session[] = ['s1', 's2'].map((id) => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}))
const directory: CommandExecutor = {
  async execute(id, raw) {
    const input = raw as Record<string, unknown>
    if (id === 'workspace.get') return input.workspaceId === workspace.id ? workspace : null
    if (id === 'session.get') return sessions.find((item) => item.id === input.sessionId) ?? null
    if (id === 'workspace.list') return { items: [workspace], nextCursor: null }
    if (id === 'session.list') return { items: sessions, nextCursor: null }
    throw new Error(`Unexpected query: ${id}`)
  },
}
const runtime = () =>
  createAppRuntime({ instanceId: 'global-pages', hostId: 'host', directory, surfaces: { canRender: () => true } })

test('global destinations share the public main-page contract and leave session outlets separate', () => {
  for (const id of appPageIds) {
    expect(isAppPageId(id)).toBe(true)
    expect(webSurfaceOutlets[id]).toBe('page')
  }
  for (const id of ['goals', 'agents', 'monitoring', 'activity', 'files'] as const) {
    expect(isAppPageId(id)).toBe(false)
    expect(webSurfaceOutlets[id]).toBe('tool')
  }
})

for (const pageId of globalFeaturePageIds) {
  test(`${pageId} covers the main view and returns to its original session, draft and tool`, async () => {
    const pageKind = pageId === 'run-board' ? 'status' : pageId
    const app = runtime()
    try {
      await app.view.commands.execute('app.setSession', { sessionId: 's1' })
      await app.view.commands.execute('draft.setText', { sessionId: 's1', text: 'unsent draft 原始草稿' })
      const draft = app.view.state.drafts.getSnapshot().s1
      const tool = await app.view.commands.execute('app.openPanel', { panelId: 'monitoring' })
      const page = await app.view.commands.execute('app.openPanel', {
        panelId: pageId,
        workspaceId: 'w1',
        binding: 'pinned',
      })
      expect(app.view.state.presentation.getSnapshot()).toMatchObject({
        page: { kind: pageKind, instanceId: page.instanceId },
        toolInstanceId: null,
        modalInstanceId: null,
        returnContext: { workspaceId: 'w1', sessionId: 's1', toolInstanceId: tool.instanceId },
      })
      if (pageId === 'run-board')
        expect(app.view.state.surfaces.getSnapshot().panels[page.instanceId]?.params.section).toBe('runs')
      expect(app.view.state.surfaces.getSnapshot().panels[page.instanceId]?.sessionId).toBeNull()
      expect(app.view.state.navigation.getSnapshot().sessionId).toBe('s1')
      expect(app.view.state.drafts.getSnapshot().s1).toEqual(draft)
      // Public summaries must accept every global page, including when toggling mobile navigation.
      expect(await app.view.commands.execute('app.setSidebarVisible', { visible: false })).toMatchObject({
        page: pageKind,
      })
      await app.view.commands.execute('app.openPanel', { panelId: 'commands' })
      expect(await app.view.commands.execute('app.back', {})).toMatchObject({ page: pageKind, modalInstanceId: null })
      expect(await app.view.commands.execute('app.back', {})).toMatchObject({
        page: 'session',
        toolInstanceId: tool.instanceId,
      })
      expect(app.view.state.navigation.getSnapshot().sessionId).toBe('s1')
      expect(app.view.state.drafts.getSnapshot().s1).toEqual(draft)
    } finally {
      app.dispose()
    }
  })
}

test('switching global pages preserves one conversation return context; failed navigation stays on its page', async () => {
  const app = runtime()
  try {
    await app.view.commands.execute('app.setSession', { sessionId: 's1' })
    const tool = await app.view.commands.execute('app.openPanel', { panelId: 'goals' })
    for (const pageId of globalFeaturePageIds) await app.view.commands.execute('app.openPanel', { panelId: pageId })
    await expect(app.view.commands.execute('app.setSession', { sessionId: 'missing' })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    })
    expect(app.view.state.presentation.getSnapshot()).toMatchObject({
      page: { kind: 'notifications' },
      returnContext: { sessionId: 's1', toolInstanceId: tool.instanceId },
    })
    await app.view.commands.execute('app.setSession', { sessionId: 's2' })
    expect(app.view.state.presentation.getSnapshot()).toMatchObject({ page: { kind: 'session' }, returnContext: null })
    expect(app.view.state.navigation.getSnapshot().sessionId).toBe('s2')
  } finally {
    app.dispose()
  }
})

test('global pages can open before workspace selection without borrowing a session', async () => {
  const app = runtime()
  try {
    for (const pageId of globalFeaturePageIds) {
      const pageKind = pageId === 'run-board' ? 'status' : pageId
      const page = await app.view.commands.execute('app.openPanel', { panelId: pageId })
      expect(page).toMatchObject({ workspaceId: null, sessionId: null })
      expect(app.view.state.presentation.getSnapshot()).toMatchObject({ page: { kind: pageKind }, toolInstanceId: null })
      if (pageId === 'run-board')
        expect(app.view.state.surfaces.getSnapshot().panels[page.instanceId]?.params.section).toBe('runs')
    }
  } finally {
    app.dispose()
  }
})

test('global page frames render host-owned Chinese and expanded copy with a named return action', () => {
  const copy = globalFeatureCopy('zh-CN')
  const expanded = `${copy.titles.schedules} — very long workspace scheduling and automation settings`
  const markup = renderToStaticMarkup(
    createElement(GlobalFeaturePage, {
      pageId: 'schedules',
      title: expanded,
      backLabel: copy.back,
      onBack: () => {},
      children: copy.workspaceRequired,
    }),
  )
  expect(markup).toContain(expanded)
  expect(markup).toContain(copy.back)
  expect(markup).toContain('data-global-page="schedules"')
  expect(markup).not.toContain('role="dialog"')
})

test('run-board invalidations refresh the active main page and stop refreshing when it is hidden', async () => {
  let invalidate = () => {}
  const queries: unknown[] = []
  const app = createAppRuntime({
    instanceId: 'board-page',
    hostId: 'host',
    directory,
    surfaces: { canRender: () => true },
    runBoardEvents: {
      subscribe: (listener) => {
        invalidate = listener
        return () => {}
      },
    },
    runBoard: {
      async execute(_id, input) {
        queries.push(input)
        return {
          workspaceId: 'w1',
          sessionId: null,
          workspaceName: 'Project',
          sessionTitle: null,
          revision: queries.length,
          observedAt: 1,
          items: [],
          nextCursor: null,
        }
      },
    },
  })
  try {
    await app.view.commands.execute('app.setSession', { sessionId: 's1' })
    const board = await app.view.commands.execute('app.openPanel', {
      panelId: 'run-board',
      workspaceId: 'w1',
      binding: 'pinned',
    })
    expect(board.panelId).toBe('status')
    expect(app.view.state.surfaces.getSnapshot().panels[board.instanceId]?.params.section).toBe('runs')
    expect(
      await app.view.commands.execute('statusWorkspace.refresh', { instanceId: board.instanceId }),
    ).toMatchObject({ section: 'runs', status: 'ready' })
    queries.length = 0
    invalidate()
    await Bun.sleep(0)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ workspaceId: 'w1' })
    expect(queries[0]).not.toHaveProperty('sessionId')
    await app.view.commands.execute('app.openStatus', {
      workspaceId: 'w1',
      section: 'dashboard',
      instanceId: board.instanceId,
      binding: 'pinned',
    })
    invalidate()
    await Bun.sleep(0)
    expect(queries).toHaveLength(1)
    await app.view.commands.execute('app.openStatus', {
      workspaceId: 'w1',
      section: 'runs',
      instanceId: board.instanceId,
      binding: 'pinned',
    })
    invalidate()
    await Bun.sleep(0)
    expect(queries).toHaveLength(2)
    await app.view.commands.execute('app.closePanel', { instanceId: board.instanceId })
    invalidate()
    await Bun.sleep(0)
    expect(queries).toHaveLength(2)
  } finally {
    app.dispose()
  }
})
