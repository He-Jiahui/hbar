import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { LumenContentText, LumenButton, LumenFrame, LumenIcon, LumenUsage01, LumenUsage02 } from '@lumen/app-ui'
import type { SettingsUsageReport, SettingsUsageWindow } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { createMessageScope } from './messages'
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
export type HbarSettingsUsageMessages = HbarSettingsUsageLabels
export const HbarSettingsUsageMessageScope = createMessageScope<HbarSettingsUsageMessages>()
export interface HbarSettingsUsageProps {
  readonly instanceId: string
  readonly connected: boolean
  readonly labels: HbarSettingsUsageLabels
}
function costValue(
  cost: Cost,
  labels: Pick<HbarSettingsUsageLabels, 'costEmpty' | 'costUnavailable' | 'currency' | 'estimated'>,
) {
  if (cost.availability !== 'available' || cost.value === null)
    return cost.availability === 'empty' ? labels.costEmpty : labels.costUnavailable
  const amount = labels.currency(cost.value)
  return cost.estimated ? labels.estimated(amount) : amount
}

/** Bounded Host summary and activity; model rows use explicit eight-row pagination. */
export function HbarSettingsUsage({ instanceId, connected, labels }: HbarSettingsUsageProps) {
  return (
    <HbarSettingsUsageMessageScope.Provider messages={labels}>
      <HbarSettingsUsageContent instanceId={instanceId} connected={connected} />
    </HbarSettingsUsageMessageScope.Provider>
  )
}

function HbarSettingsUsageContent({ instanceId, connected }: Omit<HbarSettingsUsageProps, 'labels'>) {
  const { t } = HbarSettingsUsageMessageScope.useMessages()
  const runtime = useHbarRuntime()
  const usage = useHbarRuntimeState(runtime.state.settingsUsage)
  const entry = usage.entries[instanceId]
  const report = entry?.report
  const loading = entry?.status === 'loading'
  const [bucketId, setBucketId] = useState<string | null>(null)
  const [modelNavigation, setModelNavigation] = useState({ report, instanceId, page: 0 })
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
  const lastModelPage = Math.max(0, Math.ceil(models.length / SETTINGS_USAGE_MODELS_PER_PAGE) - 1)
  // Navigation belongs to this exact summary; a refresh or retarget immediately returns to its first page.
  const modelPage =
    modelNavigation.report === report && modelNavigation.instanceId === instanceId
      ? Math.min(modelNavigation.page, lastModelPage)
      : 0
  const modelStart = modelPage * SETTINGS_USAGE_MODELS_PER_PAGE
  const pageModels = models.slice(modelStart, modelStart + SETTINGS_USAGE_MODELS_PER_PAGE)
  const moveModelPage = (direction: -1 | 1) =>
    setModelNavigation({ report, instanceId, page: Math.max(0, Math.min(lastModelPage, modelPage + direction)) })
  const selectedBucket = report?.series.find((item) => String(item.start) === bucketId)
  const windows = t('windows').filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)

  const activityOption = useMemo<EChartsOption>(() => {
    const series = report?.series ?? []
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: series.map((p) => t('observedAt')(p.start)),
        axisLabel: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: series.map((p) => ({
            value: p.input + p.output,
            itemStyle: {
              opacity: bucketId === String(p.start) ? 1 : 0.55,
            },
          })),
        },
      ],
    }
  }, [report?.series, bucketId, t])

  const usageContent = report
    ? {
        overview: {
          title: t('summary'),
          description: t('description'),
          metrics: [
            {
              id: 'tokens',
              label: t('tokens'),
              value: t('tokenCount')(report.totals.input + report.totals.output),
            },
            { id: 'input', label: t('input'), value: t('tokenCount')(report.totals.input) },
            { id: 'output', label: t('output'), value: t('tokenCount')(report.totals.output) },
            {
              id: 'cost',
              label: t('cost'),
              value: costValue(report.cost, {
                costEmpty: t('costEmpty'),
                costUnavailable: t('costUnavailable'),
                currency: t('currency'),
                estimated: t('estimated'),
              }),
            },
          ],
          meters: [],
        },
        modelSpend: {
          title: t('models'),
          description: t('description'),
          strategy: 'content-grown' as const,
          emptyLabel: t('noModels'),
          rows: pageModels.map((model) => ({
            id: model.modelSelectionId,
            model: t('model')(model.providerId, model.modelId),
            share:
              report.totals.input + report.totals.output > 0
                ? ((model.input + model.output) / (report.totals.input + report.totals.output)) * 100
                : 0,
            shareLabel: t('tokenCount')(model.input + model.output),
            spend: costValue(model.cost, {
              costEmpty: t('costEmpty'),
              costUnavailable: t('costUnavailable'),
              currency: t('currency'),
              estimated: t('estimated'),
            }),
            change: '',
            direction: 'unchanged' as const,
          })),
          columns: { model: t('models'), share: t('tokens'), spend: t('cost'), change: t('cost') },
        },
      }
    : undefined
  return (
    <LumenFrame as="section" className="hbar-settings-usage" aria-label={t('title')}>
      <LumenFrame as="header" className="hbar-settings-usage-header">
        <LumenFrame className="hbar-settings-usage-intro">
          <LumenContentText context="section.title">{t('title')}</LumenContentText>
          <LumenContentText context="form.description" tone="muted">
            {t('description')}
          </LumenContentText>
        </LumenFrame>
        <LumenButton type="button" variant="text" disabled={!connected || loading} onClick={refresh}>
          <LumenIcon icon={RefreshCw} tier="sm" />
          {t('refresh')}
        </LumenButton>
      </LumenFrame>
      <LumenFrame className="hbar-settings-usage-windows" role="group" aria-label={t('windowsLabel')}>
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
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {!connected && (
        <LumenContentText context="feedback.message" role="status">
          {t('offline')}
        </LumenContentText>
      )}
      {entry?.error && (
        <LumenContentText context="feedback.message" role="alert">
          {t('error')(entry.error)}
        </LumenContentText>
      )}
      {report && (loading || entry?.error || !connected) && (
        <LumenContentText context="form.description" tone="muted">
          {t('oldResult')}
        </LumenContentText>
      )}
      {report && (
        <>
          <LumenContentText context="form.description" tone="muted" className="hbar-settings-usage-observed">
            {t('observedAt')(report.observedAt)}
          </LumenContentText>
          {report.gap && (
            <LumenContentText context="feedback.message" role="status">
              {t('gap')}
            </LumenContentText>
          )}
          {report.totals.attempts === 0 && (
            <LumenContentText context="feedback.message" role="status">
              {t('empty')}
            </LumenContentText>
          )}
          <LumenUsage01 content={usageContent} className="hbar-settings-usage-lumen" />
          <LumenFrame as="section" className="hbar-settings-usage-activity" aria-label={t('activity')}>
            <LumenContentText context="section.subtitle">{t('activity')}</LumenContentText>
            {report.series.length > 0 ? (
              <>
                <EchartsChart
                  height="9rem"
                  label={t('activity')}
                  className="hbar-settings-usage-echarts"
                  option={activityOption}
                />
                <LumenFrame as="div" className="hbar-settings-usage-buckets" role="group" aria-label={t('activity')}>
                  {report.series.map((bucket) => {
                    const id = String(bucket.start)
                    const selected = id === bucketId
                    return (
                      <LumenButton
                        key={id}
                        type="button"
                        size="s"
                        variant={selected ? 'outlined' : 'text'}
                        aria-pressed={selected}
                        data-settings-usage-bucket={id}
                        onClick={() => setBucketId(id)}
                      >
                        {t('bucket')(bucket.start, bucket.end, bucket.input + bucket.output)}
                      </LumenButton>
                    )
                  })}
                </LumenFrame>
              </>
            ) : (
              <LumenContentText context="form.description" tone="muted">
                {t('empty')}
              </LumenContentText>
            )}
            {selectedBucket && (
              <LumenContentText context="feedback.message" role="status">
                {t('bucket')(selectedBucket.start, selectedBucket.end, selectedBucket.input + selectedBucket.output)}
              </LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-settings-usage-models" aria-label={t('models')}>
            <LumenUsage02 content={usageContent} className="hbar-settings-usage-lumen" />
            {models.length > SETTINGS_USAGE_MODELS_PER_PAGE && (
              <LumenFrame as="nav" className="hbar-settings-usage-pagination" aria-label={t('models')}>
                <LumenContentText context="form.description" role="status">
                  {t('page')(modelStart + 1, modelStart + pageModels.length, models.length)}
                </LumenContentText>
                <LumenFrame
                  className="hbar-settings-usage-pagination-actions"
                  role="group"
                  aria-label={t('models')}
                  tabIndex={0}
                >
                  <LumenButton
                    type="button"
                    size="s"
                    variant="text"
                    disabled={modelPage === 0}
                    title={t('previous')}
                    onClick={() => moveModelPage(-1)}
                  >
                    {t('previous')}
                  </LumenButton>
                  <LumenButton
                    type="button"
                    size="s"
                    variant="text"
                    disabled={modelPage === lastModelPage}
                    title={t('next')}
                    onClick={() => moveModelPage(1)}
                  >
                    {t('next')}
                  </LumenButton>
                </LumenFrame>
              </LumenFrame>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}
