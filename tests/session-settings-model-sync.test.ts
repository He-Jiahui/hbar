import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { modelCommands, type ModelConfiguration } from '@hbar/contracts/commands/models'
import { settingsCommands, type SettingsApplyInput, type SettingsReceipt } from '@hbar/contracts/commands/settings'
import { HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { encodePath } from '@hbar/schema-core'
import { applySettingsChanges, resolveSettings } from '@hbar/settings-core'

const workspaces = ['w1', 'w2'].map((id) => ({ id, name: id, path: `D:/${id}`, createdAt: 1 }))
const sessions = ['one', 'two', 'other'].map((id) => ({
  id,
  workspaceId: id === 'other' ? 'w2' : 'w1',
  title: id,
  archived: false,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  seq: 0,
}))
const thinkingField = encodePath([{ kind: 'field', name: 'provider.thinkingLevel' }])
const modelField = encodePath([{ kind: 'field', name: 'provider.model' }])

function deferred() {
  let release: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, resolve: () => release?.() }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error('Runtime projection did not settle')
}

function fixture() {
  const values: Record<string, Readonly<Record<string, unknown>>> = {
    'settings:global': { [thinkingField]: 'medium', [modelField]: 'provider:model' },
  }
  const revisions: Record<string, number> = {}
  const receipts = new Map<string, SettingsReceipt>()
  const writeKeys: string[] = []
  const modelReads: string[] = []
  let usageReads = 0
  let loseResponse = false
  let writeFailure: string | null = null
  let readFailure: string | null = null
  let nextRead: ReturnType<typeof deferred> | null = null
  let nextWrite: ReturnType<typeof deferred> | null = null
  const layers = (scope: SettingsApplyInput['scope']) => {
    const result = [{ id: 'settings:global', kind: 'global' }]
    if (scope.kind !== 'global') {
      const workspaceId =
        scope.kind === 'workspace' ? scope.targetId : sessions.find((item) => item.id === scope.targetId)?.workspaceId
      if (!workspaceId) throw new Error('Unknown workspace')
      result.push({ id: `settings:workspace:${workspaceId}`, kind: 'workspace' })
      if (scope.kind === 'session') result.push({ id: `settings:session:${scope.targetId}`, kind: 'session' })
    }
    return result.map((layer) => ({ ...layer, revision: revisions[layer.id] ?? 0, values: values[layer.id] ?? {} }))
  }
  const snapshot = (scope: SettingsApplyInput['scope']) => {
    const chain = layers(scope)
    return settingsCommands['settings.get'].output.parse({
      schemaVersion: 1,
      scope,
      revisions: Object.fromEntries(chain.map((layer) => [layer.id, layer.revision])),
      resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, chain),
    })
  }
  const readModel = (sessionId: string): ModelConfiguration => {
    const current = snapshot({ kind: 'session', targetId: sessionId })
    return modelCommands['session.getModel'].output.parse({
      sessionId,
      status: 'configured',
      modelId: current.resolution.reports[modelField]?.effectiveValue,
      model: null,
      thinkingLevel: current.resolution.reports[thinkingField]?.effectiveValue,
      revisions: current.revisions,
      sources: {
        model: current.resolution.reports[modelField]?.sourceLayer,
        thinkingLevel: current.resolution.reports[thinkingField]?.sourceLayer,
      },
    })
  }
  const settings: CommandExecutor = {
    async execute(name, raw, options) {
      if (name === 'settings.describe') return HBAR_SETTINGS_DESCRIPTION
      if (name === 'settings.get') return snapshot(settingsCommands[name].input.parse(raw).scope)
      if (name !== 'settings.apply') throw new Error(`Unexpected settings command: ${name}`)
      const input = settingsCommands[name].input.parse(raw)
      const key = options?.idempotencyKey
      if (!key) throw new Error('Missing write key')
      writeKeys.push(key)
      const prior = receipts.get(key)
      if (prior) return prior
      const barrier = nextWrite
      nextWrite = null
      await barrier?.promise
      if (writeFailure) throw new CommandError(writeFailure, 'Write rejected')
      const target = layers(input.scope).at(-1)
      if (!target) throw new Error('Missing settings layer')
      values[target.id] = applySettingsChanges(HBAR_SETTINGS_DEFINITIONS, target.kind, target.values, input.changes)
      revisions[target.id] = target.revision + 1
      const receipt = settingsCommands[name].output.parse({
        commitId: key,
        layerId: target.id,
        revision: target.revision + 1,
        schemaVersion: 1,
        values: values[target.id],
        resolution: snapshot(input.scope).resolution,
      })
      receipts.set(key, receipt)
      if (loseResponse) {
        loseResponse = false
        throw new CommandError('RESULT_UNKNOWN', 'Response lost after commit')
      }
      return receipt
    },
  }
  const models: CommandExecutor = {
    async execute(name, raw) {
      if (name !== 'session.getModel') throw new Error(`Unexpected model command: ${name}`)
      const { sessionId } = modelCommands[name].input.parse(raw)
      modelReads.push(sessionId)
      const result = readModel(sessionId)
      const barrier = nextRead
      nextRead = null
      await barrier?.promise
      if (readFailure) throw new CommandError(readFailure, 'Model read failed')
      return result
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'settings-model-sync',
    hostId: 'host',
    settings,
    models,
    directory: {
      execute(name, input) {
        if (!input || typeof input !== 'object') throw new Error('Missing directory input')
        if (name === 'session.get' && 'sessionId' in input)
          return Promise.resolve(sessions.find((item) => item.id === input.sessionId) ?? null)
        if (name === 'workspace.get' && 'workspaceId' in input)
          return Promise.resolve(workspaces.find((item) => item.id === input.workspaceId) ?? null)
        if (name === 'session.list') return Promise.resolve({ items: sessions, nextCursor: null })
        if (name === 'workspace.list') return Promise.resolve({ items: workspaces, nextCursor: null })
        throw new Error(`Unexpected directory query: ${name}`)
      },
    },
    usage: {
      execute() {
        usageReads += 1
        return Promise.reject(new CommandError('NO_USAGE_FIXTURE', 'Usage deliberately unavailable'))
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings' },
  })
  const commands = runtime.view.commands
  return {
    runtime,
    commands,
    modelReads,
    writeKeys,
    readModel,
    usageReads: () => usageReads,
    loseNextResponse() {
      loseResponse = true
    },
    failWrites(code: string | null) {
      writeFailure = code
    },
    failReads(code: string | null) {
      readFailure = code
    },
    delayRead() {
      nextRead = deferred()
      return nextRead.resolve
    },
    delayWrite() {
      nextWrite = deferred()
      return nextWrite.resolve
    },
    async select(sessionId: string) {
      await commands.execute('app.setSession', { sessionId, workspaceId: sessionId === 'other' ? 'w2' : 'w1' })
    },
    async open(scope: SettingsApplyInput['scope']) {
      await commands.execute(
        'app.openSettings',
        scope.kind === 'global'
          ? { scope: 'global' }
          : {
              scope: scope.kind,
              targetId: scope.targetId,
            },
      )
      await waitFor(() => {
        const state = runtime.view.state.settings.getSnapshot()
        return !!state.activeFormId && state.forms[state.activeFormId]?.status === 'ready'
      })
      const formId = runtime.view.state.settings.getSnapshot().activeFormId
      if (!formId) throw new Error('Missing active settings form')
      return formId
    },
    async edit(formId: string, value: string, field = thinkingField) {
      await commands.execute('settingsForm.setField', { formId, field, value })
    },
  }
}

async function selectedFixture() {
  const app = fixture()
  await app.select('one')
  await waitFor(() => app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel === 'medium')
  return app
}

for (const scope of [
  { kind: 'global' },
  { kind: 'workspace', targetId: 'w1' },
  { kind: 'session', targetId: 'one' },
] satisfies SettingsApplyInput['scope'][]) {
  test(`confirmed ${scope.kind} model settings refresh only the selected model projection`, async () => {
    const app = await selectedFixture()
    try {
      const formId = await app.open(scope)
      const reads = app.modelReads.length
      const usageReads = app.usageReads()
      await app.edit(formId, 'low')
      await app.edit(formId, 'provider:updated', modelField)
      await app.commands.execute('settingsForm.submit', { formId })
      expect(app.runtime.view.state.controls.getSnapshot().model).toEqual(app.readModel('one'))
      expect(app.runtime.view.state.controls.getSnapshot().model).toMatchObject({
        thinkingLevel: 'low',
        modelId: 'provider:updated',
      })
      expect(app.modelReads.length).toBe(reads + 1)
      expect(app.usageReads()).toBe(usageReads)
      expect(app.runtime.view.state.controls.getSnapshot().errors.usage).toBe('NO_USAGE_FIXTURE')
    } finally {
      app.runtime.dispose()
    }
  })
}

test('unrelated scope, unrelated field and rejected writes do not refresh the selected model', async () => {
  const app = await selectedFixture()
  try {
    const reads = app.modelReads.length
    for (const scope of [
      { kind: 'session', targetId: 'two' },
      { kind: 'workspace', targetId: 'w2' },
    ] satisfies SettingsApplyInput['scope'][]) {
      const formId = await app.open(scope)
      await app.edit(formId, 'high')
      await app.commands.execute('settingsForm.submit', { formId })
    }
    const formId = await app.open({ kind: 'global' })
    await app.edit(formId, '500', encodePath([{ kind: 'field', name: 'session.defaultBudget' }]))
    await app.commands.execute('settingsForm.submit', { formId })
    app.failWrites('VERSION_CONFLICT')
    await app.edit(formId, 'low')
    await expect(app.commands.execute('settingsForm.submit', { formId })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
    expect(app.modelReads.length).toBe(reads)
    expect(app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel).toBe('medium')
  } finally {
    app.runtime.dispose()
  }
})

test('unknown writes only synchronize after same-key reconciliation confirms the commit', async () => {
  const app = await selectedFixture()
  try {
    const formId = await app.open({ kind: 'session', targetId: 'one' })
    const reads = app.modelReads.length
    await app.edit(formId, 'low')
    app.loseNextResponse()
    await expect(app.commands.execute('settingsForm.submit', { formId })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(app.runtime.view.state.settings.getSnapshot().forms[formId]?.form?.status).toBe('unknown')
    expect(app.modelReads.length).toBe(reads)
    expect(app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel).toBe('medium')
    await app.commands.execute('settingsForm.reconcile', { formId })
    expect(app.writeKeys[0]).toBe(app.writeKeys[1])
    expect(app.modelReads.length).toBe(reads + 1)
    expect(app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel).toBe('low')
  } finally {
    app.runtime.dispose()
  }
})

test('committed settings remain confirmed while a failed projection read stays visibly partial and can recover', async () => {
  const app = await selectedFixture()
  try {
    const formId = await app.open({ kind: 'session', targetId: 'one' })
    await app.edit(formId, 'low')
    app.failReads('DISCONNECTED')
    await app.commands.execute('settingsForm.submit', { formId })
    expect(app.readModel('one').thinkingLevel).toBe('low')
    expect(app.runtime.view.state.settings.getSnapshot().forms[formId]).toMatchObject({ pendingKey: null, error: null })
    expect(app.runtime.view.state.controls.getSnapshot()).toMatchObject({
      status: 'partial',
      model: null,
      errors: { model: 'DISCONNECTED' },
    })
    app.failReads(null)
    await app.edit(formId, 'high')
    await app.commands.execute('settingsForm.submit', { formId })
    expect(app.runtime.view.state.controls.getSnapshot()).toMatchObject({
      model: { thinkingLevel: 'high' },
      errors: { model: null },
    })
  } finally {
    app.runtime.dispose()
  }
})

test('a settings confirmation after navigation does not refresh an unrelated selected session', async () => {
  const app = await selectedFixture()
  try {
    const formId = await app.open({ kind: 'session', targetId: 'one' })
    await app.edit(formId, 'low')
    const release = app.delayWrite()
    const pending = app.commands.execute('settingsForm.submit', { formId })
    await app.select('two')
    await waitFor(() => app.runtime.view.state.controls.getSnapshot().model?.sessionId === 'two')
    const reads = app.modelReads.length
    release()
    await pending
    expect(app.modelReads.length).toBe(reads)
    expect(app.runtime.view.state.controls.getSnapshot().model).toMatchObject({
      sessionId: 'two',
      thinkingLevel: 'medium',
    })
  } finally {
    app.runtime.dispose()
  }
})

test('an older full session load cannot overwrite a confirmed model-only refresh or discard usage errors', async () => {
  const app = fixture()
  try {
    const release = app.delayRead()
    await app.select('one')
    const formId = await app.open({ kind: 'session', targetId: 'one' })
    await app.edit(formId, 'low')
    await app.commands.execute('settingsForm.submit', { formId })
    expect(app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel).toBe('low')
    release()
    await waitFor(() => app.runtime.view.state.controls.getSnapshot().status === 'partial')
    expect(app.runtime.view.state.controls.getSnapshot()).toMatchObject({
      model: { thinkingLevel: 'low' },
      errors: { model: null, usage: 'NO_USAGE_FIXTURE' },
    })
  } finally {
    app.runtime.dispose()
  }
})

test('a delayed projection read cannot cross a session switch away and back or win over a newer submission', async () => {
  const app = await selectedFixture()
  try {
    const formId = await app.open({ kind: 'session', targetId: 'one' })
    await app.edit(formId, 'low')
    const reads = app.modelReads.length
    const release = app.delayRead()
    const pending = app.commands.execute('settingsForm.submit', { formId })
    await waitFor(() => app.modelReads.length === reads + 1)
    expect(app.runtime.view.state.controls.getSnapshot()).toMatchObject({ status: 'loading', model: null })
    await app.select('two')
    await app.select('one')
    await waitFor(() => app.runtime.view.state.controls.getSnapshot().model?.thinkingLevel === 'low')
    await app.edit(formId, 'high')
    await app.commands.execute('settingsForm.submit', { formId })
    release()
    await pending
    expect(app.runtime.view.state.controls.getSnapshot().model).toMatchObject({
      sessionId: 'one',
      thinkingLevel: 'high',
    })
  } finally {
    app.runtime.dispose()
  }
})
