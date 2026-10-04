import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenFrame,
  LumenIcon,
  LumenText,
  LumenUsage01,
  LumenUsage02,
} from '@lumen/app-ui'
import type { SettingsUsageReport, SettingsUsageWindow } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { EchartsChart, type EChartsOption } from './echarts-chart'
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
  const [bucketId, setBucketId] = useState<string | null>(null)
  useEffect(() => {
    if (connected) void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  }, [connected, instanceId, runtime])
  useEffect(() => {
    setBucketId(null)
  }, [report])
  const refresh = () => void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  const selectWindow = (window: SettingsUsageWindow) =>
    void runtime.commands.execute('settingsUsage.setWindow', { instanceId, window }).catch(() => undefined)
  const models = report?.models ?? []
  const selectedBucket = report?.series.find((item) => String(item.start) === bucketId)
  const windows = labels.windows.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)

  const activityOption = useMemo<EChartsOption>(() => {
    const series = report?.series ?? []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: series.map((p) => labels.observedAt(p.start)),
        axisLabel: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: series.map((p) => ({
            value: p.input + p.output,
            itemStyle: {
              color: bucketId === String(p.start)
                ? 'var(--lumen-accent, #7c6af7)'
                : 'color-mix(in srgb, var(--lumen-accent, #7c6af7) 55%, transparent)',
            },
          })),
        },
      ],
    }
  }, [report?.series, bucketId, labels])

  const usageContent = report
    ? {
        overview: {
          title: labels.summary,
          description: labels.description,
          metrics: [
            { id: 'tokens', label: labels.tokens, value: labels.tokenCount(report.totals.input + report.totals.output) },
            { id: 'input', label: labels.input, value: labels.tokenCount(report.totals.input) },
            { id: 'output', label: labels.output, value: labels.tokenCount(report.totals.output) },
            { id: 'cost', label: labels.cost, value: costValue(report.cost, labels) },
          ],
          meters: [],
        },
        modelSpend: {
          title: labels.models,
          description: labels.description,
          strategy: 'content-grown' as const,
          emptyLabel: labels.noModels,
          rows: models.map((model) => ({
            id: model.modelSelectionId,
            model: labels.model(model.providerId, model.modelId),
            share: report.totals.input + report.totals.output > 0 ? ((model.input + model.output) / (report.totals.input + report.totals.output)) * 100 : 0,
            shareLabel: labels.tokenCount(model.input + model.output),
            spend: costValue(model.cost, labels),
            change: '',
            direction: 'unchanged' as const,
          })),
          columns: { model: labels.models, share: labels.tokens, spend: labels.cost, change: labels.cost },
        },
      }
    : undefined
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
          <LumenUsage01 content={usageContent} className="hbar-settings-usage-lumen" />
          <LumenFrame as="section" className="hbar-settings-usage-activity" aria-label={labels.activity}>
            <LumenText as="h3">{labels.activity}</LumenText>
            {report.series.length > 0 ? (
              <EchartsChart
                height="9rem"
                label={labels.activity}
                className="hbar-settings-usage-echarts"
                option={activityOption}
              />
            ) : (
              <LumenText as="p" tone="muted">{labels.empty}</LumenText>
            )}
            {selectedBucket && (
              <LumenText as="p" role="status">
                {labels.bucket(selectedBucket.start, selectedBucket.end, selectedBucket.input + selectedBucket.output)}
              </LumenText>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-settings-usage-models" aria-label={labels.models}>
            {models.slice(0, SETTINGS_USAGE_MODELS_PER_PAGE).map((model) => (
              <LumenFrame key={`compat-${model.modelSelectionId}`} className="hbar-settings-usage-model-row" hidden>
                {labels.model(model.providerId, model.modelId)}
              </LumenFrame>
            ))}
            <LumenUsage02 content={usageContent} className="hbar-settings-usage-lumen" />
            {models.length > SETTINGS_USAGE_MODELS_PER_PAGE && (
              <LumenText as="p" className="hbar-settings-usage-pagination">
                {labels.page(1, Math.min(SETTINGS_USAGE_MODELS_PER_PAGE, models.length), models.length)}
              </LumenText>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}

