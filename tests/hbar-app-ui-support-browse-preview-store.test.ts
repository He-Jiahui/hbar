import { describe, expect, test } from 'bun:test'
import { createSupportBrowsePreviewStore } from '../apps/hbar-app-ui-preview/src/supportBrowsePreviewStore'
import { createSupportThreadPreviewStore } from '../apps/hbar-app-ui-preview/src/supportThreadPreviewStore'
import { createSupportReferencePreviewCopy } from '../apps/hbar-app-ui-preview/src/supportReferencePreviewCopy'

describe('Support reference preview ownership', () => {
  test('keeps query/filter domain-only, independent between owners, and retains them on copy refresh', () => {
    const seed = { statusIds: ['all', 'open', 'resolved', 'open'], initialStatusId: 'all' }
    const requests = createSupportBrowsePreviewStore(seed)
    const help = createSupportBrowsePreviewStore({ statusIds: [], initialStatusId: null })
    requests.getState().setQuery('4192')
    expect(requests.getState().selectStatus('open')).toBe(true)
    expect(requests.getState().statusIds).toEqual(['all', 'open', 'resolved'])
    expect(help.getState().query).toBe('')
    expect(help.getState().statusId).toBeNull()
    requests.getState().reconcile(seed)
    expect(requests.getState().query).toBe('4192')
    expect(requests.getState().statusId).toBe('open')
    expect(JSON.stringify(requests.getState())).not.toContain('Your requests')
  })

  test('rejects stale filters and recovers a removed selection without clearing the query', () => {
    const store = createSupportBrowsePreviewStore({ statusIds: ['all', 'open'], initialStatusId: 'missing' })
    expect(store.getState().statusId).toBe('all')
    expect(store.getState().selectStatus('missing')).toBe(false)
    store.getState().setQuery('billing')
    store.getState().selectStatus('open')
    store.getState().reconcile({ statusIds: ['all', 'resolved'], initialStatusId: 'all' })
    expect(store.getState().statusId).toBe('all')
    expect(store.getState().query).toBe('billing')
    store.getState().reconcile({ statusIds: [], initialStatusId: 'all' })
    expect(store.getState().statusId).toBeNull()
  })

  test('assistant reuses captured-target reply tickets; closing cancels without losing its draft', () => {
    const first = createSupportThreadPreviewStore('northwind-assistant', 2)
    const second = createSupportThreadPreviewStore('other-assistant', 2)
    first.getState().setReply('Keep my assistant draft')
    const request = first.getState().startReply()
    if (!request) throw new Error('Expected an assistant preview request')
    expect(request.threadId).toBe('northwind-assistant')
    expect(first.getState().cancelPending()).toBe(true)
    expect(first.getState().completeReply(request.requestId, 'confirmed')).toBe(false)
    expect(second.getState().completeReply(request.requestId, 'confirmed')).toBe(false)
    expect(first.getState().reply).toBe('Keep my assistant draft')
    const retry = first.getState().startReply()
    if (!retry) throw new Error('Expected a fresh assistant preview request')
    expect(first.getState().completeReply(retry.requestId, 'failed')).toBe(true)
    expect(first.getState().reply).toBe('Keep my assistant draft')
    expect(first.getState().confirmedReplies).toHaveLength(0)
    const confirm = first.getState().startReply()
    if (!confirm) throw new Error('Expected the preview retry')
    expect(first.getState().completeReply(confirm.requestId, 'confirmed')).toBe(true)
    expect(first.getState().confirmedReplies).toEqual([{ id: confirm.requestId, body: 'Keep my assistant draft' }])
    expect(first.getState().reply).toBe('')
  })

  test('preview copy clearly distinguishes local confirmation from delivery and AI answers', () => {
    expect(createSupportReferencePreviewCopy('en').confirmed).toContain('No message was delivered')
    expect(createSupportReferencePreviewCopy('en').confirmed).toContain('no AI answer was requested')
    expect(createSupportReferencePreviewCopy('de').failed).toContain('Entwurf bleibt erhalten')
    expect(createSupportReferencePreviewCopy('de').notDelivered).toContain('nicht versendet')
  })
})
