import { expect, test } from 'bun:test'
import {
  createAppRuntime,
  orderWorkspaceActivityIds,
  type ClientJsonValue,
  type ClientPersistencePort,
} from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import type { Workspace } from '@hbar/contracts/directory'

const projects: Workspace[] = ['alpha', 'beta', 'gamma'].map((id) => ({
  id,
  name: id,
  path: `D:/sample/${id}`,
  createdAt: 1,
}))

test('manual project order persists, preserves pin sections and resets on a sort choice', async () => {
  const values = new Map<string, ClientJsonValue>()
  const persistence: ClientPersistencePort = {
    read: (key) => Promise.resolve(values.get(key) ?? null),
    write: (key, value) => {
      values.set(key, value)
      return Promise.resolve()
    },
    remove: (key) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    async execute(name, raw) {
      if (name === 'workspace.sidebar.list')
        return {
          revision: 1,
          displayNamesRevision: 1,
          organizationRevision: 1,
          items: projects.map((workspace, index) => ({
            workspace,
            displayName: workspace.name,
            latestSessionCreatedAt: 3 - index,
            latestSessionUpdatedAt: 3 - index,
          })),
          includedItems: [],
          nextCursor: null,
        }
      if (name === 'workspace.get')
        return projects.find((item) => item.id === (raw as { workspaceId: string }).workspaceId) ?? null
      if (name === 'workspace.list' || name === 'session.list') return { items: [], nextCursor: null }
      if (name === 'session.get') return null
      throw new Error(`Unexpected query: ${name}`)
    },
  }
  const makeRuntime = () =>
    createAppRuntime({ instanceId: crypto.randomUUID(), hostId: 'manual-project-order', directory, persistence })
  let runtime = makeRuntime()
  const ids = () =>
    orderWorkspaceActivityIds(
      runtime.view.state.workspaceActivity.getSnapshot(),
      runtime.view.state.workspacePins.getSnapshot(),
      [],
    )
  const move = (sourceWorkspaceId: string, targetWorkspaceId: string) =>
    runtime.view.commands.execute('workspaceActivity.moveProject', {
      sourceWorkspaceId,
      targetWorkspaceId,
      placement: 'before',
      expectedOrder: [...ids()],
      expectedSortBy: 'updatedAt',
    })
  try {
    await runtime.ready
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    const navigation = runtime.view.state.navigation.getSnapshot()
    await move('gamma', 'alpha')
    expect(ids()).toEqual(['gamma', 'alpha', 'beta'])
    expect(runtime.view.state.navigation.getSnapshot()).toEqual(navigation)
    runtime.dispose()
    runtime = makeRuntime()
    await runtime.ready
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    expect(ids()).toEqual(['gamma', 'alpha', 'beta'])
    await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'beta', expectedPinned: false })
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    expect(ids()).toEqual(['beta', 'gamma', 'alpha'])
    await expect(move('alpha', 'beta')).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    await runtime.view.commands.execute('workspacePins.toggle', { workspaceId: 'beta', expectedPinned: true })
    await runtime.view.commands.execute('workspaceActivity.refresh', {})
    await runtime.view.commands.execute('workspaceActivity.setSort', { sortBy: 'updatedAt' })
    expect(ids()).toEqual(['alpha', 'beta', 'gamma'])
    expect(runtime.view.state.workspaceActivity.getSnapshot().projectOrder).toEqual([])
    await runtime.view.commands.execute('workspaceActivity.setOrganization', { organization: 'project' })
    await expect(move('gamma', 'alpha')).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  } finally {
    runtime.dispose()
  }
})
