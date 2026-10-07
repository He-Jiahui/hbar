import { createRoot } from 'react-dom/client'
import { createAppRuntime } from '@hbar/app-runtime'
import type { CommandExecutor } from '@hbar/commands'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { HbarProviderDialog, HbarRuntimeProvider } from '@hbar/app-react'
import { DEFAULT_LUMEN_APPEARANCE, LumenProvider } from '@lumen/app-ui'
import type { z } from 'zod'
import { getShellCopy } from '../../apps/web/src/shell-copy'
import '@lumen/app-ui/styles.css'

export interface ProviderEditorFixtureInput {
  readonly locale: 'en-US' | 'zh-CN'
  readonly mode: 'light' | 'dark'
  readonly suffix: string
  readonly count: number
  readonly description: z.infer<(typeof configurationCommands)['provider.describe']['output']>
}
declare global {
  interface Window {
    mountProviderEditor(input: ProviderEditorFixtureInput): Promise<void>
    releaseProviderEditor(): void
    providerEditorSnapshot(): {
      readonly selectedModelId: string | null
      readonly models: readonly { readonly id: string; readonly name: string }[]
    }
    providerEditorAdd(modelId: string): Promise<string | null>
    providerEditorRename(modelId: string, value: string): Promise<string | null>
    providerEditorRemove(modelId: string): Promise<string | null>
  }
}
window.mountProviderEditor = async (input) => {
  const container = document.getElementById('provider-editor-fixture')
  if (!container) throw new Error('Missing owned Provider editor root')
  const models = Array.from({ length: input.count }, (_, index) => ({
    id: `original-model-${index}`,
    name: `Original model ${index} — 原始模型完整名称 `.repeat(3),
  }))
  const profile = {
    provider: {
      id: 'original-provider',
      name: 'Original provider — 原始供应商',
      protocol: 'openai-responses',
      baseUrl: 'https://example.invalid/v1',
      model: 'original-model-0',
      models,
    },
    hasKey: true,
  }
  const directory: CommandExecutor = {
    execute(name) {
      if (name === 'workspace.list' || name === 'session.list') return Promise.resolve({ items: [], nextCursor: null })
      if (name === 'workspace.get' || name === 'session.get') return Promise.resolve(null)
      return Promise.reject(new Error(`Unexpected owned directory query: ${name}`))
    },
  }
  const configuration: CommandExecutor = {
    execute(name) {
      if (name === 'provider.describe') return Promise.resolve(input.description)
      if (name === 'provider.list')
        return Promise.resolve(configurationCommands['provider.list'].output.parse(input.count ? [profile] : []))
      if (name === 'provider.preset.list')
        return Promise.resolve(
          configurationCommands['provider.preset.list'].output.parse({
            items: [],
            nextCursor: null,
            catalogGeneratedAt: null,
          }),
        )
      return Promise.reject(new Error(`Unexpected owned Provider command: ${name}`))
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'owned-provider-editor',
    hostId: 'host',
    directory,
    configuration,
    surfaces: { canRender: (panelId) => panelId === 'settings-editor' },
  })
  const copy = getShellCopy(input.locale).providers.dialog
  const labels = {
    ...copy,
    addTitle: copy.addTitle + input.suffix,
    editTitle: (name: string) => copy.editTitle(name) + input.suffix,
    provider: {
      ...copy.provider,
      id: copy.provider.id + input.suffix,
      name: copy.provider.name + input.suffix,
      protocol: copy.provider.protocol + input.suffix,
      baseUrl: copy.provider.baseUrl + input.suffix,
      apiKey: copy.provider.apiKey + input.suffix,
    },
    sections: {
      ...copy.sections,
      connection: copy.sections.connection + input.suffix,
      credentials: copy.sections.credentials + input.suffix,
      models: copy.sections.models + input.suffix,
      modelDetails: copy.sections.modelDetails + input.suffix,
      preset: copy.sections.preset + input.suffix,
    },
    models: {
      ...copy.models,
      id: copy.models.id + input.suffix,
      name: copy.models.name + input.suffix,
      customId: copy.models.customId + input.suffix,
      contextWindow: copy.models.contextWindow + input.suffix,
      maxOutput: copy.models.maxOutput + input.suffix,
      addCustom: copy.models.addCustom + input.suffix,
      setDefault: copy.models.setDefault + input.suffix,
      remove: copy.models.remove + input.suffix,
    },
    save: copy.save + input.suffix,
    cancel: copy.cancel + input.suffix,
    checkConfiguration: copy.checkConfiguration + input.suffix,
    advancedConnection: copy.advancedConnection + input.suffix,
    advancedModel: copy.advancedModel + input.suffix,
  }
  const root = createRoot(container)
  window.releaseProviderEditor = () => {
    root.unmount()
    runtime.dispose()
  }
  await runtime.view.commands.execute('app.openSettingsEditor', {
    scope: 'global',
    path: 'providers',
    ...(input.count ? { entryId: 'original-provider' } : {}),
  })
  async function command(
    name: 'providerEditor.addModel' | 'providerEditor.setModelField' | 'providerEditor.removeModel',
    value: { readonly modelId: string; readonly field?: 'id'; readonly value?: string },
  ): Promise<string | null> {
    const editor = runtime.view.state.providers.getSnapshot().editor
    if (!editor) throw new Error('Missing owned Provider editor')
    try {
      if (name === 'providerEditor.setModelField') {
        if (value.value === undefined) throw new Error('Missing original Provider model rename value')
        await runtime.view.commands.execute(name, {
          editorId: editor.editorId,
          modelId: value.modelId,
          field: 'id',
          value: value.value,
        })
      } else await runtime.view.commands.execute(name, { editorId: editor.editorId, modelId: value.modelId })
      return null
    } catch (error) {
      return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'UNEXPECTED'
    }
  }
  window.providerEditorAdd = (modelId) => command('providerEditor.addModel', { modelId })
  window.providerEditorRemove = (modelId) => command('providerEditor.removeModel', { modelId })
  window.providerEditorRename = (modelId, value) =>
    command('providerEditor.setModelField', { modelId, field: 'id', value })
  window.providerEditorSnapshot = () => {
    const editor = runtime.view.state.providers.getSnapshot().editor
    if (!editor) throw new Error('Missing owned Provider draft snapshot')
    return { selectedModelId: editor.selectedModelId, models: editor.draft.models }
  }
  root.render(
    <LumenProvider appearance={{ ...DEFAULT_LUMEN_APPEARANCE, mode: input.mode, motion: false }}>
      <HbarRuntimeProvider view={runtime.view}>
        <HbarProviderDialog labels={labels} connected modalClassName="hbar-app-react-provider-modal" />
      </HbarRuntimeProvider>
    </LumenProvider>,
  )
}
