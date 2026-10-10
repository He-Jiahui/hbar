import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import type { ProviderEditorDescription } from '@hbar/contracts/commands/configuration'
import type { ModeService } from '@hbar/plugin-sdk'
import { createPiProviderPresetCatalog, ProviderPresetNotFoundError } from '@hbar/provider-catalog'
import type { Kernel } from './index'
import { toModelDescriptor } from './model-commands'

export const HBAR_PROVIDER_EDITOR_DESCRIPTION: ProviderEditorDescription = Object.freeze<ProviderEditorDescription>({
  id: 'hbar.provider',
  version: 1,
  contextPricing: {
    maxTiers: 8,
    fields: [
      {
        name: 'contextWindow',
        type: 'integer',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.standard',
        minimum: 1024,
        maximum: 10_000_000,
        order: 10,
      },
      {
        name: 'inputPrice',
        type: 'number',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.input',
        minimum: 0,
        order: 20,
      },
      {
        name: 'outputPrice',
        type: 'number',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.output',
        minimum: 0,
        order: 30,
      },
      {
        name: 'cacheReadPrice',
        type: 'number',
        component: 'NumberField',
        required: false,
        labelKey: 'i18n:settings.providers.context.cacheRead',
        minimum: 0,
        order: 40,
      },
      {
        name: 'cacheWritePrice',
        type: 'number',
        component: 'NumberField',
        required: false,
        labelKey: 'i18n:settings.providers.context.cacheWrite',
        minimum: 0,
        order: 50,
      },
      {
        name: 'maxModePricingMultiplier',
        type: 'number',
        component: 'NumberField',
        required: false,
        labelKey: 'i18n:settings.providers.context.multiplier',
        minimum: 1,
        maximum: 100,
        order: 60,
      },
    ],
    tierFields: [
      {
        name: 'contextWindow',
        type: 'integer',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.expanded',
        minimum: 1024,
        maximum: 10_000_000,
        order: 10,
      },
      {
        name: 'inputTokensAbove',
        type: 'integer',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.threshold',
        minimum: 0,
        maximum: 10_000_000,
        order: 20,
      },
      {
        name: 'inputPrice',
        type: 'number',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.input',
        minimum: 0,
        order: 30,
      },
      {
        name: 'outputPrice',
        type: 'number',
        component: 'NumberField',
        required: true,
        labelKey: 'i18n:settings.providers.context.output',
        minimum: 0,
        order: 40,
      },
      {
        name: 'cacheReadPrice',
        type: 'number',
        component: 'NumberField',
        required: false,
        labelKey: 'i18n:settings.providers.context.cacheRead',
        minimum: 0,
        order: 50,
      },
      {
        name: 'cacheWritePrice',
        type: 'number',
        component: 'NumberField',
        required: false,
        labelKey: 'i18n:settings.providers.context.cacheWrite',
        minimum: 0,
        order: 60,
      },
    ],
  },
  fields: [
    {
      name: 'id',
      type: 'string' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.id.label',
      helpKey: 'i18n:settings.providers.id.help',
      component: 'TextField',
      order: 10,
      readOnlyOnEdit: true,
      sensitive: false,
      minLength: 1,
      maxLength: 64,
    },
    {
      name: 'name',
      type: 'string' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.name.label',
      component: 'TextField',
      order: 20,
      readOnlyOnEdit: false,
      sensitive: false,
      minLength: 1,
      maxLength: 100,
    },
    {
      name: 'protocol',
      type: 'string' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.protocol.label',
      component: 'ComboBox',
      order: 30,
      readOnlyOnEdit: false,
      sensitive: false,
      choices: ['openai-completions', 'openai-responses', 'anthropic-messages', 'mock'],
    },
    {
      name: 'baseUrl',
      type: 'string' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.baseUrl.label',
      component: 'TextField',
      order: 40,
      readOnlyOnEdit: false,
      sensitive: false,
      minLength: 1,
      maxLength: 2_048,
    },
    {
      name: 'model',
      type: 'string' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.model.label',
      component: 'TextField',
      order: 50,
      readOnlyOnEdit: false,
      sensitive: false,
      minLength: 1,
      maxLength: 160,
    },
    {
      name: 'contextWindow',
      type: 'integer' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.contextWindow.label',
      component: 'NumberField',
      order: 60,
      readOnlyOnEdit: false,
      sensitive: false,
      minimum: 1_024,
      maximum: 10_000_000,
      defaultValue: 128_000,
    },
    {
      name: 'maxOutput',
      type: 'integer' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.maxOutput.label',
      component: 'NumberField',
      order: 70,
      readOnlyOnEdit: false,
      sensitive: false,
      minimum: 64,
      maximum: 10_000_000,
      defaultValue: 8_192,
    },
    {
      name: 'imageInput',
      type: 'boolean' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.imageInput.label',
      component: 'CheckBox',
      order: 80,
      readOnlyOnEdit: false,
      sensitive: false,
      defaultValue: false,
    },
    {
      name: 'reasoning',
      type: 'boolean' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.reasoning.label',
      component: 'CheckBox',
      order: 90,
      readOnlyOnEdit: false,
      sensitive: false,
      defaultValue: false,
    },
    {
      name: 'inputPrice',
      type: 'number' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.inputPrice.label',
      component: 'NumberField',
      order: 100,
      readOnlyOnEdit: false,
      sensitive: false,
      minimum: 0,
      defaultValue: 0,
    },
    {
      name: 'outputPrice',
      type: 'number' as const,
      required: true,
      nullable: false,
      labelKey: 'i18n:settings.providers.outputPrice.label',
      component: 'NumberField',
      order: 110,
      readOnlyOnEdit: false,
      sensitive: false,
      minimum: 0,
      defaultValue: 0,
    },
    {
      name: 'apiKey',
      type: 'string' as const,
      required: false,
      nullable: false,
      labelKey: 'i18n:settings.providers.apiKey.label',
      helpKey: 'i18n:settings.providers.apiKey.help',
      component: 'SecretField',
      order: 120,
      readOnlyOnEdit: false,
      sensitive: true,
      maxLength: 8_192,
    },
  ],
})

export function createConfigurationCommands(kernel: Kernel, modes: ModeService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const providerPresets = createPiProviderPresetCatalog()
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }

  registry.register(configurationCommands['provider.describe'], () => HBAR_PROVIDER_EDITOR_DESCRIPTION)
  registry.register(configurationCommands['provider.list'], () => translate(() => kernel.providerProfiles()))
  registry.register(configurationCommands['provider.preset.list'], (input) => providerPresets.list(input))
  registry.register(configurationCommands['provider.preset.models'], (input) => {
    try {
      return providerPresets.models(input)
    } catch (error) {
      if (error instanceof ProviderPresetNotFoundError) throw new CommandError('NOT_FOUND', error.message)
      throw error
    }
  })

  registry.register(configurationCommands['permission.get'], () => ({ mode: kernel.permissionMode() }))
  registry.register(
    configurationCommands['permission.set'],
    ({ mode }) => translate(() => kernel.setPermissionMode(mode)),
    { durable: true },
  )
  registry.register(configurationCommands['mode.get'], ({ sessionId }) => translate(() => modes.get(sessionId)))
  registry.register(
    configurationCommands['mode.set'],
    ({ sessionId, mode }) => translate(() => modes.set(sessionId, mode)),
    { durable: true },
  )
  registry.register(
    configurationCommands['provider.save'],
    ({ provider, apiKey }) => translate(async () => toModelDescriptor(await kernel.saveProvider(provider, apiKey))),
    { durable: true },
  )
  registry.register(
    configurationCommands['provider.delete'],
    ({ id }) =>
      translate(async () => {
        const deleted = (await kernel.models({ includeHidden: true })).some((model) => model.providerId === id)
        if (deleted) await kernel.deleteProvider(id)
        return { deleted }
      }),
    { durable: true },
  )

  return {
    ...createCommandClient(configurationCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
