import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { workspaceOrganizationApplyInputSchema } from '@hbar/contracts/commands/workspace-organization'
import {
  createWorkspaceNavigationActions,
  defaultSessionWorkspace,
  type WorkspaceNavigationActionState,
} from '../packages/app-react/src/workspace-navigation-actions'

const workspaceA = { id: 'a', name: '当前工程 A', path: 'D:/a', createdAt: 1 }
const workspaceB = { id: 'b', name: '另外一个很长很长的工程 B', path: 'D:/b', createdAt: 2 }
const workspaceOpened = { id: 'opened', name: '新打开的工程', path: 'D:/opened', createdAt: 3 }

function field(input: unknown, key: string): string {
  if (input !== null && typeof input === 'object' && key in input) {
    const value = Reflect.get(input, key) as unknown
    if (typeof value === 'string') return value
  }
  throw new Error(`Missing field: ${key}`)
}

function session(workspaceId: string) {
  return {
    id: `created-${workspaceId}`,
    workspaceId,
    title: 'New session',
    archived: false,
    parentId: null,
    createdAt: 4,
    updatedAt: 4,
    seq: 0,
  }
}

function fixture(
  write?: (name: string, input: unknown, options?: ExecuteOptions) => Promise<unknown>,
  organization?: CommandExecutor,
) {
  const calls: { name: string; input: unknown; key: string | undefined }[] = []
  const states: WorkspaceNavigationActionState[] = []
  const runtime = createAppRuntime({
    instanceId: 'navigation-actions',
    hostId: 'host',
    ...(organization ? { workspaceOrganization: { commands: organization } } : {}),
    directory: {
      execute(name, input) {
        if (name === 'workspace.get')
          return Promise.resolve(
            [workspaceA, workspaceB, workspaceOpened].find(
              (workspace) => workspace.id === field(input, 'workspaceId'),
            ) ?? null,
          )
        if (name === 'workspace.list') return Promise.resolve({ items: [workspaceA, workspaceB], nextCursor: null })
        if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
        if (name === 'session.get') return Promise.resolve(null)
        return Promise.reject(new Error(`Unexpected directory query: ${name}`))
      },
    },
    workspaces: {
      execute(name, input, options) {
        calls.push({ name, input, key: options?.idempotencyKey })
        if (write) return write(name, input, options)
        return Promise.resolve(name === 'workspace.create' ? workspaceOpened : session(field(input, 'workspaceId')))
      },
    },
  })
  let navigationSubscriptions = 0
  const actionView = {
    ...runtime.view,
    state: {
      ...runtime.view.state,
      navigation: {
        getSnapshot: runtime.view.state.navigation.getSnapshot,
        subscribe(listener: () => void) {
          navigationSubscriptions++
          const off = runtime.view.state.navigation.subscribe(listener)
          return () => {
            navigationSubscriptions--
            off()
          }
        },
      },
    },
  }
  const actions = createWorkspaceNavigationActions(actionView, (state) => states.push(state))
  return {
    runtime,
    actions,
    calls,
    states,
    navigationSubscriptions: () => navigationSubscriptions,
    dispose() {
      actions.dispose()
      runtime.dispose()
    },
  }
}

test('new-session default never silently chooses the first project or a stale active ID', () => {
  expect(defaultSessionWorkspace(null, {})).toBeNull()
  expect(defaultSessionWorkspace(null, { a: workspaceA })).toBeNull()
  expect(defaultSessionWorkspace('missing', { a: workspaceA, b: workspaceB })).toBeNull()
  expect(defaultSessionWorkspace('b', { a: workspaceA, b: workspaceB })).toBe('b')
  expect(defaultSessionWorkspace('a', { b: workspaceB, a: workspaceA })).toBe('a')
  expect(defaultSessionWorkspace('toString', { a: workspaceA })).toBeNull()
})

test('one click creates and opens the explicit project rather than the currently selected project', async () => {
  const view = fixture()
  try {
    await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'b' })).toEqual({
      workspaceId: 'b',
      sessionId: 'created-b',
    })
    expect(view.calls).toHaveLength(1)
    expect(view.calls[0]).toMatchObject({ name: 'session.create', input: { workspaceId: 'b' } })
    expect(view.calls[0]?.key).toBeString()
    expect(view.runtime.view.state.directory.getSnapshot().sessions['created-b']?.workspaceId).toBe('b')
    expect(view.runtime.view.state.navigation.getSnapshot()).toMatchObject({
      workspaceId: 'b',
      sessionId: 'created-b',
      status: 'idle',
    })
    expect(view.states.map((state) => state.status)).toEqual(['submitting', 'idle'])
  } finally {
    view.dispose()
  }
})

test('rapid clicks are single-flight and caller mutation cannot change a captured row target', async () => {
  let confirm: ((value: ReturnType<typeof session>) => void) | undefined
  const response = new Promise<ReturnType<typeof session>>((resolve) => {
    confirm = resolve
  })
  const view = fixture(() => response)
  try {
    const action = { kind: 'create-session' as const, workspaceId: 'b' }
    const first = view.actions.run(action)
    action.workspaceId = 'a'
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'a' })).toBeNull()
    expect(await view.actions.reconcile()).toBeNull()
    expect(view.actions.getSnapshot()).toMatchObject({
      status: 'submitting',
      action: { kind: 'create-session', workspaceId: 'b' },
    })
    confirm?.(session('b'))
    expect(await first).toEqual({ workspaceId: 'b', sessionId: 'created-b' })
    expect(view.calls).toHaveLength(1)
  } finally {
    view.dispose()
  }
})

test('unknown creation blocks replacement intents and reconciliation keeps the original input and durable key', async () => {
  let attempt = 0
  const view = fixture((_name, input) => {
    if (++attempt === 1) return Promise.reject(new CommandError('RESULT_UNKNOWN', 'transport detail not for display'))
    return Promise.resolve(session(field(input, 'workspaceId')))
  })
  try {
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'b' })).toBeNull()
    expect(view.actions.getSnapshot()).toEqual({
      status: 'unknown',
      action: { kind: 'create-session', workspaceId: 'b' },
      error: 'RESULT_UNKNOWN',
    })
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'a' })).toBeNull()
    expect(await view.actions.run({ kind: 'open-workspace', path: 'D:/other', createSession: false })).toBeNull()
    await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
    expect(await view.actions.reconcile()).toEqual({ workspaceId: 'b', sessionId: 'created-b' })
    expect(view.calls).toHaveLength(2)
    expect(view.calls[1]?.input).toEqual(view.calls[0]?.input)
    expect(view.calls[1]?.key).toBe(view.calls[0]?.key)
  } finally {
    view.dispose()
  }
})

for (const failure of [
  {
    name: 'connection closed',
    error: () => new CommandError('CONNECTION_CLOSED', 'response lost'),
    code: 'CONNECTION_CLOSED',
  },
  {
    name: 'execution failed after acceptance',
    error: () => new CommandError('EXECUTION_FAILED', 'response lost'),
    code: 'EXECUTION_FAILED',
  },
  {
    name: 'untyped rejection after acceptance',
    error: () => new Error('private transport failure'),
    code: 'EXECUTION_FAILED',
  },
]) {
  test(`${failure.name} retains an unknown original creation and reconciles without another durable write`, async () => {
    const acceptedKeys = new Set<string>()
    let attempt = 0
    const view = fixture((_name, input, options) => {
      if (!options?.idempotencyKey) throw new Error('Expected a durable creation key')
      acceptedKeys.add(options.idempotencyKey)
      if (++attempt === 1) return Promise.reject(failure.error())
      return Promise.resolve(session(field(input, 'workspaceId')))
    })
    try {
      expect(await view.actions.run({ kind: 'create-session', workspaceId: 'b' })).toBeNull()
      expect(view.actions.getSnapshot()).toEqual({
        status: 'unknown',
        action: { kind: 'create-session', workspaceId: 'b' },
        error: failure.code,
      })
      expect(await view.actions.run({ kind: 'create-session', workspaceId: 'a' })).toBeNull()
      expect(await view.actions.reconcile()).toEqual({ workspaceId: 'b', sessionId: 'created-b' })
      expect(view.calls.map((call) => call.input)).toEqual([{ workspaceId: 'b' }, { workspaceId: 'b' }])
      expect(view.calls[1]?.key).toBe(view.calls[0]?.key)
      expect(acceptedKeys.size).toBe(1)
    } finally {
      view.dispose()
    }
  })
}

test('adding a Host directory opens it without creating an unsolicited session', async () => {
  const view = fixture()
  try {
    expect(await view.actions.run({ kind: 'open-workspace', path: ' D:/opened ', createSession: false })).toEqual({
      workspaceId: 'opened',
      sessionId: null,
    })
    expect(view.calls.map(({ name, input }) => ({ name, input }))).toEqual([
      { name: 'workspace.create', input: { path: 'D:/opened' } },
    ])
  } finally {
    view.dispose()
  }
})

test('new-session project acquisition continues with the returned project ID and reconciles only its creation', async () => {
  let creations = 0
  const view = fixture((name, input) => {
    if (name === 'workspace.create') return Promise.resolve(workspaceOpened)
    if (++creations === 1) return Promise.reject(new CommandError('DISCONNECTED', 'lost response'))
    return Promise.resolve(session(field(input, 'workspaceId')))
  })
  try {
    expect(await view.actions.run({ kind: 'open-workspace', path: 'D:/opened', createSession: true })).toBeNull()
    expect(view.actions.getSnapshot()).toMatchObject({
      status: 'unknown',
      action: { kind: 'create-session', workspaceId: 'opened' },
    })
    expect(await view.actions.reconcile()).toEqual({ workspaceId: 'opened', sessionId: 'created-opened' })
    expect(view.calls.map((call) => call.name)).toEqual(['workspace.create', 'session.create', 'session.create'])
    expect(view.calls[1]?.key).toBe(view.calls[2]?.key)
  } finally {
    view.dispose()
  }
})

test('failed opening never creates a session, and a confirmed failure permits a corrected path', async () => {
  let attempts = 0
  const view = fixture(() => {
    if (++attempts === 1) return Promise.reject(new CommandError('INVALID_WORKSPACE', 'private system detail'))
    return Promise.resolve(workspaceOpened)
  })
  try {
    expect(await view.actions.run({ kind: 'open-workspace', path: 'D:/missing', createSession: true })).toBeNull()
    expect(view.actions.getSnapshot()).toMatchObject({ status: 'failed', error: 'INVALID_WORKSPACE' })
    expect(view.calls.map((call) => call.name)).toEqual(['workspace.create'])
    expect(await view.actions.run({ kind: 'open-workspace', path: 'D:/opened', createSession: false })).toEqual({
      workspaceId: 'opened',
      sessionId: null,
    })
  } finally {
    view.dispose()
  }
})

test('selecting an existing project without organization capability makes no Host writes', async () => {
  const view = fixture()
  try {
    expect(await view.actions.run({ kind: 'select-workspace', workspaceId: 'missing' })).toBeNull()
    expect(view.actions.getSnapshot()).toMatchObject({ status: 'failed', error: 'WORKSPACE_NOT_FOUND' })
    expect(await view.actions.run({ kind: 'select-workspace', workspaceId: 'b' })).toEqual({
      workspaceId: 'b',
      sessionId: null,
    })
    expect(view.calls).toHaveLength(0)
  } finally {
    view.dispose()
  }
})

function organizationFixture() {
  let revision = 0
  let hidden = ['a', 'b', 'opened']
  const calls: { name: string; input: unknown }[] = []
  const commands: CommandExecutor = {
    execute(name, input) {
      calls.push({ name, input })
      if (name === 'workspaceOrganization.get')
        return Promise.resolve({ schemaVersion: 1, revision, hiddenWorkspaceIds: [...hidden] })
      if (name !== 'workspaceOrganization.apply') return Promise.reject(new Error(`Unexpected command ${name}`))
      const request = workspaceOrganizationApplyInputSchema.parse(input)
      if (request.expectedRevision !== revision) return Promise.reject(new CommandError('COMMAND_CONFLICT', 'stale'))
      if (request.change.kind !== 'setHidden') return Promise.reject(new Error('Unexpected bulk change'))
      const change = request.change
      if (hidden.includes(change.workspaceId) !== change.expectedHidden)
        return Promise.reject(new CommandError('COMMAND_CONFLICT', 'changed item'))
      hidden = change.hidden ? [...hidden, change.workspaceId] : hidden.filter((id) => id !== change.workspaceId)
      revision++
      return Promise.resolve({ commitId: `commit-${revision}`, revision, request, changed: true })
    },
  }
  return { commands, calls }
}

async function drainReveal(): Promise<void> {
  // These adapters use settled promises only; drain their finite command/reader chain.
  for (let index = 0; index < 30; index++) await Promise.resolve()
}

for (const kind of ['select-workspace', 'create-session'] as const) {
  test(`explicit ${kind} reveals only its successfully selected workspace`, async () => {
    const organization = organizationFixture()
    const view = fixture(undefined, organization.commands)
    try {
      await view.runtime.view.commands.execute('workspaceSidebar.refresh', {})
      await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
      expect(organization.calls.filter((call) => call.name === 'workspaceOrganization.apply')).toEqual([])
      expect(await view.actions.run({ kind, workspaceId: 'b' })).toEqual({
        workspaceId: 'b',
        sessionId: kind === 'create-session' ? 'created-b' : null,
      })
      await drainReveal()
      expect(organization.calls.filter((call) => call.name === 'workspaceOrganization.apply')).toEqual([
        {
          name: 'workspaceOrganization.apply',
          input: {
            expectedRevision: 0,
            change: { kind: 'setHidden', workspaceId: 'b', expectedHidden: true, hidden: false },
          },
        },
      ])
      expect(view.actions.getSnapshot()).toEqual({ status: 'idle', action: null, error: null })
      expect(view.navigationSubscriptions()).toBe(0)
    } finally {
      view.dispose()
    }
  })
}

test('reveal failure belongs to organization feedback, not the successful navigation action', async () => {
  const organization = organizationFixture()
  const view = fixture(undefined, {
    execute(name, input, options) {
      if (name === 'workspaceOrganization.apply')
        return Promise.reject(new CommandError('COMMAND_CONFLICT', 'Another device changed the organization'))
      return organization.commands.execute(name, input, options)
    },
  })
  try {
    await view.runtime.view.commands.execute('workspaceSidebar.refresh', {})
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'b' })).toEqual({
      workspaceId: 'b',
      sessionId: 'created-b',
    })
    await drainReveal()
    expect(view.actions.getSnapshot()).toEqual({ status: 'idle', action: null, error: null })
    expect(view.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'b', status: 'idle' })
    expect(view.runtime.view.state.workspaceOrganization.getSnapshot().action).toMatchObject({
      status: 'failed',
      error: 'COMMAND_CONFLICT',
    })
    expect(view.navigationSubscriptions()).toBe(0)
  } finally {
    view.dispose()
  }
})

for (const outcome of ['dispose', 'navigation-ABA'] as const) {
  test(`slow reveal does not delay navigation and ${outcome} prevents a late hidden-state write`, async () => {
    const read = Promise.withResolvers<unknown>()
    const calls: string[] = []
    const view = fixture(undefined, {
      execute(name) {
        calls.push(name)
        if (name === 'workspaceOrganization.get') return read.promise
        return Promise.reject(new Error('A stale reveal must never dispatch a mutation'))
      },
    })
    try {
      expect(await view.actions.run({ kind: 'select-workspace', workspaceId: 'b' })).toEqual({
        workspaceId: 'b',
        sessionId: null,
      })
      expect(view.actions.getSnapshot()).toEqual({ status: 'idle', action: null, error: null })
      expect(view.navigationSubscriptions()).toBe(0)
      if (outcome === 'dispose') view.actions.dispose()
      else {
        await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
        await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'b' })
      }
      read.resolve({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: ['b'] })
      await drainReveal()
      expect(calls).toEqual(['workspaceOrganization.get'])
      expect(view.runtime.view.state.workspaceOrganization.getSnapshot().snapshot?.hiddenWorkspaceIds).toEqual(['b'])
    } finally {
      read.resolve({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: ['b'] })
      view.dispose()
    }
  })
}

test('unknown creation does not reveal, and reconciliation reveals the original confirmed workspace only', async () => {
  const organization = organizationFixture()
  let attempt = 0
  const view = fixture((_name, input) => {
    if (++attempt === 1) return Promise.reject(new CommandError('RESULT_UNKNOWN', 'Creation receipt lost'))
    return Promise.resolve(session(field(input, 'workspaceId')))
  }, organization.commands)
  try {
    await view.runtime.view.commands.execute('workspaceSidebar.refresh', {})
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'b' })).toBeNull()
    expect(organization.calls.filter((call) => call.name === 'workspaceOrganization.apply')).toEqual([])
    expect(view.navigationSubscriptions()).toBe(0)
    await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
    expect(await view.actions.reconcile()).toEqual({ workspaceId: 'b', sessionId: 'created-b' })
    await drainReveal()
    const writes = organization.calls.filter((call) => call.name === 'workspaceOrganization.apply')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.input).toMatchObject({ change: { workspaceId: 'b', hidden: false } })
    expect(view.calls[0]?.key).toBe(view.calls[1]?.key)
    expect(view.navigationSubscriptions()).toBe(0)
  } finally {
    view.dispose()
  }
})

test('navigation elsewhere during creation is not replaced by a late result or falsely reported as success', async () => {
  let confirm: ((value: ReturnType<typeof session>) => void) | undefined
  let started: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    started = resolve
  })
  const view = fixture(() => {
    started?.()
    return new Promise<ReturnType<typeof session>>((resolve) => {
      confirm = resolve
    })
  })
  try {
    const result = view.actions.run({ kind: 'create-session', workspaceId: 'b' })
    await waiting
    await view.runtime.view.commands.execute('app.setWorkspace', { workspaceId: 'a' })
    confirm?.(session('b'))
    expect(await result).toBeNull()
    expect(view.actions.getSnapshot()).toMatchObject({ status: 'unknown', error: 'NAVIGATION_SUPERSEDED' })
    expect(view.runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'a', sessionId: null })
  } finally {
    view.dispose()
  }
})

test('disposal aborts outstanding navigation and does not publish late UI feedback', async () => {
  let confirm: ((value: ReturnType<typeof session>) => void) | undefined
  let started: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    started = resolve
  })
  const view = fixture(() => {
    started?.()
    return new Promise<ReturnType<typeof session>>((resolve) => {
      confirm = resolve
    })
  })
  try {
    const result = view.actions.run({ kind: 'create-session', workspaceId: 'b' })
    await waiting
    view.actions.dispose()
    confirm?.(session('b'))
    expect(await result).toBeNull()
    expect(await view.actions.run({ kind: 'create-session', workspaceId: 'a' })).toBeNull()
    expect(view.states.map((state) => state.status)).toEqual(['submitting'])
    expect(view.runtime.view.state.navigation.getSnapshot().sessionId).toBeNull()
  } finally {
    view.dispose()
  }
})
