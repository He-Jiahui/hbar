import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'

const model: ModelDescriptor = {
  id: 'fixture',
  providerId: 'fixture',
  providerName: '服务商 · Provider',
  modelId: 'fixture',
  modelName: '长模型名称 · A model supplied by the Host',
  contextWindow: 128_000,
  maxOutput: 8_000,
  imageInput: false,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'high',
  hasKey: true,
}

async function settled(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('First-send catalog did not settle')
}

function fixture() {
  const events = new Set<() => void>()
  const connections = new Set<(connected: boolean) => void>()
  const held: Array<ReturnType<typeof Promise.withResolvers<unknown>>> = []
  const calls: Array<{ readonly signal: AbortSignal | undefined }> = []
  let catalog: unknown = [model]
  let error: string | null = null
  let active = 0
  let maximum = 0
  const models: CommandExecutor = {
    async execute(name, _input, execution) {
      if (name !== 'model.list') throw new Error(`Unexpected catalog command: ${name}`)
      calls.push({ signal: execution?.signal })
      const value = catalog
      const failure = error
      const pending = held.shift()
      active += 1
      maximum = Math.max(maximum, active)
      try {
        if (pending) return await pending.promise // Deliberately ignores cancellation.
        if (failure) throw new CommandError(failure, 'Fixture read failed')
        return value
      } finally {
        active -= 1
      }
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'first-send-catalog',
    hostId: 'fixture',
    models,
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
    modelEvents: {
      subscribe(listener) {
        events.add(listener)
        return () => {
          events.delete(listener)
        }
      },
      onConnection(listener) {
        connections.add(listener)
        return () => {
          connections.delete(listener)
        }
      },
    },
  })
  return {
    runtime,
    actions: runtime.view.preSessionModelCatalog,
    calls,
    state: () => runtime.view.state.preSessionModelCatalog.getSnapshot(),
    emit: () => {
      for (const listener of events) listener()
    },
    connect: (connected: boolean) => {
      for (const listener of connections) listener(connected)
    },
    hold() {
      const pending = Promise.withResolvers<unknown>()
      held.push(pending)
      return pending
    },
    catalog: (value: unknown) => {
      catalog = value
    },
    fail: (value: string | null) => {
      error = value
    },
    active: () => active,
    maximum: () => maximum,
    subscriptions: () => events.size + connections.size,
  }
}

test('visible first-send catalog refreshes on hints, coalesces bursts, and releases subscriptions', async () => {
  const f = fixture()
  try {
    f.emit()
    await Bun.sleep(1)
    expect(f.calls).toHaveLength(0)
    const release = f.actions.retain()
    const secondRelease = f.actions.retain()
    await settled(() => f.state().status === 'ready')
    expect(f.calls).toHaveLength(1)
    const draftState = f.runtime.view.state.preSessionDrafts.getSnapshot()
    const refreshed = { ...model, modelName: '模型目录已更新' }
    f.catalog([refreshed])
    for (let index = 0; index < 40; index += 1) f.emit()
    expect(f.state().models).toEqual([model])
    expect(f.state().status).toBe('ready')
    await settled(() => f.state().models[0]?.modelName === refreshed.modelName)
    expect(f.calls).toHaveLength(2)
    expect(f.runtime.view.state.preSessionDrafts.getSnapshot()).toBe(draftState)
    release()
    release() // A lease can only release itself once.
    secondRelease()
    expect(f.state().status).toBe('idle')
    f.emit()
    await Bun.sleep(1)
    expect(f.calls).toHaveLength(2)
    f.actions.retain()
    await settled(() => f.calls.length === 3 && f.state().status === 'ready')
  } finally {
    f.runtime.dispose()
  }
  expect(f.subscriptions()).toBe(0)
})

test('cancelled late reads cannot publish, and repeated hints retain only two actual reads plus the latest waiter', async () => {
  const f = fixture()
  const first = f.hold()
  const second = f.hold()
  try {
    f.actions.retain()
    await settled(() => f.calls.length === 1)
    f.emit()
    await settled(() => f.calls.length === 2)
    const latest = { ...model, id: 'latest', modelName: '最新目录' }
    f.catalog([latest])
    for (let index = 0; index < 30; index += 1) {
      f.emit()
      await Bun.sleep(1)
    }
    expect(f.calls).toHaveLength(2)
    expect(f.active()).toBe(2)
    expect(f.maximum()).toBe(2)
    expect(f.calls.every((call) => call.signal?.aborted)).toBe(true)
    first.resolve([model])
    await settled(() => f.state().status === 'ready')
    expect(f.calls).toHaveLength(3)
    expect(f.state().models).toEqual([latest])
    second.resolve([model])
    await settled(() => f.active() === 0)
    expect(f.state().models).toEqual([latest])
  } finally {
    first.resolve([])
    second.resolve([])
    f.runtime.dispose()
  }
})

test('empty, duplicate, failed and disconnected catalogs have a local retry path', async () => {
  const f = fixture()
  try {
    f.catalog([])
    f.actions.retain()
    await settled(() => f.state().status === 'ready')
    expect(f.state().models).toEqual([])
    f.catalog([model, model])
    f.emit()
    await settled(() => f.state().error === 'INVALID_OUTPUT')
    f.fail('DENIED')
    f.actions.refresh()
    await settled(() => f.state().error === 'DENIED')
    f.fail(null)
    f.catalog([model])
    f.actions.refresh()
    await settled(() => f.state().status === 'ready')
    f.connect(false)
    expect(f.state().error).toBe('DISCONNECTED')
    const count = f.calls.length
    f.emit()
    await Bun.sleep(1)
    expect(f.calls).toHaveLength(count)
    f.connect(true)
    await settled(() => f.state().status === 'ready')
    expect(f.state().models).toEqual([model])
  } finally {
    f.runtime.dispose()
  }
})

test('closing the landing and disposing the runtime fence an ignored-cancellation result', async () => {
  const f = fixture()
  const held = f.hold()
  const release = f.actions.retain()
  try {
    await settled(() => f.calls.length === 1)
    release()
    const closed = f.state()
    f.runtime.dispose()
    held.resolve([model])
    await settled(() => f.active() === 0)
    expect(f.state()).toBe(closed)
    expect(f.calls[0]?.signal?.aborted).toBe(true)
    expect(f.subscriptions()).toBe(0)
  } finally {
    held.resolve([])
    f.runtime.dispose()
  }
})

test('a read deadline reports failure locally without releasing ignored-cancellation occupancy', async () => {
  const f = fixture()
  const held = f.hold()
  try {
    f.actions.retain()
    await settled(() => f.calls.length === 1)
    await Bun.sleep(10_050)
    expect(f.state().error).toBe('TIMEOUT')
    expect(f.calls[0]?.signal?.aborted).toBe(true)
    expect(f.active()).toBe(1)
    f.actions.refresh()
    await settled(() => f.state().status === 'ready')
    held.resolve([])
    await settled(() => f.active() === 0)
    expect(f.state().models).toEqual([model])
  } finally {
    held.resolve([])
    f.runtime.dispose()
  }
}, 15_000)
