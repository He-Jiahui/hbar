import { describe, expect, test } from 'bun:test'
import {
  aiChatReferenceSeed,
  createAiChatReferencePreviewStore,
} from '../apps/hbar-app-ui-preview/src/aiChatReferencePreviewStore'
import { createAiChat1ReferenceFixture } from './fixtures/hbar-app-ui-ai-chat-1-reference-fixture'

describe('AI Chat reference preview ownership', () => {
  const input = {
    ...aiChatReferenceSeed(createAiChat1ReferenceFixture()),
    modelIds: ['atlas', 'quill', 'atlas', ''],
    initialModelId: 'missing',
    versionIds: ['v3', 'v2'],
    initialVersionId: 'v3',
    sourceIds: ['source-a', 'source-b'],
  }
  test('normalizes IDs and keeps unsupported service requests distinct from local data', () => {
    const store = createAiChatReferencePreviewStore(input)
    expect(store.getState().seed.modelIds).toEqual(['atlas', 'quill'])
    expect(store.getState().modelId).toBe('atlas')
    store.getState().setDraft('Retain this draft')
    store.getState().recordIntent()
    expect(store.getState().draft).toBe('Retain this draft')
    expect(store.getState().notice).toBe('intent')
    expect(store.getState().voicePhase).toBe('listening')
  })
  test('rejects unknown targets and preserves the original attachment after list mutations', () => {
    const store = createAiChatReferencePreviewStore(input)
    expect(store.getState().select('model', 'missing')).toBe(false)
    expect(store.getState().removeAttachment('missing')).toBe(false)
    expect(store.getState().removeAttachment('refund-csv')).toBe(true)
    expect(store.getState().removeAttachment('refund-csv')).toBe(false)
    store.getState().reconcile({ ...input, attachmentIds: ['new-file'] })
    expect(store.getState().removedAttachmentIds).toEqual([])
    expect(store.getState().removeAttachment('refund-csv')).toBe(false)
    expect(store.getState().seed.attachmentIds).toEqual(['new-file'])
  })
  test('recovers stale selections without redirecting to a different owner', () => {
    const store = createAiChatReferencePreviewStore(input)
    expect(store.getState().select('model', 'quill')).toBe(true)
    expect(store.getState().select('source', 'source-b')).toBe(true)
    store.getState().reconcile({ ...input, modelIds: ['atlas'], sourceIds: [] })
    expect(store.getState().modelId).toBe('atlas')
    expect(store.getState().sourceId).toBeNull()
    store.getState().reconcile({ ...input, ownerId: 'other-owner', modelIds: ['other'] })
    expect(store.getState().seed.ownerId).toBe(input.ownerId)
    expect(store.getState().select('model', 'quill')).toBe(false)
  })
  test('isolates two simultaneous preview owners and empty selections', () => {
    const first = createAiChatReferencePreviewStore(input)
    const second = createAiChatReferencePreviewStore({ ...input, ownerId: 'second' })
    first.getState().setDraft('First owner')
    first.getState().select('version', 'v2')
    expect(second.getState().draft).toBe('')
    expect(second.getState().versionId).toBe('v3')
    first.getState().reconcile({ ...input, versionIds: [], modelIds: [] })
    expect(first.getState().versionId).toBeNull()
    expect(first.getState().modelId).toBeNull()
    expect(first.getState().draft).toBe('First owner')
  })
  test('voice phase is explicitly local and restricted to the voice variant', () => {
    const conversation = createAiChatReferencePreviewStore(input)
    conversation.getState().setVoicePhase('stopped')
    expect(conversation.getState().voicePhase).toBe('listening')
    const voice = createAiChatReferencePreviewStore({ ...input, variant: 8 })
    voice.getState().setVoicePhase('stopped')
    expect(voice.getState().voicePhase).toBe('stopped')
    expect(voice.getState().notice).toBe('local')
    voice.getState().setVoicePhase('listening')
    expect(voice.getState().voicePhase).toBe('listening')
  })
})
