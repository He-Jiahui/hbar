import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { createModelReadQueue } from '../packages/app-runtime/src/model-read-queue'
import {
  modelCommands,
  type ModelConfiguration,
  type ModelDescriptor,
  type ModelWriteResult,
} from '@hbar/contracts/commands/models'

const catalog: ModelDescriptor[] = ['primary', 'secondary'].map((id) => ({
  id,
  providerId: id,
  providerName: id,
  modelId: id,
  modelName: id,
  contextWindow: 100_000,
  maxOutput: 8_000,
  imageInput: false,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}))
const workspace = { id: 'w', name: 'fixture', path: 'D:/fixture', createdAt: 1 }
const sessions = ['a', 'b'].map((id) => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}))
type ReadKind = 'model' | 'catalog'
async function settled(check: () => boolean) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Model invalidation fixture did not settle')
}

function fixture() {
  const selected = catalog[0]
  if (!selected) throw new Error('Missing fixture model')
  const configurations = new Map<string, ModelConfiguration>(
    sessions.map(({ id }) => [
      id,
      {
        sessionId: id,
        status: 'configured',
        modelId: selected.id,
        model: selected,
        thinkingLevel: 'low',
        revisions: { [`settings:session:${id}`]: 1 },
        sources: { model: 'session', thinkingLevel: 'session' },
      },
    ]),
  )
  const events = new Set<() => void>()
  const connections = new Set<(connected: boolean) => void>()
  const holds: Record<ReadKind, Array<Promise<void>>> = { model: [], catalog: [] }
  const active: Record<ReadKind, number> = { model: 0, catalog: 0 }
  const maximum: Record<ReadKind, number> = { model: 0, catalog: 0 }
  const receipts = new Map<string, ModelWriteResult>()
  const calls: Array<{
    name: string
    sessionId: string | null
    key: string | undefined
    signal: AbortSignal | undefined
  }> = []
  let available = catalog
  let writeHold: Promise<void> | null = null
  let lostWrite = false
  let readFailure: string | null = null
  let usageReads = 0
  const models: CommandExecutor = {
    async execute(name, raw, options) {
      const sessionId =
        raw && typeof raw === 'object' && 'sessionId' in raw && typeof raw.sessionId === 'string' ? raw.sessionId : null
      calls.push({ name, sessionId, key: options?.idempotencyKey, signal: options?.signal })
      if (name === 'model.list' || name === 'session.getModel') {
        const kind = name === 'model.list' ? 'catalog' : 'model'
        const value = structuredClone(kind === 'catalog' ? available : configurations.get(sessionId ?? ''))
        const hold = holds[kind].shift()
        active[kind] += 1
        maximum[kind] = Math.max(maximum[kind], active[kind])
        try {
          await hold
          if (readFailure && kind === 'model') throw new CommandError(readFailure, 'Fixture read failed')
          return value
        } finally {
          active[kind] -= 1
        }
      }
      if (name === 'session.getModelReceipt') {
        const input = modelCommands[name].input.parse(raw)
        const receipt = receipts.get(input.idempotencyKey)
        return receipt?.sessionId === input.sessionId
          ? {
              sessionId: receipt.sessionId,
              idempotencyKey: input.idempotencyKey,
              commitId: receipt.commitId,
              revision: receipt.revision,
              modelId: receipt.modelId,
              thinkingLevel: receipt.thinkingLevel,
              revisions: receipt.revisions,
            }
          : null
      }
      if (name !== 'session.setModel' && name !== 'session.setThinkingLevel')
        throw new Error('Unexpected fixture command')
      const input = modelCommands[name].input.parse(raw)
      const current = configurations.get(input.sessionId)
      const key = options?.idempotencyKey
      if (!current || !key) throw new Error('Missing captured fixture write target')
      const model = 'modelId' in input ? available.find((item) => item.id === input.modelId) : current.model
      if (!model) throw new CommandError('MODEL_NOT_FOUND', 'Model is unavailable')
      const layer = `settings:session:${input.sessionId}`
      const revision = (current.revisions[layer] ?? 0) + 1
      const next: ModelWriteResult = {
        ...current,
        status: 'configured',
        model,
        modelId: model.id,
        thinkingLevel: 'thinkingLevel' in input ? input.thinkingLevel : 'low',
        revisions: { ...current.revisions, [layer]: revision },
        revision,
        commitId: key,
      }
      const { commitId: _commitId, revision: _revision, ...configuration } = next
      configurations.set(input.sessionId, configuration)
      receipts.set(key, next)
      const hold = writeHold
      writeHold = null
      await hold
      if (lostWrite) {
        lostWrite = false
        throw new CommandError('RESULT_UNKNOWN', 'Lost write acknowledgement')
      }
      return next
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'model-invalidations',
    hostId: 'isolated',
    models,
    modelEvents: {
      subscribe(listener) {
        events.add(listener)
        return () => {
          events.delete(listener)
        }
      },
      onConnection(listener) {
        connections.add(listener)
        listener(true)
        return () => {
          connections.delete(listener)
        }
      },
    },
    usage: {
      async execute() {
        usageReads += 1
        throw new CommandError('NO_USAGE_FIXTURE', 'No usage fixture')
      },
    },
    directory: {
      async execute(name, raw) {
        if (name === 'workspace.get') return workspace
        if (name === 'session.get' && raw && typeof raw === 'object' && 'sessionId' in raw)
          return sessions.find((item) => item.id === raw.sessionId) ?? null
        return { items: [], nextCursor: null }
      },
    },
  })
  return {
    runtime,
    calls,
    active,
    maximum,
    events,
    connections,
    configurations,
    controls: () => runtime.view.state.controls.getSnapshot(),
    composer: () => runtime.view.state.composerModel.getSnapshot(),
    usageReads: () => usageReads,
    emit() {
      for (const listener of events) listener()
    },
    connect(value: boolean) {
      for (const listener of connections) listener(value)
    },
    async select(sessionId = 'a') {
      await runtime.view.commands.execute('app.setSession', { sessionId })
      await settled(() => runtime.view.state.controls.getSnapshot().model?.sessionId === sessionId)
    },
    open: () => runtime.view.commands.execute('composerModel.refresh', { sessionId: 'a' }),
    remove() {
      available = catalog.filter((item) => item.id !== 'primary')
      for (const [id, value] of configurations)
        configurations.set(id, { ...value, status: 'unavailable', model: null, thinkingLevel: null })
    },
    failRead(value: string | null) {
      readFailure = value
    },
    hold(kind: ReadKind) {
      const wait = Promise.withResolvers<void>()
      holds[kind].push(wait.promise)
      return wait.resolve
    },
    holdWrite() {
      const wait = Promise.withResolvers<void>()
      writeHold = wait.promise
      return wait.resolve
    },
    loseWrite() {
      lostWrite = true
    },
  }
}

test('public model events immediately revoke stale readiness and coalesce provider ACK/event signals without usage or draft changes', async () => {
  const f = fixture()
  try {
    await f.select()
    await f.open()
    await f.runtime.view.commands.execute('draft.setText', { sessionId: 'a', text: 'Unsent original draft' })
    const draft = f.runtime.view.state.drafts.getSnapshot().a
    const prior = f.controls()
    const usageReads = f.usageReads()
    const modelReads = f.calls.filter((call) => call.name === 'session.getModel').length
    const catalogReads = f.calls.filter((call) => call.name === 'model.list').length
    f.remove()
    for (let index = 0; index < 20; index += 1) f.emit()
    expect(f.controls()).toMatchObject({ model: null, status: 'loading' })
    expect(f.composer()).toMatchObject({ models: [], status: 'loading' })
    expect(f.controls().usage).toBe(prior.usage)
    expect(f.controls().budget).toBe(prior.budget)
    await settled(() => f.composer().status === 'ready')
    expect(f.controls().model).toMatchObject({ status: 'unavailable', modelId: 'primary', model: null })
    expect(f.composer().models.map((item) => item.id)).toEqual(['secondary'])
    expect(f.calls.filter((call) => call.name === 'session.getModel')).toHaveLength(modelReads + 1)
    expect(f.calls.filter((call) => call.name === 'model.list')).toHaveLength(catalogReads + 1)
    expect(f.usageReads()).toBe(usageReads)
    expect(f.runtime.view.state.drafts.getSnapshot().a).toBe(draft)
  } finally {
    f.runtime.dispose()
  }
})

test('unopened catalog remains lazy while selected model invalidation is current and read failure never restores send readiness', async () => {
  const f = fixture()
  try {
    await f.select()
    f.failRead('TIMEOUT')
    f.emit()
    await settled(() => f.controls().errors.model === 'TIMEOUT')
    expect(f.controls().model).toBeNull()
    expect(f.composer()).toMatchObject({ status: 'idle', models: [] })
    expect(f.calls.filter((call) => call.name === 'model.list')).toHaveLength(0)
    f.failRead(null)
    f.remove()
    f.emit()
    await settled(() => f.controls().model?.status === 'unavailable')
    expect(f.controls().errors.model).toBeNull()
  } finally {
    f.runtime.dispose()
  }
})

test('burst invalidations retain at most two actual reads per kind and only the latest queued candidate', async () => {
  const f = fixture()
  const releases: Array<() => void> = []
  try {
    await f.select()
    await f.open()
    for (let pass = 1; pass <= 2; pass += 1) {
      releases.push(f.hold('model'), f.hold('catalog'))
      f.emit()
      await settled(() => f.active.model === pass && f.active.catalog === pass)
    }
    f.remove()
    for (let index = 0; index < 30; index += 1) {
      f.emit()
      await Bun.sleep(1)
    }
    expect(f.active).toEqual({ model: 2, catalog: 2 })
    expect(f.maximum).toEqual({ model: 2, catalog: 2 })
    expect(f.controls().model).toBeNull()
    expect(f.composer().models).toEqual([])
    for (const release of releases) release()
    await settled(() => f.composer().status === 'ready')
    expect(f.controls().model?.status).toBe('unavailable')
    expect(f.composer().models.map((item) => item.id)).toEqual(['secondary'])
    expect(f.maximum).toEqual({ model: 2, catalog: 2 })
  } finally {
    for (const release of releases) release()
    f.runtime.dispose()
  }
})

test('provider invalidation before a delayed model ACK cannot resurrect the removed configured model', async () => {
  const f = fixture()
  const release = f.holdWrite()
  let write: Promise<unknown> | undefined
  try {
    await f.select()
    await f.open()
    write = f.runtime.view.commands.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' })
    await settled(() => f.calls.some((call) => call.name === 'session.setThinkingLevel'))
    f.remove()
    f.emit()
    const projected: Array<ModelConfiguration['status'] | null> = []
    const off = f.runtime.view.state.controls.subscribe(() => {
      projected.push(f.controls().model?.status ?? null)
    })
    await settled(() => f.controls().model?.status === 'unavailable')
    release()
    await write
    await settled(() => f.controls().model?.status === 'unavailable' && f.composer().action.status === 'idle')
    off()
    expect(projected).not.toContain('configured')
    expect(f.calls.filter((call) => call.name === 'session.setThinkingLevel')).toHaveLength(1)
  } finally {
    release()
    await write?.catch(() => {})
    f.runtime.dispose()
  }
})

test('catalog invalidation never clears an unknown write and original read-only receipt recovery keeps unavailable truth', async () => {
  const f = fixture()
  try {
    await f.select()
    await f.open()
    f.loseWrite()
    await expect(
      f.runtime.view.commands.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    const original = f.calls.find((call) => call.name === 'session.setThinkingLevel')
    if (!original?.key) throw new Error('Missing original write key')
    f.remove()
    f.emit()
    await settled(() => f.composer().status === 'ready')
    expect(f.composer().action.status).toBe('unknown')
    expect(f.controls().model?.status).toBe('unavailable')
    await expect(
      f.runtime.view.commands.execute('composerModel.selectThinking', { sessionId: 'a', thinkingLevel: 'low' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    await f.runtime.view.commands.execute('composerModel.reconcile', { sessionId: 'a' })
    expect(f.composer().action.status).toBe('idle')
    expect(f.controls().model?.status).toBe('unavailable')
    expect(f.calls.filter((call) => call.name === 'session.setThinkingLevel')).toHaveLength(1)
    expect(f.calls.find((call) => call.name === 'session.getModelReceipt')?.key).toBeUndefined()
  } finally {
    f.runtime.dispose()
  }
})

test('public reconnect invalidates missed provider facts and dispose releases subscriptions and ignores a late read', async () => {
  const f = fixture()
  let release = () => {}
  try {
    await f.select()
    await f.open()
    const usageReads = f.usageReads()
    f.connect(false)
    expect(f.controls()).toMatchObject({ model: null, errors: { model: 'DISCONNECTED' } })
    expect(f.composer().models).toEqual([])
    const reads = f.calls.length
    f.remove()
    f.emit()
    await Bun.sleep(2)
    expect(f.calls).toHaveLength(reads)
    f.connect(true)
    await settled(() => f.composer().status === 'ready')
    expect(f.controls().model?.status).toBe('unavailable')
    expect(f.usageReads()).toBe(usageReads)
    release = f.hold('model')
    f.emit()
    await settled(() => f.active.model === 1)
    const snapshot = f.controls()
    const oldInvalidator = [...f.events][0]
    f.runtime.dispose()
    expect(f.events.size).toBe(0)
    expect(f.connections.size).toBe(0)
    oldInvalidator?.()
    release()
    await settled(() => f.active.model === 0)
    expect(f.controls()).toBe(snapshot)
  } finally {
    release()
    f.runtime.dispose()
  }
})

test('A-B-A navigation cannot let an old provider model read win or exceed the shared physical cap', async () => {
  const f = fixture()
  let release = () => {}
  try {
    await f.select()
    release = f.hold('model')
    f.emit()
    await settled(() => f.active.model === 1)
    await f.select('b')
    const original = f.configurations.get('a')
    if (!original) throw new Error('Original fixture session disappeared')
    f.configurations.set('a', { ...original, status: 'unavailable', model: null, thinkingLevel: null })
    await f.select('a')
    expect(f.controls().model?.status).toBe('unavailable')
    release()
    await settled(() => f.active.model === 0)
    expect(f.controls().model).toMatchObject({ sessionId: 'a', status: 'unavailable' })
    expect(f.maximum.model).toBeLessThanOrEqual(2)
  } finally {
    release()
    f.runtime.dispose()
  }
})

test('captured public model reads share the cap but are not cancelled merely by projection navigation', async () => {
  const f = fixture()
  let release = () => {}
  let captured: Promise<unknown> | undefined
  try {
    await f.select()
    release = f.hold('model')
    captured = f.runtime.view.commands.execute('session.getModel', { sessionId: 'a' })
    await settled(() => f.active.model === 1)
    const request = f.calls.at(-1)
    expect(request?.name).toBe('session.getModel')
    await f.select('b')
    expect(request?.signal?.aborted).toBe(false)
    release()
    expect(await captured).toMatchObject({ sessionId: 'a', status: 'configured' })
    expect(f.controls().model?.sessionId).toBe('b')
    expect(f.maximum.model).toBeLessThanOrEqual(2)
  } finally {
    release()
    await captured?.catch(() => {})
    f.runtime.dispose()
  }
})

test('model read capacity preserves one captured waiter and replaces only its latest projection candidate', async () => {
  const queue = createModelReadQueue()
  const firstGate = Promise.withResolvers<void>()
  const secondGate = Promise.withResolvers<void>()
  const entered: string[] = []
  const signals = new Map<string, AbortSignal>()
  let physical = 0
  let maximum = 0
  const read =
    (name: string, gate: Promise<void> = Promise.resolve()) =>
    async (signal: AbortSignal) => {
      entered.push(name)
      signals.set(name, signal)
      physical += 1
      maximum = Math.max(maximum, physical)
      try {
        await gate
        return name
      } finally {
        physical -= 1
      }
    }
  const jobs: Promise<unknown>[] = []
  const handle = (job: Promise<unknown>) => {
    const handled = job.catch((error: unknown) => error)
    jobs.push(handled)
    return handled
  }
  try {
    void handle(queue.run(read('old-projection', firstGate.promise)))
    void handle(queue.run(read('active-captured', secondGate.promise), undefined, 'captured'))
    await settled(() => entered.length === 2)
    const waiting = handle(queue.run(read('waiting-captured'), undefined, 'captured'))
    const replaced = handle(queue.run(read('replaced-projection')))
    const latest = handle(queue.run(read('latest-projection')))
    expect(await replaced).toMatchObject({ code: 'CANCELLED' })
    expect(await handle(queue.run(read('excess-captured'), undefined, 'captured'))).toMatchObject({ code: 'BUSY' })
    expect(entered).toHaveLength(2)
    queue.cancel()
    expect(signals.get('old-projection')?.aborted).toBe(true)
    expect(signals.get('active-captured')?.aborted).toBe(false)
    expect(await latest).toMatchObject({ code: 'CANCELLED' })
    expect(physical).toBe(2)
    firstGate.resolve()
    expect(await waiting).toBe('waiting-captured')
    expect(entered).not.toContain('excess-captured')
    expect(entered).not.toContain('replaced-projection')
    expect(entered).not.toContain('latest-projection')
    expect(maximum).toBe(2)
    queue.dispose()
    expect(signals.get('active-captured')?.aborted).toBe(true)
    expect(physical).toBe(1)
  } finally {
    firstGate.resolve()
    secondGate.resolve()
    queue.dispose()
    await Promise.all(jobs)
  }
})
