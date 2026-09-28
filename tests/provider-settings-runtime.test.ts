import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { HbarError, providerSchema, type ProviderConfig } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { settingsCommands } from '@hbar/contracts/commands/settings'
import { HBAR_PROVIDER_EDITOR_DESCRIPTION, HBAR_SETTINGS_DEFINITIONS, HBAR_SETTINGS_DESCRIPTION } from '@hbar/kernel'
import { createSchemaCallbackRegistry, encodePath } from '@hbar/schema-core'
import { resolveSettings } from '@hbar/settings-core'

function model(id: string) {
  return {
    id,
    name: id,
    contextWindow: 128_000,
    maxOutput: 8_192,
    imageInput: false,
    reasoning: true,
    inputPrice: 1,
    outputPrice: 2,
    thinkingLevels: ['off', 'high'] as const,
    supportedThinkingLevels: ['off', 'high'] as const,
    defaultThinkingLevel: 'high' as const,
    defaultReasoningEffort: 'high' as const,
    supportedReasoningEfforts: ['off', 'high'] as const,
  }
}

function provider(id: string, name: string): ProviderConfig {
  return providerSchema.parse({
    id,
    name,
    protocol: 'openai-responses',
    baseUrl: 'https://example.invalid/v1',
    model: 'model-1',
    models: [model('model-1')],
  })
}

const openAiPreset = {
  id: 'openai:openai-responses:fixture',
  providerId: 'openai',
  name: 'OpenAI',
  protocol: 'openai-responses' as const,
  baseUrl: 'https://api.openai.com/v1',
  requiresBaseUrlConfiguration: false,
  modelCount: 2,
}
const openAiPresetModels = [
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    imageInput: true,
    reasoning: true,
    inputPrice: 2.5,
    outputPrice: 15,
    thinkingLevels: ['off', 'low', 'medium', 'high'] as const,
    defaultThinkingLevel: 'medium' as const,
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 mini',
    contextWindow: 400_000,
    maxOutput: 64_000,
    imageInput: true,
    reasoning: true,
    inputPrice: 0.4,
    outputPrice: 1.6,
    thinkingLevels: ['off', 'low', 'high'] as const,
    defaultThinkingLevel: 'low' as const,
  },
]

const directory: CommandExecutor = {
  execute(name) {
    if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
    if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
    return Promise.reject(new Error(`Unexpected directory query: ${name}`))
  },
}

function fixture() {
  const profiles = new Map<string, { provider: ProviderConfig; hasKey: boolean }>([
    ['fixture', { provider: provider('fixture', 'Fixture provider'), hasKey: false }],
  ])
  let saveError: Error | null = null
  let listError: Error | null = null
  let hold: Promise<void> | null = null
  let release = () => {}
  const saves: unknown[] = []
  const port: CommandExecutor = {
    execute(name, raw) {
      if (name === 'provider.describe') return Promise.resolve(HBAR_PROVIDER_EDITOR_DESCRIPTION)
      if (name === 'provider.list') {
        if (listError) {
          const error = listError
          listError = null
          return Promise.reject(error)
        }
        return Promise.resolve([...profiles.values()])
      }
      if (name === 'provider.preset.list')
        return Promise.resolve({ items: [openAiPreset], nextCursor: null, catalogGeneratedAt: 1 })
      if (name === 'provider.preset.models')
        return Promise.resolve({
          preset: openAiPreset,
          items: openAiPresetModels,
          nextCursor: null,
          catalogGeneratedAt: 1,
        })
      if (name === 'provider.save') {
        saves.push(structuredClone(raw))
        const input = configurationCommands[name].input.parse(raw)
        const saved = providerSchema.parse(input.provider)
        profiles.set(saved.id, {
          provider: saved,
          hasKey: input.apiKey === undefined ? (profiles.get(saved.id)?.hasKey ?? false) : Boolean(input.apiKey),
        })
        if (saveError) {
          const error = saveError
          saveError = null
          return Promise.reject(error)
        }
        return hold ? hold.then(() => ({})) : Promise.resolve({})
      }
      if (name === 'provider.delete') {
        const { id } = configurationCommands[name].input.parse(raw)
        return Promise.resolve({ deleted: profiles.delete(id) })
      }
      return Promise.reject(new Error(`Unexpected configuration command: ${name}`))
    },
  }
  return {
    port,
    profiles,
    saves,
    holdNextSave() {
      hold = new Promise<void>((resolve) => {
        release = resolve
      })
      return () => {
        hold = null
        release()
      }
    },
    loseNextSave(error: Error = new CommandError('RESULT_UNKNOWN', 'response lost')) {
      saveError = error
    },
    failNextList() {
      listError = new CommandError('READ_FAILED', 'Provider list refresh failed')
    },
  }
}

function modelInvalidationRuntime(configuration: ReturnType<typeof fixture>) {
  const workspace = { id: 'workspace', path: 'D:/fixture', name: 'Fixture', createdAt: 1 }
  const session = {
    id: 'session',
    workspaceId: workspace.id,
    title: 'Original session',
    parentId: null,
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    seq: 0,
  }
  let modelReads = 0
  const runtime = createAppRuntime({
    instanceId: 'provider-model-invalidation',
    hostId: 'host',
    directory: {
      execute(name) {
        if (name === 'workspace.get') return Promise.resolve(workspace)
        if (name === 'session.get') return Promise.resolve(session)
        if (name === 'workspace.list') return Promise.resolve({ items: [workspace], nextCursor: null })
        if (name === 'session.list') return Promise.resolve({ items: [session], nextCursor: null })
        return Promise.reject(new Error(`Unexpected directory query: ${name}`))
      },
    },
    configuration: configuration.port,
    models: {
      execute(name) {
        if (name !== 'session.getModel') return Promise.reject(new Error(`Unexpected model query: ${name}`))
        modelReads += 1
        const profile = configuration.profiles.get('fixture')
        const descriptor = profile
          ? {
              id: 'fixture',
              providerId: 'fixture',
              providerName: profile.provider.name,
              modelId: 'model-1',
              modelName: profile.provider.name,
              contextWindow: 128_000,
              maxOutput: 8_192,
              imageInput: false,
              reasoning: true,
              thinkingLevels: ['off', 'high'],
              defaultThinkingLevel: 'high',
              hasKey: false,
            }
          : null
        return Promise.resolve({
          sessionId: session.id,
          status: descriptor ? 'configured' : 'unavailable',
          modelId: 'fixture',
          model: descriptor,
          thinkingLevel: descriptor ? 'high' : null,
          revisions: { global: 1, workspace: 1, session: 1 },
          sources: { model: 'session', thinkingLevel: 'session' },
        })
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  return { runtime, modelReads: () => modelReads }
}

for (const action of ['save', 'delete'] as const) {
  test(`confirmed provider ${action} invalidates the selected model even when its following list refresh fails`, async () => {
    const configuration = fixture()
    const { runtime, modelReads } = modelInvalidationRuntime(configuration)
    try {
      await runtime.view.commands.execute('app.setSession', { sessionId: 'session', workspaceId: 'workspace' })
      await waitFor(() => (runtime.view.state.controls.getSnapshot().model?.status === 'configured' ? true : undefined))
      await runtime.view.commands.execute('app.openSettingsEditor', {
        scope: 'global',
        path: 'providers',
        entryId: 'fixture',
        instanceId: 'provider-model-editor',
      })
      const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
      if (action === 'save')
        await runtime.view.commands.execute('providerEditor.setProviderField', {
          editorId: editor.editorId,
          field: 'name',
          value: 'Confirmed new model name',
        })
      const previousReads = modelReads()
      const projectionStates: Array<string | null> = []
      const off = runtime.view.state.controls.subscribe(() => {
        projectionStates.push(runtime.view.state.controls.getSnapshot().model?.status ?? null)
      })
      configuration.failNextList()
      const result =
        action === 'save'
          ? runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId })
          : runtime.view.commands.execute('providerEditor.delete', { providerId: 'fixture' })
      await expect(result).rejects.toMatchObject({ code: action === 'save' ? 'RESULT_UNKNOWN' : 'READ_FAILED' })
      await waitFor(() => {
        const current = runtime.view.state.controls.getSnapshot().model
        return action === 'save'
          ? current?.model?.modelName === 'Confirmed new model name'
            ? true
            : undefined
          : current?.status === 'unavailable'
            ? true
            : undefined
      })
      off()
      expect(projectionStates).toContain(null)
      expect(modelReads()).toBeGreaterThan(previousReads)
      expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe('session')
      if (action === 'save') expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('unknown')
    } finally {
      runtime.dispose()
    }
  })
}

test('provider reconciliation invalidates model facts only after the original unknown change is confirmed', async () => {
  const configuration = fixture()
  const { runtime, modelReads } = modelInvalidationRuntime(configuration)
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: 'session', workspaceId: 'workspace' })
    await waitFor(() => (runtime.view.state.controls.getSnapshot().model?.status === 'configured' ? true : undefined))
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'fixture',
      instanceId: 'provider-model-editor',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: editor.editorId,
      field: 'name',
      value: 'Reconciled model name',
    })
    const previousReads = modelReads()
    configuration.loseNextSave()
    await expect(
      runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId }),
    ).rejects.toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(modelReads()).toBe(previousReads)
    await runtime.view.commands.execute('providerEditor.reconcile', { editorId: editor.editorId })
    await waitFor(() =>
      runtime.view.state.controls.getSnapshot().model?.model?.modelName === 'Reconciled model name' ? true : undefined,
    )
    expect(configuration.saves).toHaveLength(1)
    expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('succeeded')
  } finally {
    runtime.dispose()
  }
})

test('discard clears only unsaved secret input and cannot discard submitting or unknown provider saves', async () => {
  const configuration = fixture()
  const runtime = createAppRuntime({
    instanceId: 'provider-discard',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'fixture',
      instanceId: 'editor-a',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    const id = editor.editorId
    await runtime.view.commands.execute('providerEditor.setField', {
      editorId: id,
      field: 'apiKey',
      value: 'cancelled-fixture-secret',
    })
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: id,
      field: 'name',
      value: 'Discard this name',
    })
    expect(JSON.stringify(runtime.view.state.providers.getSnapshot())).not.toContain('cancelled-fixture-secret')
    await runtime.view.commands.execute('providerEditor.resetDraft', { editorId: id })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      draftDirty: [],
      sensitiveDirty: false,
      draft: { name: 'Fixture provider' },
      secretResetRevision: editor.secretResetRevision + 1,
    })
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: id,
      field: 'name',
      value: 'Saved without cancelled key',
    })
    const release = configuration.holdNextSave()
    const saving = runtime.view.commands.execute('providerEditor.save', { editorId: id })
    await expect(runtime.view.commands.execute('providerEditor.resetDraft', { editorId: id })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    await expect(
      runtime.view.commands.execute('providerEditor.resetField', { editorId: id, field: 'apiKey' }),
    ).rejects.toMatchObject({ code: 'SUBMISSION_PENDING' })
    release()
    await saving
    expect(configuration.saves[0]).not.toHaveProperty('apiKey')
    expect(configuration.profiles.get('fixture')?.hasKey).toBe(false)
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: id,
      field: 'name',
      value: 'Unknown name',
    })
    configuration.loseNextSave()
    await expect(runtime.view.commands.execute('providerEditor.save', { editorId: id })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await expect(runtime.view.commands.execute('providerEditor.resetDraft', { editorId: id })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    await runtime.view.commands.execute('providerEditor.reconcile', { editorId: id })
    expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('succeeded')
  } finally {
    runtime.dispose()
  }
})

test('accepted provider saves preserve unknown state for public transport errors and reconcile without writing twice', async () => {
  for (const error of [
    new Error('response lost'),
    ...['RESULT_UNKNOWN', 'CONNECTION_CLOSED', 'TIMEOUT', 'EXECUTION_FAILED'].map(
      (code) => new HbarError(code, 'response lost'),
    ),
  ]) {
    const configuration = fixture()
    const runtime = createAppRuntime({
      instanceId: 'provider-transport',
      hostId: 'host',
      directory,
      configuration: configuration.port,
      surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
    })
    try {
      await runtime.view.commands.execute('app.openSettingsEditor', {
        scope: 'global',
        path: 'providers',
        entryId: 'fixture',
      })
      const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
      const editorId = editor.editorId
      await runtime.view.commands.execute('providerEditor.setProviderField', {
        editorId,
        field: 'name',
        value: 'Accepted but unconfirmed',
      })
      configuration.loseNextSave(error)
      await expect(runtime.view.commands.execute('providerEditor.save', { editorId })).rejects.toMatchObject({
        code: 'RESULT_UNKNOWN',
      })
      expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('unknown')
      await expect(runtime.view.commands.execute('providerEditor.resetDraft', { editorId })).rejects.toMatchObject({
        code: 'SUBMISSION_PENDING',
      })
      await expect(runtime.view.commands.execute('providerEditor.save', { editorId })).rejects.toMatchObject({
        code: 'SUBMISSION_PENDING',
      })
      await runtime.view.commands.execute('providerEditor.reconcile', { editorId })
      expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('succeeded')
      expect(configuration.saves).toHaveLength(1)
    } finally {
      runtime.dispose()
    }
  }
})

test('a lost credential replacement cannot be confirmed from hasKey and remains locked without another write', async () => {
  const configuration = fixture()
  configuration.profiles.set('fixture', { provider: provider('fixture', 'Fixture provider'), hasKey: true })
  const runtime = createAppRuntime({
    instanceId: 'provider-credential-unknown',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'fixture',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    const editorId = editor.editorId
    await runtime.view.commands.execute('providerEditor.setField', {
      editorId,
      field: 'apiKey',
      value: 'unknown-replacement-key',
    })
    configuration.loseNextSave(new HbarError('CONNECTION_CLOSED', 'response lost'))
    await expect(runtime.view.commands.execute('providerEditor.save', { editorId })).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    await expect(runtime.view.commands.execute('providerEditor.reconcile', { editorId })).rejects.toMatchObject({
      code: 'CREDENTIAL_RESULT_UNKNOWN',
    })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      form: { status: 'unknown' },
      sensitiveDirty: true,
      error: 'CREDENTIAL_RESULT_UNKNOWN',
    })
    expect(configuration.profiles.get('fixture')?.hasKey).toBe(true)
    expect(JSON.stringify(runtime.view.state.providers.getSnapshot())).not.toContain('unknown-replacement-key')
    await expect(runtime.view.commands.execute('providerEditor.resetDraft', { editorId })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    await expect(runtime.view.commands.execute('providerEditor.save', { editorId })).rejects.toMatchObject({
      code: 'SUBMISSION_PENDING',
    })
    expect(configuration.saves).toHaveLength(1)
  } finally {
    runtime.dispose()
  }
})

test('late provider save confirmation cannot replace a newly opened editor or its draft', async () => {
  const configuration = fixture()
  configuration.profiles.set('other', { provider: provider('other', 'Other provider'), hasKey: false })
  const runtime = createAppRuntime({
    instanceId: 'provider-late-save',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'fixture',
      instanceId: 'editor-a',
    })
    await waitFor(() => (runtime.view.state.providers.getSnapshot().editor?.editorId === 'editor-a' ? true : undefined))
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: 'editor-a',
      field: 'name',
      value: 'Saved A',
    })
    const release = configuration.holdNextSave()
    const saving = runtime.view.commands.execute('providerEditor.save', { editorId: 'editor-a' })
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'other',
      instanceId: 'editor-b',
    })
    await waitFor(() => (runtime.view.state.providers.getSnapshot().editor?.editorId === 'editor-b' ? true : undefined))
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: 'editor-b',
      field: 'name',
      value: 'Unsaved B',
    })
    release()
    await saving
    expect(runtime.view.state.presentation.getSnapshot().modalInstanceId).toBe('editor-b')
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      editorId: 'editor-b',
      draft: { name: 'Unsaved B' },
      draftDirty: ['name'],
    })
    expect(configuration.profiles.get('fixture')?.provider.name).toBe('Saved A')
    expect(configuration.profiles.get('other')?.provider.name).toBe('Other provider')
  } finally {
    runtime.dispose()
  }
})

async function waitFor<Value>(read: () => Value | undefined): Promise<Value> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(2)
  }
  throw new Error('Timed out waiting for provider state')
}

test('provider model lists keep original targets and enforce empty, single, duplicate, and capacity boundaries', async () => {
  const configuration = fixture()
  const runtime = createAppRuntime({
    instanceId: 'provider-model-boundaries',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      instanceId: 'bounded-editor',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    const editorId = editor.editorId
    expect(editor.draft.models).toEqual([])
    expect(editor.selectedModelId).toBeNull()
    await runtime.view.commands.execute('providerEditor.addModel', { editorId, modelId: 'first' })
    await expect(
      runtime.view.commands.execute('providerEditor.removeModel', { editorId, modelId: 'first' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      runtime.view.commands.execute('providerEditor.addModel', { editorId, modelId: 'first' }),
    ).rejects.toMatchObject({ code: 'COMMAND_CONFLICT' })
    await runtime.view.commands.execute('providerEditor.addModel', { editorId, modelId: 'second' })
    await runtime.view.commands.execute('providerEditor.removeModel', { editorId, modelId: 'first' })
    await expect(
      runtime.view.commands.execute('providerEditor.setModelField', {
        editorId,
        modelId: 'first',
        field: 'name',
        value: 'Late first edit',
      }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      selectedModelId: 'second',
      draft: { model: 'second', models: [{ id: 'second', name: 'second' }] },
    })
    await expect(
      runtime.view.commands.execute('providerEditor.selectModel', { editorId, modelId: 'missing' }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    for (let index = 1; index < 256; index++)
      await runtime.view.commands.execute('providerEditor.addModel', { editorId, modelId: `bounded-${index}` })
    expect(runtime.view.state.providers.getSnapshot().editor?.draft.models).toHaveLength(256)
    await expect(
      runtime.view.commands.execute('providerEditor.addModel', { editorId, modelId: 'over-limit' }),
    ).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' })
    expect(runtime.view.state.providers.getSnapshot().editor?.draft.models).toHaveLength(256)
  } finally {
    runtime.dispose()
  }
})

test('provider runtime owns list, editor drafts, secrets, save, and unknown reconciliation', async () => {
  const configuration = fixture()
  const runtime = createAppRuntime({
    instanceId: 'providers-runtime',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('providerEditor.refresh', {})
    expect(runtime.view.state.providers.getSnapshot().list?.order).toEqual(['fixture'])
    expect(await runtime.view.commands.execute('provider.list', {})).toHaveLength(1)

    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      entryId: 'fixture',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    expect(editor.form.draft.name).toBe('Fixture provider')
    expect(editor.form.draft.apiKey).toBeUndefined()
    await runtime.view.commands.execute('providerEditor.setField', {
      editorId: editor.editorId,
      field: 'name',
      value: 'Updated provider',
    })
    await runtime.view.commands.execute('providerEditor.setField', {
      editorId: editor.editorId,
      field: 'apiKey',
      value: 'runtime-secret',
    })
    expect(runtime.view.state.providers.getSnapshot().editor?.sensitiveDirty).toBe(true)
    expect(JSON.stringify(runtime.view.state.providers.getSnapshot())).not.toContain('runtime-secret')
    await runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId })
    expect(configuration.profiles.get('fixture')).toMatchObject({
      provider: { name: 'Updated provider' },
      hasKey: true,
    })
    expect(JSON.stringify(runtime.view.state.providers.getSnapshot().profiles)).not.toContain('runtime-secret')

    await runtime.view.commands.execute('providerEditor.setField', {
      editorId: editor.editorId,
      field: 'name',
      value: 'Recovered provider',
    })
    configuration.loseNextSave()
    await expect(
      runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId }),
    ).rejects.toMatchObject({
      code: 'RESULT_UNKNOWN',
    })
    expect(runtime.view.state.providers.getSnapshot().editor?.form.status).toBe('unknown')
    await runtime.view.commands.execute('providerEditor.reconcile', { editorId: editor.editorId })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      form: { status: 'succeeded', dirty: [] },
      original: { name: 'Recovered provider' },
    })
  } finally {
    runtime.dispose()
  }
})

test('provider runtime applies paged presets and edits multi-model visibility and thinking through commands', async () => {
  const configuration = fixture()
  const runtime = createAppRuntime({
    instanceId: 'structured-provider-runtime',
    hostId: 'host',
    directory,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  try {
    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      instanceId: 'settings-editor:providers:new',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    expect(editor.draft.models).toHaveLength(0)
    expect(editor.draftIssues.length).toBeGreaterThan(0)

    await runtime.view.commands.execute('providerEditor.loadPresets', {
      editorId: editor.editorId,
      query: 'openai',
      append: false,
    })
    expect(runtime.view.state.providers.getSnapshot().editor?.presets.items).toEqual([openAiPreset])
    await runtime.view.commands.execute('providerEditor.applyPreset', {
      editorId: editor.editorId,
      presetId: openAiPreset.id,
    })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      draft: {
        id: 'openai',
        protocol: 'openai-responses',
        model: 'gpt-5.4',
        models: [{ id: 'gpt-5.4', visible: true }],
      },
      selectedModelId: 'gpt-5.4',
      draftIssues: [],
    })
    await runtime.view.commands.execute('providerEditor.setProviderField', {
      editorId: editor.editorId,
      field: 'visible',
      value: false,
    })
    await runtime.view.commands.execute('providerEditor.addPresetModel', {
      editorId: editor.editorId,
      presetId: openAiPreset.id,
      modelId: 'gpt-5.4-mini',
    })
    await runtime.view.commands.execute('providerEditor.setModelField', {
      editorId: editor.editorId,
      modelId: 'gpt-5.4-mini',
      field: 'visible',
      value: false,
    })
    await runtime.view.commands.execute('providerEditor.setModelField', {
      editorId: editor.editorId,
      modelId: 'gpt-5.4-mini',
      field: 'description',
      value: 'x'.repeat(161),
    })
    expect(
      runtime.view.state.providers
        .getSnapshot()
        .editor?.draftIssues.some((issue) => issue.path === 'models.1.description'),
    ).toBe(true)
    await runtime.view.commands.execute('providerEditor.setModelField', {
      editorId: editor.editorId,
      modelId: 'gpt-5.4-mini',
      field: 'description',
      value: 'Quick multilingual edits and review',
    })
    await runtime.view.commands.execute('providerEditor.setModelThinkingLevels', {
      editorId: editor.editorId,
      modelId: 'gpt-5.4-mini',
      thinkingLevels: ['off', 'high'],
    })
    await runtime.view.commands.execute('providerEditor.setDefaultModel', {
      editorId: editor.editorId,
      modelId: 'gpt-5.4-mini',
    })
    const structured = runtime.view.state.providers.getSnapshot().editor!
    expect(structured.draft.models).toHaveLength(2)
    expect(structured.draftDirty).toContain('models')
    expect(structured.draft.models.find((model) => model.id === 'gpt-5.4-mini')?.description).toBe(
      'Quick multilingual edits and review',
    )
    expect(structured.draftIssues).toEqual([])
    await runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId })
    expect(configuration.profiles.get('openai')?.provider).toMatchObject({
      visible: false,
      model: 'gpt-5.4-mini',
      models: [
        { id: 'gpt-5.4', visible: true },
        {
          id: 'gpt-5.4-mini',
          visible: false,
          description: 'Quick multilingual edits and review',
          thinkingLevels: ['off', 'high'],
          defaultThinkingLevel: 'high',
        },
      ],
    })
    expect(runtime.view.state.providers.getSnapshot().editor).toMatchObject({
      draftDirty: [],
      draftIssues: [],
      form: { status: 'succeeded' },
    })
  } finally {
    runtime.dispose()
  }
})

test('provider save refreshes loaded settings model content without rebuilding the form', async () => {
  const configuration = fixture()
  const callbacks = createSchemaCallbackRegistry()
  const modelPath = encodePath([{ kind: 'field', name: 'provider.model' }])
  callbacks.registerQuery('settings.getModels', {
    version: 1,
    valueType: 'string',
    async execute(request) {
      const options = [...configuration.profiles.values()].flatMap(({ provider: item }) =>
        item.visible
          ? item.models
              .filter((entry) => entry.visible)
              .map((entry) => ({
                value: `${item.id}:${entry.id}`,
                label: { kind: 'literal' as const, text: `${item.name} · ${entry.name}` },
                disabled: false,
              }))
          : [],
      )
      return {
        kind: 'options',
        status: 'ready',
        options,
        dependencyFingerprint: request.dependencyFingerprint,
        capabilityRevision: `models:${options.map((option) => option.value).join(',')}`,
      }
    },
  })
  callbacks.registerQuery('settings.getThinkingLevels', {
    version: 1,
    valueType: 'string',
    async execute() {
      return { kind: 'options', status: 'unavailable', reasonCode: 'missing_model' }
    },
  })
  const settings: CommandExecutor = {
    execute(name, raw) {
      if (name === 'settings.describe') return Promise.resolve(HBAR_SETTINGS_DESCRIPTION)
      if (name === 'settings.get') {
        const scope = settingsCommands[name].input.parse(raw).scope
        return Promise.resolve(
          settingsCommands[name].output.parse({
            schemaVersion: 1,
            scope,
            revisions: { 'settings:global': 0 },
            resolution: resolveSettings(HBAR_SETTINGS_DEFINITIONS, [
              { id: 'settings:global', kind: 'global', revision: 0, values: {} },
            ]),
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected settings command: ${name}`))
    },
  }
  const subscriberErrors: unknown[] = []
  const runtime = createAppRuntime({
    instanceId: 'provider-settings-content',
    hostId: 'host',
    directory,
    settings,
    schemaContent: callbacks,
    configuration: configuration.port,
    surfaces: { canRender: (panelId) => ['settings', 'settings-editor'].includes(panelId) },
    onSubscriberError: (error) => subscriberErrors.push(error),
  })
  try {
    await runtime.view.commands.execute('app.openSettings', { scope: 'global' })
    const form = await waitFor(() => {
      const state = runtime.view.state.settings.getSnapshot()
      const entry = state.activeFormId ? state.forms[state.activeFormId] : undefined
      const content = entry?.content[modelPath]
      return entry && content?.status === 'ready' ? entry : undefined
    })
    expect(form.content[modelPath]?.status === 'ready' ? form.content[modelPath].report.options : []).toHaveLength(1)

    await runtime.view.commands.execute('app.openSettingsEditor', {
      scope: 'global',
      path: 'providers',
      instanceId: 'settings-editor:providers:refresh-content',
    })
    const editor = await waitFor(() => runtime.view.state.providers.getSnapshot().editor ?? undefined)
    await runtime.view.commands.execute('providerEditor.loadPresets', {
      editorId: editor.editorId,
      query: 'openai',
      append: false,
    })
    await runtime.view.commands.execute('providerEditor.applyPreset', {
      editorId: editor.editorId,
      presetId: openAiPreset.id,
    })
    await runtime.view.commands.execute('providerEditor.save', { editorId: editor.editorId })
    await waitFor(() => {
      const content = runtime.view.state.settings.getSnapshot().forms[form.formId]?.content[modelPath]
      return content?.status === 'ready' && content.report.options.some((option) => option.value === 'openai:gpt-5.4')
        ? true
        : undefined
    })
    expect(runtime.view.state.settings.getSnapshot().forms[form.formId]?.form?.dirty).toEqual([])
    expect(subscriberErrors).toEqual([])
  } finally {
    runtime.dispose()
    callbacks.dispose()
  }
})
