import { expect, test } from 'bun:test'
import { CommandError, type CommandExecutor } from '@hbar/commands'
import { createAppRuntime } from '@hbar/app-runtime'
import { providerSchema, type ProviderConfig } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { HBAR_PROVIDER_EDITOR_DESCRIPTION } from '@hbar/kernel'

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
