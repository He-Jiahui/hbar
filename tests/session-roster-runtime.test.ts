import { expect, test } from 'bun:test'
import { createAppRuntime, type DirectoryState } from '@hbar/app-runtime'
import { directoryCommands } from '@hbar/contracts/commands'
import type { CommandExecutor } from '@hbar/commands'

test('public runtime roster wiring preserves two clients selection/draft while reconciling new, rename and active archive', async () => {
  const workspace = { id: 'project', name: '工程', path: 'D:/fixture/project', createdAt: 1 }
  const initial: DirectoryState['sessions'][string] = {
    id: 'a',
    workspaceId: workspace.id,
    title: 'Initial',
    archived: false,
    parentId: null,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  const records = new Map<string, DirectoryState['sessions'][string]>([['a', initial]])
  const port: CommandExecutor = {
    async execute(name, value) {
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      if (name === 'workspace.get') return workspace
      if (name === 'session.get') return records.get(directoryCommands[name].input.parse(value).sessionId) ?? null
      if (name === 'session.list') {
        const input = directoryCommands[name].input.parse(value)
        const items = [...records.values()]
          .filter((item) => !item.archived && (!input.after || item.id > input.after))
          .sort((left, right) => left.id.localeCompare(right.id))
        return {
          items: items.slice(0, input.limit),
          nextCursor: items.length > input.limit ? items[input.limit - 1]?.id : null,
        }
      }
      throw new Error('Fixture received a roster write or an unsupported read')
    },
  }
  const first = createAppRuntime({ instanceId: 'client-a', hostId: 'fixture', directory: port })
  const second = createAppRuntime({ instanceId: 'client-b', hostId: 'fixture', directory: port })
  try {
    for (const runtime of [first, second]) {
      await runtime.view.commands.execute('workspace.list', {})
      await runtime.view.commands.execute('app.setSession', { sessionId: initial.id, workspaceId: workspace.id })
      await runtime.view.commands.execute('draft.setText', { sessionId: initial.id, text: runtime.view.instanceId })
    }
    const originalDraft = first.view.state.drafts.getSnapshot()
    const originalSelection = first.view.state.navigation.getSnapshot()
    records.set('a', { ...initial, title: 'Other client changed the title', archived: true, updatedAt: 4, seq: 3 })
    records.set('z', { ...initial, id: 'z', title: 'New on the other client', createdAt: 5, updatedAt: 5 })
    await first.view.commands.execute('sessionRoster.refresh', { workspaceId: workspace.id })
    expect(first.view.state.directory.getSnapshot().sessions.a).toMatchObject({
      title: 'Other client changed the title',
      archived: true,
    })
    expect(first.view.state.directory.getSnapshot().sessions.z?.title).toBe('New on the other client')
    expect(first.view.state.navigation.getSnapshot()).toBe(originalSelection)
    expect(first.view.state.drafts.getSnapshot()).toBe(originalDraft)
    expect(second.view.state.directory.getSnapshot().sessions.a?.title).toBe('Initial')
    expect(second.view.state.navigation.getSnapshot().sessionId).toBe('a')
    await first.view.commands.execute('sessionRoster.invalidate', {})
    expect(first.view.state.sessionRosterRefresh.getSnapshot().entries).toEqual({})
  } finally {
    first.dispose()
    second.dispose()
  }
})
