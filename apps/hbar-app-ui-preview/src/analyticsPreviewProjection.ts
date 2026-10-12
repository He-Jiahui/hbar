import type { LumenAnalyticsContent, LumenAnalyticsReferenceContent as Content, LumenAnalyticsReferenceChart as Chart } from '@lumen/app-ui/catalog'
import type {
  AnalyticsPreviewSeed,
  AnalyticsPreviewStoreApi,
  AnalyticsPreviewSelectionSlotSeed,
  AnalyticsPreviewFlagSeed,
} from './analyticsPreviewModel'
import { analyticsPreviewNotice, analyticsPreviewCapturedSelection } from './analyticsPreviewReferenceFixtures'

export function createAnalyticsPreviewSeed(
  content: Content,
  variant: number,
  ownerId: string,
  fixtureId: string,
): AnalyticsPreviewSeed {
  const slots: AnalyticsPreviewSelectionSlotSeed[] = [
    { id: 'range', items: content.choices, initialId: content.selectedId },
  ]
  const flags: AnalyticsPreviewFlagSeed[] = []
  function slot(
    id: string,
    items: readonly { readonly id: string; readonly disabled?: boolean | undefined }[],
    initialId?: string,
  ) {
    slots.push({ id, items, initialId })
  }
  function chart(value: Chart | undefined) {
    if (!value) return
    slot(
      'cursor',
      value.pointLabels.map((_, i) => ({ id: `point-${i}` })),
      value.cursorId,
    )
    value.series.forEach((item) => flags.push({ id: `series-${item.id}`, value: item.visible }))
  }
  switch (content.kind) {
    case 'pulse':
      break
    case 'revenue':
    case 'tickets':
    case 'latency':
    case 'storage':
      chart(content.chart)
      break
    case 'channels':
    case 'referrals':
    case 'funnel':
    case 'goals':
    case 'bullets':
      slot('entry', [{ id: 'none' }, ...content.entries], content.activeEntryId || 'none')
      break
    case 'service':
      slot('metric', content.metrics, content.activeMetricId)
      chart(content.chart)
      break
    case 'heatmap':
      slot('cell', content.cells, content.activeCellId)
      break
    case 'cohort':
      slot('display', content.displayChoices, content.displayId)
      break
    case 'candles':
      slot('candle', content.candles, content.activeCandleId)
      break
    case 'scatter':
      slot('point', content.points, content.activePointId)
      break
    case 'live':
      chart(content.chart)
      flags.push({ id: 'paused', value: content.paused })
      slot(
        'sample',
        Array.from({ length: 32 }, (_, i) => ({ id: `sample-${i}` })),
        'sample-0',
      )
      break
    default:
      break
  }
  return {
    ownerId,
    variant,
    fixtureId,
    slots,
    flags,
    requestActions: content.kind === 'pulse' ? [{ actionId: 'open-report' }] : [],
  }
}
const derivedModes = new Set(['storage', 'scatter', 'bullets', 'live'])
function sampleIndex(store: AnalyticsPreviewStoreApi): number {
  return Number(store.getState().selectedBySlot.sample?.slice(7) ?? 0)
}
/** One bounded local simulation tick. The Host owns cadence and cancellation. */
export function advanceAnalyticsPreviewLive(store: AnalyticsPreviewStoreApi): boolean {
  const state = store.getState()
  if (state.variant !== 16 || state.flagsById.paused || state.selectedBySlot.range !== '60s') return false
  return state.select(state.ownerId, 'sample', `sample-${(sampleIndex(store) + 1) % 32}`)
}
function projectedChart(chart: Chart, store: AnalyticsPreviewStoreApi): Chart {
  const state = store.getState()
  const series = chart.series.map((item) => ({
    ...item,
    visible: state.flagsById[`series-${item.id}`] ?? item.visible,
  }))
  const cursorId = state.selectedBySlot.cursor
  return {
    ...chart,
    series,
    cursorId: chart.pointLabels.some((_, i) => `point-${i}` === cursorId)
      ? (cursorId ?? chart.cursorId)
      : chart.cursorId,
  }
}
export function projectAnalyticsPreview(
  content: Content,
  store: AnalyticsPreviewStoreApi,
  report?: (event: { readonly actionId: string }) => void,
): LumenAnalyticsContent {
  const state = store.getState()
  const selectedId = state.selectedBySlot.range ?? content.selectedId
  const capturedSelection = analyticsPreviewCapturedSelection(content, selectedId)
  const data = capturedSelection ?? content
  let projected: Content = { ...content, selectedId }
  switch (content.kind) {
    case 'pulse':
      break
    case 'revenue':
    case 'tickets':
    case 'latency':
      if (data.kind === 'revenue' || data.kind === 'tickets' || data.kind === 'latency')
        projected = { ...data, chart: projectedChart(data.chart, store) }
      break
    case 'channels':
    case 'referrals':
    case 'funnel':
    case 'goals':
      if (data.kind === 'channels' || data.kind === 'referrals' || data.kind === 'funnel' || data.kind === 'goals')
        projected = { ...data, activeEntryId: state.selectedBySlot.entry ?? '' }
      break
    case 'service': {
      const activeMetricId = state.selectedBySlot.metric ?? content.activeMetricId
      const metric = (data.kind === 'service' ? data.metrics : content.metrics).find(({ id }) => id === activeMetricId)
      let detailChart = content.chart
      let detailMetrics = content.detailMetrics
      if (activeMetricId !== content.activeMetricId && metric) {
        const value = Number.parseFloat(metric.value)
        detailChart = content.chart
          ? {
              ...content.chart,
              label: `${metric.label} · illustrative reference curve`,
              maximum: Math.max(1, value * 1.5),
              series: [
                {
                  id: 'requests',
                  label: metric.label,
                  points:
                    metric.points?.slice(0, content.chart.pointLabels.length).map((point) => (point / 80) * value) ??
                    [],
                  color: '#8b5cf6',
                  visible: true,
                },
              ],
              ticks: [],
              cursorLabel: () => `${metric.label} · ${metric.value} · illustrative reference curve`,
            }
          : undefined
        detailMetrics = [metric]
      }
      projected = {
        ...content,
        ...(data.kind === 'service' ? data : content),
        activeMetricId,
        detailTitle: `${metric?.label ?? content.title} · last ${selectedId}`,
        chart: detailChart ? projectedChart(detailChart, store) : undefined,
        detailMetrics,
      }
      break
    }
    case 'heatmap':
      projected = { ...content, activeCellId: state.selectedBySlot.cell ?? '' }
      break
    case 'cohort': {
      const displayId = state.selectedBySlot.display ?? content.displayId
      const absolute = displayId === 'absolute'
      projected = {
        ...content,
        displayId,
        rows: content.rows.map((row) => ({
          ...row,
          values: row.values.map((value) => ({
            ...value,
            label: absolute
              ? Math.round((Number(row.detail.replace(/\D/g, '')) * value.percent) / 100).toLocaleString('en-US')
              : value.label,
          })),
        })),
        averages: absolute
          ? content.periods.map((_, i) => {
              const rows = content.rows.filter((row) => row.values[i] !== undefined)
              const total = rows.reduce(
                (sum, row) =>
                  sum + Math.round((Number(row.detail.replace(/\D/g, '')) * (row.values[i]?.percent ?? 0)) / 100),
                0,
              )
              return rows.length ? Math.round(total / rows.length).toLocaleString('en-US') : ''
            })
          : content.averages,
        footer: absolute
          ? 'Absolute counts are estimates rounded from captured percentages; exact counts were not captured.'
          : content.footer,
      }
      break
    }
    case 'storage': {
      const chart = projectedChart(content.chart, store)
      const visible = chart.series.filter(({ visible }) => visible)
      const total = visible.reduce((sum, item) => sum + (item.points.at(-1) ?? 0), 0)
      const percentMode = selectedId === 'percent'
      const normalized = chart.series.map((item) => ({
        ...item,
        points: item.points.map((point, i) =>
          percentMode
            ? (point /
                Math.max(
                  1,
                  visible.reduce((sum, other) => sum + (other.points[i] ?? 0), 0),
                )) *
              100
            : point,
        ),
      }))
      const last = visible.map((item) => `${item.label} ${item.points.at(-1) ?? 0} TB`).join(' · ')
      projected = {
        ...content,
        value: `${total.toLocaleString('en-US')} TB`,
        delta: `across ${visible.length} visible tiers`,
        chart: {
          ...chart,
          series: normalized,
          maximum: percentMode ? 100 : content.chart.maximum,
          ticks: percentMode ? ['100%', '75%', '50%', '25%', '0%'] : chart.ticks,
          cursorLabel: (index) =>
            index === chart.pointLabels.length - 1 ? `Dec · ${last} · Total ${total} TB` : chart.cursorLabel(index),
        },
        metrics: [
          { ...content.metrics[0], id: 'total', label: 'Total stored', value: `${total.toLocaleString('en-US')} TB` },
          ...(visible.length === content.chart.series.length ? content.metrics.slice(1) : []),
        ],
      }
      break
    }
    case 'candles':
      projected = { ...content, activeCandleId: state.selectedBySlot.candle ?? '' }
      break
    case 'scatter': {
      const points = content.points.filter((point) => selectedId === 'all' || point.segment === selectedId)
      const activePointId = points.some(({ id }) => id === state.selectedBySlot.point)
        ? (state.selectedBySlot.point ?? '')
        : (points[0]?.id ?? '')
      projected = {
        ...content,
        points,
        activePointId,
        value: selectedId === 'all' ? content.value : `${points.length} illustrative ${selectedId} accounts`,
        delta:
          selectedId === 'all'
            ? content.delta
            : 'Segment membership is a preview approximation; source records were not captured.',
      }
      break
    }
    case 'bullets': {
      const entries = [...content.entries].sort((a, b) => {
        if (selectedId === 'quota') return b.quota - a.quota
        if (selectedId === 'alphabetical') return a.label.localeCompare(b.label)
        return b.amount / Math.max(1, b.quota) - a.amount / Math.max(1, a.quota)
      })
      projected = { ...content, entries, activeEntryId: state.selectedBySlot.entry ?? '' }
      break
    }
    case 'live': {
      const tick = sampleIndex(store)
      const chart = projectedChart(content.chart, store)
      const basePoints = content.chart.series[0]?.points ?? []
      const points = basePoints.map((point, i) =>
        tick === 0 ? point : Math.round(1040 + Math.sin((i + tick) * 1.7) * 155 + Math.cos((i + tick) * 0.3) * 40),
      )
      const current = points.at(-1) ?? 0
      const currentLabel = `${current.toLocaleString('en-US')} rps`
      projected = {
        ...content,
        paused: state.flagsById.paused ?? content.paused,
        available: selectedId === '60s',
        value: selectedId === '60s' ? currentLabel : undefined,
        subtitle: tick
          ? 'Local preview stream · illustrative samples, not a connected live service.'
          : content.subtitle,
        chart: {
          ...chart,
          series: chart.series.map((item) => ({ ...item, points })),
          cursorLabel: (i) =>
            tick === 0
              ? content.chart.cursorLabel(i)
              : `${chart.pointLabels[i] ?? content.title} · ${points[i] ?? 0} rps · local simulated sample`,
        },
        metrics: tick
          ? [
              { id: 'current', label: 'Current', value: currentLabel },
              { id: 'peak', label: 'Window peak', value: Math.max(0, ...points).toLocaleString('en-US') },
              {
                id: 'mean',
                label: 'Window mean',
                value: Math.round(
                  points.reduce((sum, point) => sum + point, 0) / Math.max(1, points.length),
                ).toLocaleString('en-US'),
              },
            ]
          : content.metrics,
      }
      break
    }
    default:
      break
  }
  return {
    reference: {
      ...projected,
      selectedId,
      ...(selectedId !== content.selectedId && !capturedSelection && !derivedModes.has(content.kind)
        ? { available: false, value: undefined, delta: undefined, footer: undefined }
        : {}),
      onSelect: (slotId, itemId) => {
        const current = store.getState()
        const range = current.selectedBySlot.range ?? content.selectedId
        const currentContent = analyticsPreviewCapturedSelection(content, range) ?? content
        if (slotId === 'cursor' && 'chart' in currentContent) {
          const index = Number(itemId.replace(/^point-/, ''))
          if (!Number.isInteger(index) || index < 0 || index >= (currentContent.chart?.pointLabels.length ?? 0)) return
        }
        if (
          slotId !== 'range' &&
          range !== content.selectedId &&
          !analyticsPreviewCapturedSelection(content, range) &&
          !derivedModes.has(content.kind)
        )
          return
        if (
          content.kind === 'scatter' &&
          slotId === 'point' &&
          !content.points.some((point) => point.id === itemId && (range === 'all' || point.segment === range))
        )
          return
        current.select(state.ownerId, slotId, itemId)
      },
      onFlag: (id, value) => {
        store.getState().setFlag(state.ownerId, id, value)
      },
      onRequest: (actionId) => {
        const request = store.getState().request(state.ownerId, { actionId })
        if (request) report?.({ actionId: request.actionId })
      },
    },
    presentation: {
      ownerId: state.ownerId,
      notice: state.lastRequest ? analyticsPreviewNotice(state.lastRequest.actionId) : undefined,
    },
  }
}
