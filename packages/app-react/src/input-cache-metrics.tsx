import { useMemo, useState } from 'react'
import { LumenCompactMetrics, LumenContentText, LumenFrame } from '@lumen/app-ui'
import { INPUT_CACHE_MINIMUM, INPUT_CACHE_TARGET, type InputCacheQuality } from '@hbar/contracts/commands/usage'
import { createMessageScope } from './messages'
import { inputCacheBuckets, type InputCacheReport } from './input-cache-model'
import './input-cache-metrics.css'

export interface HbarInputCacheLabels {
  readonly title: string
  readonly description: string
  readonly overall: string
  readonly recent: string
  readonly lowest: string
  readonly cacheRead: string
  readonly uncached: string
  readonly trend: string
  readonly empty: string
  readonly status: Readonly<Record<InputCacheQuality['status'], string>>
  readonly percent: (value: number | null) => string
  readonly tokens: (value: number) => string
  readonly targets: (minimum: number, target: number) => string
  readonly samples: (count: number, window: number, belowMinimum: number, belowTarget: number) => string
  readonly window: (from: number, to: number) => string
  readonly bucket: (start: number, end: number, ratio: number | null, input: number, cached: number) => string
}
const inputCacheMessages = createMessageScope<HbarInputCacheLabels>()

export function HbarInputCacheMetrics({
  report,
  labels,
}: {
  readonly report: InputCacheReport
  readonly labels: HbarInputCacheLabels
}) {
  return (
    <inputCacheMessages.Provider messages={labels}>
      <InputCacheMetrics report={report} />
    </inputCacheMessages.Provider>
  )
}

/** A bounded chart derived only from the current Host report. The surrounding pane owns scrolling. */
function InputCacheMetrics({ report }: { readonly report: InputCacheReport }) {
  const { t } = inputCacheMessages.useMessages()
  const buckets = useMemo(() => inputCacheBuckets(report.series), [report.series])
  const [selection, setSelection] = useState<{ readonly report: InputCacheReport; readonly start: number } | null>(null)
  const point = selection?.report === report ? buckets.find((bucket) => bucket.start === selection.start) : undefined
  const quality = report.cacheQuality
  const status = quality?.status ?? 'unavailable'
  const ratio = report.cacheHitRate.availability === 'available' ? report.cacheHitRate.value : null
  const x = (start: number, end: number) =>
    (((start + end) / 2 - report.window.from) / Math.max(1, report.window.to - report.window.from)) * 320
  const path = buckets
    .map((bucket, index) =>
      bucket.ratio === null
        ? ''
        : `${index === 0 || buckets[index - 1]?.ratio === null ? 'M' : 'L'}${x(bucket.start, bucket.end)} ${102 - bucket.ratio * 100}`,
    )
    .join(' ')
  return (
    <LumenFrame as="section" className="hbar-input-cache" aria-label={t('title')} data-cache-status={status}>
      <LumenFrame className="hbar-input-cache-heading">
        <LumenContentText context="section.subtitle">{t('title')}</LumenContentText>
        <LumenContentText context="control.label" className="hbar-input-cache-status" role="status">
          {t('status')[status]}
        </LumenContentText>
      </LumenFrame>
      <LumenContentText context="section.description" tone="muted">
        {t('description')}
      </LumenContentText>
      <LumenCompactMetrics
        label={t('title')}
        metrics={[
          { id: 'overall', label: t('overall'), value: t('percent')(ratio) },
          { id: 'recent', label: t('recent'), value: t('percent')(quality?.recentRate.value ?? null) },
          { id: 'lowest', label: t('lowest'), value: t('percent')(quality?.recentMinimum ?? null) },
        ]}
      />
      <LumenFrame className="hbar-input-cache-details">
        <LumenContentText context="message.inline">
          {t('cacheRead')}
          {t('tokens')(report.totals.cacheRead)}
        </LumenContentText>
        <LumenContentText context="message.inline">
          {t('uncached')}
          {t('tokens')(Math.max(0, report.totals.input - report.totals.cacheRead))}
        </LumenContentText>
      </LumenFrame>
      <LumenContentText context="section.description">
        {t('targets')(INPUT_CACHE_MINIMUM, INPUT_CACHE_TARGET)}
      </LumenContentText>
      {quality && (
        <LumenContentText context="section.description" tone="muted">
          {t('samples')(quality.sampleCount, quality.windowSize, quality.belowMinimum, quality.belowTarget)}
        </LumenContentText>
      )}
      {buckets.some((bucket) => bucket.ratio !== null) ? (
        <svg
          viewBox="0 0 320 104"
          preserveAspectRatio="none"
          className="hbar-input-cache-chart"
          role="img"
          aria-label={t('trend')}
          onMouseLeave={() => setSelection(null)}
        >
          <path className="hbar-input-cache-grid" d="M0 102H320 M0 52H320 M0 2H320" />
          <path className="hbar-input-cache-minimum" d={`M0 ${102 - INPUT_CACHE_MINIMUM * 100}H320`} />
          <path className="hbar-input-cache-target" d={`M0 ${102 - INPUT_CACHE_TARGET * 100}H320`} />
          <path className="hbar-input-cache-line" d={path} />
          {buckets.map((bucket) =>
            bucket.ratio === null ? null : (
              <g
                key={bucket.start}
                tabIndex={0}
                role="img"
                aria-label={t('bucket')(bucket.start, bucket.end, bucket.ratio, bucket.input, bucket.cacheRead)}
                data-cache-bucket={bucket.start}
                data-cache-level={
                  bucket.ratio < INPUT_CACHE_MINIMUM ? 'low' : bucket.ratio < INPUT_CACHE_TARGET ? 'warning' : 'healthy'
                }
                onFocus={() => setSelection({ report, start: bucket.start })}
                onBlur={() => setSelection(null)}
                onMouseEnter={() => setSelection({ report, start: bucket.start })}
              >
                <title>{t('bucket')(bucket.start, bucket.end, bucket.ratio, bucket.input, bucket.cacheRead)}</title>
                <circle cx={x(bucket.start, bucket.end)} cy={102 - bucket.ratio * 100} r="0.75" />
              </g>
            ),
          )}
        </svg>
      ) : (
        <LumenContentText context="section.description" tone="muted">
          {t('empty')}
        </LumenContentText>
      )}
      <LumenContentText context="section.description" tone="muted" aria-live="polite">
        {point
          ? t('bucket')(point.start, point.end, point.ratio, point.input, point.cacheRead)
          : t('window')(report.window.from, report.window.to)}
      </LumenContentText>
    </LumenFrame>
  )
}
