'use client'

import * as React from 'react'
import './feedback-insights-reference.css'

export type LumenFeedbackInsightsReferenceListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export interface LumenFeedbackInsightsReferenceMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly change?: string | undefined
  readonly changeDirection?: 'up' | 'down' | 'flat' | undefined
}

export interface LumenFeedbackInsightsReferenceSentiment {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly percent: number
}

export interface LumenFeedbackInsightsReferenceTheme {
  readonly id: string
  readonly label: string
  readonly mentions: string
  readonly changeLabel: string
  readonly changeDirection: 'up' | 'down' | 'flat'
  readonly progress: number
}

export interface LumenFeedbackInsightsReferenceVolumePoint {
  readonly id: string
  readonly label: string
  readonly value: number
}

export interface LumenFeedbackInsightsReferencePeriod {
  readonly id: string
  readonly label: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly metrics: readonly LumenFeedbackInsightsReferenceMetric[]
  readonly sentiment: readonly LumenFeedbackInsightsReferenceSentiment[]
  readonly themes: readonly LumenFeedbackInsightsReferenceTheme[]
  readonly volume: readonly LumenFeedbackInsightsReferenceVolumePoint[]
}

export interface LumenFeedbackInsightsReferenceAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenFeedbackInsightsReferenceContent {
  readonly reportId: string
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly sentiment: string
    readonly topThemes: string
    readonly mentionsPeriod: string
    readonly weeklyVolume: string
    readonly responsesPerDay: string
    readonly empty: string
    readonly sentimentSummary: (
      items: readonly Pick<LumenFeedbackInsightsReferenceSentiment, 'label' | 'value'>[],
    ) => string
    readonly volumeSummary: string
  }
  readonly periods: readonly LumenFeedbackInsightsReferencePeriod[]
  readonly initialPeriodId: string | undefined
  readonly selectedPeriodId: string | undefined
  readonly listStrategy: LumenFeedbackInsightsReferenceListStrategy
  readonly onPeriodChange?: ((reportId: string, periodId: string) => void) | undefined
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function uniqueLumenFeedbackInsightsReferencePeriods(
  periods: readonly LumenFeedbackInsightsReferencePeriod[],
): readonly LumenFeedbackInsightsReferencePeriod[] {
  return uniqueById(periods)
}

export function selectLumenFeedbackInsightsReferencePeriod(
  periods: readonly LumenFeedbackInsightsReferencePeriod[],
  selectedId: string | undefined,
): LumenFeedbackInsightsReferencePeriod | undefined {
  const unique = uniqueLumenFeedbackInsightsReferencePeriods(periods)
  return unique.find((period) => period.id === selectedId) ?? unique[0]
}

function boundedPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

function TrendMark({
  direction,
  className,
}: {
  readonly direction: 'up' | 'down' | 'flat'
  readonly className: string
}): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    >
      {direction === 'up' ? <path d="M7 7h10v10M7 17 17 7" /> : null}
      {direction === 'down' ? <path d="m7 7 10 10M17 7v10H7" /> : null}
      {direction === 'flat' ? <path d="M5 12h14" /> : null}
    </svg>
  )
}

function InsightsMetricCards({
  metrics,
  sentiment,
  labels,
}: {
  readonly metrics: readonly LumenFeedbackInsightsReferenceMetric[]
  readonly sentiment: readonly LumenFeedbackInsightsReferenceSentiment[]
  readonly labels: LumenFeedbackInsightsReferenceContent['labels']
}): React.ReactElement {
  const sentimentItems = uniqueById(sentiment)
  return (
    <div className="lumen-feedback-insights-reference-metrics">
      {uniqueById(metrics).map((metric) => (
        <div className="lumen-feedback-insights-reference-metric" key={metric.id}>
          <p>{metric.label}</p>
          <div className="lumen-feedback-insights-reference-metric-value">
            <p>{metric.value}</p>
            {metric.change ? (
              <span className="lumen-feedback-insights-reference-metric-change">
                {metric.changeDirection ? (
                  <TrendMark
                    className="lumen-feedback-insights-reference-metric-trend"
                    direction={metric.changeDirection}
                  />
                ) : null}
                <span>{metric.change}</span>
              </span>
            ) : null}
          </div>
          <p>{metric.detail}</p>
        </div>
      ))}
      <div className="lumen-feedback-insights-reference-metric lumen-feedback-insights-reference-sentiment-card">
        <p>{labels.sentiment}</p>
        {sentimentItems.length > 0 ? (
          <div
            className="lumen-feedback-insights-reference-sentiment-bar"
            role="img"
            aria-label={labels.sentimentSummary(sentimentItems)}
          >
            {sentimentItems.map((item) => (
              <span key={item.id} style={{ inlineSize: `${boundedPercent(item.percent)}%` }} data-sentiment={item.id} />
            ))}
          </div>
        ) : null}
        <ul className="lumen-feedback-insights-reference-sentiment-legend">
          {sentimentItems.map((item) => (
            <li key={item.id}>
              <span aria-hidden="true" data-sentiment={item.id} />
              <span>{item.label}</span>
              <span>{item.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ThemesSection({
  period,
  labels,
  strategy,
}: {
  readonly period: LumenFeedbackInsightsReferencePeriod
  readonly labels: LumenFeedbackInsightsReferenceContent['labels']
  readonly strategy: LumenFeedbackInsightsReferenceListStrategy
}): React.ReactElement {
  const themes = uniqueById(period.themes)
  const maximumProgress = Math.max(1, ...themes.map((theme) => theme.progress))
  return (
    <div
      className="lumen-feedback-insights-reference-section lumen-feedback-insights-reference-themes"
      data-hbar-app-ui-list-strategy={strategy.kind}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
    >
      <div className="lumen-feedback-insights-reference-section-header">
        <p>{labels.topThemes}</p>
        <span>{labels.mentionsPeriod}</span>
      </div>
      {themes.length > 0 ? (
        <ol>
          {themes.map((theme) => (
            <li key={theme.id}>
              <div className="lumen-feedback-insights-reference-theme-label">
                <span>{theme.label}</span>
                <span>
                  <span>{theme.mentions}</span>
                  <TrendMark
                    className="lumen-feedback-insights-reference-theme-trend"
                    direction={theme.changeDirection}
                  />
                  <span>{theme.changeLabel}</span>
                </span>
              </div>
              <span aria-hidden="true" className="lumen-feedback-insights-reference-theme-progress">
                <span
                  style={{
                    inlineSize: `${boundedPercent((theme.progress / maximumProgress) * 100)}%`,
                  }}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="lumen-feedback-insights-reference-empty">{labels.empty}</p>
      )}
    </div>
  )
}

function VolumeSection({
  period,
  labels,
  strategy,
}: {
  readonly period: LumenFeedbackInsightsReferencePeriod
  readonly labels: LumenFeedbackInsightsReferenceContent['labels']
  readonly strategy: LumenFeedbackInsightsReferenceListStrategy
}): React.ReactElement {
  const volume = uniqueById(period.volume)
  const maximum = Math.max(1, ...volume.map((point) => point.value))
  return (
    <div
      className="lumen-feedback-insights-reference-section lumen-feedback-insights-reference-volume"
      data-hbar-app-ui-list-strategy={strategy.kind}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
    >
      <div className="lumen-feedback-insights-reference-section-header">
        <div>
          <p>{labels.weeklyVolume}</p>
          <p>{labels.responsesPerDay}</p>
        </div>
      </div>
      {volume.length > 0 ? (
        <>
          <div className="lumen-feedback-insights-reference-volume-plot" role="img" aria-label={labels.volumeSummary}>
            {volume.map((point, index) => (
              <span
                key={point.id}
                aria-hidden="true"
                data-volume-endpoint={index === 0 ? 'start' : index === volume.length - 1 ? 'end' : undefined}
                style={{ blockSize: `${Math.max(4, (point.value / maximum) * 100)}%` }}
              />
            ))}
          </div>
          <div className="lumen-feedback-insights-reference-volume-labels">
            <span>{period.periodStart}</span>
            <span>{period.periodEnd}</span>
          </div>
        </>
      ) : (
        <p className="lumen-feedback-insights-reference-empty">{labels.empty}</p>
      )}
    </div>
  )
}

export function LumenFeedbackInsightsReference({
  content,
  onAction,
}: {
  readonly content: LumenFeedbackInsightsReferenceContent
  readonly onAction?: ((event: LumenFeedbackInsightsReferenceAction) => void) | undefined
}): React.ReactElement {
  const periods = uniqueLumenFeedbackInsightsReferencePeriods(content.periods)
  const period = selectLumenFeedbackInsightsReferencePeriod(periods, content.selectedPeriodId)
  const selectedPeriodId = period?.id

  return (
    <div className="lumen-feedback-insights-reference" data-hbar-app-ui-component="hbar-app-ui-feedback-6">
      <div className="lumen-feedback-insights-reference-panel">
        <header className="lumen-feedback-insights-reference-header">
          <div>
            <h2>{content.labels.title}</h2>
            <p>{content.labels.description}</p>
          </div>
          <div className="lumen-feedback-insights-reference-periods" data-hbar-app-ui-region="periods">
            {periods.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === selectedPeriodId}
                data-hbar-app-ui-action="select-period"
                data-hbar-app-ui-state={option.id === selectedPeriodId ? 'selected' : 'idle'}
                onClick={() => {
                  content.onPeriodChange?.(content.reportId, option.id)
                  onAction?.({ actionId: 'change-period', value: option.id })
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>
        {period ? (
          <>
            <InsightsMetricCards metrics={period.metrics} sentiment={period.sentiment} labels={content.labels} />
            <div className="lumen-feedback-insights-reference-lower">
              <ThemesSection period={period} labels={content.labels} strategy={content.listStrategy} />
              <VolumeSection period={period} labels={content.labels} strategy={content.listStrategy} />
            </div>
          </>
        ) : (
          <p className="lumen-feedback-insights-reference-empty">{content.labels.empty}</p>
        )}
      </div>
    </div>
  )
}
