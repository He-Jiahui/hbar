import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError, maximumContextWindow, thinkingLevelSchema } from '@hbar/contracts'
import {
  canonicalModelDescriptorId,
  modelCommands,
  modelReceiptSchema,
  MAX_MODE_SETTING,
  type ModelDescriptor,
} from '@hbar/contracts/commands/models'
import { encodePath, type SchemaPath } from '@hbar/schema-core'
import type { SettingReport } from '@hbar/settings-core'
import type { ModelCommandKernelPort } from './controller-port'
import type { SettingsCandidateValidator } from './settings-service'
import { HBAR_SETTINGS_SCHEMA_VERSION, SettingsService } from './settings-service'

const field = (name: string): SchemaPath => [{ kind: 'field', name }]
const MODEL_PATH = field('provider.model')
const THINKING_PATH = field('provider.thinkingLevel')
const MAX_MODE_PATH = field(MAX_MODE_SETTING)
const MODEL_KEY = encodePath(MODEL_PATH)
const THINKING_KEY = encodePath(THINKING_PATH)
const MAX_MODE_KEY = encodePath(MAX_MODE_PATH)

export function toModelDescriptor(model: Awaited<ReturnType<ModelCommandKernelPort['models']>>[number]): ModelDescriptor {
  return {
    id: model.id,
    providerId: model.providerId,
    providerName: model.providerName,
    modelId: model.modelId,
    modelName: model.modelName,
    ...(model.description ? { description: model.description } : {}),
    contextWindow: model.contextWindow,
    ...(model.contextTiers === undefined ? {} : { contextTiers: model.contextTiers }),
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    ...(model.maxModePricingMultiplier === undefined
      ? {}
      : { maxModePricingMultiplier: model.maxModePricingMultiplier }),
    maxOutput: model.maxOutput,
    imageInput: model.imageInput,
    reasoning: model.reasoning,
    thinkingLevels: model.thinkingLevels,
    defaultThinkingLevel: model.defaultThinkingLevel,
    hasKey: model.hasKey,
    ...(model.canExecute === undefined ? {} : { canExecute: model.canExecute }),
    ...(model.primary === undefined ? {} : { primary: model.primary }),
  }
}

function value(report: SettingReport | undefined): unknown {
  return report?.effectiveValue
}

export function createModelSettingsValidator(kernel: ModelCommandKernelPort): SettingsCandidateValidator {
  return async ({ changes, resolution }) => {
    if (!changes.some((change) => [MODEL_KEY, THINKING_KEY].includes(encodePath(change.path)))) return
    const selected = value(resolution.reports[MODEL_KEY])
    const thinking = value(resolution.reports[THINKING_KEY])
    if (selected === null && thinking === null) return
    const includesModelSelection = changes.some((change) => encodePath(change.path) === MODEL_KEY)
    const catalog = (await kernel.models({ includeHidden: !includesModelSelection })).map(toModelDescriptor)
    const canonicalSelected = typeof selected === 'string' ? canonicalModelDescriptorId(catalog, selected) : selected
    const model = catalog.find((item) => item.id === canonicalSelected)
    if (!model) throw new HbarError('MODEL_NOT_FOUND', `Configured model ${String(selected)} was not found`)
    const parsedThinking = thinkingLevelSchema.safeParse(thinking)
    if (thinking !== null && (!parsedThinking.success || !model.thinkingLevels.includes(parsedThinking.data)))
      throw new HbarError('THINKING_LEVEL_UNSUPPORTED', `${String(thinking)} is unavailable for ${model.id}`)
  }
}

export function createModelCommands(kernel: ModelCommandKernelPort, settings: SettingsService) {
  const registry = new CommandRegistry({ execution: 'host' })
  const translate = async <Value>(operation: () => Promise<Value>): Promise<Value> => {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof HbarError) throw new CommandError(error.code, error.message)
      throw error
    }
  }
  const configuration = async (sessionId: string) => {
    const snapshot = await settings.get({ kind: 'session', targetId: sessionId })
    const modelReport = snapshot.resolution.reports[MODEL_KEY]!
    const thinkingReport = snapshot.resolution.reports[THINKING_KEY]!
    const maxModeReport = snapshot.resolution.reports[MAX_MODE_KEY]!
    const modelId = typeof modelReport.effectiveValue === 'string' ? modelReport.effectiveValue : null
    const catalog = (await kernel.models({ includeHidden: true })).map(toModelDescriptor)
    const canonicalModelId = modelId === null ? null : canonicalModelDescriptorId(catalog, modelId)
    const selected = modelId ? catalog.find((model) => model.id === canonicalModelId) : undefined
    const parsedThinking = thinkingLevelSchema.safeParse(thinkingReport.effectiveValue)
    const rawThinking = parsedThinking.success ? parsedThinking.data : null
    const thinkingLevel = selected
      ? rawThinking !== null && selected.thinkingLevels.includes(rawThinking)
        ? rawThinking
        : selected.defaultThinkingLevel
      : null
    return {
      sessionId,
      status: modelId === null ? ('unset' as const) : selected ? ('configured' as const) : ('unavailable' as const),
      modelId: canonicalModelId,
      model: selected ?? null,
      thinkingLevel,
      maxMode: Boolean(
        selected && maximumContextWindow(selected) > selected.contextWindow && maxModeReport.effectiveValue === true,
      ),
      revisions: { ...snapshot.revisions },
      sources: {
        model: modelReport.sourceLayer,
        thinkingLevel: thinkingReport.sourceLayer,
        maxMode: maxModeReport.sourceLayer,
      },
    }
  }

  registry.register(modelCommands['model.list'], async () => (await kernel.models()).map(toModelDescriptor))
  registry.register(modelCommands['session.getModel'], ({ sessionId }) => translate(() => configuration(sessionId)))
  registry.register(modelCommands['session.getContextUsage'], ({ sessionId }) =>
    translate(async () => kernel.getContextUsage(sessionId, (await configuration(sessionId)).modelId)),
  )
  registry.register(modelCommands['session.getModelReceipt'], ({ sessionId, idempotencyKey }, context) =>
    translate(async () => {
      if (!context.actorId) throw new HbarError('INVALID_INPUT', 'Authenticated actor is required')
      const receipt = await settings.getReceipt(
        { kind: 'session', targetId: sessionId },
        context.actorId,
        idempotencyKey,
      )
      if (!receipt) return null
      const parsed = modelReceiptSchema.safeParse({
        sessionId,
        idempotencyKey,
        commitId: receipt.commitId,
        revision: receipt.revision,
        modelId: value(receipt.resolution.reports[MODEL_KEY]),
        thinkingLevel: value(receipt.resolution.reports[THINKING_KEY]),
        maxMode: value(receipt.resolution.reports[MAX_MODE_KEY]) === true,
        revisions: Object.fromEntries(receipt.resolution.layers.map((layer) => [layer.id, layer.revision])),
      })
      if (!parsed.success) throw new HbarError('INVALID_OUTPUT', 'Stored model receipt is invalid')
      return parsed.data
    }),
  )
  registry.register(
    modelCommands['session.setModel'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        const models = await kernel.models()
        const selected = models.find((model) => model.id === input.modelId)
        if (!selected) throw new HbarError('MODEL_NOT_FOUND', `Model ${input.modelId} was not found`)
        const before = await settings.get({ kind: 'session', targetId: input.sessionId })
        const currentThinking = value(before.resolution.reports[THINKING_KEY])
        const parsedThinking = thinkingLevelSchema.safeParse(currentThinking)
        const changes = [
          { op: 'set' as const, path: MODEL_PATH, value: selected.id },
          ...(parsedThinking.success && !selected.thinkingLevels.includes(parsedThinking.data)
            ? [{ op: 'set' as const, path: THINKING_PATH, value: selected.defaultThinkingLevel }]
            : []),
        ]
        const receipt = await settings.apply({
          schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
          scope: { kind: 'session', targetId: input.sessionId },
          changes,
          baselineRevisions: input.baselineRevisions,
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
        })
        return { ...(await configuration(input.sessionId)), commitId: receipt.commitId, revision: receipt.revision }
      }),
    { durable: true },
  )
  registry.register(
    modelCommands['session.setThinkingLevel'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        const before = await settings.get({ kind: 'session', targetId: input.sessionId })
        const modelId = value(before.resolution.reports[MODEL_KEY])
        const catalog = (await kernel.models({ includeHidden: true })).map(toModelDescriptor)
        const canonicalModelId = typeof modelId === 'string' ? canonicalModelDescriptorId(catalog, modelId) : modelId
        const selected = catalog.find((model) => model.id === canonicalModelId)
        if (!selected) throw new HbarError('MODEL_NOT_FOUND', 'Select an available model before setting thinking')
        if (!selected.thinkingLevels.includes(input.thinkingLevel))
          throw new HbarError('THINKING_LEVEL_UNSUPPORTED', `${input.thinkingLevel} is unavailable for ${selected.id}`)
        const receipt = await settings.apply({
          schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
          scope: { kind: 'session', targetId: input.sessionId },
          changes: [{ op: 'set', path: THINKING_PATH, value: input.thinkingLevel }],
          baselineRevisions: input.baselineRevisions,
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
        })
        return { ...(await configuration(input.sessionId)), commitId: receipt.commitId, revision: receipt.revision }
      }),
    { durable: true },
  )

  registry.register(
    modelCommands['session.setMaxMode'],
    (input, context) =>
      translate(async () => {
        if (!context.actorId || !context.idempotencyKey)
          throw new HbarError('INVALID_INPUT', 'Authenticated actor and idempotency key are required')
        const before = await configuration(input.sessionId)
        if (!before.model) throw new HbarError('MODEL_NOT_FOUND', 'Select an available model before setting MAX')
        if (input.enabled && maximumContextWindow(before.model) <= before.model.contextWindow)
          throw new HbarError('MAX_MODE_UNSUPPORTED', 'The selected model has no expanded context tier')
        const receipt = await settings.apply({
          schemaVersion: HBAR_SETTINGS_SCHEMA_VERSION,
          scope: { kind: 'session', targetId: input.sessionId },
          changes: [{ op: 'set', path: MAX_MODE_PATH, value: input.enabled }],
          baselineRevisions: input.baselineRevisions,
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
        })
        return { ...(await configuration(input.sessionId)), commitId: receipt.commitId, revision: receipt.revision }
      }),
    { durable: true },
  )

  return {
    ...createCommandClient(modelCommands, registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
