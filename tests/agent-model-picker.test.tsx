import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { AgentModelPicker } from '../packages/app-react/src/agent-model-picker'
import { filterCatalogModels, MODEL_CATALOG_PAGE_SIZE } from '../packages/app-react/src/model-choice-filter'
import { getShellCopy } from '../apps/web/src/shell-copy'

const model: ModelDescriptor = {
  id: 'provider:model',
  providerId: 'provider',
  providerName: 'Provider with a deliberately long bilingual name — 很长的供应商名称',
  modelId: 'model',
  modelName: 'Model with a deliberately long bilingual name — 很长的模型名称',
  contextWindow: 128_000,
  maxOutput: 8192,
  imageInput: false,
  reasoning: true,
  thinkingLevels: ['low', 'high'],
  defaultThinkingLevel: 'low',
  hasKey: false,
}

function render(locale: 'en-US' | 'zh-CN', catalog: Parameters<typeof AgentModelPicker>[0]['catalog'], value = '') {
  return renderToStaticMarkup(
    <AgentModelPicker
      id="agent-model"
      value={value}
      catalog={catalog}
      connected
      disabled={false}
      labels={getShellCopy(locale).agents.modelPicker}
      onSelect={() => {}}
      onRetry={() => {}}
    />,
  )
}

test('Agent model picker keeps unavailable drafts visible and localizes failure, empty, and long model rows', () => {
  const error = render('zh-CN', { status: 'error', models: [], error: 'DISCONNECTED' }, 'old:model')
  expect(error).toContain('不可用：old:model')
  expect(error).toContain('无法读取模型：DISCONNECTED')
  expect(error).toContain('重试读取模型')
  const empty = render('en-US', { status: 'ready', models: [], error: null })
  expect(empty).toContain('No models available')
  const unavailableDraft = render('zh-CN', { status: 'ready', models: [], error: null }, 'old:model')
  expect(unavailableDraft).toContain('不可用：old:model')
  expect(unavailableDraft).toContain('role="option"')
  expect(unavailableDraft).not.toContain('没有可用模型')
  const ready = render('zh-CN', { status: 'ready', models: [model], error: null }, model.id)
  expect(ready).toContain(model.modelName)
  expect(ready).toContain(model.providerName)
  expect(ready).toContain('aria-selected="true"')
  expect(ready).not.toContain('disabled="" role="option"')
})

test('Agent model search and paging cover the Host catalog without rendering more than one page', () => {
  const models = Array.from({ length: 4096 }, (_, index) => ({
    ...model,
    id: `provider:model-${index}`,
    modelId: `model-${index}`,
    modelName: `Model ${index}`,
  }))
  const first = filterCatalogModels(models, '', MODEL_CATALOG_PAGE_SIZE)
  expect(first.groups.flatMap(([, group]) => group.models)).toHaveLength(MODEL_CATALOG_PAGE_SIZE)
  expect(first.remaining).toBe(4096 - MODEL_CATALOG_PAGE_SIZE)
  expect(filterCatalogModels(models, 'model-4095', MODEL_CATALOG_PAGE_SIZE).groups[0]?.[1].models[0]?.id).toBe(
    'provider:model-4095',
  )
  expect(filterCatalogModels(models, 'missing', MODEL_CATALOG_PAGE_SIZE).groups).toEqual([])
})
