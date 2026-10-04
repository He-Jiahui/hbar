import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/index'
import { CommentsPreviewHost } from '../apps/hbar-app-ui-preview/src/CommentsPreviewHost'
import {
  createCommentsPreviewStore,
  type CommentsPreviewScope,
  type CommentsPreviewVariant,
} from '../apps/hbar-app-ui-preview/src/commentsPreviewModel'
import { projectCommentsPreview } from '../apps/hbar-app-ui-preview/src/commentsPreviewProjection'
import { HBAR_APP_UI_COMMENTS_FIXTURES } from './fixtures/hbar-app-ui-comments-fixtures'

const input = HBAR_APP_UI_COMMENTS_FIXTURES
function setup(variant: CommentsPreviewVariant) {
  const scope: CommentsPreviewScope = { ownerId: 'preview', variant, fixtureId: 'default' }
  const store = createCommentsPreviewStore(input, scope)
  return { scope, store, content: () => projectCommentsPreview(input, store) }
}

describe('Comments active owner', () => {
  test('projects only the active rich/legacy workflow and bypasses unrelated catalog surfaces', () => {
    const variants: readonly CommentsPreviewVariant[] = [1, 2, 3, 4, 5, 6]
    const names: Record<CommentsPreviewVariant, string> = {
      1: 'referenceDiscussion',
      2: 'referenceAnnotation',
      3: 'referenceReview',
      4: 'referenceComposer',
      5: 'referenceInbox',
      6: 'referenceCanvas',
    }
    for (const variant of variants) {
      const { content } = setup(variant)
      expect(Object.keys(content())).toHaveLength(2)
      expect(Object.keys(content()).filter((key) => key.startsWith('reference'))).toEqual([names[variant]])
    }
    expect(
      renderToStaticMarkup(
        createElement(CommentsPreviewHost, {
          spec: getHbarAppUiVariant('wizard', 1).spec,
          content: input,
          children: createElement('p', {}, 'Outside Comments'),
        }),
      ),
    ).toBe('<p>Outside Comments</p>')
  })

  test('discussion keeps drafts and bounded reactions when sorting; foreign or missing targets do nothing', () => {
    const { scope, store, content } = setup(1)
    content().referenceDiscussion?.onDraftChange?.('Ready for review')
    content().referenceDiscussion?.onSortChange?.('new')
    content().referenceDiscussion?.onReactionToggle?.('priya')
    expect(content().referenceDiscussion?.sortId).toBe('new')
    expect(content().referenceDiscussion?.draft).toBe('Ready for review')
    expect(content().referenceDiscussion?.messages.find((message) => message.id === 'priya')?.reactionCount).toBe(4)
    content().referenceDiscussion?.onReactionToggle?.('priya')
    expect(content().referenceDiscussion?.messages.find((message) => message.id === 'priya')?.reactionCount).toBe(5)
    expect(store.getState().choose(scope, 'missing')).toBe(false)
    expect(store.getState().react(scope, 'missing')).toBe(false)
    expect(store.getState().draft({ ...scope }, 'Wrong generation')).toBe(false)
    expect(input.referenceDiscussion?.draft).toBe('')
  })

  test('annotation row resolution does not move the independently selected text range', () => {
    const { store, scope, content } = setup(2)
    content().referenceAnnotation?.onSelectionChange?.('regions')
    content().referenceAnnotation?.onResolveToggle?.('support')
    const projected = content().referenceAnnotation
    expect(projected?.activeId).toBe('regions')
    expect(projected?.annotations.filter((annotation) => !annotation.resolved)).toHaveLength(1)
    expect(store.getState().select(scope, 'missing')).toBe(false)
    expect(store.getState().resolve(scope, 'missing', true)).toBe(false)
    expect(store.getState().resolveReview(scope, true)).toBe(false)
  })

  test('code-review resolution leaves the draft and read-only suggestion intact', () => {
    const { content } = setup(3)
    content().referenceReview?.onDraftChange?.('Read both values from the pool')
    content().referenceReview?.onResolvedChange?.(true)
    content().referenceReview?.onResolvedChange?.(false)
    expect(content().referenceReview?.draft).toBe('Read both values from the pool')
    expect(content().referenceReview?.resolved).toBe(false)
    expect(content().referenceReview?.lines).toBe(input.referenceReview?.lines)
    expect(content().referenceReview?.messages).toBe(input.referenceReview?.messages)
  })

  test('mention selection rechecks the current query and removes only the targeted attachment', () => {
    const { content, store, scope } = setup(4)
    const oldCandidates = content().referenceComposer
    oldCandidates?.onDraftChange?.('Please ask @so')
    expect(content().referenceComposer?.suggestions.map((person) => person.id)).toEqual(['sofia'])
    oldCandidates?.onMentionSelect?.('marcus')
    expect(content().referenceComposer?.draft).toBe('Please ask @so')
    content().referenceComposer?.onMentionSelect?.('sofia')
    expect(content().referenceComposer?.draft).toBe('Please ask @sofia ')
    expect(content().referenceComposer?.suggestions).toEqual([])
    content().referenceComposer?.onAttachmentRemove?.('saturation')
    expect(content().referenceComposer?.attachments.map((item) => item.id)).toEqual(['backfill'])
    expect(store.getState().removeAttachment(scope, 'saturation')).toBe(false)
    expect(store.getState().mention(scope, 'sofia')).toBe(false)
  })

  test('inbox resolution respects the current filter and cannot reopen a hidden stale row', () => {
    const { content, store, scope } = setup(5)
    const old = content().referenceInbox
    old?.onFilterChange?.('open')
    old?.onResolvedChange?.('priya', true)
    expect(store.getState().resolve(scope, 'priya', false)).toBe(false)
    expect(content().referenceInbox?.items.find((item) => item.id === 'priya')?.resolved).toBe(true)
    content().referenceInbox?.onFilterChange?.('mentions')
    expect(store.getState().resolve(scope, 'marcus', true)).toBe(false)
    content().referenceInbox?.onFilterChange?.('all')
    expect(store.getState().resolve(scope, 'priya', false)).toBe(true)
    expect(content().referenceInbox?.items).toHaveLength(5)
    expect(input.referenceInbox?.items.find((item) => item.id === 'priya')?.resolved).toBe(false)
  })

  test('canvas retains the source shared draft while rejecting an old active-pin editor callback', () => {
    const { content, scope, store } = setup(6)
    const old = content().referenceCanvas
    old?.onDraftChange?.('Shared review draft')
    old?.onSelectionChange?.('card')
    old?.onDraftChange?.('Stale headline edit')
    content().referenceCanvas?.onResolvedChange?.('headline', true)
    expect(content().referenceCanvas?.draft).toBe('Shared review draft')
    expect(content().referenceCanvas?.activeId).toBe('card')
    content().referenceCanvas?.onDraftChange?.('Current card edit')
    expect(content().referenceCanvas?.draft).toBe('Current card edit')
    expect(store.getState().select(scope, 'missing')).toBe(false)
    expect(content().referenceCanvas?.pins).toHaveLength(3)
    expect(content().referenceCanvas?.onSend).toBeUndefined()
  })

  test('empty and duplicate IDs are normalized without initializing a different workflow', () => {
    const scope: CommentsPreviewScope = { ownerId: 'boundary', variant: 6, fixtureId: 'default' }
    const canvas = input.referenceCanvas
    const pin = canvas?.pins[0]
    if (!canvas || !pin) throw new Error('Canvas fixture missing')
    const duplicates = {
      ...input,
      referenceCanvas: { ...canvas, activeId: 'stale', pins: [pin, { ...pin, resolved: true }, { ...pin, id: '' }] },
    }
    const store = createCommentsPreviewStore(duplicates, scope)
    const projected = projectCommentsPreview(duplicates, store).referenceCanvas
    expect(projected?.pins).toHaveLength(1)
    expect(projected?.activeId).toBe(pin.id)
    expect(projected?.pins[0]?.resolved).toBe(false)
    const emptyInput = { ...input, referenceCanvas: { ...canvas, pins: [] } }
    const empty = createCommentsPreviewStore(emptyInput, scope)
    expect(projectCommentsPreview(emptyInput, empty).referenceCanvas?.activeId).toBe('')
    expect(empty.getState().draft(scope, 'No active pin', '')).toBe(false)
    const absent = createCommentsPreviewStore({ referenceDiscussion: input.referenceDiscussion }, scope)
    expect(absent.getState().flow).toEqual({ kind: 'empty' })
  })
})
