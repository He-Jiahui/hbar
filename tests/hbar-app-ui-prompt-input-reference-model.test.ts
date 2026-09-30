import { describe, expect, test } from 'bun:test'
import {
  createPromptReferencePreviewStore,
  promptReferenceSeed,
} from '../apps/hbar-app-ui-preview/src/promptReferencePreviewStore'
import { createPrompt1ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-1-reference-fixture'
import { createPrompt3ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-3-reference-fixture'
import { createPrompt4ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-4-reference-fixture'
import { createPrompt6ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-6-reference-fixture'
import { createPrompt7ReferenceFixture } from './fixtures/hbar-app-ui-prompt-input-7-reference-fixture'

describe('Prompt Input reference preview ownership', () => {
  test('normalizes IDs, recovers stale selections and retains the draft on requests', () => {
    const source = createPrompt1ReferenceFixture()
    const store = createPromptReferencePreviewStore({
      ...source,
      models: [...source.models, source.models[0]!, { id: '', label: 'Invalid' }],
      modelId: 'stale',
    })
    expect(store.getState().seed.modelIds).toEqual(['atlas', 'atlas-pro', 'quill'])
    expect(store.getState().modelId).toBe('atlas')
    store.getState().setDraft('Keep this unsent draft')
    expect(store.getState().select('model', 'quill')).toBe(true)
    expect(store.getState().select('effort', 'missing')).toBe(false)
    store.getState().recordIntent()
    expect(store.getState().draft).toBe('Keep this unsent draft')
    expect(store.getState().notice).toBe('intent')
    expect(store.getState().remove('attachment', 'auth-service')).toBe(true)
    expect(store.getState().remove('attachment', 'auth-service')).toBe(false)
    expect(store.getState().remove('attachment', 'missing')).toBe(false)
    store.getState().reconcile({ ...promptReferenceSeed(source), modelIds: [], attachmentIds: [] })
    expect(store.getState().modelId).toBeNull()
    expect(store.getState().removedAttachmentIds).toEqual([])
    expect(store.getState().draft).toBe('Keep this unsent draft')
  })

  test('bounds context selection and preserves stable ordering for duplicate requests', () => {
    const source = createPrompt6ReferenceFixture()
    const store = createPromptReferencePreviewStore({
      ...source,
      maximumSources: 3,
      selectedSourceIds: [...source.selectedSourceIds, 'auth-service', 'unknown'],
    })
    expect(store.getState().selectedSourceIds).toEqual(source.selectedSourceIds)
    expect(store.getState().setSource('auth-service', true)).toBe(true)
    expect(store.getState().selectedSourceIds).toEqual(source.selectedSourceIds)
    expect(store.getState().setSource('api-contract', true)).toBe(false)
    expect(store.getState().setSource('billing-channel', false)).toBe(true)
    expect(store.getState().setSource('api-contract', true)).toBe(true)
    expect(store.getState().setSource('unknown', true)).toBe(false)
    store.getState().reconcile({ ...promptReferenceSeed(source), sourceIds: ['api-contract'] })
    expect(store.getState().selectedSourceIds).toEqual(['api-contract'])
  })

  test('preserves variable values through copy changes and rejects cross-owner reconciliation', () => {
    const source = createPrompt4ReferenceFixture()
    const store = createPromptReferencePreviewStore(source)
    expect(store.getState().setVariable('product', 'Atlas Billing')).toBe(true)
    expect(store.getState().setVariable('unknown', 'Ignore')).toBe(false)
    store.getState().reconcile(promptReferenceSeed(createPrompt4ReferenceFixture('zh')))
    expect(store.getState().variables.find(({ id }) => id === 'product')?.value).toBe('Atlas Billing')
    store.getState().reconcile({ ...promptReferenceSeed(source), ownerId: 'another-template', variables: [] })
    expect(store.getState().seed.ownerId).toBe(source.ownerId)
    expect(store.getState().variables).toHaveLength(3)
    store.getState().recordIntent()
    expect(store.getState().variables.find(({ id }) => id === 'product')?.value).toBe('Atlas Billing')
  })

  test('prefills only host presets and isolates simultaneous preview owners', () => {
    const source = createPrompt3ReferenceFixture()
    const first = createPromptReferencePreviewStore(source)
    const second = createPromptReferencePreviewStore(source)
    expect(first.getState().usePreset('missing')).toBe(false)
    expect(first.getState().usePreset(source.suggestions[0]!.id)).toBe(true)
    expect(first.getState().draft).toBe(source.suggestions[0]!.draft)
    expect(second.getState().draft).toBe('')
    const modes = createPromptReferencePreviewStore(createPrompt7ReferenceFixture())
    modes.getState().setDraft('Preserve across modes')
    expect(modes.getState().select('mode', 'ask')).toBe(true)
    expect(modes.getState().draft).toBe('Preserve across modes')
    expect(modes.getState().select('environment', 'unknown')).toBe(false)
  })
})
