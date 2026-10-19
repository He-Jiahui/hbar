import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { definePlugin, type Disposer, type HbarAPI } from '@hbar/plugin-sdk'
import { IpcPeer, RuntimeValuePort, runtimeServiceIdleSchema, type RuntimePreparation } from '@hbar/runtime'
import { createRuntimePlugin } from '../apps/host/src/runtime-plugin-process'

function gate() {
  let release: () => void = () => {
    throw new Error('Uninitialized fixture gate')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

const firstId = 'd780243c-50a8-4e58-b49b-7957d0389729'
const secondId = '4b369135-6968-4c02-b1f7-6b24119a9db2'
const descriptorSchema = z.strictObject({
  kind: z.literal('terminal'),
  id: z.string(),
  sessionId: z.literal('fixture-session'),
})

type CheckpointMode = 'valid' | 'missing' | 'throws' | 'invalid'

async function fixture(
  failureCode?: 'FIXTURE_RELEASE_REJECTED' | 'RESULT_UNKNOWN',
  checkpoint: CheckpointMode = 'valid',
) {
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: { unitId: 'host', generation: 1, incarnation: 'resource-host' },
    remote: { unitId: 'plugin.fixture', generation: 1, incarnation: 'resource-plugin' },
    transport: {
      send(frame) {
        if (!child) throw new Error('Fixture child peer missing')
        child.receive(frame)
      },
    },
  })
  child = new IpcPeer({
    owner: parent.remote,
    remote: parent.owner,
    transport: { send: (frame) => parent.receive(frame) },
  })
  const childPeer = child
  const values = new RuntimeValuePort(parent, { prefix: 'plugin.application' })
  const entered = gate()
  const finish = gate()
  const pending = new Set<Promise<void>>()
  const tracked = (dispose: Disposer) => () => {
    const task = Promise.resolve(dispose())
    pending.add(task)
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    )
    return task
  }
  const held = new Set<string>()
  const released: string[] = []
  values.register('resource.retain', ([raw]) => {
    const value = descriptorSchema.parse(raw)
    const id = value.id === 'first' ? firstId : secondId
    if (held.has(id)) throw new Error('Duplicate fixture retain')
    held.add(id)
    return id
  })
  values.register('resource.release', async ([raw]) => {
    const id = z.string().uuid().parse(raw)
    released.push(id)
    if (id === firstId) {
      entered.release()
      await finish.promise
      if (failureCode) throw new HbarError(failureCode, 'Synthetic release outcome')
    }
    if (!held.delete(id)) throw new Error('Fixture resource released twice')
    return undefined
  })
  let api: HbarAPI | undefined
  const resourcesAPI = () => {
    if (!api?.resources) throw new Error('Production plugin resource API missing')
    return api.resources
  }
  const plugin = definePlugin({
    manifest: {
      id: 'resource.fixture',
      name: 'Resource release fixture',
      description: 'Paired-port lifecycle test',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
    },
    apply(context) {
      api = context.hbar.api
      if (checkpoint !== 'missing') {
        api.runtimeIdle?.register(() => {
          if (checkpoint === 'throws') throw new HbarError('FIXTURE_CHECKPOINT_FAILED', 'Synthetic checkpoint failure')
          // Structurally typed numeric proof, deliberately invalid at the public Zod boundary.
          return {
            supported: true,
            requests: checkpoint === 'invalid' ? -1 : 0,
            resources: 0,
            background: 0,
            unconfirmed: 0,
          }
        })
      }
    },
  })
  const service = createRuntimePlugin(
    {
      peer: childPeer,
      configuration: { dataRoot: 'fixture-data', cacheRoot: 'fixture-cache' },
      preparing: () => false,
    },
    { plugins: [plugin] },
  )
  const preparation: RuntimePreparation = {
    descriptor: {
      id: 'plugin.fixture',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 32,
    },
    configuration: { dataRoot: 'fixture-data', cacheRoot: 'fixture-cache' },
  }
  const close = async () => {
    finish.release()
    await Promise.allSettled([...pending])
    try {
      await service.dispose()
    } finally {
      values.dispose()
      parent.close()
      childPeer.close()
    }
  }
  try {
    await service.prepare(preparation)
    await service.activate('default')
    const resources = resourcesAPI()
    const idle = service.idle
    if (!idle) throw new Error('Production plugin idle service missing')
    const first = await resources.retain({ kind: 'terminal', id: 'first', sessionId: 'fixture-session' })
    const second = await resources.retain({ kind: 'terminal', id: 'second', sessionId: 'fixture-session' })
    return {
      first: tracked(first),
      second: tracked(second),
      held,
      released,
      entered,
      finish,
      close,
      idle: async () => runtimeServiceIdleSchema.parse(await idle()),
    }
  } catch (primary) {
    try {
      await close()
    } catch (cleanup) {
      throw new AggregateError([primary, cleanup], 'Fixture creation and cleanup failed', { cause: cleanup })
    }
    throw primary
  }
}

async function withFixture(
  failureCode: 'FIXTURE_RELEASE_REJECTED' | 'RESULT_UNKNOWN' | undefined,
  operation: (value: Awaited<ReturnType<typeof fixture>>) => Promise<void>,
  checkpoint: CheckpointMode = 'valid',
) {
  const value = await fixture(failureCode, checkpoint)
  let failed = false
  let primary: unknown
  try {
    await operation(value)
  } catch (error) {
    failed = true
    primary = error
  }
  try {
    await value.close()
  } catch (cleanup) {
    if (failed) throw new AggregateError([primary, cleanup], 'Test and cleanup failed', { cause: cleanup })
    throw cleanup
  }
  if (failed) throw primary
}

test('paired production plugin disposer releases once and keeps its other actual resource busy', async () => {
  await withFixture(undefined, async (value) => {
    expect(await value.idle()).toMatchObject({ eligible: false, resources: 2 })
    const first = Promise.resolve(value.first())
    const duplicate = Promise.resolve(value.first())
    // Attach both waiters immediately; no unhandled rejection if a regression occurs.
    const completed = Promise.allSettled([first, duplicate])
    await value.entered.promise
    expect(value.released).toEqual([firstId])
    expect(value.held.size).toBe(2)
    expect((await value.idle()).eligible).toBe(false)
    value.finish.release()
    expect(await completed).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ])
    expect(value.released).toEqual([firstId])
    expect([...value.held]).toEqual([secondId])
    expect(await value.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 1 })
    await value.first()
    expect(value.released).toEqual([firstId])
    await value.second()
    expect(value.held.size).toBe(0)
    expect(await value.idle()).toEqual({ eligible: true, requests: 0, runs: 0, resources: 0 })
  })
})

for (const code of ['FIXTURE_RELEASE_REJECTED', 'RESULT_UNKNOWN'] as const) {
  test(`paired production plugin retains occupancy and does not replay release after ${code}`, async () => {
    await withFixture(code, async (value) => {
      const first = Promise.resolve(value.first())
      const duplicate = Promise.resolve(value.first())
      const completed = Promise.allSettled([first, duplicate])
      await value.entered.promise
      expect(value.released).toEqual([firstId])
      value.finish.release()
      const results = await completed
      for (const result of results) {
        expect(result.status).toBe('rejected')
        if (result.status !== 'rejected') throw new Error('Expected preserved release failure')
        expect(result.reason).toHaveProperty('code', code)
      }
      expect(value.released).toEqual([firstId])
      expect(value.held.size).toBe(2)
      expect(await value.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 2 })
      await expect(Promise.resolve(value.first())).rejects.toHaveProperty('code', code)
      expect(value.released).toEqual([firstId])
      await value.second()
      expect([...value.held]).toEqual([firstId])
      expect(await value.idle()).toEqual({ eligible: false, requests: 0, runs: 0, resources: 1 })
    })
  })
}

test('empty production service requires a present, readable and runtime-valid registered idle proof', async () => {
  for (const checkpoint of ['valid', 'missing', 'throws', 'invalid'] as const) {
    await withFixture(
      undefined,
      async (value) => {
        value.finish.release()
        await value.first()
        await value.second()
        expect(value.released).toEqual([firstId, secondId])
        expect(value.held.size).toBe(0)
        expect(await value.idle()).toEqual({
          eligible: checkpoint === 'valid',
          requests: 0,
          runs: 0,
          resources: 0,
        })
      },
      checkpoint,
    )
  }
})
