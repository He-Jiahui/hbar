import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { providerSchema, type ProviderConfig } from '@hbar/contracts'
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
  let unknown = false
  const port: CommandExecutor = {
    execute(name, raw) {
      if (name === 'provider.describe') return Promise.resolve(HBAR_PROVIDER_EDITOR_DESCRIPTION)
      if (name === 'provider.list') return Promise.resolve([...profiles.values()])
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
        const input = configurationCommands[name].input.parse(raw)
        const saved = providerSchema.parse(input.provider)
        profiles.set(saved.id, {
          provider: saved,
          hasKey: input.apiKey === undefined ? (profiles.get(saved.id)?.hasKey ?? false) : Boolean(input.apiKey),
        })
        if (unknown) {
          unknown = false
          return Promise.reject(new CommandError('RESULT_UNKNOWN', 'response lost'))
        }
        return Promise.resolve({})
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
    loseNextSave() {
      unknown = true
    },
  }
}

async function waitFor<Value>(read: () => Value | undefined): Promise<Value> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = read()
    if (value !== undefined) return value
    await Bun.sleep(2)
  }
  throw new Error('Timed out waiting for provider state')
}

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
