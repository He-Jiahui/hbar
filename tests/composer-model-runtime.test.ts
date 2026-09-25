import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  modelCommands,
  type ModelConfiguration,
  type ModelDescriptor,
  type ModelWriteResult,
} from '@hbar/contracts/commands/models'

const models: ModelDescriptor[] = ['fast', 'deep'].map((id) => ({
  id: `provider/${id}`,
  providerId: 'provider',
  providerName: 'Provider',
  modelId: id,
  modelName: id,
  contextWindow: 100_000,
  maxOutput: 8_000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['off', 'low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: true,
}))
const workspace = { id: 'w', name: 'workspace', path: 'D:/fixture', createdAt: 1 }
const sessions = ['one', 'two'].map((id) => ({
  id,
  workspaceId: workspace.id,
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 1,
}))

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Composer state did not settle')
}

function fixture() {
  const configurations = new Map<string, ModelConfiguration>(
    sessions.map(({ id }) => [
      id,
      {
        sessionId: id,
        status: 'configured',
        modelId: models[0]!.id,
        model: models[0]!,
        thinkingLevel: 'low',
        revisions: { [`settings:session:${id}`]: 1 },
        sources: { model: 'global', thinkingLevel: 'global' },
      },
    ]),
  )
  const calls: { name: string; input: unknown; key: string | undefined; signal: AbortSignal | undefined }[] = []
  const receipts = new Map<string, ModelWriteResult>()
  let catalog: unknown = models
  let listBarrier: ReturnType<typeof deferred> | null = null
  let readBarrier: ReturnType<typeof deferred> | null = null
  let writeBarrier: ReturnType<typeof deferred> | null = null
  let writeFailure: string | null = null
  let loseWrite = false
  let corruptWrite = false
  let usageReads = 0
  const port: CommandExecutor = {
    async execute(name, raw, options: ExecuteOptions = {}) {
      calls.push({ name, input: raw, key: options.idempotencyKey, signal: options.signal })
      if (name === 'model.list') {
        const result = structuredClone(catalog)
        const barrier = listBarrier
        listBarrier = null
        await barrier?.promise
        return result
      }
      if (name === 'session.getModel') {
        const { sessionId } = modelCommands[name].input.parse(raw)
        const result = structuredClone(configurations.get(sessionId))
        const barrier = readBarrier
        readBarrier = null
        await barrier?.promise
        return result
      }
      if (name !== 'session.setModel' && name !== 'session.setThinkingLevel') throw new Error('Unexpected command')
      const input = modelCommands[name].input.parse(raw)
      const key = options.idempotencyKey
      if (!key) throw new Error('Missing durable key')
      const receipt = receipts.get(key)
      if (receipt) return receipt
      const barrier = writeBarrier
      writeBarrier = null
      await barrier?.promise
      if (writeFailure) throw new CommandError(writeFailure, 'Rejected fixture write')
      const current = configurations.get(input.sessionId)
      if (!current) throw new Error('Missing fixture configuration')
      const layer = `settings:session:${input.sessionId}`
      if (input.baselineRevisions[layer] !== current.revisions[layer])
        throw new CommandError('VERSION_CONFLICT', 'Stale baseline')
      const selectedModel = 'modelId' in input ? models.find((model) => model.id === input.modelId) : current.model
      if (!selectedModel) throw new CommandError('MODEL_NOT_FOUND', 'Unknown fixture model')
      const revision = (current.revisions[layer] ?? 0) + 1
      const next: ModelConfiguration = {
        ...current,
        status: 'configured',
        modelId: selectedModel.id,
        model: selectedModel,
        thinkingLevel: 'thinkingLevel' in input ? input.thinkingLevel : selectedModel.defaultThinkingLevel,
        revisions: { ...current.revisions, [layer]: revision },
      }
      configurations.set(input.sessionId, next)
      const result = { ...next, commitId: key, revision }
      receipts.set(key, result)
      if (loseWrite) {
        loseWrite = false
        throw new CommandError('RESULT_UNKNOWN', 'Lost after commit')
      }
      if (corruptWrite) {
        corruptWrite = false
        return { ...result, sessionId: 'wrong-session' }
      }
      return result
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'composer-model-fixture',
    hostId: 'host',
    models: port,
    directory: {
      execute(name, raw) {
        if (!raw || typeof raw !== 'object') throw new Error('Expected directory input')
        if (name === 'session.get' && 'sessionId' in raw)
          return Promise.resolve(sessions.find((session) => session.id === raw.sessionId) ?? null)
        if (name === 'workspace.get') return Promise.resolve(workspace)
        return Promise.resolve({ items: [], nextCursor: null })
      },
    },
    usage: {
      execute() {
        usageReads++
        return Promise.reject(new CommandError('NO_USAGE_FIXTURE', 'No usage fixture'))
      },
    },
  })
  return {
    runtime,
    commands: runtime.view.commands,
    calls,
    configurations,
    usageReads: () => usageReads,
    snapshot: () => runtime.view.state.composerModel.getSnapshot(),
    model: () => runtime.view.state.controls.getSnapshot().model,
    async select(sessionId = 'one') {
      await runtime.view.commands.execute('app.setSession', { sessionId })
      await waitFor(() => runtime.view.state.controls.getSnapshot().model?.sessionId === sessionId)
    },
    catalog(value: unknown) {
      catalog = value
    },
    delayList() {
      listBarrier = deferred()
      return listBarrier.release
    },
    delayRead() {
      readBarrier = deferred()
      return readBarrier.release
    },
    delayWrite() {
      writeBarrier = deferred()
      return writeBarrier.release
    },
    failWrite(code: string | null) {
      writeFailure = code
    },
    loseResponse() {
      loseWrite = true
    },
    corruptResponse() {
      corruptWrite = true
    },
  }
}

test('composer catalog refresh coalesces repeated clicks and accepts an unset configuration and empty catalog', async () => {
  const app = fixture()
  try {
    await app.select()
    app.configurations.set('one', {
      sessionId: 'one',
      status: 'unset',
      modelId: null,
      model: null,
      thinkingLevel: null,
      revisions: {},
      sources: { model: 'default', thinkingLevel: 'default' },
    })
    app.catalog([])
    const release = app.delayList()
    const first = app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const second = app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    await waitFor(() => app.snapshot().status === 'loading')
    release()
    await Promise.all([first, second])
    expect(app.calls.filter((call) => call.name === 'model.list')).toHaveLength(1)
    expect(app.snapshot()).toMatchObject({ sessionId: 'one', status: 'ready', models: [], action: { status: 'idle' } })
    expect(app.model()?.status).toBe('unset')
  } finally {
    app.runtime.dispose()
  }
})

test('model and thinking selections confirm in place with current CAS baselines and no usage reload', async () => {
  const app = fixture()
  try {
    await app.select()
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const usage = app.usageReads()
    const reads = app.calls.filter((call) => call.name === 'session.getModel').length
    await app.commands.execute('composerModel.selectModel', { sessionId: 'one', modelId: 'provider/deep' })
    expect(app.model()).toMatchObject({
      modelId: 'provider/deep',
      thinkingLevel: 'low',
      revisions: { 'settings:session:one': 2 },
    })
    await app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' })
    expect(app.model()).toMatchObject({
      modelId: 'provider/deep',
      thinkingLevel: 'high',
      revisions: { 'settings:session:one': 3 },
    })
    const writes = app.calls.filter((call) => call.key)
    expect(writes.map((call) => call.input)).toEqual([
      { sessionId: 'one', modelId: 'provider/deep', baselineRevisions: { 'settings:session:one': 1 } },
      { sessionId: 'one', thinkingLevel: 'high', baselineRevisions: { 'settings:session:one': 2 } },
    ])
    expect(app.snapshot().action).toEqual({ status: 'idle', error: null })
    expect(app.usageReads()).toBe(usage)
    expect(app.calls.filter((call) => call.name === 'session.getModel')).toHaveLength(reads)
  } finally {
    app.runtime.dispose()
  }
})

test('thinking can be selected before opening the model catalog and catalog refresh keeps the current label', async () => {
  const app = fixture()
  try {
    await app.select()
    expect(app.snapshot().status).toBe('idle')
    await app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' })
    expect(app.model()?.thinkingLevel).toBe('high')
    expect(app.calls.filter((call) => call.name === 'model.list')).toHaveLength(0)
    const release = app.delayRead()
    const refresh = app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    await waitFor(() => app.snapshot().status === 'loading')
    expect(app.model()).toMatchObject({ modelId: 'provider/fast', thinkingLevel: 'high' })
    release()
    await refresh
    expect(app.snapshot().status).toBe('ready')
  } finally {
    app.runtime.dispose()
  }
})

test('a catalog refresh cannot clear an unknown thinking write started while it was loading', async () => {
  const app = fixture()
  try {
    await app.select()
    const release = app.delayList()
    const refresh = app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    await waitFor(() => app.calls.some((call) => call.name === 'model.list'))
    app.loseResponse()
    await expect(
      app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    release()
    await refresh
    expect(app.snapshot()).toMatchObject({ status: 'ready', action: { status: 'unknown' } })
    await app.commands.execute('composerModel.reconcile', { sessionId: 'one' })
    expect(app.model()?.thinkingLevel).toBe('high')
  } finally {
    app.runtime.dispose()
  }
})

test('pending and unknown writes block new intents and reconcile with the exact original key and input', async () => {
  const app = fixture()
  try {
    await app.select()
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const release = app.delayWrite()
    app.loseResponse()
    const pending = app.commands.execute('composerModel.selectModel', { sessionId: 'one', modelId: 'provider/deep' })
    const rejection = pending.catch((error: unknown) => error)
    await waitFor(() => app.snapshot().action.status === 'submitting')
    await expect(
      app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    release()
    expect(await rejection).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(app.snapshot().action.status).toBe('unknown')
    expect(app.model()?.modelId).toBe('provider/fast')
    await expect(
      app.commands.execute('composerModel.selectModel', { sessionId: 'one', modelId: 'provider/fast' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    await expect(app.commands.execute('composerModel.refresh', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    await app.commands.execute('composerModel.reconcile', { sessionId: 'one' })
    const writes = app.calls.filter((call) => call.key)
    expect(writes).toHaveLength(2)
    expect(writes[1]?.key).toBe(writes[0]?.key)
    expect(writes[1]?.input).toEqual(writes[0]?.input)
    expect(app.model()?.modelId).toBe('provider/deep')
    expect(app.snapshot().action.status).toBe('idle')
  } finally {
    app.runtime.dispose()
  }
})

test('late catalog and write results stay with their original session, including unknown recovery after returning', async () => {
  const app = fixture()
  try {
    await app.select()
    const releaseList = app.delayList()
    const oldRefresh = app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    await waitFor(() => app.calls.some((call) => call.name === 'model.list'))
    await app.select('two')
    await app.commands.execute('composerModel.refresh', { sessionId: 'two' })
    releaseList()
    await oldRefresh
    expect(app.snapshot()).toMatchObject({ sessionId: 'two', status: 'ready' })
    await app.select('one')
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const releaseWrite = app.delayWrite()
    app.loseResponse()
    const oldWrite = app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' })
    const rejection = oldWrite.catch((error: unknown) => error)
    await waitFor(() => app.snapshot().action.status === 'submitting')
    await app.select('two')
    releaseWrite()
    expect(await rejection).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(app.snapshot()).toMatchObject({ sessionId: 'two', action: { status: 'idle' } })
    expect(app.model()).toMatchObject({ sessionId: 'two', thinkingLevel: 'low' })
    await expect(app.commands.execute('composerModel.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'STALE_TARGET',
    })
    await app.select('one')
    expect(app.snapshot().action.status).toBe('unknown')
    await app.commands.execute('composerModel.reconcile', { sessionId: 'one' })
    expect(app.snapshot().action.status).toBe('idle')
    expect(app.model()?.thinkingLevel).toBe('high')
  } finally {
    app.runtime.dispose()
  }
})

test('a read started before confirmation cannot overwrite the new projection', async () => {
  const app = fixture()
  try {
    await app.select()
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const release = app.delayRead()
    const oldRead = app.commands.execute('session.getModel', { sessionId: 'one' })
    await waitFor(() => app.calls.filter((call) => call.name === 'session.getModel').length === 3)
    await app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' })
    release()
    await oldRead
    expect(app.model()?.thinkingLevel).toBe('high')
  } finally {
    app.runtime.dispose()
  }
})

test('rejected writes preserve configuration and recover after refresh; malformed confirmation stays unknown', async () => {
  const app = fixture()
  try {
    await app.select()
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    app.failWrite('VERSION_CONFLICT')
    await expect(
      app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    expect(app.snapshot().action).toEqual({ status: 'failed', error: 'VERSION_CONFLICT' })
    expect(app.model()?.thinkingLevel).toBe('low')
    app.failWrite(null)
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    app.corruptResponse()
    await expect(
      app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'high' }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT' })
    expect(app.snapshot().action.status).toBe('unknown')
    expect(app.model()?.thinkingLevel).toBe('low')
    await app.commands.execute('composerModel.reconcile', { sessionId: 'one' })
    expect(app.model()?.thinkingLevel).toBe('high')
  } finally {
    app.runtime.dispose()
  }
})

test('invalid catalogs and unsupported selections fail locally without durable writes', async () => {
  const app = fixture()
  try {
    await app.select()
    app.catalog([models[0], models[0]])
    await expect(app.commands.execute('composerModel.refresh', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'INVALID_OUTPUT',
    })
    expect(app.snapshot()).toMatchObject({ status: 'error', error: 'INVALID_OUTPUT' })
    app.catalog(models)
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    await expect(
      app.commands.execute('composerModel.selectModel', { sessionId: 'one', modelId: 'missing' }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    await expect(
      app.commands.execute('composerModel.selectThinking', { sessionId: 'one', thinkingLevel: 'max' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(app.calls.filter((call) => call.key)).toHaveLength(0)
  } finally {
    app.runtime.dispose()
  }
})

test('cancellation exposes unknown while an uncooperative write is in flight and never starts a duplicate', async () => {
  const app = fixture()
  try {
    await app.select()
    await app.commands.execute('composerModel.refresh', { sessionId: 'one' })
    const release = app.delayWrite()
    const controller = new AbortController()
    const request = app.commands
      .execute(
        'composerModel.selectThinking',
        { sessionId: 'one', thinkingLevel: 'high' },
        { signal: controller.signal },
      )
      .catch((error: unknown) => error)
    await waitFor(() => app.snapshot().action.status === 'submitting')
    controller.abort()
    expect(await request).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(app.snapshot().action.status).toBe('unknown')
    await expect(app.commands.execute('composerModel.reconcile', { sessionId: 'one' })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    expect(app.calls.filter((call) => call.key)).toHaveLength(1)
    release()
    await waitFor(() => app.snapshot().action.status === 'idle')
    expect(app.model()?.thinkingLevel).toBe('high')
  } finally {
    app.runtime.dispose()
  }
})

test('disposed runtime aborts its catalog request and ignores late results', async () => {
  const app = fixture()
  await app.select()
  const release = app.delayList()
  const request = app.commands.execute('composerModel.refresh', { sessionId: 'one' }).catch((error: unknown) => error)
  await waitFor(() => app.calls.some((call) => call.name === 'model.list'))
  const snapshot = app.snapshot()
  app.runtime.dispose()
  expect(app.calls.find((call) => call.name === 'model.list')?.signal?.aborted).toBe(true)
  release()
  expect(await request).toMatchObject({ code: 'RESULT_UNKNOWN' })
  expect(app.snapshot()).toEqual(snapshot)
})

test('missing model capability returns a bounded retryable error without leaving a refresh lock', async () => {
  const runtime = createAppRuntime({
    instanceId: 'composer-model-unavailable',
    hostId: 'host',
    directory: {
      execute(name) {
        return Promise.resolve(name === 'session.get' ? sessions[0] : workspace)
      },
    },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'one' })
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(runtime.view.commands.execute('composerModel.refresh', { sessionId: 'one' })).rejects.toMatchObject({
        code: 'CAPABILITY_UNAVAILABLE',
      })
      expect(runtime.view.state.composerModel.getSnapshot()).toMatchObject({
        sessionId: 'one',
        status: 'error',
        error: 'CAPABILITY_UNAVAILABLE',
        action: { status: 'idle' },
      })
    }
  } finally {
    runtime.dispose()
  }
})
