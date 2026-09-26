import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  LumenBarSeries,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenText,
} from '@lumen/app-ui'
import type { SettingsUsageReport, SettingsUsageWindow } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './settings-usage.css'

export const SETTINGS_USAGE_MODELS_PER_PAGE = 8
type Cost = SettingsUsageReport['cost']
export interface HbarSettingsUsageLabels {
  readonly title: string
  readonly description: string
  readonly refresh: string
  readonly loading: string
  readonly offline: string
  readonly oldResult: string
  readonly empty: string
  readonly gap: string
  readonly summary: string
  readonly tokens: string
  readonly input: string
  readonly output: string
  readonly cost: string
  readonly costUnavailable: string
  readonly costEmpty: string
  readonly estimated: (value: string) => string
  readonly activity: string
  readonly windowsLabel: string
  readonly windows: readonly { readonly id: SettingsUsageWindow; readonly label: string }[]
  readonly models: string
  readonly noModels: string
  readonly previous: string
  readonly next: string
  readonly page: (from: number, to: number, total: number) => string
  readonly tokenCount: (value: number) => string
  readonly currency: (value: number) => string
  readonly model: (providerId: string, modelId: string) => string
  readonly observedAt: (time: number) => string
  readonly bucket: (start: number, end: number, tokens: number) => string
  readonly error: (code: string) => string
}
export interface HbarSettingsUsageProps {
  readonly instanceId: string
  readonly connected: boolean
  readonly labels: HbarSettingsUsageLabels
}
function costValue(cost: Cost, labels: HbarSettingsUsageLabels) {
  if (cost.availability !== 'available' || cost.value === null)
    return cost.availability === 'empty' ? labels.costEmpty : labels.costUnavailable
  const amount = labels.currency(cost.value)
  return cost.estimated ? labels.estimated(amount) : amount
}

/** Bounded Host summary and activity; model rows use explicit eight-row pagination. */
export function HbarSettingsUsage({ instanceId, connected, labels }: HbarSettingsUsageProps) {
  const runtime = useHbarRuntime()
  const usage = useHbarRuntimeState(runtime.state.settingsUsage)
  const entry = usage.entries[instanceId]
  const report = entry?.report
  const loading = entry?.status === 'loading'
  const [requestedPage, setPage] = useState(0)
  const [bucketId, setBucketId] = useState<string | null>(null)
  useEffect(() => {
    if (connected) void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  }, [connected, instanceId, runtime])
  useEffect(() => {
    setPage(0)
    setBucketId(null)
  }, [report])
  const refresh = () => void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  const selectWindow = (window: SettingsUsageWindow) =>
    void runtime.commands.execute('settingsUsage.setWindow', { instanceId, window }).catch(() => undefined)
  const models = report?.models ?? []
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(models.length / SETTINGS_USAGE_MODELS_PER_PAGE) - 1))
  const start = page * SETTINGS_USAGE_MODELS_PER_PAGE
  const selectedBucket = report?.series.find((item) => String(item.start) === bucketId)
  const windows = labels.windows.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
  return (
    <LumenFrame as="section" className="hbar-settings-usage" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-settings-usage-header">
        <LumenFrame className="hbar-settings-usage-intro">
          <LumenText as="h2">{labels.title}</LumenText>
          <LumenText as="p" tone="muted">
            {labels.description}
          </LumenText>
        </LumenFrame>
        <LumenButton type="button" variant="text" disabled={!connected || loading} onClick={refresh}>
          <LumenIcon icon={RefreshCw} tier="sm" />
          {labels.refresh}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="hbar-settings-usage-windows" role="group" aria-label={labels.windowsLabel}>
        {windows.map((window) => (
          <LumenButton
            key={window.id}
            type="button"
            size="s"
            variant={entry?.window === window.id ? 'outlined' : 'text'}
            aria-pressed={(entry?.window ?? '24h') === window.id}
            disabled={!connected || (loading && entry?.window === window.id)}
            onClick={() => selectWindow(window.id)}
          >
            {window.label}
          </LumenButton>
        ))}
      </LumenFrame>
      {loading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {!connected && (
        <LumenText as="p" role="status">
          {labels.offline}
        </LumenText>
      )}
      {entry?.error && (
        <LumenText as="p" role="alert">
          {labels.error(entry.error)}
        </LumenText>
      )}
      {report && (loading || entry?.error || !connected) && (
        <LumenText as="p" tone="muted">
          {labels.oldResult}
        </LumenText>
      )}
      {report && (
        <>
          <LumenText as="p" tone="muted" className="hbar-settings-usage-observed">
            {labels.observedAt(report.observedAt)}
          </LumenText>
          {report.gap && (
            <LumenText as="p" role="status">
              {labels.gap}
            </LumenText>
          )}
          {report.totals.attempts === 0 && (
            <LumenText as="p" role="status">
              {labels.empty}
            </LumenText>
          )}
          <LumenCollection className="hbar-settings-usage-summary" aria-label={labels.summary}>
            <UsageMetric label={labels.tokens} value={labels.tokenCount(report.totals.input + report.totals.output)} />
            <UsageMetric label={labels.input} value={labels.tokenCount(report.totals.input)} />
            <UsageMetric label={labels.output} value={labels.tokenCount(report.totals.output)} />
            <UsageMetric label={labels.cost} value={costValue(report.cost, labels)} />
          </LumenCollection>
          <LumenFrame as="section" className="hbar-settings-usage-activity" aria-label={labels.activity}>
            <LumenText as="h3">{labels.activity}</LumenText>
            <LumenBarSeries
              label={labels.activity}
              points={report.series.map((point) => ({
                id: String(point.start),
                value: point.input + point.output,
                label: labels.bucket(point.start, point.end, point.input + point.output),
              }))}
              empty={
                <LumenText as="p" tone="muted">
                  {labels.empty}
                </LumenText>
              }
              selectedId={selectedBucket ? String(selectedBucket.start) : null}
              onSelect={setBucketId}
            />
            {selectedBucket && (
              <LumenText as="p" role="status">
                {labels.bucket(selectedBucket.start, selectedBucket.end, selectedBucket.input + selectedBucket.output)}
              </LumenText>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-settings-usage-models" aria-label={labels.models}>
            <LumenText as="h3">{labels.models}</LumenText>
            {!models.length ? (
              <LumenText as="p" tone="muted">
                {labels.noModels}
              </LumenText>
            ) : (
              <LumenCollection as="ul" className="hbar-settings-usage-model-list">
                {models.slice(start, start + SETTINGS_USAGE_MODELS_PER_PAGE).map((model) => (
                  <LumenCollectionItem as="li" className="hbar-settings-usage-model-row" key={model.modelSelectionId}>
                    <LumenText as="strong">{labels.model(model.providerId, model.modelId)}</LumenText>
                    <LumenText as="span">{labels.tokenCount(model.input + model.output)}</LumenText>
                    <LumenText as="span" tone="muted">
                      {costValue(model.cost, labels)}
                    </LumenText>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )}
            {models.length > SETTINGS_USAGE_MODELS_PER_PAGE && (
              <LumenFrame className="hbar-settings-usage-pagination">
                <LumenText as="span">
                  {labels.page(
                    start + 1,
                    Math.min(start + SETTINGS_USAGE_MODELS_PER_PAGE, models.length),
                    models.length,
                  )}
                </LumenText>
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {labels.previous}
                </LumenButton>
                <LumenButton
                  type="button"
                  size="s"
                  variant="text"
                  disabled={start + SETTINGS_USAGE_MODELS_PER_PAGE >= models.length}
                  onClick={() => setPage(page + 1)}
                >
                  {labels.next}
                </LumenButton>
              </LumenFrame>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}
function UsageMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <LumenCollectionItem className="hbar-settings-usage-metric">
      <LumenText as="strong">{value}</LumenText>
      <LumenText as="span" tone="muted">
        {label}
      </LumenText>
    </LumenCollectionItem>
  )
}
