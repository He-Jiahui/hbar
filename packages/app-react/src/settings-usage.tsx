import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenFrame,
  LumenIcon,
  LumenContentText,
  LumenBarSeries,
  LumenUsage01,
  LumenUsage02,
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
  const [selection, setSelection] = useState<{ readonly report: typeof report; readonly id: string } | null>(null)
  const [pagination, setPagination] = useState<{ readonly report: typeof report; readonly page: number } | null>(null)
  useEffect(() => {
    if (connected) void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  }, [connected, instanceId, runtime])
  const refresh = () => void runtime.commands.execute('settingsUsage.refresh', { instanceId }).catch(() => undefined)
  const selectWindow = (window: SettingsUsageWindow) =>
    void runtime.commands.execute('settingsUsage.setWindow', { instanceId, window }).catch(() => undefined)
  const models = report?.models ?? []
  const selectedBucket =
    selection?.report === report ? report?.series.find((item) => String(item.start) === selection?.id) : undefined
  const lastPage = Math.max(0, Math.ceil(models.length / SETTINGS_USAGE_MODELS_PER_PAGE) - 1)
  const page = pagination?.report === report ? Math.min(pagination?.page ?? 0, lastPage) : 0
  const pageStart = page * SETTINGS_USAGE_MODELS_PER_PAGE
  const windows = labels.windows.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)

  const usageContent = report
    ? {
        overview: {
          title: labels.summary,
          description: labels.description,
          metrics: [
            {
              id: 'tokens',
              label: labels.tokens,
              value: labels.tokenCount(report.totals.input + report.totals.output),
            },
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
          rows: models.slice(pageStart, pageStart + SETTINGS_USAGE_MODELS_PER_PAGE).map((model) => ({
            id: model.modelSelectionId,
            model: labels.model(model.providerId, model.modelId),
            share:
              report.totals.input + report.totals.output > 0
                ? ((model.input + model.output) / (report.totals.input + report.totals.output)) * 100
                : 0,
            shareLabel: labels.tokenCount(model.input + model.output),
            spend: costValue(model.cost, labels),
          })),
          columns: { model: labels.models, share: labels.tokens, spend: labels.cost },
        },
      }
    : undefined
  return (
    <LumenFrame as="section" className="hbar-settings-usage" aria-label={labels.title}>
      <LumenFrame as="header" className="hbar-settings-usage-header">
        <LumenFrame className="hbar-settings-usage-intro">
          <LumenContentText context="section.title" level={2}>
            {labels.title}
          </LumenContentText>
          <LumenContentText context="section.description">{labels.description}</LumenContentText>
        </LumenFrame>
        <LumenFrame className="hbar-settings-usage-reader" role="group" aria-label={labels.title} tabIndex={0}>
          <LumenButton type="button" variant="text" disabled={!connected || loading} onClick={refresh}>
            <LumenIcon icon={RefreshCw} tier="sm" />
            {labels.refresh}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>
      <LumenFrame className="hbar-settings-usage-windows" role="group" aria-label={labels.windowsLabel} tabIndex={0}>
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
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.loading}
        </LumenContentText>
      )}
      {!connected && (
        <LumenContentText context="feedback.paragraph" role="status">
          {labels.offline}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenContentText context="feedback.paragraph" role="alert" tone="danger">
          {labels.error(entry.error)}
        </LumenContentText>
      )}
      {report && (loading || entry?.error || !connected) && (
        <LumenContentText context="feedback.paragraph" tone="muted">
          {labels.oldResult}
        </LumenContentText>
      )}
      {report && (
        <>
          <LumenFrame
            className="hbar-settings-usage-reader"
            role="group"
            aria-label={labels.observedAt(report.observedAt)}
            tabIndex={0}
          >
            <LumenContentText
              context="metadata.time"
              tone="muted"
              dateTime={new Date(report.observedAt).toISOString()}
              className="hbar-settings-usage-observed"
            >
              {labels.observedAt(report.observedAt)}
            </LumenContentText>
          </LumenFrame>
          {report.gap && (
            <LumenContentText context="feedback.paragraph" role="status" tone="warning">
              {labels.gap}
            </LumenContentText>
          )}
          {report.totals.attempts === 0 && (
            <LumenContentText context="empty.description" role="status">
              {labels.empty}
            </LumenContentText>
          )}
          <LumenUsage01 content={usageContent} className="hbar-settings-usage-lumen" />
          <LumenFrame as="section" className="hbar-settings-usage-activity" aria-label={labels.activity}>
            <LumenContentText context="section.title" level={3}>
              {labels.activity}
            </LumenContentText>
            <LumenBarSeries
              label={labels.activity}
              points={report.series.map((point) => ({
                id: String(point.start),
                value: point.input + point.output,
                label: labels.bucket(point.start, point.end, point.input + point.output),
              }))}
              empty={<LumenContentText context="empty.description">{labels.empty}</LumenContentText>}
              selectedId={selectedBucket ? String(selectedBucket.start) : null}
              onSelect={(id) => setSelection({ report, id })}
            />
            {selectedBucket && (
              <LumenContentText context="feedback.paragraph" role="status">
                {labels.bucket(selectedBucket.start, selectedBucket.end, selectedBucket.input + selectedBucket.output)}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-settings-usage-models" aria-label={labels.models}>
            <LumenUsage02 content={usageContent} className="hbar-settings-usage-lumen" />
            {models.length > SETTINGS_USAGE_MODELS_PER_PAGE && (
              <LumenFrame
                className="hbar-settings-usage-pagination"
                role="group"
                aria-label={labels.models}
                tabIndex={0}
              >
                <LumenButton disabled={page === 0} onClick={() => setPagination({ report, page: page - 1 })}>
                  {labels.previous}
                </LumenButton>
                <LumenContentText context="metadata">
                  {labels.page(
                    pageStart + 1,
                    Math.min(pageStart + SETTINGS_USAGE_MODELS_PER_PAGE, models.length),
                    models.length,
                  )}
                </LumenContentText>
                <LumenButton disabled={page === lastPage} onClick={() => setPagination({ report, page: page + 1 })}>
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
