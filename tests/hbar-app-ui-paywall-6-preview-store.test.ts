import { describe, expect, test } from 'bun:test'
import { createPaywall6PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall6PreviewStore'
import { createPaywall6PreviewFixture, PAYWALL6_SOURCE_EVIDENCE } from '../apps/hbar-app-ui-preview/src/paywall6PreviewFixtures'

describe('Paywall 6 email draft and passive counter', () => {
  test('projects three used read segments and three host-owned assurances', () => {
    const fixture = createPaywall6PreviewFixture()
    const state = createPaywall6PreviewStore(fixture.seed).getState()
    const content = fixture.contentFor(state)
    expect(content.emailDraft).toBe('')
    expect(content.segments.map((segment) => segment.used)).toEqual([true, true, true])
    expect(content.assurances.map((row) => row.text)).toEqual(['No card required', 'One email each Thursday', 'Unsubscribe in a click'])
    expect(content.labels.counterImage).toBe('3 of 3 free articles read this month')
  })
  test('keeps arbitrary drafts local without changing the passive counter or inventing delivery', () => {
    const fixture = createPaywall6PreviewFixture()
    const store = createPaywall6PreviewStore(fixture.seed)
    const segments = store.getState().segments
    store.getState().updateEmailDraft('audit@example.invalid')
    expect(store.getState().emailDraft).toBe('audit@example.invalid')
    expect(store.getState().segments).toBe(segments)
    expect(store.getState().requestKeepReading()).toEqual({ kind: 'keep-reading-request', emailDraft: 'audit@example.invalid', resultBehavior: 'delivery-and-subscription-unverified' })
    expect(store.getState().requestSignIn()).toEqual({ kind: 'sign-in-request', resultBehavior: 'navigation-and-access-unverified' })
    expect(store.getState().emailDraft).toBe('audit@example.invalid')
    store.getState().updateEmailDraft('not an email yet')
    expect(store.getState().emailDraft).toBe('not an email yet')
  })
  test('filters invalid/duplicate IDs in host collections without mutating seed records', () => {
    const segment = { id: 'one', used: true }
    const store = createPaywall6PreviewStore({ emailDraft: '', segments: [segment, { ...segment, used: false }, { id: '', used: false }],
      assurances: [{ id: 'note', text: 'First' }, { id: 'note', text: 'Duplicate' }, { id: ' ', text: 'Invalid' }] })
    expect(store.getState().segments).toHaveLength(1)
    expect(store.getState().segments[0]).not.toBe(segment)
    expect(store.getState().assurances).toEqual([{ id: 'note', text: 'First' }])
  })
  test('exercises empty/one/six/17-note host capacity and long labels without claiming a source cap', () => {
    for (const [capacity, count] of [['empty', 0], ['one', 1], ['boundary', 6], ['overflow', 17]] as const) {
      const fixture = createPaywall6PreviewFixture('de-long', capacity)
      const content = fixture.contentFor(createPaywall6PreviewStore(fixture.seed).getState())
      expect(content.assurances).toHaveLength(count)
      expect(content.listStrategy.kind).toBe(capacity === 'overflow' ? 'pane-scroll' : 'content-grown')
      expect(content.sourceBoundary.sourceMaximum).toBe('not-tested')
    }
    expect(PAYWALL6_SOURCE_EVIDENCE.liveObservation.form.emailRequired).toBe(false)
    expect(PAYWALL6_SOURCE_EVIDENCE.liveObservation.counterRole).toBe('img')
    expect(PAYWALL6_SOURCE_EVIDENCE.liveObservation.currentCaptureProtocolEvidence).toBe(false)
  })
})
