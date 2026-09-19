import { expect, test } from 'bun:test'
import { createAppRuntime, type ClientJsonValue, type ClientPersistencePort } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'

const directory: CommandExecutor = {
  execute(name) {
    if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
    return Promise.resolve(null)
  },
}

function memory(initial: Readonly<Record<string, unknown>> = {}) {
  const values = new Map(Object.entries(initial))
  const writes: string[] = []
  const port: ClientPersistencePort = {
    read(key) {
      return Promise.resolve(values.get(key) ?? null)
    },
    write(key, value: ClientJsonValue) {
      values.set(key, value)
      writes.push(key)
      return Promise.resolve()
    },
    remove(key) {
      values.delete(key)
      return Promise.resolve()
    },
  }
  return { port, values, writes }
}

test('layout and preferences restore versioned state and mutate only through commands', async () => {
  const storage = memory()
  const first = createAppRuntime({
    instanceId: 'first',
    hostId: 'host',
    directory,
    persistence: storage.port,
    defaultLayout: { schemaVersion: 1, sidebar: { widthRem: 17 } },
  })
  await first.ready
  const committed = await first.view.commands.execute('layout.commit', {
    description: { schemaVersion: 1, sidebar: { widthRem: 20 } },
    expectedRevision: 0,
  })
  expect(committed).toMatchObject({ revision: 1, persisted: true, source: 'current' })
  await first.view.commands.execute('preferences.set', { key: 'locale', value: 'zh-CN', expectedRevision: 0 })
  expect(Reflect.set(first.view.state.preferences.getSnapshot().values, 'locale', 'corrupt')).toBe(false)
  first.dispose()

  const second = createAppRuntime({
    instanceId: 'second',
    hostId: 'host',
    directory,
    persistence: storage.port,
    defaultLayout: { schemaVersion: 1, sidebar: { widthRem: 17 } },
  })
  await second.ready
  expect(second.view.state.layout.getSnapshot()).toMatchObject({
    revision: 1,
    source: 'saved',
    persisted: true,
    description: { sidebar: { widthRem: 20 } },
  })
  expect(second.view.state.preferences.getSnapshot()).toMatchObject({
    revision: 1,
    persisted: true,
    values: { locale: 'zh-CN' },
  })
  await expect(
    second.view.commands.execute('preferences.set', { key: 'locale', value: 'en-US', expectedRevision: 0 }),
  ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
  second.dispose()
})

test('corrupt or future persisted data falls back per runtime without leaking instances', async () => {
  const storage = memory({
    'hbar:host:layout': { version: 99, revision: 2, value: { corrupt: true } },
    'hbar:host:preferences': { version: 1, revision: -1, value: {} },
  })
  const runtime = createAppRuntime({
    instanceId: 'one',
    hostId: 'host',
    directory,
    persistence: storage.port,
    defaultLayout: { schemaVersion: 1 },
  })
  const isolated = createAppRuntime({
    instanceId: 'two',
    hostId: 'other',
    directory,
    defaultLayout: { marker: 'other' },
  })
  await runtime.ready
  await isolated.ready
  expect(runtime.view.state.layout.getSnapshot()).toMatchObject({
    source: 'default',
    description: { schemaVersion: 1 },
    restoreError: 'UNSUPPORTED_PERSISTED_VERSION',
  })
  expect(runtime.view.state.preferences.getSnapshot()).toMatchObject({
    values: {},
    restoreError: 'INVALID_PERSISTED_STATE',
  })
  await runtime.view.commands.execute('layout.restore', { source: 'default' })
  expect(storage.values.has('hbar:host:layout')).toBe(false)
  expect(isolated.view.state.layout.getSnapshot().description).toEqual({ marker: 'other' })
  runtime.dispose()
  isolated.dispose()
})

test('layout descriptions migrate through a host schema while invalid saved or committed layouts stay isolated', async () => {
  const normalize = (description: Readonly<Record<string, ClientJsonValue>>) => {
    if (description.schemaVersion === 1)
      return {
        schemaVersion: 2,
        modules: [{ moduleId: 'projects', widthRem: description.sidebarWidthRem ?? 17 }],
      }
    if (description.schemaVersion === 2 && Array.isArray(description.modules)) return description
    throw new Error('unsupported layout')
  }
  const storage = memory({
    'hbar:host:layout': {
      version: 1,
      revision: 4,
      value: { schemaVersion: 1, sidebarWidthRem: 20 },
    },
  })
  const runtime = createAppRuntime({
    instanceId: 'layout-migration',
    hostId: 'host',
    directory,
    persistence: storage.port,
    layoutDescription: { normalize },
    defaultLayout: { schemaVersion: 2, modules: [{ moduleId: 'projects', widthRem: 17 }] },
  })
  try {
    await runtime.ready
    expect(runtime.view.state.layout.getSnapshot()).toMatchObject({
      source: 'saved',
      revision: 4,
      persisted: true,
      description: { schemaVersion: 2, modules: [{ moduleId: 'projects', widthRem: 20 }] },
      restoreError: null,
    })
    expect(storage.values.get('hbar:host:layout')).toMatchObject({
      value: { schemaVersion: 1, sidebarWidthRem: 20 },
    })
    await expect(
      runtime.view.commands.execute('layout.commit', {
        description: { schemaVersion: 3 },
        expectedRevision: 4,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(runtime.view.state.layout.getSnapshot()).toMatchObject({ revision: 4, source: 'saved' })
  } finally {
    runtime.dispose()
  }

  const invalidStorage = memory({
    'hbar:invalid:layout': { version: 1, revision: 1, value: { schemaVersion: 3 } },
  })
  const invalid = createAppRuntime({
    instanceId: 'invalid-layout',
    hostId: 'invalid',
    directory,
    persistence: invalidStorage.port,
    layoutDescription: { normalize },
    defaultLayout: { schemaVersion: 2, modules: [] },
  })
  try {
    await invalid.ready
    expect(invalid.view.state.layout.getSnapshot()).toMatchObject({
      source: 'default',
      persisted: false,
      description: { schemaVersion: 2, modules: [] },
      restoreError: 'INVALID_PERSISTED_STATE',
    })
    expect(invalidStorage.values.has('hbar:invalid:layout')).toBe(true)
  } finally {
    invalid.dispose()
  }
})

test('client persistence commands serialize writes and reject oversized JSON', async () => {
  let release: (() => void) | undefined
  const writes: ClientJsonValue[] = []
  const port: ClientPersistencePort = {
    read: () => Promise.resolve(null),
    write(_key, value) {
      writes.push(value)
      if (writes.length === 1) return new Promise<void>((resolve) => (release = resolve))
      return Promise.resolve()
    },
    remove: () => Promise.resolve(),
  }
  const runtime = createAppRuntime({ instanceId: 'one', hostId: 'host', directory, persistence: port })
  await runtime.ready
  const first = runtime.view.commands.execute('preferences.set', { key: 'theme', value: 'dark' })
  const second = runtime.view.commands.execute('preferences.set', { key: 'density', value: 'compact' })
  while (writes.length === 0) await Bun.sleep(1)
  expect(writes).toHaveLength(1)
  release?.()
  await Promise.all([first, second])
  expect(runtime.view.state.preferences.getSnapshot()).toMatchObject({
    revision: 2,
    values: { theme: 'dark', density: 'compact' },
  })
  await expect(
    runtime.view.commands.execute('layout.commit', { description: { value: 'x'.repeat(256 * 1024) } }),
  ).rejects.toHaveProperty('code', 'INPUT_TOO_LARGE')
  runtime.dispose()
})
