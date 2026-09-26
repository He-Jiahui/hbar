import { expect, test } from 'bun:test'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import {
  COMPOSER_MODEL_PAGE_SIZE,
  composerModelPresentation,
  filterComposerModels,
  thinkingProgressPercent,
  thinkingPreviewIdentity,
  visibleThinkingIndex,
} from '../packages/app-react/src/composer-model-picker'
import type { ComposerModelState, SessionControlsState } from '@hbar/app-runtime'

function fixture(index: number): ModelDescriptor {
  return {
    id: `provider/model-${index}`,
    providerId: 'provider',
    providerName: '长供应商名称 — Long provider name',
    modelId: `model-${index}`,
    modelName: `模型 ${index} — A long translated display name`,
    contextWindow: 128_000,
    maxOutput: 8192,
    imageInput: true,
    reasoning: true,
    thinkingLevels: ['low', 'high'],
    defaultThinkingLevel: 'low',
    hasKey: true,
  }
}

for (const count of [0, 1, 12, COMPOSER_MODEL_PAGE_SIZE, COMPOSER_MODEL_PAGE_SIZE + 1, 4096]) {
  test(`model menu renders a bounded first page for ${count} records`, () => {
    const models = Array.from({ length: count }, (_, index) => fixture(index))
    const result = filterComposerModels(models, '', COMPOSER_MODEL_PAGE_SIZE)
    expect(result.groups.flatMap(([, group]) => group.models)).toEqual(models.slice(0, COMPOSER_MODEL_PAGE_SIZE))
    expect(result.remaining).toBe(Math.max(0, count - COMPOSER_MODEL_PAGE_SIZE))
  })
}

test('catalog search covers hidden pages, provider names and empty results without a fake selection', () => {
  const models = Array.from({ length: 61 }, (_, index) => fixture(index))
  expect(filterComposerModels(models, 'model-60', 60).groups[0]?.[1].models).toEqual([models[60]!])
  expect(filterComposerModels(models, '长供应商', 60).remaining).toBe(1)
  expect(filterComposerModels(models, 'missing', 60).groups).toEqual([])
})

test('thinking fill follows the exact number of Host-provided discrete stops', () => {
  expect(thinkingProgressPercent(0, 0)).toBe(0)
  expect(thinkingProgressPercent(1, 0)).toBe(0)
  expect([0, 1].map((index) => thinkingProgressPercent(2, index))).toEqual([0, 100])
  expect([0, 1, 2, 3, 4].map((index) => thinkingProgressPercent(5, index))).toEqual([0, 25, 50, 75, 100])
  for (const index of [0, 1, 2, 3, 4, 5, 6]) {
    expect(thinkingProgressPercent(7, index)).toBeCloseTo((index / 6) * 100)
  }
  expect(thinkingProgressPercent(5, -1)).toBe(0)
  expect(thinkingProgressPercent(5, 20)).toBe(100)
})

test('a selected model beyond the first page is visible once, without expanding the bounded menu', () => {
  const models = Array.from({ length: 65 }, (_, index) => fixture(index))
  const selected = models[63]!
  const firstPage = filterComposerModels(models, '', COMPOSER_MODEL_PAGE_SIZE, selected.id)
  const visible = firstPage.groups.flatMap(([, group]) => group.models)
  expect(visible).toHaveLength(COMPOSER_MODEL_PAGE_SIZE)
  expect(visible[0]?.id).toBe(selected.id)
  expect(visible.filter((model) => model.id === selected.id)).toHaveLength(1)
  expect(firstPage.remaining).toBe(5)
  const complete = filterComposerModels(models, '', COMPOSER_MODEL_PAGE_SIZE * 2, selected.id)
  const completeVisible = complete.groups.flatMap(([, group]) => group.models)
  expect(completeVisible).toHaveLength(65)
  expect(completeVisible[0]?.id).toBe(selected.id)
  expect(completeVisible.filter((model) => model.id === selected.id)).toHaveLength(1)
  expect(complete.remaining).toBe(0)
  expect(filterComposerModels(models, 'missing', 60, selected.id).groups).toEqual([])
  expect(filterComposerModels(models, '', 60, 'removed/model').groups.flatMap(([, group]) => group.models)).toEqual(
    models.slice(0, 60),
  )
})

test('catalog groups use stable provider IDs; duplicate records cannot render duplicate actions', () => {
  const original = fixture(0)
  const renamed = { ...original, modelName: '重命名' }
  const another = { ...fixture(1), providerId: 'other', providerName: 'Other provider' }
  const result = filterComposerModels([original, renamed, another], '', 60)
  expect(result.groups.map(([id]) => id)).toEqual(['provider', 'other'])
  expect(result.groups[0]?.[1].models).toEqual([renamed])
  expect(result.groups[0]?.[1].models[0]?.id).toBe(original.id)
  expect(filterComposerModels([another], original.id, 60).groups).toEqual([])
})

test('a local thinking preview belongs to one session and one confirmed model revision', () => {
  const model = fixture(0)
  const configuration = {
    modelId: model.id,
    model,
    thinkingLevel: 'low' as const,
    revisions: { 'settings:session:a': 2, 'settings:global': 3 },
  }
  const identity = thinkingPreviewIdentity('a', configuration)
  expect(
    thinkingPreviewIdentity('a', { ...configuration, revisions: { 'settings:global': 3, 'settings:session:a': 2 } }),
  ).toBe(identity)
  expect(visibleThinkingIndex(0, identity, { identity, index: 1 })).toBe(1)
  expect(visibleThinkingIndex(0, thinkingPreviewIdentity('b', configuration), { identity, index: 1 })).toBe(0)
  expect(
    visibleThinkingIndex(0, thinkingPreviewIdentity('a', { ...configuration, thinkingLevel: 'high' }), {
      identity,
      index: 1,
    }),
  ).toBe(0)
  expect(
    visibleThinkingIndex(
      0,
      thinkingPreviewIdentity('a', {
        ...configuration,
        revisions: { ...configuration.revisions, 'settings:session:a': 3 },
      }),
      { identity, index: 1 },
    ),
  ).toBe(0)
  expect(
    visibleThinkingIndex(
      0,
      thinkingPreviewIdentity('a', {
        ...configuration,
        model: { ...model, thinkingLevels: ['low', 'medium', 'high'] },
      }),
      { identity, index: 1 },
    ),
  ).toBe(0)
})

function projectionFixture() {
  const model = fixture(0)
  const controls: SessionControlsState = {
    sessionId: 'a',
    status: 'ready',
    model: {
      sessionId: 'a',
      status: 'configured',
      modelId: model.id,
      model,
      thinkingLevel: 'low',
      revisions: {},
      sources: { model: 'session', thinkingLevel: 'session' },
    },
    usage: null,
    budget: null,
    errors: { model: null, usage: null, budget: null },
  }
  const catalog: ComposerModelState = {
    sessionId: 'a',
    status: 'ready',
    models: [model],
    error: null,
    action: { status: 'idle', error: null },
  }
  return { controls, catalog, model }
}

test('model validity uses the exact session configuration, not a hidden model missing from the catalog', () => {
  const f = projectionFixture()
  const hidden = composerModelPresentation(
    'a',
    true,
    { ...f.controls, status: 'partial', errors: { ...f.controls.errors, usage: 'READ_FAILED' } },
    { ...f.catalog, models: [] },
  )
  expect(hidden.state).toBe('configured')
  expect(hidden.current).toEqual(f.model)
  expect(hidden.confirmedEmpty).toBe(false)
  expect(hidden.recoverProviders).toBe(false)
  expect(hidden.canChoose).toBe(true)
  expect(composerModelPresentation('b', true, f.controls, f.catalog)).toMatchObject({
    state: 'loading',
    configuration: null,
    current: null,
    catalogReady: false,
    confirmedEmpty: false,
    canChoose: false,
  })
})

test('unset and deleted selections differ while both can use a confirmed alternative model', () => {
  const f = projectionFixture()
  if (!f.controls.model) throw new Error('The fixture model is missing')
  const unset = {
    ...f.controls,
    model: { ...f.controls.model, status: 'unset' as const, modelId: null, model: null, thinkingLevel: null },
  }
  expect(composerModelPresentation('a', true, unset, f.catalog)).toMatchObject({
    state: 'unset',
    confirmedEmpty: false,
    recoverProviders: false,
    canChoose: true,
  })
  const unavailable = {
    ...unset,
    model: { ...unset.model, status: 'unavailable' as const, modelId: 'removed/provider-model' },
  }
  expect(composerModelPresentation('a', true, unavailable, f.catalog)).toMatchObject({
    state: 'unavailable',
    current: null,
    confirmedEmpty: false,
    recoverProviders: true,
    canChoose: true,
  })
  expect(composerModelPresentation('a', true, unset, { ...f.catalog, models: [] })).toMatchObject({
    confirmedEmpty: true,
    recoverProviders: true,
  })
})

test('unread, stale, failed, foreign and offline empty arrays never imply a confirmed empty catalog', () => {
  const f = projectionFixture()
  for (const status of ['idle', 'loading', 'error'] as const) {
    const result = composerModelPresentation(
      'a',
      true,
      { ...f.controls, model: null, status: 'loading' },
      { ...f.catalog, models: [], status },
    )
    expect(result.confirmedEmpty).toBe(false)
    expect(result.canChoose).toBe(false)
    expect(result.state).toBe('loading')
    expect(result.readFailed).toBe(status === 'error')
  }
  const failure = composerModelPresentation(
    'a',
    true,
    { ...f.controls, model: null, status: 'partial', errors: { ...f.controls.errors, model: 'UNAUTHORIZED' } },
    { ...f.catalog, models: [] },
  )
  expect(failure).toMatchObject({ state: 'error', confirmedEmpty: false, canChoose: false, readFailed: true })
  expect(composerModelPresentation('a', false, f.controls, f.catalog)).toMatchObject({
    state: 'offline',
    current: null,
    canChoose: false,
    confirmedEmpty: false,
  })
})
