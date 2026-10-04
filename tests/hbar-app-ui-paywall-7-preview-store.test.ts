import { describe, expect, test } from 'bun:test'
import { createPaywall7PreviewFixture } from '../apps/hbar-app-ui-preview/src/paywall7PreviewFixtures'
import {
  createPaywall7PreviewStore,
  type Paywall7PreviewRecipient,
} from '../apps/hbar-app-ui-preview/src/paywall7PreviewStore'

describe('Paywall 7 preview store', () => {
  test('seeds the two observed admins and source note as local editable content', () => {
    const fixture = createPaywall7PreviewFixture()
    const store = createPaywall7PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())

    expect(content.recipients).toHaveLength(2)
    expect(content.recipients.map((recipient) => recipient.id)).toEqual(['priya-nandakumar', 'marcus-bell'])
    expect(content.recipients[0]?.name).toBe('Priya Nandakumar')
    expect(content.recipients[1]?.role).toBe('Billing admin')
    expect(content.draft).toBe('I need audit log access to close out the SOC 2 evidence request.')
    expect(content.listStrategy).toEqual({ kind: 'content-grown', expectedMaximum: 6 })
  })

  test('covers empty, one, host boundary and over-boundary recipient capacities', () => {
    const cases = [
      ['empty', 0, 'content-grown'],
      ['one', 1, 'content-grown'],
      ['boundary', 6, 'content-grown'],
      ['overflow', 16, 'pane-scroll'],
    ] as const

    for (const [capacity, count, strategy] of cases) {
      const fixture = createPaywall7PreviewFixture('en', capacity)
      const store = createPaywall7PreviewStore(fixture.seed)
      const content = fixture.contentFor(store.getState())
      expect(content.recipients).toHaveLength(count)
      expect(content.listStrategy.kind).toBe(strategy)
      expect(content.sourceBoundary.sourceMaximum).toBe('not-tested')
    }
  })

  test('keeps localized labels and deliberately long copy with localized editable drafts', () => {
    const localized = createPaywall7PreviewFixture('de')
    const localizedStore = createPaywall7PreviewStore(localized.seed)
    const localizedContent = localized.contentFor(localizedStore.getState())
    expect(localizedContent.labels.reasonLabel).toBe('Wofür benötigst du den Zugriff?')
    expect(localizedContent.draft).toContain('SOC-2-Nachweisanfrage')

    const long = createPaywall7PreviewFixture('de-long')
    const longStore = createPaywall7PreviewStore(long.seed)
    const longContent = long.contentFor(longStore.getState())
    expect(longContent.labels.title.length).toBeGreaterThan(100)
    expect(longContent.labels.requestSectionDescription.length).toBeGreaterThan(180)
    expect(longContent.labels.sendRequest.length).toBeGreaterThan(60)
    expect(longContent.draft.length).toBeGreaterThan(150)
  })

  test('updates only the local draft and captures stable recipient IDs and the current message in a request', () => {
    const fixture = createPaywall7PreviewFixture()
    const store = createPaywall7PreviewStore(fixture.seed)
    const draft = 'Audit sample note for local reference verification.'
    store.getState().setDraft(draft)

    expect(store.getState().draft).toBe(draft)
    expect(store.getState().requestSend()).toEqual({
      kind: 'admin-upgrade-request',
      recipientIds: ['priya-nandakumar', 'marcus-bell'],
      message: draft,
      resultBehavior: 'delivery-and-upgrade-unverified',
    })
    expect(store.getState().draft).toBe(draft)
    expect(store.getState().recipients).toHaveLength(2)
  })

  test('returns comparison and send requests without fabricating navigation, delivery, or upgrade state', () => {
    const store = createPaywall7PreviewStore(createPaywall7PreviewFixture().seed)
    expect(store.getState().requestComparePlans()).toEqual({
      kind: 'compare-plans-request',
      resultBehavior: 'comparison-navigation-unverified',
    })
    const before = store.getState()
    const request = store.getState().requestSend()
    const after = store.getState()
    expect(request.kind).toBe('admin-upgrade-request')
    expect(after.recipients).toEqual(before.recipients)
    expect(after.draft).toBe(before.draft)
  })

  test('filters invalid recipient rows and keeps the first record for each stable ID', () => {
    const recipient: Paywall7PreviewRecipient = {
      id: 'owner-1',
      initials: 'OW',
      name: 'Original owner',
      role: 'Workspace owner',
    }
    const store = createPaywall7PreviewStore({
      recipients: [
        recipient,
        { ...recipient, name: 'Duplicate owner' },
        { ...recipient, id: '   ' },
        { ...recipient, id: 'missing-role', role: ' ' },
        { ...recipient, id: 'missing-initials', initials: '' },
      ],
      initialDraft: '',
    })

    expect(store.getState().recipients).toEqual([recipient])
    expect(store.getState().requestSend()).toMatchObject({
      recipientIds: ['owner-1'],
      message: '',
    })
  })
})
