import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import {
  createAppRuntime,
  MAX_WORKSPACE_TABS,
  type ClientJsonValue,
  type ClientPersistencePort,
} from '@hbar/app-runtime'
import { sessionListInputSchema, type Session, type Workspace } from '@hbar/contracts/directory'

const workspace: Workspace = { id: 'w', name: 'Workspace', path: 'D:/workspace', createdAt: 1 }
const session = (id: string, archived = false): Session => ({
  id,
  workspaceId: 'w',
  title: id,
  archived,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
})
function fixture(saved?: unknown) {
  const sessions = new Map<string, Session>()
  const reads: string[] = []
  const values = new Map<string, unknown>()
  if (saved !== undefined)
    values.set('hbar:host:preferences', { version: 1, revision: 1, value: { workspaceTabs: saved, locale: 'zh-CN' } })
  const writes: ClientJsonValue[] = []
  const persistence: ClientPersistencePort = {
    read: (key) => Promise.resolve(values.get(key) ?? null),
    write: (key, value) => {
      values.set(key, value)
      writes.push(value)
      return Promise.resolve()
    },
    remove: (key) => {
      values.delete(key)
      return Promise.resolve()
    },
  }
  const directory: CommandExecutor = {
    execute(name, input) {
      const target = input as { sessionId?: string; workspaceId?: string }
      reads.push(`${name}:${target.sessionId ?? target.workspaceId ?? ''}`)
      if (name === 'session.get') return Promise.resolve(sessions.get(target.sessionId ?? '') ?? null)
      if (name === 'workspace.get') return Promise.resolve(target.workspaceId === workspace.id ? workspace : null)
      if (name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      throw new Error(`Unexpected directory query: ${name}`)
    },
  }
  const create = (workspaces?: CommandExecutor, hostId = 'host') =>
    createAppRuntime({
      instanceId: crypto.randomUUID(),
      hostId,
      directory,
      persistence,
      ...(workspaces ? { workspaces } : {}),
    })
  return { sessions, reads, values, writes, persistence, directory, create }
}

test('tabs follow the original navigation, move by stable IDs, close captured instances and select known nearest survivors', async () => {
  const f = fixture()
  for (const id of ['one', 'two', 'three']) f.sessions.set(id, session(id))
  const runtime = f.create()
  await runtime.ready
  await runtime.view.commands.execute('preferences.set', { key: 'locale', value: 'zh-CN' })
  const commands = runtime.view.commands
  for (const id of ['one', 'two', 'three'])
    await commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['one', 'two', 'three'])
  const capture = runtime.workspaceTabs.capture(['two'])
  runtime.workspaceTabs.move('three', 'one')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['three', 'one', 'two'])
  await runtime.workspaceTabs.select('two')
  await runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ sessionId: 'one', workspaceId: 'w' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('one')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['three', 'one'])
  await commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  const reopened = runtime.workspaceTabs.capture(['two'])
  expect(reopened[0]?.instanceKey).not.toBe(capture[0]?.instanceKey)
  await runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)
  expect(runtime.workspaceTabs.capture(['two'])).toEqual(reopened)
  await runtime.workspaceTabs.closeCaptured(
    runtime.workspaceTabs.capture(['one', 'two', 'three']),
    new AbortController().signal,
  )
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toEqual([])
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
  await runtime.workspaceTabs.whenIdle()
  const saved = f.values.get('hbar:host:preferences') as {
    value: { locale: string; workspaceTabs: { items: unknown[] } }
  }
  expect(saved.value.locale).toBe('zh-CN')
  expect(saved.value.workspaceTabs.items).toHaveLength(0)
  runtime.dispose()
})

test('confirmed empty-draft replacement retains the original tab position and rejects a reopened source', async () => {
  const f = fixture()
  for (const id of ['before', 'source', 'after', 'replacement']) f.sessions.set(id, session(id))
  const runtime = f.create()
  try {
    await runtime.ready
    for (const id of ['before', 'source', 'after'])
      await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
    const source = runtime.workspaceTabs.capture(['source'])[0]
    if (!source) throw new Error('Missing source fixture tab')
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'replacement' })
    const replacement = runtime.workspaceTabs.capture(['replacement'])[0]
    runtime.workspaceTabs.replaceCapturedSession(source, 'replacement')
    expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual([
      'before',
      'replacement',
      'after',
    ])
    expect(runtime.workspaceTabs.capture(['replacement'])[0]).toEqual(replacement)
    expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ sessionId: 'replacement', status: 'idle' })
    expect(f.sessions.get('source')?.archived).toBe(false)

    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'source' })
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'replacement' })
    const before = runtime.view.state.workspaceTabs.getSnapshot()
    expect(() => runtime.workspaceTabs.replaceCapturedSession(source, 'replacement')).toThrow(
      'The original or replacement Session tab changed',
    )
    expect(runtime.view.state.workspaceTabs.getSnapshot()).toBe(before)
    await runtime.workspaceTabs.whenIdle()
  } finally {
    runtime.dispose()
  }
})

test('a thirty-third creation is denied before any Host write, while an existing tab remains selectable', async () => {
  const f = fixture()
  let hostWrites = 0
  const workspaces: CommandExecutor = {
    execute() {
      hostWrites++
      return Promise.resolve(session('new'))
    },
  }
  for (let i = 0; i < MAX_WORKSPACE_TABS; i++) f.sessions.set(`s-${i}`, session(`s-${i}`))
  const runtime = f.create(workspaces)
  await runtime.ready
  for (let i = 0; i < MAX_WORKSPACE_TABS; i++)
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: `s-${i}` })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)
  await expect(
    runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'no-slot' }),
  ).rejects.toMatchObject({ code: 'TAB_LIMIT' })
  expect(hostWrites).toBe(0)
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 's-0' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('s-0')
  runtime.dispose()
})

test('unknown create retains the same reserved idempotency key, blocks a competing write and releases after confirmed retry', async () => {
  const f = fixture()
  for (let i = 0; i < 31; i++) f.sessions.set(`s-${i}`, session(`s-${i}`))
  let hostWrites = 0
  const keys: string[] = []
  const workspaces: CommandExecutor = {
    execute(_name, _input, context) {
      hostWrites++
      keys.push(context?.idempotencyKey ?? '')
      return hostWrites === 1
        ? Promise.reject(new CommandError('RESULT_UNKNOWN', 'Lost receipt'))
        : Promise.resolve(session('created'))
    },
  }
  const runtime = f.create(workspaces)
  await runtime.ready
  for (let i = 0; i < 31; i++)
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: `s-${i}` })
  await expect(
    runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'retry' }),
  ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
  await expect(
    runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'other' }),
  ).rejects.toMatchObject({ code: 'TAB_LIMIT' })
  expect(hostWrites).toBe(1)
  await runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'retry' })
  expect(hostWrites).toBe(2)
  expect(keys[0]).toBe(keys[1])
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.at(-1)?.id).toBe('created')
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('created')
  runtime.dispose()
})

test('concurrent identical creations at 31 tabs share one confirmed key and both Host receipts validate at capacity', async () => {
  const f = fixture()
  for (let i = 0; i < 31; i++) f.sessions.set(`s-${i}`, session(`s-${i}`))
  const firstReceipt = Promise.withResolvers<Session>()
  const secondReceipt = Promise.withResolvers<Session>()
  const entered = Promise.withResolvers<void>()
  const keys: string[] = []
  const workspaces: CommandExecutor = {
    execute(_name, _input, context) {
      keys.push(context?.idempotencyKey ?? '')
      if (keys.length === 2) entered.resolve()
      return keys.length === 1 ? firstReceipt.promise : secondReceipt.promise
    },
  }
  const runtime = f.create(workspaces)
  await runtime.ready
  for (let i = 0; i < 31; i++)
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: `s-${i}` })
  const first = runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'same' })
  const second = runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'same' })
  await entered.promise
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  firstReceipt.resolve(session('created'))
  await expect(first).rejects.toMatchObject({ code: 'NAVIGATION_SUPERSEDED' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(32)
  secondReceipt.resolve(session('created'))
  await expect(second).resolves.toMatchObject({ id: 'created' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('created')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.filter((item) => item.id === 'created')).toHaveLength(1)
  await expect(
    runtime.view.commands.execute('app.createSession', { workspaceId: 'w', title: 'new' }),
  ).rejects.toMatchObject({
    code: 'TAB_LIMIT',
  })
  expect(keys).toHaveLength(2)
  runtime.dispose()
})

test('saved refs restore by exact IDs and Host scope, skip vanished/archived rows and never navigate on restore', async () => {
  const saved = {
    version: 1,
    activeId: null,
    items: ['one', 'missing', 'archived', 'two'].map((id) => ({
      kind: 'session',
      id,
      sessionId: id,
      workspaceId: 'w',
    })),
  }
  const f = fixture(saved)
  for (const id of ['one', 'two']) f.sessions.set(id, session(id))
  f.sessions.set('archived', session('archived', true))
  const runtime = f.create()
  await runtime.ready
  expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({ restoreStatus: 'ready', activeId: null })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['one', 'two'])
  expect(f.reads).toContain('session.get:missing')
  expect(f.reads).not.toContain('workspace.get:archived')
  await runtime.workspaceTabs.whenIdle()
  runtime.dispose()
  const otherHost = f.create(undefined, 'other-host')
  await otherHost.ready
  expect(otherHost.view.state.workspaceTabs.getSnapshot().items).toEqual([])
  otherHost.dispose()
})

test('malformed saved refs report an error and do not partially open or silently truncate', async () => {
  for (const saved of [
    { version: 2, items: [] },
    { version: 1, items: [{ kind: 'session', id: 'one', sessionId: 'two', workspaceId: 'w' }] },
    {
      version: 1,
      items: Array.from({ length: 33 }, (_, i) => ({
        kind: 'session',
        id: `s${i}`,
        sessionId: `s${i}`,
        workspaceId: 'w',
      })),
    },
  ]) {
    const runtime = fixture(saved).create()
    await runtime.ready
    expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({
      restoreStatus: 'error',
      restoreError: 'INVALID_PERSISTED_STATE',
      items: [],
    })
    runtime.dispose()
  }
})

test('a delayed restore cannot overwrite a newer navigation; a delayed selection cannot reopen a closed captured target', async () => {
  const f = fixture({
    version: 1,
    activeId: 'one',
    items: [{ kind: 'session', id: 'one', sessionId: 'one', workspaceId: 'w' }],
  })
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  f.sessions.set('three', session('three'))
  const read = Promise.withResolvers<unknown>()
  const store: ClientPersistencePort = {
    ...f.persistence,
    read: (key) => (key === 'hbar:host:preferences' ? read.promise : f.persistence.read(key)),
  }
  const runtime = createAppRuntime({ instanceId: 'late', hostId: 'host', directory: f.directory, persistence: store })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  read.resolve(f.values.get('hbar:host:preferences'))
  await runtime.ready
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['two'])
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('two')
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'three' })
  const target = runtime.workspaceTabs.capture(['two'])
  await runtime.workspaceTabs.closeCaptured(target, new AbortController().signal)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('three')
  runtime.dispose()
})

test('saved active Session reselects through validated navigation, and the typed public actions route original IDs', async () => {
  const f = fixture({
    version: 1,
    activeId: 'two',
    items: ['one', 'two'].map((id) => ({ kind: 'session', id, sessionId: id, workspaceId: 'w' })),
  })
  for (const id of ['one', 'two']) f.sessions.set(id, session(id))
  const runtime = f.create()
  await runtime.ready
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: 'two' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('two')
  const targets = await runtime.view.commands.execute('workspaceTabs.capture', { ids: ['one'] })
  expect(targets[0]).toMatchObject({ id: 'one', sessionId: 'one' })
  const moved = await runtime.view.commands.execute('workspaceTabs.move', { id: 'one', beforeId: null })
  expect(moved.revision).toBeGreaterThan(0)
  await runtime.view.commands.execute('workspaceTabs.select', { id: 'one' })
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('one')
  await runtime.workspaceTabs.whenIdle()
  const stored = f.values.get('hbar:host:preferences') as { value: { workspaceTabs: { activeId: string } } }
  expect(stored.value.workspaceTabs.activeId).toBe('one')
  runtime.dispose()
})

test('batch close chooses the nearest surviving neighbour relative to the active target, never an earlier noncontiguous target', async () => {
  const f = fixture()
  for (const id of ['a', 'b', 'c', 'd']) f.sessions.set(id, session(id))
  const runtime = f.create()
  await runtime.ready
  for (const id of ['a', 'b', 'c', 'd'])
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['a', 'd']), new AbortController().signal)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('c')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['b', 'c'])
  runtime.dispose()
})

test('closing the selected tab validates an older open neighbour evicted from the bounded directory cache', async () => {
  const f = fixture()
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (name === 'session.list') {
        const request = sessionListInputSchema.parse(input)
        const after = request.after
        const page = after ? Number(after.slice(1)) : 0
        const start = page * 200
        // 63d2ae67 reserves another 320 cache slots for Agent ancestry; 1321 rows force eviction.
        const size = page === 6 ? 121 : 200
        return Promise.resolve({
          items: Array.from({ length: size }, (_, i) => ({
            ...session(`bulk-${start + i}`),
            workspaceId: request.workspaceId,
          })),
          nextCursor: page === 6 ? null : `p${page + 1}`,
        })
      }
      return f.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'eviction', hostId: 'host', directory })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  for (let page = 0; page <= 6; page++)
    await runtime.view.commands.execute('session.list', {
      // Keep each workspace scan within the 1000-version projection fence.
      workspaceId: `bulk-workspace-${page}`,
      limit: 200,
      ...(page ? { after: `p${page}` } : {}),
    })
  expect(runtime.view.state.directory.getSnapshot().sessions.one).toBeUndefined()
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['one', 'two'])
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['two']), new AbortController().signal)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('one')
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('one')
  runtime.dispose()
})

test('closing the selected tab skips archived and deleted neighbours instead of trusting stale cache rows', async () => {
  for (const unavailable of ['archived', 'deleted'] as const) {
    const f = fixture()
    for (const id of ['a', 'b', 'c', 'd']) f.sessions.set(id, session(id))
    const runtime = f.create()
    await runtime.ready
    for (const id of ['a', 'b', 'c', 'd'])
      await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
    if (unavailable === 'archived') f.sessions.set('c', session('c', true))
    else f.sessions.delete('c')
    await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['b']), new AbortController().signal)
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('d')
    expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(
      unavailable === 'archived' ? ['a', 'd'] : ['a', 'c', 'd'],
    )
    runtime.dispose()
  }
})

test('a newer navigation during neighbour validation keeps the captured close unchanged', async () => {
  const f = fixture()
  for (const id of ['a', 'b', 'c']) f.sessions.set(id, session(id))
  const pending = Promise.withResolvers<unknown>()
  let intercept = false
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (intercept && name === 'session.get' && (input as { sessionId: string }).sessionId === 'c')
        return pending.promise
      return f.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'close-race', hostId: 'host', directory })
  await runtime.ready
  for (const id of ['a', 'b', 'c'])
    await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: id })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'b' })
  const capture = runtime.workspaceTabs.capture(['b'])
  intercept = true
  const close = runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)
  intercept = false
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'a' })
  pending.resolve(f.sessions.get('c'))
  await expect(close).rejects.toMatchObject({ code: 'BUSY' })
  expect(runtime.workspaceTabs.capture(['b'])).toEqual(capture)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('a')
  runtime.dispose()
})

test('Keep-close while offline closes only the captured view and returns to the original workspace without claiming a neighbour', async () => {
  const f = fixture()
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  let offline = false
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (offline && name === 'session.get')
        return Promise.reject(new CommandError('CONNECTION_CLOSED', 'Host connection closed'))
      return f.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'offline-close', hostId: 'host', directory })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  offline = true
  await runtime.workspaceTabs.closeCaptured(runtime.workspaceTabs.capture(['two']), new AbortController().signal)
  expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({ items: [{ id: 'one' }], activeId: null })
  expect(runtime.view.state.navigation.getSnapshot()).toMatchObject({ workspaceId: 'w', sessionId: null })
  offline = false
  await runtime.view.commands.execute('workspaceTabs.select', { id: 'one' })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('one')
  runtime.dispose()
})

test('a non-connection validation error keeps the captured close and navigation unchanged', async () => {
  const f = fixture()
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  let invalid = false
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (invalid && name === 'session.get')
        return Promise.reject(new CommandError('INVALID_OUTPUT', 'Malformed Host response'))
      return f.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'invalid-neighbour', hostId: 'host', directory })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  const target = runtime.workspaceTabs.capture(['two'])
  invalid = true
  await expect(runtime.workspaceTabs.closeCaptured(target, new AbortController().signal)).rejects.toMatchObject({
    code: 'INVALID_OUTPUT',
  })
  expect(runtime.workspaceTabs.capture(['two'])).toEqual(target)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('two')
  runtime.dispose()
})

test('a pending navigation makes close BUSY without removing a target or cancelling an unrelated newer selection', async () => {
  const f = fixture()
  for (const id of ['one', 'two', 'three']) f.sessions.set(id, session(id))
  const pending = Promise.withResolvers<unknown>()
  const directory: CommandExecutor = {
    execute: (name, input, options) =>
      name === 'session.get' && (input as { sessionId: string }).sessionId === 'three'
        ? pending.promise
        : f.directory.execute(name, input, options),
  }
  const runtime = createAppRuntime({ instanceId: 'busy', hostId: 'host', directory })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  const capture = runtime.workspaceTabs.capture(['two'])
  const next = runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'three' })
  await expect(runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)).rejects.toMatchObject({
    code: 'BUSY',
  })
  expect(runtime.workspaceTabs.capture(['two'])).toEqual(capture)
  pending.resolve(f.sessions.get('three'))
  await next
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('three')
  await runtime.workspaceTabs.closeCaptured(capture, new AbortController().signal)
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('three')
  runtime.dispose()
})

test('a failed preference write retains local tabs with explicit error and a later confirmed write clears it', async () => {
  const f = fixture()
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  let writes = 0
  const persistence: ClientPersistencePort = {
    ...f.persistence,
    write(key, value) {
      writes++
      if (writes === 1) return Promise.reject(new CommandError('DISCONNECTED', 'Memory write failed'))
      return f.persistence.write(key, value)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'failure', hostId: 'host', directory: f.directory, persistence })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.workspaceTabs.whenIdle()
  expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({
    items: [{ id: 'one' }],
    persistError: 'DISCONNECTED',
  })
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  await runtime.workspaceTabs.whenIdle()
  expect(runtime.view.state.workspaceTabs.getSnapshot().persistError).toBeNull()
  expect(writes).toBe(2)
  runtime.dispose()
})

test('retryPersist writes the current full description without a second navigation or Host Run', async () => {
  const f = fixture()
  f.sessions.set('one', session('one'))
  let writes = 0
  const persistence: ClientPersistencePort = {
    ...f.persistence,
    write(key, value) {
      if (++writes === 1) return Promise.reject(new CommandError('DISCONNECTED', 'Preference write failed'))
      return f.persistence.write(key, value)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'retry-write', hostId: 'host', directory: f.directory, persistence })
  await runtime.ready
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'one' })
  await runtime.workspaceTabs.whenIdle()
  const before = runtime.view.state.workspaceTabs.getSnapshot()
  expect(before.persistError).toBe('DISCONNECTED')
  expect(await runtime.view.commands.execute('workspaceTabs.retryPersist', {})).toEqual({ error: null })
  expect(runtime.view.state.workspaceTabs.getSnapshot().revision).toBe(before.revision)
  expect(writes).toBe(2)
  await expect(runtime.view.commands.execute('workspaceTabs.retryPersist', {})).rejects.toMatchObject({
    code: 'NOT_REQUIRED',
  })
  runtime.dispose()
})

test('retryRestore reloads a failed Host-scoped preferences read and revalidates the saved Session', async () => {
  const f = fixture({
    version: 1,
    activeId: 'one',
    items: [{ kind: 'session', id: 'one', sessionId: 'one', workspaceId: 'w' }],
  })
  f.sessions.set('one', session('one'))
  let reads = 0
  const persistence: ClientPersistencePort = {
    ...f.persistence,
    read(key) {
      if (key === 'hbar:host:preferences' && ++reads === 1)
        return Promise.reject(new CommandError('DISCONNECTED', 'Initial read failed'))
      return f.persistence.read(key)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'retry-read', hostId: 'host', directory: f.directory, persistence })
  await runtime.ready
  expect(runtime.view.state.workspaceTabs.getSnapshot()).toMatchObject({
    restoreStatus: 'error',
    restoreError: 'DISCONNECTED',
    items: [],
  })
  expect(await runtime.view.commands.execute('workspaceTabs.retryRestore', {})).toEqual({
    status: 'ready',
    error: null,
  })
  expect(runtime.view.state.workspaceTabs.getSnapshot().activeId).toBe('one')
  expect(runtime.view.state.workspaceTabs.getSnapshot().items).toHaveLength(1)
  expect(reads).toBe(2)
  await expect(runtime.view.commands.execute('workspaceTabs.retryRestore', {})).rejects.toMatchObject({
    code: 'NOT_REQUIRED',
  })
  runtime.dispose()
})

test('retryRestore cannot steal a navigation made while its validation query is unresolved', async () => {
  const f = fixture({
    version: 1,
    activeId: 'one',
    items: [{ kind: 'session', id: 'one', sessionId: 'one', workspaceId: 'w' }],
  })
  f.sessions.set('one', session('one'))
  f.sessions.set('two', session('two'))
  const pending = Promise.withResolvers<unknown>()
  let reads = 0
  const directory: CommandExecutor = {
    execute(name, input, options) {
      if (name === 'session.get' && (input as { sessionId: string }).sessionId === 'one' && ++reads === 1)
        return Promise.reject(new CommandError('DISCONNECTED', 'Validation failed'))
      if (name === 'session.get' && (input as { sessionId: string }).sessionId === 'one') return pending.promise
      return f.directory.execute(name, input, options)
    },
  }
  const runtime = createAppRuntime({ instanceId: 'retry-race', hostId: 'host', directory, persistence: f.persistence })
  await runtime.ready
  expect(runtime.view.state.workspaceTabs.getSnapshot().restoreStatus).toBe('error')
  const retry = runtime.view.commands.execute('workspaceTabs.retryRestore', {})
  await Promise.resolve()
  await runtime.view.commands.execute('app.setSession', { workspaceId: 'w', sessionId: 'two' })
  pending.resolve(f.sessions.get('one'))
  expect(await retry).toEqual({ status: 'ready', error: null })
  expect(runtime.view.state.workspaceTabs.getSnapshot().items.map((item) => item.id)).toEqual(['two'])
  expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('two')
  runtime.dispose()
})
