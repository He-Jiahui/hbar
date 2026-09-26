import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PluginInfo } from '@hbar/contracts/commands/extensions'

const plugin = (id: string, status: PluginInfo['status'] = 'active'): PluginInfo => ({
  id,
  name: id,
  version: '1.0.0',
  required: false,
  status,
  provides: [],
  requires: [],
  description: 'Plugin fixture',
  config: {},
  installScope: 'global',
  runtimeScope: 'host',
})

function fixture(
  write: (id: string, enabled: boolean) => Promise<PluginInfo[]>,
  read?: { list?: () => Promise<PluginInfo[]>; inspect?: (id: string) => Promise<PluginInfo | null> },
) {
  let plugins = [plugin('a'), plugin('b')]
  let writes = 0
  const runtime = createAppRuntime({
    instanceId: 'plugin-action',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(id, input) {
        if (id === 'skill.list') return []
        if (id === 'plugin.list') return read?.list ? read.list() : plugins
        if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string')
          throw new Error('Expected plugin id')
        if (id === 'plugin.inspect')
          return read?.inspect ? read.inspect(input.id) : (plugins.find((plugin) => plugin.id === input.id) ?? null)
        writes++
        return write(input.id, id === 'plugin.enable')
      },
    },
    surfaces: { canRender: () => true },
  })
  return {
    runtime,
    setPlugins: (next: PluginInfo[]) => {
      plugins = next
    },
    writes: () => writes,
    entry: (instanceId = 'settings') => {
      const entry = runtime.view.state.extensions.getSnapshot().entries[instanceId]
      if (!entry) throw new Error('Missing entry')
      return entry
    },
    async open(instanceId = 'settings') {
      await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'extensions', instanceId })
      await runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId })
    },
    inspect: (pluginId: string, instanceId = 'settings') =>
      runtime.view.commands.execute('extensionWorkspace.inspect', { instanceId, pluginId }),
    change: (enabled: boolean, instanceId = 'settings', pluginId = 'a') =>
      runtime.view.commands.execute('extensionWorkspace.setEnabled', { instanceId, pluginId, enabled }),
  }
}

test('observing current Host value never unlocks an uncertain write, even through another or reopened panel', async () => {
  const value = fixture(async () => {
    throw new CommandError('RESULT_UNKNOWN', 'lost')
  })
  try {
    await value.open()
    await value.inspect('a')
    await expect(value.change(false)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    for (const status of ['active', 'disabled'] as const) {
      value.setPlugins([plugin('a', status), plugin('b')])
      await value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
      await value.inspect('a')
      expect(value.entry().actions.a?.status).toBe('unknown')
      expect(value.entry().detail?.plugin?.status).toBe(status)
      await expect(value.change(status !== 'active')).rejects.toMatchObject({ code: 'BUSY' })
    }
    await value.open('other')
    expect(value.entry('other').actions.a?.status).toBe('unknown')
    await expect(value.change(true, 'other')).rejects.toMatchObject({ code: 'BUSY' })
    await value.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings' })
    await value.open()
    expect(value.entry().actions.a?.status).toBe('unknown')
    expect(value.writes()).toBe(1)
  } finally {
    value.runtime.dispose()
  }
})

test('confirmed reply synchronizes list and current detail without changing selection, query or page', async () => {
  const reply = Promise.withResolvers<PluginInfo[]>()
  const value = fixture(() => reply.promise)
  try {
    await value.open()
    await value.runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId: 'settings', query: 'a' })
    await value.inspect('a')
    const write = value.change(false)
    expect(value.entry().actions.a?.status).toBe('submitting')
    await value.open('other')
    await value.inspect('a', 'other')
    await expect(value.change(false, 'other')).rejects.toMatchObject({ code: 'BUSY' })
    await value.inspect('b')
    reply.resolve([plugin('a', 'disabled'), plugin('b')])
    await write
    expect(value.entry()).toMatchObject({
      query: 'a',
      selectedPluginId: 'b',
      detail: { pluginId: 'b', plugin: { id: 'b' } },
      actions: { a: { status: 'succeeded' } },
    })
    expect(value.entry().plugins[0]?.status).toBe('disabled')
    expect(value.entry('other').detail?.plugin?.status).toBe('disabled')
    expect(value.writes()).toBe(1)
  } finally {
    reply.resolve([])
    value.runtime.dispose()
  }
})

test('a direct acknowledgement updates the displayed detail and list together', async () => {
  const value = fixture(async () => [plugin('a', 'disabled'), plugin('b')])
  try {
    await value.open()
    await value.inspect('a')
    await value.change(false)
    expect(value.entry()).toMatchObject({
      plugins: [{ id: 'a', status: 'disabled' }, { id: 'b' }],
      detail: { pluginId: 'a', plugin: { status: 'disabled' } },
      actions: { a: { status: 'succeeded' } },
    })
  } finally {
    value.runtime.dispose()
  }
})

test('late A acknowledgement cannot roll back an independently acknowledged B value', async () => {
  const a = Promise.withResolvers<PluginInfo[]>()
  const b = Promise.withResolvers<PluginInfo[]>()
  const value = fixture((id) => (id === 'a' ? a.promise : b.promise))
  try {
    await value.open()
    await value.inspect('b')
    const writeA = value.change(false)
    const writeB = value.change(false, 'settings', 'b')
    b.resolve([plugin('a'), plugin('b', 'disabled')])
    await writeB
    a.resolve([plugin('a', 'disabled'), plugin('b')])
    await writeA
    expect(value.entry().plugins.map((plugin) => plugin.status)).toEqual(['disabled', 'disabled'])
    expect(value.entry().detail?.plugin?.status).toBe('disabled')
    expect(value.entry().actions).toMatchObject({ a: { status: 'succeeded' }, b: { status: 'succeeded' } })
  } finally {
    a.resolve([])
    b.resolve([])
    value.runtime.dispose()
  }
})

for (const readKind of ['inspect', 'refresh'] as const)
  test(`a ${readKind} started before an acknowledgement cannot later restore the old value`, async () => {
    const reply = Promise.withResolvers<PluginInfo[]>()
    const oldList = Promise.withResolvers<PluginInfo[]>()
    const oldDetail = Promise.withResolvers<PluginInfo | null>()
    let slow = false
    const value = fixture(() => reply.promise, {
      list: () => (slow ? oldList.promise : Promise.resolve([plugin('a'), plugin('b')])),
      inspect: () => (slow ? oldDetail.promise : Promise.resolve(plugin('a'))),
    })
    try {
      await value.open()
      await value.inspect('a')
      const write = value.change(false)
      slow = true
      const read = (
        readKind === 'inspect'
          ? value.inspect('a')
          : value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
      ).catch((reason: unknown) => reason)
      reply.resolve([plugin('a', 'disabled'), plugin('b')])
      await write
      oldList.resolve([plugin('a'), plugin('b')])
      oldDetail.resolve(plugin('a'))
      expect(await read).toMatchObject({ code: readKind === 'inspect' ? 'CANCELLED' : 'RESULT_UNKNOWN' })
      expect(value.entry().plugins[0]?.status).toBe('disabled')
      expect(value.entry().detail?.plugin?.status).toBe('disabled')
      expect(value.entry().status).toBe('ready')
    } finally {
      reply.resolve([])
      oldList.resolve([])
      oldDetail.resolve(null)
      value.runtime.dispose()
    }
  })

test('a superseded refresh cleanup cannot unlock a newer refresh on the same panel', async () => {
  const oldRead = Promise.withResolvers<PluginInfo[]>()
  const newRead = Promise.withResolvers<PluginInfo[]>()
  let reads = 0
  const value = fixture(async () => [plugin('a', 'disabled'), plugin('b')], {
    list: () => {
      reads++
      if (reads === 1) return Promise.resolve([plugin('a'), plugin('b')])
      return reads === 2 ? oldRead.promise : newRead.promise
    },
  })
  try {
    await value.open()
    const old = value.runtime.view.commands
      .execute('extensionWorkspace.refresh', { instanceId: 'settings' })
      .catch((reason: unknown) => reason)
    await value.change(false)
    const current = value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
    oldRead.resolve([plugin('a'), plugin('b')])
    expect(await old).toMatchObject({ code: 'RESULT_UNKNOWN' })
    await value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
    expect(reads).toBe(3)
    expect(value.entry().status).toBe('loading')
    newRead.resolve([plugin('a', 'disabled'), plugin('b')])
    await current
    expect(value.entry().plugins[0]?.status).toBe('disabled')
  } finally {
    oldRead.resolve([])
    newRead.resolve([])
    value.runtime.dispose()
  }
})

for (const reason of [
  new Error('private payload'),
  new CommandError('DISCONNECTED', 'lost'),
  new CommandError('TIMEOUT', 'lost'),
  new CommandError('CONNECTION_CLOSED', 'lost'),
  new CommandError('EXECUTION_FAILED', 'ambiguous'),
])
  test(`ambiguous ${reason instanceof CommandError ? reason.code : 'plain Error'} write does not become retryable`, async () => {
    const value = fixture(async () => {
      throw reason
    })
    try {
      await value.open()
      await expect(value.change(false)).rejects.toBeDefined()
      expect(value.entry().actions.a?.status).toBe('unknown')
      await value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
      await expect(value.change(false)).rejects.toMatchObject({ code: 'BUSY' })
      expect(value.writes()).toBe(1)
    } finally {
      value.runtime.dispose()
    }
  })

test('an explicit Host BUSY rejection is local and can be manually retried; required never dispatches', async () => {
  let reject = true
  const value = fixture(async () => {
    if (reject) throw new CommandError('BUSY', 'private host detail')
    return [plugin('a', 'disabled'), plugin('b')]
  })
  try {
    await value.open()
    await value.inspect('a')
    await expect(value.change(false)).rejects.toMatchObject({ code: 'BUSY' })
    expect(value.entry().actions.a).toEqual({ status: 'failed', error: 'BUSY' })
    reject = false
    await value.change(false)
    expect(value.entry().actions.a?.status).toBe('succeeded')
    value.setPlugins([{ ...plugin('a'), required: true }, plugin('b')])
    await value.runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId: 'settings' })
    await expect(value.change(false)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(value.writes()).toBe(2)
  } finally {
    value.runtime.dispose()
  }
})

for (const response of [
  [],
  [plugin('a')],
  [plugin('a', 'disabled'), plugin('a', 'disabled')],
  [{ ...plugin('a', 'disabled'), projectId: 'other-project' }],
])
  test('malformed or wrong-target acknowledgement stays unknown and does not replace facts', async () => {
    const value = fixture(async () => response)
    try {
      await value.open()
      await value.inspect('a')
      await expect(value.change(false)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(value.entry().actions.a?.status).toBe('unknown')
      expect(value.entry().detail?.plugin?.status).toBe('active')
    } finally {
      value.runtime.dispose()
    }
  })

test('dispose ignores a late write acknowledgement', async () => {
  const reply = Promise.withResolvers<PluginInfo[]>()
  const value = fixture(() => reply.promise)
  await value.open()
  const write = value.change(false).catch((reason: unknown) => reason)
  const snapshot = value.runtime.view.state.extensions.getSnapshot()
  value.runtime.dispose()
  reply.resolve([plugin('a', 'disabled'), plugin('b')])
  expect(await write).toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(value.runtime.view.state.extensions.getSnapshot()).toBe(snapshot)
})

test('64 uncertain actions remain locked after their panels close; the next write is refused before dispatch', async () => {
  const value = fixture(async () => {
    throw new CommandError('RESULT_UNKNOWN', 'lost')
  })
  try {
    value.setPlugins(Array.from({ length: 65 }, (_, index) => plugin(`plugin-${index}`)))
    await value.open()
    for (let index = 0; index < 64; index++)
      await expect(value.change(false, 'settings', `plugin-${index}`)).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    await value.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings' })
    for (let index = 0; index < 5; index++) {
      await value.open(`panel-${index}`)
      await value.runtime.view.commands.execute('app.closePanel', { instanceId: `panel-${index}` })
    }
    await value.open()
    await value.inspect('plugin-64')
    await expect(value.change(false, 'settings', 'plugin-64')).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
    expect(value.entry().error).toBe('CAPACITY_EXCEEDED')
    await value.inspect('plugin-0')
    expect(value.entry().error).toBeNull()
    expect(value.entry().detail?.pluginId).toBe('plugin-0')
    expect(value.entry().actions['plugin-0']?.status).toBe('unknown')
    await expect(value.change(false, 'settings', 'plugin-64')).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' })
    expect(value.entry().error).toBeNull()
    await expect(value.change(false, 'settings', 'plugin-0')).rejects.toMatchObject({ code: 'BUSY' })
    expect(value.writes()).toBe(64)
    expect(Object.keys(value.entry().actions)).toHaveLength(64)
  } finally {
    value.runtime.dispose()
  }
})

test('terminal action history is evicted at the cap, not an unresolved action', async () => {
  const plugins = Array.from({ length: 65 }, (_, index) => plugin(`plugin-${index}`))
  const value = fixture(async (id) =>
    plugins.map((plugin) => (plugin.id === id ? { ...plugin, status: 'disabled' } : plugin)),
  )
  try {
    value.setPlugins(plugins)
    await value.open()
    for (let index = 0; index < 65; index++) await value.change(false, 'settings', `plugin-${index}`)
    expect(value.writes()).toBe(65)
    expect(Object.keys(value.entry().actions)).toHaveLength(64)
    expect(value.entry().actions['plugin-0']).toBeUndefined()
    expect(value.entry().plugins.every((plugin) => plugin.status === 'disabled')).toBe(true)
  } finally {
    value.runtime.dispose()
  }
})
