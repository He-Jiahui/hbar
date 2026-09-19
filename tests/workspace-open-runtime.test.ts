import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'

const existing = { id: 'existing', name: 'existing', path: 'D:/existing', createdAt: 1 }
const opened = { id: 'opened', name: 'project', path: 'D:/project', createdAt: 2 }
const directory: CommandExecutor = {
  execute(name, input) {
    if (name === 'workspace.get')
      return Promise.resolve((input as { workspaceId: string }).workspaceId === existing.id ? existing : null)
    if (name === 'workspace.list') return Promise.resolve({ items: [existing], nextCursor: null })
    if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
    if (name === 'session.get') return Promise.resolve(null)
    return Promise.reject(new Error(`Unexpected query: ${name}`))
  },
}

test('workspace.open registers through the Host command port and selects the returned stable ID', async () => {
  const calls: { name: string; input: unknown }[] = []
  const runtime = createAppRuntime({
    instanceId: 'workspace-open',
    hostId: 'host',
    directory,
    workspaces: {
      execute(name, input) {
        calls.push({ name, input })
        return Promise.resolve(opened)
      },
    },
  })
  const result = await runtime.view.commands.execute('workspace.open', { path: ' D:/project ' })
  expect(calls).toEqual([{ name: 'workspace.create', input: { path: 'D:/project' } }])
  expect(result).toEqual(opened)
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
    workspaceId: opened.id,
    sessionId: null,
    status: 'idle',
  })
  expect(Object.keys(runtime.view.state.navigation.getSnapshot()).sort()).toEqual([
    'error',
    'sessionId',
    'status',
    'workspaceId',
  ])
  expect(runtime.view.state.directory.getSnapshot().workspaces[opened.id]).toEqual(opened)
  runtime.dispose()
})

test('workspace.open reports unavailable and unknown writes without claiming a new selection', async () => {
  const unavailable = createAppRuntime({ instanceId: 'unavailable', hostId: 'host', directory })
  await expect(unavailable.view.commands.execute('workspace.open', { path: 'D:/project' })).rejects.toHaveProperty(
    'code',
    'CAPABILITY_UNAVAILABLE',
  )
  expect(unavailable.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: null, status: 'error' })
  unavailable.dispose()

  const unknown = createAppRuntime({
    instanceId: 'unknown',
    hostId: 'host',
    directory,
    workspaces: {
      execute() {
        return Promise.reject(new CommandError('RESULT_UNKNOWN', 'inspect the directory before retrying'))
      },
    },
  })
  await unknown.view.commands.execute('app.setWorkspace', { workspaceId: existing.id })
  await expect(unknown.view.commands.execute('workspace.open', { path: 'D:/project' })).rejects.toHaveProperty(
    'code',
    'RESULT_UNKNOWN',
  )
  expect(unknown.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: existing.id, status: 'error' })
  expect(unknown.view.state.directory.getSnapshot().workspaces[opened.id]).toBeUndefined()
  unknown.dispose()
})
