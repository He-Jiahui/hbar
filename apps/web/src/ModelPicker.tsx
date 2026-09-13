import type { ModelInfo, ThinkingLevel } from '@hbar/contracts'
import { selectModel, selectThinkingLevel, useCatalog, useWorkbench } from './stores'
import { modelThinkingLabel } from './model-catalog'
import { useLocale } from './locale'
import ModelPickerSurface, { type ReactBitsModelOption } from './react-bits/components/ModelPickerSurface'

const EMPTY_MODELS: readonly ModelInfo[] = []

function toViewModel(model: ModelInfo): ReactBitsModelOption {
  return {
    id: model.id,
    providerId: model.providerId,
    providerName: model.providerName,
    modelName: model.modelName,
    model: model.model,
    protocol: model.protocol,
    hasKey: model.hasKey,
    imageInput: model.imageInput,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    thinkingLevels: model.thinkingLevels,
    defaultThinkingLevel: model.defaultThinkingLevel,
  }
}

/**
 * hbar ViewModel adapter for the ReactBits AI Chat 9 model picker. All
 * provider data and mutations stay here; the visual component is reusable by
 * the reference gallery and does not know about Zustand or the Client.
 */
export default function ModelPicker() {
  const { locale, t } = useLocale()
  const models = useCatalog((state) => state.data?.models ?? EMPTY_MODELS)
  const selectedModelId = useWorkbench((state) => state.modelId)
  const selectedThinking = useWorkbench((state) => state.thinkingLevel)
  const options = models.map(toViewModel)

  return (
    <ModelPickerSurface
      models={options}
      selectedModelId={selectedModelId}
      selectedThinking={selectedThinking}
      locale={locale}
      labels={{
        selectModel: t('selectModel'),
        unconfiguredModel: t('unconfiguredModel'),
        searchModels: t('searchModels'),
        searchModelsOrProviders: t('searchModelsOrProviders'),
        noMatchingModels: t('noMatchingModels'),
        localModel: t('localModel'),
        connected: t('connected'),
        keyNotConfigured: t('keyNotConfigured'),
        imageInput: t('imageInput'),
        imageAndText: t('imageAndText'),
        reasoning: t('reasoning'),
        reasoningLabel: t('reasoningLabel'),
        detail: t('detail'),
        multiStepReasoning: t('multiStepReasoning'),
        fastResponse: t('fastResponse'),
        context: t('context'),
        maxOutput: t('maxOutput'),
        cost: t('cost'),
        localOrFree: t('localOrFree'),
        thinkingLevel: t('thinkingLevel'),
        thinkingHint: t('thinkingHint'),
        modelCount: t('modelCount'),
      }}
      formatThinkingLevel={(level, currentLocale) => modelThinkingLabel(level as ThinkingLevel, currentLocale ?? locale)}
      onSelectModel={(modelId) => selectModel(modelId)}
      onSelectThinking={(modelId, level) => {
        if (modelId === useWorkbench.getState().modelId) selectThinkingLevel(level as ThinkingLevel)
        else selectModel(modelId, level as ThinkingLevel)
      }}
    />
  )
}
