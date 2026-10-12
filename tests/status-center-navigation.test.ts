import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'

const directory: CommandExecutor = {
  execute(name) {
    if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
    return Promise.resolve({ items: [], nextCursor: null })
  },
}

test('status sections share one pinned page instance and preserve the original target', async () => {
  const runtime = createAppRuntime({
    hostId: 'host',
    instanceId: 'runtime',
    directory,
    surfaces: { canRender: () => true },
  })
  try {
    await runtime.ready
    const target = {
      workspaceId: 'workspace-a',
      sessionId: 'session-a',
      instanceId: 'status-a',
      binding: 'pinned' as const,
    }
    for (const section of ['dashboard', 'runs', 'usage', 'diagnostics', 'git'] as const) {
      const opened = await runtime.view.commands.execute('app.openStatus', { ...target, section })
      expect(opened.instanceId).toBe(target.instanceId)
      expect(runtime.view.state.surfaces.getSnapshot().panels[target.instanceId]).toMatchObject({
        panelId: 'status',
        workspaceId: target.workspaceId,
        sessionId: target.sessionId,
        params: { section },
      })
      expect(runtime.view.state.presentation.getSnapshot().page).toEqual({
        kind: 'status',
        instanceId: target.instanceId,
      })
    }
    expect(Object.keys(runtime.view.state.surfaces.getSnapshot().panels)).toEqual([target.instanceId])
  } finally {
    runtime.dispose()
  }
})

test('legacy run-board and global diagnostics entry commands reach the status center', async () => {
  const runtime = createAppRuntime({
    hostId: 'host',
    instanceId: 'runtime',
    directory,
    surfaces: { canRender: () => true },
  })
  try {
    await runtime.ready
    const board = await runtime.view.commands.execute('app.openPanel', {
      panelId: 'run-board',
      binding: 'followActive',
    })
    expect(board.panelId).toBe('status')
    expect(runtime.view.state.surfaces.getSnapshot().panels[board.instanceId]?.params.section).toBe('runs')
    expect(
      await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: board.instanceId }),
    ).toMatchObject({ section: 'runs', status: 'ready' })
    const diagnostics = await runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section: 'diagnostics',
    })
    expect(diagnostics.instanceId).toBe(board.instanceId)
    expect(runtime.view.state.surfaces.getSnapshot().panels[diagnostics.instanceId]?.params.section).toBe('diagnostics')
    expect(
      await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: diagnostics.instanceId }),
    ).toMatchObject({ section: 'diagnostics', status: 'ready' })
  } finally {
    runtime.dispose()
  }
})

test('a host offering only legacy settings keeps its diagnostics contract', async () => {
  const runtime = createAppRuntime({
    hostId: 'host',
    instanceId: 'runtime',
    directory,
    surfaces: { canRender: (id) => id === 'settings' },
  })
  try {
    await runtime.ready
    const opened = await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'diagnostics' })
    expect(opened.panelId).toBe('settings')
  } finally {
    runtime.dispose()
  }
})
