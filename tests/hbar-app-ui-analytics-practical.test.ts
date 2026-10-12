import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenAnalytics, type LumenAnalyticsReferenceChart, type LumenAnalyticsReferenceContent } from '@lumen/app-ui/catalog'
import { createAnalyticsPreviewStore } from '../apps/hbar-app-ui-preview/src/analyticsPreviewModel'
import {
  advanceAnalyticsPreviewLive,
  createAnalyticsPreviewSeed,
  projectAnalyticsPreview,
} from '../apps/hbar-app-ui-preview/src/analyticsPreviewProjection'
import { createAnalyticsPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/analyticsPreviewReferenceFixtures'

function chartFor(content: LumenAnalyticsReferenceContent): LumenAnalyticsReferenceChart | undefined {
  if (
    content.kind === 'revenue' ||
    content.kind === 'tickets' ||
    content.kind === 'latency' ||
    content.kind === 'storage' ||
    content.kind === 'live'
  )
    return content.chart
  return undefined
}

function renderReference(variant: number, content: LumenAnalyticsReferenceContent): string {
  return renderToStaticMarkup(
    createElement(LumenAnalytics, {
      variant,
      variantId: `analytics-practical-${variant}`,
      content: { reference: content },
    }),
  )
}

function setup(variant: number, mode = 'default', ownerId = `analytics-practical-${variant}-${mode}`) {
  const content = createAnalyticsPreviewReferenceContent(variant, mode)
  const seed = createAnalyticsPreviewSeed(content, variant, ownerId, mode)
  const store = createAnalyticsPreviewStore(seed)
  const project = () => {
    const projected = projectAnalyticsPreview(content, store)
    if (!projected.reference) throw new Error(`analytics variant ${variant} did not project reference content`)
    return projected.reference
  }
  const render = () => renderReference(variant, project())
  return { content, seed, store, project, render }
}

test('all sixteen analytics references keep distinct kinds and default semantics', () => {
  const owners = Array.from({ length: 16 }, (_, index) => setup(index + 1))
  const kinds = owners.map(({ project }) => project().kind)
  expect(kinds).toEqual([
    'pulse',
    'revenue',
    'tickets',
    'latency',
    'channels',
    'referrals',
    'service',
    'funnel',
    'heatmap',
    'goals',
    'cohort',
    'storage',
    'candles',
    'scatter',
    'bullets',
    'live',
  ])
  expect(new Set(kinds).size).toBe(16)
  const rendered = owners.map(({ render }) => render())
  expect(new Set(rendered).size).toBe(16)
  rendered.forEach((html, index) => {
    expect(html).toContain('data-lumen-component="analytics"')
    expect(html).toContain(`data-lumen-variant="${index + 1}"`)
    expect(html).toContain(`data-reference-kind="${kinds[index]}"`)
  })
  owners.forEach(({ project }) => {
    const chart = chartFor(project())
    if (chart) expect(chart.pointLabels.length).toBeGreaterThan(0)
  })
})

test('an uncaptured range becomes unavailable and recovers to its captured default; legends hide and recover', () => {
  const revenue = setup(2)
  const stale = revenue.project()
  stale.onSelect('range', '12m')
  const unavailable = revenue.project()
  expect(unavailable.selectedId).toBe('12m')
  expect(unavailable.available).toBe(false)
  expect(revenue.render()).toContain(unavailable.labels.unavailable)

  unavailable.onSelect('range', revenue.content.selectedId)
  const recovered = revenue.project()
  expect(recovered.selectedId).toBe(revenue.content.selectedId)
  expect(recovered.available).not.toBe(false)
  expect(recovered.value).toBe(revenue.content.value)

  const tickets = setup(3)
  const initial = tickets.project()
  if (initial.kind !== 'tickets') throw new Error('expected tickets reference')
  const previous = initial.chart.series.find((series) => series.id === 'previous')
  if (!previous) throw new Error('expected previous tickets series')
  initial.onFlag('series-previous', false)
  const hidden = tickets.project()
  if (hidden.kind !== 'tickets') throw new Error('expected tickets reference after hide')
  expect(hidden.chart.series.find((series) => series.id === 'previous')?.visible).toBe(false)
  hidden.onFlag('series-previous', true)
  const recoveredSeries = tickets.project()
  if (recoveredSeries.kind !== 'tickets') throw new Error('expected tickets reference after recover')
  expect(recoveredSeries.chart.series.find((series) => series.id === 'previous')?.visible).toBe(true)
})

test('captured alternate periods replace the corresponding facts instead of retaining default-period totals', () => {
  const revenue = setup(2)
  revenue.project().onSelect('range', '7d')
  const sevenDays = revenue.project()
  if (sevenDays.kind !== 'revenue') throw new Error('expected revenue reference')
  expect(sevenDays.available).not.toBe(false)
  expect(sevenDays.value).toBe('$47,904')
  expect(sevenDays.metrics.map(({ value }) => value)).toEqual(['$47,904', '$43,022', '$40,742'])

  const referrals = setup(6)
  referrals.project().onSelect('range', '7d')
  const sources = referrals.project()
  if (sources.kind !== 'referrals') throw new Error('expected referrals reference')
  expect(sources.value).toBe('3,180')
  expect(sources.entries.map(({ amount }) => amount)).toEqual([940, 610, 505, 300, 210, 165])
  expect(sources.entries.map(({ delta }) => delta)).toEqual(['+24.0%', '+5.2%', '−2.0%', '+31.0%', '−9.0%', '+6.0%'])
  expect(sources.footer).toContain('65%')

  const service = setup(7)
  service.project().onSelect('range', '1h')
  const hourly = service.project()
  if (hourly.kind !== 'service') throw new Error('expected service reference')
  expect(hourly.metrics.map(({ value }) => value)).toEqual(['4.8k req/s', '169ms', '0.47%', '64%'])
  expect(hourly.detailTitle).toBe('Request rate · last 1h')
})

test('service metric and channel entry selections own their projected detail', () => {
  const service = setup(7)
  const serviceInitial = service.project()
  if (serviceInitial.kind !== 'service') throw new Error('expected service reference')
  const nextMetric = serviceInitial.metrics.find(({ id }) => id !== serviceInitial.activeMetricId)
  if (!nextMetric) throw new Error('expected a second service metric')
  serviceInitial.onSelect('metric', nextMetric.id)
  const serviceChanged = service.project()
  if (serviceChanged.kind !== 'service') throw new Error('expected service reference after selection')
  expect(serviceChanged.activeMetricId).toBe(nextMetric.id)
  expect(serviceChanged.detailMetrics.map(({ id }) => id)).toEqual([nextMetric.id])
  expect(serviceChanged.detailMetrics.map(({ id }) => id)).not.toContain(serviceInitial.activeMetricId)
  expect(serviceChanged.detailTitle).toContain(nextMetric.label)

  const channels = setup(5)
  const channelInitial = channels.project()
  if (channelInitial.kind !== 'channels') throw new Error('expected channels reference')
  const selected = channelInitial.entries[1]
  if (!selected) throw new Error('expected a second channel entry')
  channelInitial.onSelect('entry', selected.id)
  const channelChanged = channels.project()
  if (channelChanged.kind !== 'channels') throw new Error('expected channels reference after selection')
  expect(channelChanged.activeEntryId).toBe(selected.id)
  expect(channels.render()).toContain(selected.value)
  expect(channels.render()).toContain(`${selected.detail} of sessions`)
})

test('cohort absolute mode states rounded estimates and storage percent mode normalizes visible tiers', () => {
  const cohort = setup(11)
  const cohortInitial = cohort.project()
  if (cohortInitial.kind !== 'cohort') throw new Error('expected cohort reference')
  cohortInitial.onSelect('display', 'absolute')
  const absolute = cohort.project()
  if (absolute.kind !== 'cohort') throw new Error('expected cohort reference after absolute mode')
  const firstRow = absolute.rows[0]
  const firstValue = firstRow?.values[0]
  if (!firstRow || !firstValue) throw new Error('expected a cohort row and value')
  const expectedAbsolute = Math.round(
    (Number(firstRow.detail.replace(/\D/g, '')) * firstValue.percent) / 100,
  ).toLocaleString('en-US')
  expect(absolute.displayId).toBe('absolute')
  expect(firstValue.label).toBe(expectedAbsolute)
  expect(absolute.footer).toContain('estimates rounded from captured percentages')
  expect(absolute.footer).toContain('exact counts were not captured')

  const storage = setup(12)
  const storageInitial = storage.project()
  if (storageInitial.kind !== 'storage') throw new Error('expected storage reference')
  storageInitial.onFlag('series-hot', false)
  storageInitial.onSelect('range', 'percent')
  const normalized = storage.project()
  if (normalized.kind !== 'storage') throw new Error('expected storage reference after percent mode')
  const visible = normalized.chart.series.filter(({ visible: isVisible }) => isVisible)
  const endingPercent = visible.reduce((sum, series) => sum + (series.points.at(-1) ?? 0), 0)
  expect(normalized.value).toBe('925 TB')
  expect(normalized.metrics[0]?.value).toBe('925 TB')
  expect(normalized.chart.maximum).toBe(100)
  expect(endingPercent).toBeCloseTo(100, 8)
})

test('quota uses one projection sort mechanism for attainment, quota, and alphabetical views', () => {
  const owner = setup(15)
  const initial = owner.project()
  if (initial.kind !== 'bullets') throw new Error('expected bullets reference')
  const sortIds = ['attainment', 'quota', 'alphabetical'] as const
  const orders = sortIds.map((sortId) => {
    owner.project().onSelect('range', sortId)
    const projected = owner.project()
    if (projected.kind !== 'bullets') throw new Error('expected bullets reference after sort')
    return projected.entries.map(({ id }) => id)
  })
  expect(new Set(orders.map((order) => order.join('|'))).size).toBe(3)
  const expectedAttainment = [...initial.entries]
    .sort((left, right) => right.amount / Math.max(1, right.quota) - left.amount / Math.max(1, left.quota))
    .map(({ id }) => id)
  const expectedQuota = [...initial.entries].sort((left, right) => right.quota - left.quota).map(({ id }) => id)
  const expectedAlphabetical = [...initial.entries]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(({ id }) => id)
  expect(orders).toEqual([expectedAttainment, expectedQuota, expectedAlphabetical])
})

test('scatter filtering is scoped to the current segment and rejects stale point callbacks', () => {
  const owner = setup(14)
  const all = owner.project()
  if (all.kind !== 'scatter') throw new Error('expected scatter reference')
  const stalePoint = all.points.find(({ segment }) => segment === 'enterprise')
  if (!stalePoint) throw new Error('expected an enterprise point')
  all.onSelect('range', 'growth')
  const filtered = owner.project()
  if (filtered.kind !== 'scatter') throw new Error('expected scatter reference after filter')
  expect(filtered.points.length).toBeGreaterThan(0)
  expect(filtered.points.every(({ segment }) => segment === 'growth')).toBe(true)
  all.onSelect('point', stalePoint.id)
  expect(owner.store.getState().selectedBySlot.point).toBe(all.activePointId)
  const allowed = filtered.points[0]
  if (!allowed) throw new Error('expected a filtered point')
  filtered.onSelect('point', allowed.id)
  expect(owner.store.getState().selectedBySlot.point).toBe(allowed.id)
})

test('live preview advances local samples, pauses and resumes, while report intent stays explicitly local', () => {
  const live = setup(16, 'default', 'analytics-live-a')
  const other = setup(16, 'default', 'analytics-live-b')
  const initial = live.project()
  if (initial.kind !== 'live') throw new Error('expected live reference')
  const initialPoints = initial.chart.series[0]?.points
  if (!initialPoints) throw new Error('expected live chart points')
  expect(live.store.getState().selectedBySlot.sample).toBe('sample-0')
  expect(advanceAnalyticsPreviewLive(live.store)).toBe(true)
  const ticked = live.project()
  if (ticked.kind !== 'live') throw new Error('expected live reference after tick')
  expect(live.store.getState().selectedBySlot.sample).toBe('sample-1')
  expect(ticked.subtitle).toContain('Local preview stream')
  expect(ticked.chart.series[0]?.points).not.toEqual(initialPoints)
  expect(live.store.getState().setFlag(live.store.getState().ownerId, 'paused', true)).toBe(true)
  expect(advanceAnalyticsPreviewLive(live.store)).toBe(false)
  expect(live.store.getState().selectedBySlot.sample).toBe('sample-1')
  expect(live.store.getState().setFlag(live.store.getState().ownerId, 'paused', false)).toBe(true)
  expect(advanceAnalyticsPreviewLive(live.store)).toBe(true)
  expect(live.store.getState().selectedBySlot.sample).toBe('sample-2')
  expect(other.store.getState().selectedBySlot.sample).toBe('sample-0')

  const events: { readonly actionId: string }[] = []
  const pulse = setup(1)
  const pulseReference = pulse.project()
  pulseReference.onRequest('open-report')
  events.push({ actionId: pulse.store.getState().lastRequest?.actionId ?? '' })
  expect(events).toEqual([{ actionId: 'open-report' }])
  const pulseProjection = projectAnalyticsPreview(pulse.content, pulse.store)
  expect(pulseProjection.presentation?.notice).toContain('no external report service is connected')
  expect(pulseProjection.presentation?.notice).not.toContain('succeeded')
})

test('referral capacities, localized copy, duplicate normalization, missing IDs, and stale callbacks stay bounded', () => {
  const cases: readonly [string, number][] = [
    ['empty', 0],
    ['one', 1],
    ['default', 6],
    ['boundary', 80],
    ['overflow', 81],
  ]
  for (const [mode, expectedLength] of cases) {
    const owner = setup(6, mode)
    const projected = owner.project()
    if (projected.kind !== 'referrals') throw new Error(`expected referrals reference for ${mode}`)
    expect(projected.entries).toHaveLength(expectedLength)
    if (mode === 'boundary' || mode === 'overflow') {
      expect(projected.listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 80 })
    }
  }
  expect(setup(6, 'localized').render()).toContain('按来源分析团队在较长报告周期内的新增注册与持续参与情况')

  const base = createAnalyticsPreviewReferenceContent(6, 'default')
  if (base.kind !== 'referrals') throw new Error('expected referrals fixture')
  const first = base.entries[0]
  if (!first) throw new Error('expected first referral entry')
  const duplicateContent = { ...base, activeEntryId: 'missing', entries: [first, ...base.entries] }
  const seed = createAnalyticsPreviewSeed(duplicateContent, 6, 'analytics-referral-owner', 'duplicate')
  const store = createAnalyticsPreviewStore(seed)
  const entrySlot = store.getState().slots.find(({ id }) => id === 'entry')
  expect(entrySlot?.items.map(({ id }) => id)).toEqual(['none', ...base.entries.map(({ id }) => id)])
  expect(store.getState().selectedBySlot.entry).toBe('none')
  const stale = projectAnalyticsPreview(duplicateContent, store).reference
  if (!stale || stale.kind !== 'referrals') throw new Error('expected stale referrals projection')

  const nextContent = {
    ...duplicateContent,
    entries: duplicateContent.entries.filter(({ id }) => id !== first.id),
  }
  const nextSeed = createAnalyticsPreviewSeed(nextContent, 6, 'analytics-referral-owner', 'duplicate')
  expect(store.getState().refresh(nextSeed)).toBe(true)
  const nextFirst = nextContent.entries[0]
  if (!nextFirst) throw new Error('expected refreshed referral entry')
  expect(store.getState().selectedBySlot.entry).toBe('none')
  stale.onSelect('entry', first.id)
  expect(store.getState().selectedBySlot.entry).toBe('none')
})
