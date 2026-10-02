import { expect, test } from 'bun:test'
import { preSessionModelSelection, type PreSessionModelCatalogState } from '@hbar/app-runtime'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'
import { preSessionCopy } from '../apps/web/src/pre-session-copy'

const model: ModelDescriptor = {
  id: 'selected',
  providerId: 'provider',
  providerName: 'Provider',
  modelId: 'selected',
  modelName: 'Selected',
  contextWindow: 128_000,
  maxOutput: 8_000,
  imageInput: true,
  reasoning: true,
  thinkingLevels: ['low', 'medium'],
  defaultThinkingLevel: 'medium',
  hasKey: true,
}
const ready: PreSessionModelCatalogState = { status: 'ready', models: [model], error: null }

test('live selection validity identifies removed model and effort without modifying the explicit draft', () => {
  const draft = Object.freeze({ modelId: model.id, thinkingLevel: 'high' as const })
  expect(preSessionModelSelection(ready, draft)).toEqual({ model, unavailable: 'thinking' })
  expect(preSessionModelSelection({ ...ready, models: [{ ...model, id: 'other' }] }, draft)).toEqual({
    model: null,
    unavailable: 'model',
  })
  expect(draft).toEqual({ modelId: 'selected', thinkingLevel: 'high' })
  expect(preSessionModelSelection(ready, { ...draft, thinkingLevel: 'low' })).toEqual({ model, unavailable: null })
  expect(preSessionModelSelection(ready, { ...draft, thinkingLevel: null }).unavailable).toBeNull()
})

test('unset choice and an unconfirmed read do not pretend a removed choice is confirmed', () => {
  expect(preSessionModelSelection(ready, undefined)).toEqual({ model: null, unavailable: null })
  expect(preSessionModelSelection(ready, { modelId: null, thinkingLevel: null }).unavailable).toBeNull()
  for (const status of ['idle', 'loading', 'error'] as const)
    expect(
      preSessionModelSelection({ ...ready, status, models: [] }, { modelId: 'selected', thinkingLevel: 'high' }),
    ).toEqual({ model: null, unavailable: null })
})

test('an unsupported effort stays invalid even when only one level is now supported', () => {
  const single = { ...model, thinkingLevels: ['off' as const], defaultThinkingLevel: 'off' as const }
  expect(
    preSessionModelSelection({ ...ready, models: [single] }, { modelId: model.id, thinkingLevel: 'high' }).unavailable,
  ).toBe('thinking')
})

test('first-send invalid choices have distinct host-owned localized recovery copy', () => {
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const copy = preSessionCopy(locale)
    expect(copy.selectedModelUnavailable).not.toBe(copy.model.empty)
    expect(copy.selectedThinkingUnavailable).not.toBe(copy.modelReadFailed)
    expect(copy.selectedModelUnavailable.length).toBeGreaterThan(10)
  }
  expect(preSessionCopy('zh-CN').selectedModelUnavailable).toContain('重新选择')
  expect(preSessionCopy('zh-CN').selectedThinkingUnavailable).toContain('确认')
})
