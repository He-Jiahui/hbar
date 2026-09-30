import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenUsage, uniqueLumenUsageItems } from '@lumen/app-ui'
import { createUsageIntentPreviewStore } from '../apps/hbar-app-ui-preview/src/usageIntentPreviewStore'
import { createUsagePreviewCopy } from '../apps/hbar-app-ui-preview/src/usagePreviewCopy'
import { usageCompactFixture } from './fixtures/hbar-app-ui-usage-compact-fixtures'
import { usageOverageFixture } from './fixtures/hbar-app-ui-usage-overage-fixtures'
import {
  createUsageOveragePreviewStore,
  projectUsageOveragePreview,
} from '../apps/hbar-app-ui-preview/src/usage-overage-preview-model'

describe('owned usage preview intent and feedback', () => {
  test('records the original target only and rejects other owners, stale, blank and repeated requests', () => {
    const store = createUsageIntentPreviewStore({
      ownerId: 'usage-preview',
      targets: [
        { actionId: 'upgrade', targetId: 'team ' },
        { actionId: 'details', targetId: 'team ' },
        { actionId: 'upgrade', targetId: ' ' },
      ],
    })
    expect(store.getState().request('another-owner', 'upgrade', 'team ')).toBe(false)
    expect(store.getState().request('usage-preview', 'upgrade', 'missing')).toBe(false)
    expect(store.getState().request('usage-preview', 'upgrade', ' ')).toBe(false)
    expect(store.getState().intent).toBeUndefined()
    expect(store.getState().request('usage-preview', 'upgrade', 'team ')).toBe(true)
    expect(store.getState().intent).toEqual({ actionId: 'upgrade', targetId: 'team ' })
    expect(store.getState().request('usage-preview', 'upgrade', 'team ')).toBe(false)
    expect(store.getState().request('usage-preview', 'details', 'team ')).toBe(true)
    expect(store.getState().intent).toEqual({ actionId: 'details', targetId: 'team ' })
  })

  test('reconciliation prunes removed targets without adopting another owner or inventing a service result', () => {
    const store = createUsageIntentPreviewStore({
      ownerId: 'quota',
      targets: [{ actionId: 'request-increase', targetId: 'tier-2' }],
    })
    store.getState().request('quota', 'request-increase', 'tier-2')
    store.getState().reconcile({ ownerId: 'other', targets: [] })
    expect(store.getState().intent?.targetId).toBe('tier-2')
    store.getState().reconcile({ ownerId: 'quota', targets: [] })
    expect(store.getState().intent).toBeUndefined()
    expect(store.getState().request('quota', 'request-increase', 'tier-2')).toBe(false)
    expect(
      createUsageIntentPreviewStore({ ownerId: ' ', targets: [{ actionId: 'details', targetId: undefined }] })
        .getState()
        .request(' ', 'details', undefined),
    ).toBe(false)
  })

  test('localized preview notice leaves compact allowance and overage facts untouched; defaults stay compatible', () => {
    const copy = createUsagePreviewCopy(true)
    const compact = usageCompactFixture('localized', () => undefined)
    const markup = renderToStaticMarkup(
      createElement(LumenUsage, {
        variant: 8,
        variantId: 'hbar-app-ui-ai-usage-8',
        content: { compact, presentation: { ownerId: 'team-widget', notice: copy.requestNotice } },
      }),
    )
    expect(markup).toContain('lumen-usage-preview-root')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('keine Navigation, Zahlung')
    expect(markup).toContain('1.842')
    expect(markup).toContain('/ 2.000')
    const source = usageOverageFixture(null)
    const store = createUsageOveragePreviewStore(source.plans)
    const before = projectUsageOveragePreview(store.getState(), source.copy, () => undefined)
    const seed = createUsageIntentPreviewStore({
      ownerId: 'overage',
      targets: [{ actionId: 'upgrade', targetId: 'scale' }],
    })
    seed.getState().request('overage', 'upgrade', 'scale')
    expect(projectUsageOveragePreview(store.getState(), source.copy, () => undefined).panel?.summary).toBe(
      before.panel?.summary,
    )
    expect(store.getState().selectedId).toBe('scale')
    const legacy = renderToStaticMarkup(
      createElement(LumenUsage, { variant: 8, variantId: 'hbar-app-ui-ai-usage-8', content: { compact } }),
    )
    expect(legacy).not.toContain('lumen-usage-preview-root')
    expect(legacy).not.toContain(copy.requestNotice)
  })

  test('public collection helper excludes blank IDs without changing last-record-wins semantics', () => {
    expect(
      uniqueLumenUsageItems([
        { id: ' ', value: 0 },
        { id: 'same ', value: 1 },
        { id: 'same ', value: 2 },
      ]),
    ).toEqual([{ id: 'same ', value: 2 }])
  })
})
