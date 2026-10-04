import { describe, expect, test } from 'bun:test'
import { createHbarAppUiVariantSpec } from '../packages/hbar-app-ui/src/catalog'
import { createChatReferencePreviewFixtures } from './fixtures/hbar-app-ui-chat-reference-fixtures'
import {
  createChatPreviewSeed,
  createChatPreviewStore,
  type ChatPreviewSeed,
} from '../apps/hbar-app-ui-preview/src/chatPreviewStore'

function createStore(variant: number, content = createChatReferencePreviewFixtures()) {
  const spec = createHbarAppUiVariantSpec('chat', variant)
  return createChatPreviewStore(createChatPreviewSeed(spec, content))
}

function seed(overrides: Partial<ChatPreviewSeed> = {}): ChatPreviewSeed {
  return {
    variantId: 'hbar-app-ui-chat-2',
    variant: 2,
    initialTargetId: 'sofia',
    targets: [{ id: 'sofia', maxLocalMessages: 2, sendable: true, initialDraft: '' }],
    quickReplyIds: [],
    initialRating: 0,
    maximumRating: 0,
    initialDirectQuery: '',
    initialSocialSortOrder: 'relevant',
    socialMessageIds: [],
    initialLikedIds: [],
    groupReactionIds: [],
    initialSelectedReactionIds: [],
    initialFollowed: false,
    ...overrides,
  }
}

describe('Chat preview store', () => {
  test('seeds domain targets only, excluding translated labels and callbacks', () => {
    const english = createChatPreviewSeed(
      createHbarAppUiVariantSpec('chat', 1),
      createChatReferencePreviewFixtures('en'),
    )
    const german = createChatPreviewSeed(
      createHbarAppUiVariantSpec('chat', 1),
      createChatReferencePreviewFixtures('de-long'),
    )

    expect(english).toEqual(german)
    expect(english).toMatchObject({
      variantId: 'hbar-app-ui-chat-1',
      variant: 1,
      initialTargetId: 'launch-room',
      targets: [{ id: 'launch-room', maxLocalMessages: 20, sendable: true, initialDraft: '' }],
    })
    expect(JSON.stringify(english)).not.toContain('Angeheftete Nachrichten')
  })

  test('captures a send target and keeps each conversation draft isolated while switching', () => {
    const store = createStore(2)
    const state = store.getState()
    state.setDraft('sofia', '  Ship the updated copy  ')
    state.setActiveTarget('marcus')
    state.setDraft('marcus', 'Review the final line')

    const ticket = state.startSend('sofia')
    expect(ticket).toMatchObject({ targetId: 'sofia', body: 'Ship the updated copy' })
    expect(state.startSend('sofia')).toBeNull()
    expect(state.setActiveTarget('marcus')).toBe(true)
    expect(store.getState().completeSend(ticket?.requestId ?? '')).toBe(true)
    expect(store.getState().getConversation('sofia')).toMatchObject({
      draft: '',
      messages: [{ targetId: 'sofia', body: 'Ship the updated copy' }],
      outcome: 'confirmed',
    })
    expect(store.getState().getConversation('marcus')).toMatchObject({
      draft: 'Review the final line',
      messages: [],
      outcome: 'idle',
    })
    expect(store.getState().completeSend(ticket?.requestId ?? '')).toBe(false)
  })

  test('failed and cancelled local outcomes retain the draft and reject stale completions', () => {
    const store = createStore(2)
    store.getState().setDraft('sofia', 'Keep this editable')
    const failed = store.getState().startSend('sofia', 'failed')
    expect(failed).not.toBeNull()
    expect(store.getState().completeSend(failed?.requestId ?? '')).toBe(true)
    expect(store.getState().getConversation('sofia')).toMatchObject({
      draft: 'Keep this editable',
      messages: [],
      outcome: 'failed',
    })

    const cancelled = store.getState().startSend('sofia')
    expect(cancelled).not.toBeNull()
    expect(store.getState().cancelSend(cancelled?.requestId ?? '')).toBe(true)
    expect(store.getState().completeSend(cancelled?.requestId ?? '')).toBe(false)
    expect(store.getState().getConversation('sofia')?.draft).toBe('Keep this editable')
  })

  test('removed targets cancel their pending callback; new owners receive unique tickets', () => {
    const firstStore = createStore(2)
    const secondStore = createStore(2)
    firstStore.getState().setDraft('sofia', 'Target-bound draft')
    secondStore.getState().setDraft('sofia', 'Independent target-bound draft')
    const first = firstStore.getState().startSend('sofia')
    const second = secondStore.getState().startSend('sofia')
    expect(first?.requestId).not.toBe(second?.requestId)

    firstStore.getState().reconcileSeed(
      seed({
        targets: [{ id: 'marcus', maxLocalMessages: 2, sendable: true, initialDraft: '' }],
        initialTargetId: 'marcus',
      }),
    )
    expect(firstStore.getState().pendingSends).toHaveLength(0)
    expect(firstStore.getState().completeSend(first?.requestId ?? '')).toBe(false)
    expect(firstStore.getState().getConversation('sofia')).toBeUndefined()
    expect(secondStore.getState().completeSend(second?.requestId ?? '')).toBe(true)
  })

  test('owner cleanup cancels pending work but preserves drafts, selection and reusable state', () => {
    const store = createStore(2)
    store.getState().setDraft('sofia', 'Draft survives cleanup')
    store.getState().setActiveTarget('marcus')
    const pending = store.getState().startSend('sofia')

    store.getState().clearOwner()
    expect(store.getState()).toMatchObject({ activeTargetId: 'marcus', pendingSends: [] })
    expect(store.getState().getConversation('sofia')?.draft).toBe('Draft survives cleanup')
    expect(store.getState().completeSend(pending?.requestId ?? '')).toBe(false)

    const next = store.getState().startSend('sofia')
    expect(next?.requestId).not.toBe(pending?.requestId)
    expect(store.getState().completeSend(next?.requestId ?? '')).toBe(true)
  })

  test('keeps only the bounded recent local suffix and rejects an empty-capacity acknowledgement', () => {
    const store = createChatPreviewStore(seed())
    for (let index = 0; index < 4; index += 1) {
      store.getState().setDraft('sofia', `Message ${index + 1}`)
      const ticket = store.getState().startSend('sofia')
      expect(ticket).not.toBeNull()
      expect(store.getState().completeSend(ticket?.requestId ?? '')).toBe(true)
    }
    expect(
      store
        .getState()
        .getConversation('sofia')
        ?.messages.map(({ body }) => body),
    ).toEqual(['Message 3', 'Message 4'])

    const full = createChatPreviewStore(
      seed({
        targets: [{ id: 'sofia', maxLocalMessages: 0, sendable: true, initialDraft: 'Keep me' }],
      }),
    )
    const failed = full.getState().startSend('sofia')
    expect(failed?.previewOutcome).toBe('failed')
    expect(full.getState().completeSend(failed?.requestId ?? '')).toBe(true)
    expect(full.getState().getConversation('sofia')).toMatchObject({
      draft: 'Keep me',
      messages: [],
      outcome: 'failed',
    })
  })

  test('keeps support rating and quick-reply selections bounded to current domain IDs', () => {
    const store = createChatPreviewStore(
      seed({
        variantId: 'hbar-app-ui-chat-4',
        variant: 4,
        targets: [{ id: 'runbook-answer', maxLocalMessages: 11, sendable: true, initialDraft: '' }],
        initialTargetId: 'runbook-answer',
        quickReplyIds: ['connection', 'billing', 'connection'],
        maximumRating: 5,
      }),
    )
    expect(store.getState().quickReplyIds).toEqual(['connection', 'billing'])
    expect(store.getState().setRating(8)).toBe(true)
    expect(store.getState().rating).toBe(5)
    expect(store.getState().selectQuickReply('connection')).toBe(true)
    expect(store.getState().selectQuickReply('removed')).toBe(false)
    expect(store.getState().selectedQuickReplyId).toBe('connection')
  })

  test('keeps direct search separate from conversation selection and copy refreshes', () => {
    const store = createChatPreviewStore(
      seed({
        targets: [
          { id: 'sofia', maxLocalMessages: 2, sendable: true, initialDraft: '' },
          { id: 'marcus', maxLocalMessages: 2, sendable: true, initialDraft: '' },
        ],
      }),
    )
    store.getState().setActiveTarget('marcus')
    store.getState().setDirectQuery('Sofia')
    expect(store.getState().activeTargetId).toBe('marcus')

    store.getState().reconcileSeed(
      seed({
        targets: [
          { id: 'sofia', maxLocalMessages: 2, sendable: true, initialDraft: '' },
          { id: 'marcus', maxLocalMessages: 2, sendable: true, initialDraft: '' },
        ],
        initialDirectQuery: 'translated copy refresh',
      }),
    )

    expect(store.getState()).toMatchObject({ activeTargetId: 'marcus', directQuery: 'Sofia' })
  })

  test('sorts and toggles social likes only for current IDs, pruning evicted local replies', () => {
    const store = createChatPreviewStore(
      seed({
        variantId: 'hbar-app-ui-chat-3',
        variant: 3,
        initialTargetId: 'post-billing',
        targets: [{ id: 'post-billing', maxLocalMessages: 1, sendable: true, initialDraft: '' }],
        initialSocialSortOrder: 'relevant',
        socialMessageIds: ['post-billing', 'marcus-reply', 'sofia-reply', 'amelia-nested', 'marcus-reply'],
        initialLikedIds: ['post-billing', 'removed-message', 'post-billing'],
      }),
    )
    const state = store.getState()
    expect(state.socialMessageIds).toEqual(['post-billing', 'marcus-reply', 'sofia-reply', 'amelia-nested'])
    expect(state.likedIds).toEqual(['post-billing'])
    expect(state.toggleSocialLike('stale-message')).toBe(false)
    expect(state.toggleSocialLike('sofia-reply')).toBe(true)
    state.setSocialSortOrder('recent')

    state.setDraft('post-billing', 'First local reply')
    const first = state.startSend('post-billing')
    expect(store.getState().completeSend(first?.requestId ?? '')).toBe(true)
    const firstLocalId = first?.requestId ?? ''
    expect(store.getState().toggleSocialLike(firstLocalId)).toBe(true)

    store.getState().setDraft('post-billing', 'Second local reply')
    const second = store.getState().startSend('post-billing')
    expect(store.getState().completeSend(second?.requestId ?? '')).toBe(true)
    expect(store.getState()).toMatchObject({ socialSortOrder: 'recent' })
    expect(store.getState().socialMessageIds).not.toContain(firstLocalId)
    expect(store.getState().likedIds).not.toContain(firstLocalId)
  })

  test('keeps group reaction and live follow selections domain-bound', () => {
    const group = createChatPreviewStore(
      seed({
        variantId: 'hbar-app-ui-chat-5',
        variant: 5,
        initialTargetId: 'hbar-app-ui-chat-5',
        targets: [{ id: 'hbar-app-ui-chat-5', maxLocalMessages: 2, sendable: true, initialDraft: '' }],
        groupReactionIds: ['priya-fire', 'priya-heart', 'tomas-hundred', 'naomi-pray', 'priya-fire'],
        initialSelectedReactionIds: ['priya-fire', 'removed-reaction', 'priya-fire'],
      }),
    )
    expect(group.getState().groupReactionIds).toEqual(['priya-fire', 'priya-heart', 'tomas-hundred', 'naomi-pray'])
    expect(group.getState().selectedReactionIds).toEqual(['priya-fire'])
    expect(group.getState().toggleGroupReaction('removed-reaction')).toBe(false)
    expect(group.getState().toggleGroupReaction('priya-heart')).toBe(true)

    const live = createChatPreviewStore(
      seed({
        variantId: 'hbar-app-ui-chat-6',
        variant: 6,
        initialFollowed: false,
      }),
    )
    expect(live.getState().setFollowed(true)).toBe(true)
    live.getState().reconcileSeed(seed({ variantId: 'hbar-app-ui-chat-6', variant: 6, initialFollowed: false }))
    expect(live.getState().followed).toBe(true)
  })
})
