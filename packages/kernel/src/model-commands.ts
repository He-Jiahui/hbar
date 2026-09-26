import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { HbarError, thinkingLevelSchema } from '@hbar/contracts'
import { modelCommands, modelReceiptSchema, type ModelDescriptor } from '@hbar/contracts/commands/models'
import { encodePath, type SchemaPath } from '@hbar/schema-core'
import type { SettingReport } from '@hbar/settings-core'
import type { Kernel } from './index'
import type { SettingsCandidateValidator } from './settings-service'
import { HBAR_SETTINGS_SCHEMA_VERSION, SettingsService } from './settings-service'

const field = (name: string): SchemaPath => [{ kind: 'field', name }]
const MODEL_PATH = field('provider.model')
const THINKING_PATH = field('provider.thinkingLevel')
const MODEL_KEY = encodePath(MODEL_PATH)
const THINKING_KEY = encodePath(THINKING_PATH)

export function toModelDescriptor(model: Awaited<ReturnType<Kernel['models']>>[number]): ModelDescriptor {
  return {
    id: model.id,
    providerId: model.providerId,
    providerName: model.providerName,
    modelId: model.modelId,
    modelName: model.modelName,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    imageInput: model.imageInput,
    reasoning: model.reasoning,
    thinkingLevels: model.thinkingLevels,
    defaultThinkingLevel: model.defaultThinkingLevel,
    hasKey: model.hasKey,
  }
}

function value(report: SettingReport | undefined): unknown {
  return report?.effectiveValue
}

export function createModelSettingsValidator(kernel: Kernel): SettingsCandidateValidator {
  return async ({ changes, resolution }) => {
    if (!changes.some((change) => [MODEL_KEY, THINKING_KEY].includes(encodePath(change.path)))) return
    const selected = value(resolution.reports[MODEL_KEY])
    const thinking = value(resolution.reports[THINKING_KEY])
    if (selected === null && thinking === null) return
    const includesModelSelection = changes.some((change) => encodePath(change.path) === MODEL_KEY)
    const model = (await kernel.models({ includeHidden: !includesModelSelection })).find((item) => item.id === selected)
    if (!model) throw new HbarError('MODEL_NOT_FOUND', `Configured model ${String(selected)} was not found`)
    const parsedThinking = thinkingLevelSchema.safeParse(thinking)
    if (thinking !== null && (!parsedThinking.success || !model.thinkingLevels.includes(parsedThinking.data)))
      throw new HbarError('THINKING_LEVEL_UNSUPPORTED', `${String(thinking)} is unavailable for ${model.id}`)
  }
}

export function createModelCommands(kernel: Kernel, settings: SettingsService) {
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
    const modelId = typeof modelReport.effectiveValue === 'string' ? modelReport.effectiveValue : null
    const selected = modelId
      ? (await kernel.models({ includeHidden: true })).find((model) => model.id === modelId)
      : undefined
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
      modelId,
      model: selected ? toModelDescriptor(selected) : null,
      thinkingLevel,
      revisions: { ...snapshot.revisions },
      sources: { model: modelReport.sourceLayer, thinkingLevel: thinkingReport.sourceLayer },
    }
  }

  registry.register(modelCommands['model.list'], async () => (await kernel.models()).map(toModelDescriptor))
  registry.register(modelCommands['session.getModel'], ({ sessionId }) => translate(() => configuration(sessionId)))
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
        const selected = (await kernel.models({ includeHidden: true })).find((model) => model.id === modelId)
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
