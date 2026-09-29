import { describe, expect, test } from 'bun:test'
import { createPaywall4PreviewStore } from '../apps/hbar-app-ui-preview/src/paywall4PreviewStore'
import { createPaywall4PreviewFixture, PAYWALL4_SOURCE_EVIDENCE } from '../apps/hbar-app-ui-preview/src/paywall4PreviewFixtures'

describe('Paywall 4 passive usage store', () => {
  test('projects three stable source quotas without making bars interactive', () => {
    const fixture = createPaywall4PreviewFixture()
    const store = createPaywall4PreviewStore(fixture.seed)
    const content = fixture.contentFor(store.getState())
    expect(content.meters.map((meter) => meter.id)).toEqual(['api-requests', 'rows-processed', 'connected-sources'])
    expect(content.meters.map((meter) => meter.fraction)).toEqual([1, 0.92, 1])
    expect(content.meters[1]?.usedText).toBe('1.84M')
    expect(content.meters[1]?.limitText).toBe(' / 2.00M')
    expect(content.sourceBoundary.sourceMaximum).toBe('not-tested')
  })

  test('keeps top-up and upgrade as typed requests without mutating quotas or resuming ingestion', () => {
    const fixture = createPaywall4PreviewFixture()
    const store = createPaywall4PreviewStore(fixture.seed)
    const before = store.getState().meters
    expect(store.getState().requestTopUp()).toEqual({ kind: 'top-up-request', resultBehavior: 'checkout-and-quota-update-unverified' })
    expect(store.getState().requestUpgrade()).toEqual({ kind: 'upgrade-request', resultBehavior: 'billing-and-ingestion-resume-unverified' })
    expect(store.getState().meters).toBe(before)
    expect(store.getState().meters[0]?.fraction).toBe(1)
  })

  test('rejects empty/duplicate IDs and normalizes invalid fractions without altering seed objects', () => {
    const meter = { id: 'one', label: 'Host quota', usedText: '1', limitText: ' / 10', fraction: 2 }
    const store = createPaywall4PreviewStore({ meters: [meter, { ...meter, fraction: 0.2 }, { ...meter, id: ' ', fraction: 0 },
      { ...meter, id: 'nan', fraction: Number.NaN }, { ...meter, id: 'negative', fraction: -1 }] })
    expect(store.getState().meters.map((row) => row.id)).toEqual(['one', 'nan', 'negative'])
    expect(store.getState().meters.map((row) => row.fraction)).toEqual([1, 0, 0])
    expect(meter.fraction).toBe(2)
  })

  test('exposes empty, one, boundary and overflow capacity as host policy rather than a source cap', () => {
    for (const [capacity, count, kind] of [['empty', 0, 'content-grown'], ['one', 1, 'content-grown'],
      ['boundary', 6, 'content-grown'], ['overflow', 17, 'pane-scroll']] as const) {
      const fixture = createPaywall4PreviewFixture('en', capacity)
      const state = createPaywall4PreviewStore(fixture.seed).getState()
      const content = fixture.contentFor(state)
      expect(content.meters).toHaveLength(count)
      expect(content.listStrategy.kind).toBe(kind)
      expect(content.sourceBoundary.sourceMaximum).toBe('not-tested')
    }
  })

  test('keeps localized long copy and records live inspection without current strict protocol proof', () => {
    const fixture = createPaywall4PreviewFixture('de-long')
    const content = fixture.contentFor(createPaywall4PreviewStore(fixture.seed).getState())
    expect(content.labels.title).toContain('gemeinsam verwendeten')
    expect(content.meters[1]?.label).toContain('gespeicherte Datenzeilen')
    expect(PAYWALL4_SOURCE_EVIDENCE.liveObservation.progressRoles).toBe(0)
    expect(PAYWALL4_SOURCE_EVIDENCE.liveObservation.previewAvailable).toBe(true)
    expect(PAYWALL4_SOURCE_EVIDENCE.liveObservation.currentCaptureProtocolEvidence).toBe(false)
  })
})
