import { expect, spyOn, test } from 'bun:test'
import { CommandError, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import type { PluginInfo, SkillDescriptor } from '@hbar/contracts/commands/extensions'

const plugin = (id = 'plugin-a', status: PluginInfo['status'] = 'active'): PluginInfo => ({
  id,
  name: id,
  version: '1.0.0',
  required: false,
  status,
  provides: [],
  requires: [],
  description: 'Fixture',
  config: {},
})
const skill = (id = 'skill-a'): SkillDescriptor => ({ id, path: `D:/fixture/${id}`, scope: 'global' })
const outcome = (request: Promise<unknown>) =>
  request.then(
    () => null,
    (error: unknown) => error,
  )
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('Fixture did not settle within its bounded observation window')
}
function fixture() {
  const calls: { name: string; signal: AbortSignal | undefined }[] = []
  let plugins: PluginInfo[] = [plugin()]
  let skills: SkillDescriptor[] = [skill()]
  const errors: { plugins: unknown; skills: unknown } = { plugins: null, skills: null }
  const gates: { plugins: Promise<void> | null; skills: Promise<void> | null } = { plugins: null, skills: null }
  let writeUnknown = false
  const runtime = createAppRuntime({
    instanceId: 'collection-test',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    extensions: {
      async execute(name, input, execution) {
        calls.push({ name, signal: execution?.signal })
        if (name === 'plugin.list' || name === 'skill.list') {
          const collection = name === 'plugin.list' ? 'plugins' : 'skills'
          const result = collection === 'plugins' ? plugins : skills
          const error = errors[collection]
          await gates[collection]
          if (error) throw error
          return result
        }
        if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string')
          throw new Error('Fixture target required')
        const id = input.id
        if (name === 'plugin.inspect') return plugins.find((item) => item.id === id) ?? null
        if (name === 'plugin.enable' || name === 'plugin.disable') {
          plugins = plugins.map((item) =>
            item.id === id ? { ...item, status: name === 'plugin.enable' ? 'active' : 'disabled' } : item,
          )
          if (writeUnknown) throw new CommandError('RESULT_UNKNOWN', 'Lost fixture ACK')
          return plugins
        }
        throw new Error('Unexpected fixture command')
      },
    },
    surfaces: { canRender: () => true },
  })
  return {
    runtime,
    calls,
    errors,
    gates,
    setPlugins(value: PluginInfo[]) {
      plugins = value
    },
    setSkills(value: SkillDescriptor[]) {
      skills = value
    },
    setWriteUnknown(value: boolean) {
      writeUnknown = value
    },
    async open(instanceId = 'settings') {
      await runtime.view.commands.execute('app.openSettings', { scope: 'global', section: 'extensions', instanceId })
    },
    entry(instanceId = 'settings') {
      const value = runtime.view.state.extensions.getSnapshot().entries[instanceId]
      if (!value) throw new Error('Expected extension projection')
      return value
    },
    refresh(instanceId = 'settings', collection?: 'plugins' | 'skills', options?: ExecuteOptions) {
      return runtime.view.commands.execute('extensionWorkspace.refresh', { instanceId, collection }, options)
    },
    dispose() {
      runtime.dispose()
    },
  }
}

test('a failed Skills read cannot erase the successful Plugins collection', async () => {
  const f = fixture()
  try {
    await f.open()
    f.errors.skills = new CommandError('UNAUTHORIZED', 'Private fixture error')
    expect(await outcome(f.refresh())).toMatchObject({ code: 'UNAUTHORIZED' })
    expect(f.entry().plugins.map((item) => item.id)).toEqual(['plugin-a'])
    expect(f.entry().skills).toEqual([])
    expect(f.entry().collections).toEqual({
      plugins: { status: 'ready', hasSnapshot: true, error: null, requestInFlight: false },
      skills: { status: 'error', hasSnapshot: false, error: 'UNAUTHORIZED', requestInFlight: false },
    })
  } finally {
    f.dispose()
  }
})

for (const held of ['plugins', 'skills'] as const)
  test(`independent ${held} latency cannot delay the other publication`, async () => {
    const f = fixture()
    const gate = Promise.withResolvers<void>()
    try {
      await f.open()
      f.gates[held] = gate.promise
      const read = f.refresh()
      const other = held === 'plugins' ? 'skills' : 'plugins'
      await until(() => f.entry().collections[other].status === 'ready')
      expect(f.entry().collections[held]).toEqual({
        status: 'loading',
        hasSnapshot: false,
        error: null,
        requestInFlight: true,
      })
      expect(f.entry()[other].length).toBe(1)
      expect(f.entry().status).toBe('loading')
      if (other === 'plugins') {
        await f.runtime.view.commands.execute('extensionWorkspace.inspect', {
          instanceId: 'settings',
          pluginId: 'plugin-a',
        })
        await f.runtime.view.commands.execute('extensionWorkspace.setEnabled', {
          instanceId: 'settings',
          pluginId: 'plugin-a',
          enabled: false,
        })
        expect(f.entry().plugins[0]?.status).toBe('disabled')
        expect(f.entry().detail?.status).toBe('ready')
        expect(f.entry().collections.skills.status).toBe('loading')
      }
      gate.resolve()
      await read
      expect(f.entry().collections[held].requestInFlight).toBe(false)
      expect(f.entry().status).toBe('ready')
    } finally {
      gate.resolve()
      f.dispose()
    }
  })

for (const failed of ['plugins', 'skills'] as const)
  test(`${failed} retry preserves the successful other collection and local state`, async () => {
    const f = fixture()
    try {
      await f.open()
      f.setPlugins(Array.from({ length: 45 }, (_, index) => plugin(`plugin-${index}`)))
      await f.refresh()
      await f.runtime.view.commands.execute('extensionWorkspace.setQuery', { instanceId: 'settings', query: 'plugin' })
      await f.runtime.view.commands.execute('extensionWorkspace.setPage', {
        instanceId: 'settings',
        collection: 'plugins',
        page: 1,
      })
      await f.runtime.view.commands.execute('extensionWorkspace.inspect', {
        instanceId: 'settings',
        pluginId: 'plugin-25',
      })
      const before = f.entry()
      f.errors[failed] = new CommandError('DISCONNECTED', 'private detail')
      expect(await outcome(f.refresh('settings', failed))).toMatchObject({ code: 'DISCONNECTED' })
      expect(f.entry()[failed]).toBe(before[failed])
      expect(f.entry().collections[failed]).toEqual({
        status: 'error',
        hasSnapshot: true,
        error: 'DISCONNECTED',
        requestInFlight: false,
      })
      const other = failed === 'plugins' ? 'skills' : 'plugins'
      expect(f.entry().collections[other]).toBe(before.collections[other])
      const calls = f.calls.length
      f.errors[failed] = null
      await f.refresh('settings', failed)
      expect(f.calls.slice(calls).map((call) => call.name)).toEqual([
        failed === 'plugins' ? 'plugin.list' : 'skill.list',
      ])
      expect(f.entry()).toMatchObject({
        queries: { plugins: 'plugin', skills: 'plugin' },
        pluginPage: 1,
        selectedPluginId: 'plugin-25',
        detail: { pluginId: 'plugin-25', status: 'ready' },
      })
      expect(f.entry().collections[failed]).toEqual({
        status: 'ready',
        hasSnapshot: true,
        error: null,
        requestInFlight: false,
      })
    } finally {
      f.dispose()
    }
  })

test('a confirmed empty collection is distinct from idle and failed empty data', async () => {
  const f = fixture()
  try {
    await f.open()
    f.setPlugins([])
    await f.refresh('settings', 'plugins')
    expect(f.entry().collections.plugins).toEqual({
      status: 'ready',
      hasSnapshot: true,
      error: null,
      requestInFlight: false,
    })
    expect(f.entry().collections.skills).toEqual({
      status: 'idle',
      hasSnapshot: false,
      error: null,
      requestInFlight: false,
    })
    f.errors.skills = new Error('private response not shown')
    await outcome(f.refresh('settings', 'skills'))
    expect(f.entry().collections.skills).toEqual({
      status: 'error',
      hasSnapshot: false,
      error: 'EXECUTION_FAILED',
      requestInFlight: false,
    })
    expect(JSON.stringify(f.entry())).not.toContain('private response')
  } finally {
    f.dispose()
  }
})

for (const duplicate of ['plugins', 'skills'] as const)
  test(`duplicate ${duplicate} IDs fail only that collection without replacing its snapshot`, async () => {
    const f = fixture()
    try {
      await f.open()
      await f.refresh()
      const before = f.entry()
      if (duplicate === 'plugins') f.setPlugins([plugin(), plugin()])
      else f.setSkills([skill(), skill()])
      expect(await outcome(f.refresh())).toMatchObject({ code: 'INVALID_OUTPUT' })
      expect(f.entry()[duplicate]).toBe(before[duplicate])
      expect(f.entry().collections[duplicate]).toMatchObject({
        status: 'error',
        hasSnapshot: true,
        error: 'INVALID_OUTPUT',
      })
      expect(f.entry().collections[duplicate === 'plugins' ? 'skills' : 'plugins'].status).toBe('ready')
    } finally {
      f.dispose()
    }
  })

test('plugin ACK does not erase Skills failure or falsely validate an already failed plugin list', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    f.errors.plugins = new CommandError('TIMEOUT', 'private')
    f.errors.skills = new CommandError('UNAUTHORIZED', 'private')
    await outcome(f.refresh())
    await f.runtime.view.commands.execute('extensionWorkspace.setEnabled', {
      instanceId: 'settings',
      pluginId: 'plugin-a',
      enabled: false,
    })
    expect(f.entry().plugins[0]?.status).toBe('disabled')
    expect(f.entry().actions['plugin-a']?.status).toBe('succeeded')
    expect(f.entry().collections).toEqual({
      plugins: { status: 'error', hasSnapshot: true, error: 'TIMEOUT', requestInFlight: false },
      skills: { status: 'error', hasSnapshot: true, error: 'UNAUTHORIZED', requestInFlight: false },
    })
  } finally {
    f.dispose()
  }
})

test('independent read recovery never unlocks an unknown plugin write', async () => {
  const f = fixture()
  try {
    await f.open()
    await f.refresh()
    f.setWriteUnknown(true)
    const input = { instanceId: 'settings', pluginId: 'plugin-a', enabled: false }
    expect(await outcome(f.runtime.view.commands.execute('extensionWorkspace.setEnabled', input))).toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await f.refresh('settings', 'skills')
    await f.refresh('settings', 'plugins')
    expect(f.entry().actions['plugin-a']?.status).toBe('unknown')
    expect(await outcome(f.runtime.view.commands.execute('extensionWorkspace.setEnabled', input))).toMatchObject({
      code: 'BUSY',
    })
    expect(f.calls.filter((call) => call.name === 'plugin.disable')).toHaveLength(1)
  } finally {
    f.dispose()
  }
})

test('caller cancellation retains the physical slot and duplicates cannot cancel the first caller', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  const first = new AbortController()
  const second = new AbortController()
  try {
    await f.open()
    f.gates.plugins = gate.promise
    const read = outcome(f.refresh('settings', 'plugins', { signal: first.signal }))
    await f.refresh('settings', 'plugins', { signal: second.signal })
    second.abort()
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.signal?.aborted).toBe(false)
    first.abort()
    expect(await read).toMatchObject({ code: 'RESULT_UNKNOWN' }) // local command transport interruption, not a Host write
    expect(f.entry().collections.plugins).toEqual({
      status: 'error',
      error: 'CANCELLED',
      hasSnapshot: false,
      requestInFlight: true,
    })
    await f.refresh('settings', 'plugins')
    expect(f.calls).toHaveLength(1)
    gate.resolve()
    await until(() => !f.entry().collections.plugins.requestInFlight)
    expect(f.entry().plugins).toEqual([])
    f.gates.plugins = null
    await f.refresh('settings', 'plugins')
    expect(f.calls).toHaveLength(2)
    expect(f.entry().collections.plugins.status).toBe('ready')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('pre-aborted refresh performs no Host read and does not create a loading projection', async () => {
  const f = fixture()
  const controller = new AbortController()
  try {
    await f.open()
    controller.abort()
    expect(await outcome(f.refresh('settings', undefined, { signal: controller.signal }))).toMatchObject({
      code: 'CANCELLED',
    })
    expect(f.calls).toHaveLength(0)
    expect(f.runtime.view.state.extensions.getSnapshot().entries.settings).toBeUndefined()
  } finally {
    f.dispose()
  }
})

test('group A-B-A and close/reopen cancel the old read without letting late data replace the new scope', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    f.gates.plugins = gate.promise
    const old = outcome(f.refresh('settings', 'plugins'))
    await f.runtime.view.commands.execute('app.openSettings', {
      scope: 'global',
      section: 'general',
      instanceId: 'settings',
    })
    expect(await old).toMatchObject({ code: 'CANCELLED' })
    expect(f.calls[0]?.signal?.aborted).toBe(true)
    expect(f.entry().collections.plugins).toMatchObject({ status: 'error', error: 'CANCELLED', requestInFlight: false })
    await f.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings' })
    await f.open()
    f.gates.plugins = null
    f.setPlugins([plugin('new-scope')])
    await f.refresh('settings', 'plugins')
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.entry().plugins.map((item) => item.id)).toEqual(['new-scope'])
    expect(f.entry().collections.plugins).toEqual({
      status: 'ready',
      error: null,
      hasSnapshot: true,
      requestInFlight: false,
    })
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('eight ignored-abort physical reads bound repeated close/reopen without leaking capacity after settlement', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    f.gates.plugins = gate.promise
    f.gates.skills = gate.promise
    for (let index = 0; index < 4; index++) {
      await f.open()
      const read = outcome(f.refresh())
      await f.runtime.view.commands.execute('app.closePanel', { instanceId: 'settings' })
      expect(await read).toMatchObject({ code: 'CANCELLED' })
    }
    expect(f.calls).toHaveLength(8)
    expect(f.calls.every((call) => call.signal?.aborted)).toBe(true)
    await f.open()
    expect(await outcome(f.refresh())).toMatchObject({ code: 'BUSY' })
    expect(f.calls).toHaveLength(8)
    expect(f.entry().collections.plugins).toMatchObject({ status: 'error', error: 'BUSY', hasSnapshot: false })
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    f.gates.plugins = null
    f.gates.skills = null
    await f.refresh()
    expect(f.calls).toHaveLength(10)
    expect(f.entry().collections.plugins.status).toBe('ready')
    expect(f.entry().collections.skills.status).toBe('ready')
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('dispose aborts both reads and prevents every late publication', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    f.gates.plugins = gate.promise
    f.gates.skills = gate.promise
    const read = outcome(f.refresh())
    const before = f.runtime.view.state.extensions.getSnapshot()
    f.dispose()
    expect(f.calls).toHaveLength(2)
    expect(f.calls.every((call) => call.signal?.aborted)).toBe(true)
    gate.resolve()
    await read
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.runtime.view.state.extensions.getSnapshot()).toBe(before)
  } finally {
    gate.resolve()
    f.dispose()
  }
})

test('the 30 second logical deadline reports TIMEOUT while the ignored-abort executor still owns its slot', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  const original = globalThis.setTimeout
  const deadlines: number[] = []
  const accelerated = new Proxy(original, {
    apply(target, receiver: unknown, args: unknown[]) {
      const delay = args[1]
      if (delay === 30_000) deadlines.push(delay)
      const result: unknown = Reflect.apply(target, receiver, [args[0], delay === 30_000 ? 5 : delay, ...args.slice(2)])
      return result
    },
  })
  const clock = spyOn(globalThis, 'setTimeout').mockImplementation(accelerated)
  try {
    await f.open()
    deadlines.length = 0 // Exclude app.openSettings's unrelated local command deadline.
    f.gates.plugins = gate.promise
    expect(await outcome(f.refresh('settings', 'plugins'))).toMatchObject({ code: 'TIMEOUT' })
    expect(deadlines).toEqual([30_000])
    expect(f.entry().collections.plugins).toEqual({
      status: 'error',
      error: 'TIMEOUT',
      hasSnapshot: false,
      requestInFlight: true,
    })
    expect(f.calls[0]?.signal?.aborted).toBe(true)
    await f.refresh('settings', 'plugins')
    expect(f.calls).toHaveLength(1)
    gate.resolve()
    await until(() => !f.entry().collections.plugins.requestInFlight)
    expect(f.entry().plugins).toEqual([])
    f.gates.plugins = null
    await f.refresh('settings', 'plugins')
    expect(f.calls).toHaveLength(2)
    expect(f.entry().collections.plugins.status).toBe('ready')
  } finally {
    clock.mockRestore()
    gate.resolve()
    f.dispose()
  }
})

test('leaving for Status cancels presentation reads and remount can read while the old physical request settles', async () => {
  const f = fixture()
  const gate = Promise.withResolvers<void>()
  try {
    await f.open()
    await f.refresh()
    f.gates.plugins = gate.promise
    const read = outcome(f.refresh('settings', 'plugins'))
    await f.runtime.view.commands.execute('app.openStatus', { instanceId: 'status' })
    expect(await read).toMatchObject({ code: 'CANCELLED' })
    expect(f.entry().collections.plugins).toMatchObject({
      status: 'error',
      error: 'CANCELLED',
      hasSnapshot: true,
      requestInFlight: true,
    })
    await f.open()
    f.setPlugins([plugin('fresh')])
    f.gates.plugins = null
    await f.refresh('settings', 'plugins')
    expect(f.entry().plugins.map((item) => item.id)).toEqual(['fresh'])
    gate.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(f.entry().plugins.map((item) => item.id)).toEqual(['fresh'])
    expect(f.entry().collections.plugins).toEqual({
      status: 'ready',
      error: null,
      hasSnapshot: true,
      requestInFlight: false,
    })
  } finally {
    gate.resolve()
    f.dispose()
  }
})
