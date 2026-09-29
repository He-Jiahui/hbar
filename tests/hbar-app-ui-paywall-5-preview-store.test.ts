import { describe, expect, test } from 'bun:test'
import { createPaywall5PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall5PreviewStore'
import { createPaywall5PreviewFixture, PAYWALL5_SOURCE_EVIDENCE } from '../apps/hbar-app-ui-preview/src/paywall5PreviewFixtures'

describe('Paywall 5 retained-data store', () => {
  test('projects four stable retained rows and host-owned payment copy', () => {
    const fixture = createPaywall5PreviewFixture()
    const content = fixture.contentFor(createPaywall5PreviewStore(fixture.seed).getState())
    expect(content.rows.map((row) => row.id)).toEqual(['workspaces', 'saved-views', 'scheduled-exports', 'team-members'])
    expect(content.rows[0]?.value).toBe('4 kept, read-only')
    expect(content.labels.paymentTitle).toBe('Card ending 4471')
    expect(content.labels.reactivate).toBe('Reactivate Pro: $168 / yr')
  })
  test('keeps payment change and reactivation request-only without restoring data or access', () => {
    const fixture = createPaywall5PreviewFixture()
    const store = createPaywall5PreviewStore(fixture.seed)
    const rows = store.getState().rows
    expect(store.getState().requestPaymentChange()).toEqual({ kind: 'change-payment-request', resultBehavior: 'payment-editor-and-update-unverified' })
    expect(store.getState().requestReactivate()).toEqual({ kind: 'reactivate-request', resultBehavior: 'billing-and-access-restoration-unverified' })
    expect(store.getState().rows).toBe(rows)
    expect(rows[2]?.value).toBe('Paused')
  })
  test('preserves first stable IDs, drops invalid duplicates and copies the seed rows', () => {
    const row = { id: 'one', label: 'Host label', value: 'Host value' }
    const store = createPaywall5PreviewStore({ rows: [row, { ...row, value: 'Duplicate' }, { ...row, id: '' }] })
    expect(store.getState().rows).toHaveLength(1)
    expect(store.getState().rows[0]?.value).toBe('Host value')
    expect(store.getState().rows[0]).not.toBe(row)
  })
  test('exposes empty/one/eight/overflow policy and localized long data without claiming a source maximum', () => {
    for (const [capacity, count] of [['empty', 0], ['one', 1], ['boundary', 8], ['overflow', 18]] as const) {
      const fixture = createPaywall5PreviewFixture('de-long', capacity)
      const content = fixture.contentFor(createPaywall5PreviewStore(fixture.seed).getState())
      expect(content.rows).toHaveLength(count)
      expect(content.listStrategy.kind).toBe(capacity === 'overflow' ? 'pane-scroll' : 'content-grown')
      expect(content.sourceBoundary.sourceMaximum).toBe('not-tested')
      expect(content.labels.change).toContain('gespeicherte Zahlungsmethode')
    }
    expect(PAYWALL5_SOURCE_EVIDENCE.liveObservation.retainedRows).toBe(4)
    expect(PAYWALL5_SOURCE_EVIDENCE.liveObservation.currentCaptureProtocolEvidence).toBe(false)
  })
})
