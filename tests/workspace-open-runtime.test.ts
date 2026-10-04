import { expect, test } from 'bun:test'
import { createAppRuntime, type NavigationState } from '@hbar/app-runtime'
import { CommandError, CommandRegistry, createCommandClient, type CommandExecutor } from '@hbar/commands'
import { directoryCommands, navigationCommands } from '@hbar/contracts/commands'
import { registerNavigationCommands } from '../packages/app-runtime/src/navigation'
import { createState } from '../packages/app-runtime/src/state'

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

test('session row commands merge renamed facts and clear an archived active selection', async () => {
  const calls: { name: string; input: unknown }[] = []
  const runtime = createAppRuntime({
    instanceId: 'session-row-actions',
    hostId: 'host',
    directory: {
      execute(name, input) {
        if (name === 'workspace.get') return Promise.resolve(existing)
        if (name === 'session.get')
          return Promise.resolve((input as { sessionId: string }).sessionId === created.id ? created : null)
        if (name === 'workspace.list') return Promise.resolve({ items: [existing], nextCursor: null })
        if (name === 'session.list') return Promise.resolve({ items: [created], nextCursor: null })
        return Promise.reject(new Error(`Unexpected query: ${name}`))
      },
    },
    workspaces: {
      execute(name, input) {
        calls.push({ name, input })
        if (name === 'session.rename')
          return Promise.resolve({ ...created, title: (input as { title: string }).title, updatedAt: 4, seq: 1 })
        if (name === 'session.archive')
          return Promise.resolve({ ...created, title: 'Renamed session', archived: true, updatedAt: 5, seq: 2 })
        return Promise.reject(new Error(`Unexpected write: ${name}`))
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: created.id })
    const renamed = await runtime.view.commands.execute('app.renameSession', {
      sessionId: created.id,
      title: ' Renamed session ',
    })
    expect(renamed).toMatchObject({ id: created.id, title: 'Renamed session', archived: false, seq: 1 })
    expect(runtime.view.state.directory.getSnapshot().sessions[created.id]).toMatchObject({
      title: 'Renamed session',
      seq: 1,
    })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(created.id)

    const archived = await runtime.view.commands.execute('app.archiveSession', { sessionId: created.id })
    expect(archived).toMatchObject({ id: created.id, archived: true, seq: 2 })
    expect(runtime.view.state.directory.getSnapshot().sessions[created.id]?.archived).toBe(true)
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: existing.id,
      sessionId: null,
      status: 'idle',
      error: null,
    })
    expect(calls).toEqual([
      { name: 'session.rename', input: { sessionId: created.id, title: 'Renamed session' } },
      { name: 'session.archive', input: { sessionId: created.id, archived: true } },
    ])
  } finally {
    runtime.dispose()
  }
})

function explicitOpenFixture(
  onOpened: (workspaceId: string, isCurrent: () => boolean) => Promise<void>,
  open: () => Promise<typeof opened> = () => Promise.resolve(opened),
) {
  let disposed = false
  const navigation = createState<NavigationState>(
    { workspaceId: null, sessionId: null, status: 'idle', error: null },
    () => {},
  )
  const registry = new CommandRegistry()
  const queries = createCommandClient(directoryCommands, {
    execute(name, input) {
      if (name === 'workspace.get') {
        const { workspaceId } = directoryCommands['workspace.get'].input.parse(input)
        return Promise.resolve([existing, opened].find((workspace) => workspace.id === workspaceId) ?? null)
      }
      if (name === 'session.get') return Promise.resolve(created)
      return Promise.reject(new Error(`Unexpected fixture query: ${name}`))
    },
  })
  registerNavigationCommands(
    registry,
    queries,
    () => Promise.resolve(created),
    () => Promise.resolve(created),
    () => Promise.resolve(created),
    open,
    navigation,
    () => disposed,
    undefined,
    onOpened,
  )
  return {
    navigation: navigation.reader,
    commands: createCommandClient(navigationCommands, registry),
    dispose() {
      disposed = true
      registry.dispose()
      navigation.dispose()
    },
  }
}

test('explicit workspace.open reveals after confirmed navigation, never for ordinary workspace/session selection', async () => {
  const reveals: { workspaceId: string; current: boolean; selected: string | null }[] = []
  const runtime = explicitOpenFixture((workspaceId, isCurrent) => {
    reveals.push({ workspaceId, current: isCurrent(), selected: runtime.navigation.getSnapshot().workspaceId })
    return Promise.resolve()
  })
  try {
    await runtime.commands.execute('app.setWorkspace', { workspaceId: existing.id })
    await runtime.commands.execute('app.setSession', { sessionId: created.id })
    await runtime.commands.execute('app.createSession', { workspaceId: existing.id })
    expect(reveals).toEqual([])
    expect(await runtime.commands.execute('workspace.open', { path: opened.path })).toEqual(opened)
    expect(reveals).toEqual([{ workspaceId: opened.id, current: true, selected: opened.id }])
    expect(runtime.navigation.getSnapshot()).toEqual({
      workspaceId: opened.id,
      sessionId: null,
      status: 'idle',
      error: null,
    })
  } finally {
    runtime.dispose()
  }
})

for (const synchronous of [true, false]) {
  test(`a ${synchronous ? 'synchronous' : 'rejected'} reveal callback cannot invalidate a successful open`, async () => {
    const runtime = explicitOpenFixture(() => {
      if (synchronous) throw new Error('Unexpected organization callback error')
      return Promise.reject(new CommandError('RESULT_UNKNOWN', 'Organization owner retains recovery state'))
    })
    try {
      expect(await runtime.commands.execute('workspace.open', { path: opened.path })).toEqual(opened)
      expect(runtime.navigation.getSnapshot()).toMatchObject({ workspaceId: opened.id, status: 'idle', error: null })
    } finally {
      runtime.dispose()
    }
  })
}

test('slow reveal does not hold open pending and its guard stays false after navigation ABA', async () => {
  const reveal = Promise.withResolvers<void>()
  const guards: (() => boolean)[] = []
  const runtime = explicitOpenFixture((_workspaceId, isCurrent) => {
    guards.push(isCurrent)
    return reveal.promise
  })
  try {
    expect(await runtime.commands.execute('workspace.open', { path: opened.path })).toEqual(opened)
    expect(runtime.navigation.getSnapshot().status).toBe('idle')
    expect(guards[0]?.()).toBe(true)
    await runtime.commands.execute('app.setWorkspace', { workspaceId: existing.id })
    await runtime.commands.execute('app.setWorkspace', { workspaceId: opened.id })
    expect(guards[0]?.()).toBe(false)
    reveal.resolve()
  } finally {
    reveal.resolve()
    runtime.dispose()
  }
})

test('failed, superseded and disposed workspace opens never reveal a late returned workspace', async () => {
  for (const outcome of ['failed', 'superseded', 'disposed'] as const) {
    const opening = Promise.withResolvers<typeof opened>()
    const reveals: string[] = []
    const runtime = explicitOpenFixture(
      (workspaceId) => {
        reveals.push(workspaceId)
        return Promise.resolve()
      },
      () => opening.promise,
    )
    try {
      const pending = runtime.commands.execute('workspace.open', { path: opened.path })
      const settled = pending.then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      )
      if (outcome === 'failed') opening.reject(new CommandError('INVALID_WORKSPACE', 'Fixture path is invalid'))
      else {
        if (outcome === 'disposed') runtime.dispose()
        else await runtime.commands.execute('app.setWorkspace', { workspaceId: existing.id })
        opening.resolve(opened)
      }
      expect(await settled).toMatchObject({
        value: null,
        error: {
          code:
            outcome === 'failed'
              ? 'INVALID_WORKSPACE'
              : outcome === 'disposed'
                ? 'RESULT_UNKNOWN'
                : 'NAVIGATION_SUPERSEDED',
        },
      })
      await Promise.resolve()
      expect(reveals).toEqual([])
      if (outcome === 'superseded')
        expect(runtime.navigation.getSnapshot()).toMatchObject({ workspaceId: existing.id, status: 'idle' })
    } finally {
      runtime.dispose()
    }
  }
})

test('a reveal callback already started can detect runtime disposal before its own write', async () => {
  const guards: (() => boolean)[] = []
  const runtime = explicitOpenFixture((_workspaceId, isCurrent) => {
    guards.push(isCurrent)
    return Promise.resolve()
  })
  await runtime.commands.execute('workspace.open', { path: opened.path })
  expect(guards[0]?.()).toBe(true)
  runtime.dispose()
  expect(guards[0]?.()).toBe(false)
})
