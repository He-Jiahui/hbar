import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'
import ModelPickerSurface, { type ReactBitsModelPickerLabels, type ReactBitsModelOption } from './ModelPickerSurface'

const labels: ReactBitsModelPickerLabels = {
  selectModel: 'Select model',
  unconfiguredModel: 'No model configured',
  searchModels: 'Search models',
  searchModelsOrProviders: 'Search models or providers',
  noMatchingModels: 'No matching models',
  localModel: 'Local',
  connected: 'Connected',
  keyNotConfigured: 'Key not configured',
  imageInput: 'Supports image input',
  imageAndText: 'Image + text',
  reasoning: 'Supports reasoning',
  reasoningLabel: 'Reasoning',
  detail: 'Details',
  multiStepReasoning: 'Multi-step reasoning',
  fastResponse: 'Fast responses',
  context: 'Context',
  maxOutput: 'Max output',
  cost: 'Cost',
  localOrFree: 'Local or free',
  thinkingLevel: 'Thinking level',
  thinkingHint: 'Adjust the response depth.',
  modelCount: 'models',
}

const model: ReactBitsModelOption = {
  id: 'provider/model',
  providerId: 'provider',
  providerName: 'Provider',
  modelName: 'Model',
  model: 'model',
  protocol: 'mock',
  hasKey: false,
  imageInput: true,
  reasoning: true,
  contextWindow: 128_000,
  maxOutput: 8_192,
  inputPrice: 0,
  outputPrice: 0,
  thinkingLevels: ['off', 'medium'],
  defaultThinkingLevel: 'medium',
}

test('model picker surface renders the ReactBits binding without a store dependency', () => {
  const markup = renderToStaticMarkup(
    createElement(ModelPickerSurface, {
      models: [model],
      selectedModelId: model.id,
      selectedThinking: 'medium',
      labels,
      formatThinkingLevel: (level) => level,
      onSelectModel: () => undefined,
      onSelectThinking: () => undefined,
    }),
  )
  expect(markup).toContain('rb-model-picker')
  expect(markup).toContain('data-reactbits-reference="https://pro.reactbits.dev/docs/app-ui/ai-chat/ai-chat-9"')
  expect(markup).toContain('Provider')
  expect(markup).toContain('Model · medium')
})
