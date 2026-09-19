import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'

const existing = { id: 'existing', name: 'existing', path: 'D:/existing', createdAt: 1 }
const opened = { id: 'opened', name: 'project', path: 'D:/project', createdAt: 2 }
const created = {
  id: 'created-session',
  workspaceId: existing.id,
  title: 'Focused work',
  archived: false,
  parentId: null,
  createdAt: 3,
  updatedAt: 3,
  seq: 0,
}
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

test('app.createSession creates through the Host port and opens the returned session without exposing an ID workflow', async () => {
  const calls: { name: string; input: unknown; idempotencyKey?: string }[] = []
  const runtime = createAppRuntime({
    instanceId: 'session-create',
    hostId: 'host',
    directory,
    workspaces: {
      execute(name, input, options) {
        calls.push({ name, input, ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) })
        return Promise.resolve(created)
      },
    },
  })
  try {
    const result = await runtime.view.commands.execute('app.createSession', {
      workspaceId: existing.id,
      title: ' Focused work ',
    })
    expect(result).toEqual(created)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      name: 'session.create',
      input: { workspaceId: existing.id, title: 'Focused work' },
    })
    expect(calls[0]?.idempotencyKey).toBeString()
    expect(calls[0]?.idempotencyKey).not.toBeEmpty()
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: existing.id,
      sessionId: created.id,
      status: 'idle',
      error: null,
    })
    expect(runtime.view.state.directory.getSnapshot().sessions[created.id]).toEqual(created)
  } finally {
    runtime.dispose()
  }
})

test('app.createSession reuses its internal idempotency key after an unknown Host result', async () => {
  const keys: string[] = []
  let attempt = 0
  const runtime = createAppRuntime({
    instanceId: 'session-create-retry',
    hostId: 'host',
    directory,
    workspaces: {
      execute(_name, _input, options) {
        keys.push(options?.idempotencyKey ?? '')
        attempt += 1
        if (attempt === 1) return Promise.reject(new CommandError('RESULT_UNKNOWN', 'response lost'))
        return Promise.resolve(created)
      },
    },
  })
  try {
    const input = { workspaceId: existing.id, title: 'Focused work' }
    await expect(runtime.view.commands.execute('app.createSession', input)).rejects.toHaveProperty(
      'code',
      'RESULT_UNKNOWN',
    )
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ status: 'error', sessionId: null })
    expect(await runtime.view.commands.execute('app.createSession', input)).toEqual(created)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeString()
    expect(keys[0]).not.toBeEmpty()
    expect(keys[1]).toBe(keys[0])
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: existing.id,
      sessionId: created.id,
      status: 'idle',
    })
  } finally {
    runtime.dispose()
  }
})
