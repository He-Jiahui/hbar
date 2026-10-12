'use client'

import * as React from 'react'
import { LumenDisclosure } from './disclosure'
import { LumenInput, LumenSelect, LumenToggleControl } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import { UsageOverviewChartContent, type LumenUsageOverviewChart } from './usage-overview'
import { UsageModelTable, type LumenUsageModelTableContent } from './usage-model-table'
import { UsageRatePanel, type LumenUsageRatePanelContent } from './usage-rate-panel'
import { UsageMemberList, type LumenUsageMemberListContent } from './usage-member-list'
import { UsageBudgetPanel, type LumenUsageBudgetPanelContent } from './usage-budget-panel'
import { UsageOveragePanel, type LumenUsageOveragePanelContent } from './usage-overage-panel'
import { UsageRequestTable, type LumenUsageRequestTableContent } from './usage-request-table'
import { UsageCompactWidget, type LumenUsageCompactWidgetContent } from './usage-compact-widget'
import './usage.css'
import './usage-practical-flow.css'
import { LumenProgress } from './ui-controls'

export interface LumenUsageMetric {
  readonly id?: string | undefined
  readonly label: string
  readonly value: string
  readonly detail?: string | undefined
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative' | undefined
}

export interface LumenUsageOption {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
}

export interface LumenUsageHeading {
  readonly title: string
  readonly description: string
}

export interface LumenUsageAction {
  readonly label: string
  readonly disabled?: boolean | undefined
  readonly onInvoke: () => void
}

export interface LumenUsageChoice {
  readonly label: string
  readonly value: string
  readonly options: readonly LumenUsageOption[]
  readonly onChange: (id: string) => void
}

export interface LumenUsageMeter {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly progress: number
  readonly progressLabel: string
  readonly detail: string
  readonly tone: 'accent' | 'positive' | 'warning' | 'danger'
}

export interface LumenUsageCollection {
  readonly strategy: 'content-grown' | 'virtual'
  readonly emptyLabel: string
}

export interface LumenUsageOverviewContent extends LumenUsageHeading {
  readonly metrics: readonly LumenUsageMetric[]
  readonly meters: readonly LumenUsageMeter[]
  readonly range?: LumenUsageChoice | undefined
  /** Optional stacked-series surface; omitting it preserves the legacy meter API. */
  readonly chart?: LumenUsageOverviewChart | undefined
}

export interface LumenUsageModelSpendRow {
  readonly id: string
  readonly model: string
  readonly share: number
  readonly shareLabel: string
  readonly spend: string
  readonly change: string
  readonly direction: 'up' | 'down' | 'unchanged'
}

export interface LumenUsageModelSpendContent extends LumenUsageHeading, LumenUsageCollection {
  /** Detailed responsive model table; omission preserves the original compact-list API. */
  readonly table?: LumenUsageModelTableContent | undefined
  readonly rows: readonly LumenUsageModelSpendRow[]
  readonly columns: {
    readonly model: string
    readonly share: string
    readonly spend: string
    readonly change: string
  }
  readonly sort?: LumenUsageAction | LumenUsageChoice | undefined
}

export interface LumenUsageRateLimitsContent extends LumenUsageHeading {
  /** Detailed rate-limit panel; omission preserves the compact meter API. */
  readonly panel?: LumenUsageRatePanelContent | undefined
  readonly tier?: LumenUsageChoice | undefined
  readonly meters: readonly LumenUsageMeter[]
  readonly emptyLabel: string
}

export interface LumenUsageSeatRow {
  readonly id: string
  readonly filterId?: string | undefined
  readonly initials: string
  readonly name: string
  readonly detail: string
  readonly progress: number
  readonly progressLabel: string
  readonly spend: string
}

export interface LumenUsageSeatContent extends LumenUsageHeading, LumenUsageCollection {
  /** Detailed member list; omission retains the legacy seat-list API. */
  readonly members?: LumenUsageMemberListContent | undefined
  readonly query: string
  readonly searchLabel: string
  readonly onQueryChange: (value: string) => void
  readonly filter?: LumenUsageAction | LumenUsageChoice | undefined
  readonly rows: readonly LumenUsageSeatRow[]
}

export interface LumenUsageBudgetContent extends LumenUsageHeading {
  /** Immediate budget controls; omission preserves the legacy save-form API. */
  readonly panel?: LumenUsageBudgetPanelContent | undefined
  readonly labels: { readonly cap: string; readonly save: string; readonly saving: string }
  readonly cap: {
    readonly value: string
    readonly display: string
    readonly input: 'number' | 'range'
    readonly minimum: number
    readonly maximum?: number | undefined
    readonly step: number
  }
  readonly status?:
    | {
        readonly label: string
        readonly tone: 'neutral' | 'positive' | 'warning' | 'danger'
      }
    | undefined
  readonly threshold?: LumenUsageChoice | undefined
  readonly hardStop?:
    | {
        readonly label: string
        readonly checked: boolean
        readonly onChange: (checked: boolean) => void
      }
    | undefined
  readonly busy: boolean
  readonly canSave: boolean
  readonly error?: string | undefined
  readonly onCapChange: (value: string) => void
  readonly onSave: () => void
  readonly clear?: LumenUsageAction | undefined
}

export interface LumenUsageOverageContent extends LumenUsageHeading {
  /** Detailed allowance split and plan cards; omission preserves the legacy meter API. */
  readonly panel?: LumenUsageOveragePanelContent | undefined
  readonly status: string
  readonly meters: readonly LumenUsageMeter[]
  readonly plan?: LumenUsageChoice | undefined
  readonly review?: LumenUsageAction | undefined
}

export interface LumenUsageRequest {
  readonly id: string
  readonly filterId?: string | undefined
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly details: string
  readonly expandLabel: string
}

export interface LumenUsageRequestLogContent extends LumenUsageHeading, LumenUsageCollection {
  /** Detailed responsive request log; omission retains the legacy disclosure API. */
  readonly table?: LumenUsageRequestTableContent | undefined
  readonly rows: readonly LumenUsageRequest[]
  readonly filter?: LumenUsageAction | LumenUsageChoice | undefined
}

export interface LumenUsageCompactContent extends LumenUsageHeading {
  /** Detailed plan widget. Inline density and omission retain the legacy surfaces. */
  readonly widget?: LumenUsageCompactWidgetContent | undefined
  readonly density?: 'default' | 'inline' | undefined
  readonly value: string
  readonly detail: string
  readonly progress?: number | undefined
  readonly progressLabel: string
  readonly tone: LumenUsageMeter['tone']
  /** Bounded normalized trend, normally twelve points; hosts aggregate above thirty-one. */
  readonly sparkline: readonly { readonly id: string; readonly value: number }[]
  readonly sparklineLabel: string
  readonly metrics: readonly (LumenUsageMetric & { readonly id: string })[]
  readonly action?: LumenUsageAction | undefined
}

export interface LumenUsageContent {
  /** Preview sizing and nearby feedback are resolved by the owning Host. */
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  readonly overview?: LumenUsageOverviewContent | undefined
  readonly modelSpend?: LumenUsageModelSpendContent | undefined
  readonly rateLimits?: LumenUsageRateLimitsContent | undefined
  readonly seats?: LumenUsageSeatContent | undefined
  readonly budget?: LumenUsageBudgetContent | undefined
  readonly overage?: LumenUsageOverageContent | undefined
  readonly requests?: LumenUsageRequestLogContent | undefined
  readonly compact?: LumenUsageCompactContent | undefined
}

export interface LumenUsageProviderProps {
  readonly content: LumenUsageContent
  readonly children: React.ReactNode
}

export interface LumenUsageProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenUsageContent | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenUsageVariantProps = Omit<LumenUsageProps, 'variant' | 'variantId'>

const UsageContentContext = React.createContext<LumenUsageContent>({})

export function LumenUsageProvider({ content, children }: LumenUsageProviderProps) {
  return <UsageContentContext.Provider value={content}>{children}</UsageContentContext.Provider>
}

export function useLumenUsageContent(): LumenUsageContent {
  return React.useContext(UsageContentContext)
}

/** Last record wins while its first position remains stable. */
export function uniqueLumenUsageItems<Item extends { readonly id: string }>(items: readonly Item[]): readonly Item[] {
  return [...new Map(items.filter((item) => item.id.trim()).map((item) => [item.id, item])).values()]
}

function usageTone(tone: 'neutral' | 'positive' | 'warning' | 'danger'): 'neutral' | 'success' | 'warning' | 'danger' {
  return tone === 'positive' ? 'success' : tone
}

function UsageGlyph({ name }: { readonly name: 'down' | 'filter' | 'search' | 'trend-down' | 'trend-up' }) {
  return (
    <svg className="lumen-usage-glyph" viewBox="0 0 16 16" aria-hidden="true">
      {name === 'down' ? <path d="m4 6 4 4 4-4" /> : null}
      {name === 'filter' ? <path d="M2.5 3.5h11M4.5 8h7m-5 4.5h3" /> : null}
      {name === 'search' ? <path d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm4-1 3 3" /> : null}
      {name === 'trend-down' ? <path d="m3 5 4 4 3-3 3 3m0-3v3h-3" /> : null}
      {name === 'trend-up' ? <path d="m3 11 4-4 3 3 3-3m0 3V7h-3" /> : null}
    </svg>
  )
}

function UsageProgress({
  value,
  label,
  tone = 'accent',
}: {
  readonly value: number
  readonly label?: string | undefined
  readonly tone?: LumenUsageMeter['tone'] | undefined
}) {
  const tones = {
    accent: 'info',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return (
    <LumenProgress
      className="lumen-usage-progress hbar-app-ui-progress"
      label={label ?? ''}
      value={value}
      tone={tone ? tones[tone] : 'info'}
    />
  )
}

function UsageFrame({
  content,
  variant,
  children,
}: {
  readonly content: LumenUsageHeading
  readonly variant: number
  readonly children: React.ReactNode
}) {
  return (
    <section
      className={`lumen-usage-content hbar-app-ui-usage-content hbar-app-ui-usage-variant-${variant}`}
      aria-label={content.title}
    >
      <header className="lumen-usage-heading hbar-app-ui-toolbar">
        <div>
          <LumenText as="h2" variant="heading">
            {content.title}
          </LumenText>
          <LumenText as="small" tone="muted">
            {content.description}
          </LumenText>
        </div>
      </header>
      {children}
    </section>
  )
}

function UsageActionButton({
  action,
  children,
}: {
  readonly action: LumenUsageAction | LumenUsageChoice
  readonly children?: React.ReactNode
}) {
  if ('options' in action) return <UsageChoiceControl choice={action} />
  return (
    <LumenButton variant="outlined" disabled={action.disabled} onClick={action.onInvoke}>
      {children}
      {action.label}
    </LumenButton>
  )
}

function UsageChoiceControl({
  choice,
  disabled = false,
}: {
  readonly choice: LumenUsageChoice
  readonly disabled?: boolean | undefined
}) {
  const options = uniqueLumenUsageItems(choice.options)
  return (
    <label className="lumen-usage-choice">
      <LumenText as="span" variant="label">
        {choice.label}
      </LumenText>
      <LumenSelect
        aria-label={choice.label}
        value={options.some((option) => option.id === choice.value) ? choice.value : ''}
        disabled={disabled}
        onChange={(event) => choice.onChange(event.currentTarget.value)}
      >
        <option value="" hidden disabled aria-label={choice.label} />
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </LumenSelect>
    </label>
  )
}

function UsageMeterCard({ meter }: { readonly meter: LumenUsageMeter }) {
  return (
    <article className="lumen-usage-meter hbar-app-ui-spotlight">
      <div>
        <LumenText as="strong" variant="label">
          {meter.label}
        </LumenText>
        <b>{meter.value}</b>
      </div>
      <UsageProgress value={meter.progress} label={meter.progressLabel} tone={meter.tone} />
      <LumenText as="small" tone="muted">
        {meter.detail}
      </LumenText>
    </article>
  )
}

function UsageCollectionView<Item extends { readonly id: string }>({
  content,
  items,
  render,
}: {
  readonly content: LumenUsageCollection & LumenUsageHeading
  readonly items: readonly Item[]
  readonly render: (item: Item) => React.ReactNode
}) {
  const records = uniqueLumenUsageItems(items)
  if (records.length === 0) {
    return (
      <LumenText as="p" tone="muted">
        {content.emptyLabel}
      </LumenText>
    )
  }
  return (
    <div className="lumen-usage-list hbar-app-ui-usage-list" role="list" data-lumen-list-strategy={content.strategy}>
      {records.map((item) => (
        <div role="listitem" key={item.id}>
          {render(item)}
        </div>
      ))}
    </div>
  )
}

function UsageTabs({ choice }: { readonly choice: LumenUsageChoice }) {
  return (
    <div className="lumen-usage-tabs hbar-app-ui-tabs" role="group" aria-label={choice.label}>
      {uniqueLumenUsageItems(choice.options).map((option) => (
        <LumenButton
          key={option.id}
          size="s"
          variant={choice.value === option.id ? 'solid' : 'text'}
          aria-pressed={choice.value === option.id}
          onClick={() => choice.onChange(option.id)}
        >
          {option.label}
        </LumenButton>
      ))}
    </div>
  )
}

function UsageMetrics({ metrics }: { readonly metrics: readonly LumenUsageMetric[] }) {
  return (
    <dl className="lumen-usage-metrics hbar-app-ui-metrics">
      {metrics.map((metric, index) => (
        <div key={metric.id ?? `${metric.label}:${index}`} data-tone={metric.tone ?? 'neutral'}>
          <LumenText as="dt" tone="muted">
            {metric.label}
          </LumenText>
          <LumenText as="dd" variant="heading">
            {metric.value}
          </LumenText>
          {metric.detail ? (
            <LumenText as="small" tone="muted">
              {metric.detail}
            </LumenText>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

export function LumenUsageOverview(content: LumenUsageOverviewContent) {
  if (content.chart) {
    return <UsageOverviewChartContent content={content} chart={content.chart} />
  }
  return (
    <UsageFrame content={content} variant={1}>
      {content.range ? <UsageTabs choice={content.range} /> : null}
      <UsageMetrics metrics={content.metrics} />
      {content.meters.length > 0 ? (
        <div className="lumen-usage-meter-list hbar-app-ui-stacked-bars">
          {uniqueLumenUsageItems(content.meters).map((meter) => (
            <UsageMeterCard key={meter.id} meter={meter} />
          ))}
        </div>
      ) : null}
    </UsageFrame>
  )
}

export function LumenUsageModelSpend(content: LumenUsageModelSpendContent) {
  if (content.table) {
    return <UsageModelTable heading={content} table={content.table} />
  }
  return (
    <UsageFrame content={content} variant={2}>
      {content.sort ? (
        <UsageActionButton action={content.sort}>
          <UsageGlyph name="filter" />
        </UsageActionButton>
      ) : null}
      <div className="lumen-usage-table-heading hbar-app-ui-table-heading">
        <span>{content.columns.model}</span>
        <span>{content.columns.share}</span>
        <span>{content.columns.spend}</span>
        <span>{content.columns.change}</span>
      </div>
      <UsageCollectionView
        content={content}
        items={content.rows}
        render={(row) => (
          <div className="lumen-usage-model-row hbar-app-ui-model-spend-row hbar-settings-usage-model-row">
            <strong>{row.model}</strong>
            <UsageProgress value={row.share} label={row.shareLabel} />
            <span>{row.spend}</span>
            <b data-direction={row.direction}>
              {row.direction !== 'unchanged' ? (
                <UsageGlyph name={row.direction === 'down' ? 'trend-down' : 'trend-up'} />
              ) : null}
              {row.change}
            </b>
          </div>
        )}
      />
    </UsageFrame>
  )
}

export function LumenUsageRateLimits(content: LumenUsageRateLimitsContent) {
  if (content.panel) {
    return <UsageRatePanel heading={content} panel={content.panel} />
  }
  return (
    <UsageFrame content={content} variant={3}>
      {content.tier ? <UsageChoiceControl choice={content.tier} /> : null}
      <div className="lumen-usage-meter-list hbar-app-ui-rate-limits">
        {content.meters.length > 0 ? (
          uniqueLumenUsageItems(content.meters).map((meter) => <UsageMeterCard key={meter.id} meter={meter} />)
        ) : (
          <LumenText as="p" tone="muted">
            {content.emptyLabel}
          </LumenText>
        )}
      </div>
    </UsageFrame>
  )
}

export function LumenUsageSeats(content: LumenUsageSeatContent) {
  if (content.members) {
    return <UsageMemberList content={content} members={content.members} />
  }
  return (
    <UsageFrame content={content} variant={4}>
      <div className="lumen-usage-search hbar-app-ui-inline-search">
        <UsageGlyph name="search" />
        <LumenInput
          value={content.query}
          onChange={(event) => content.onQueryChange(event.currentTarget.value)}
          placeholder={content.searchLabel}
          aria-label={content.searchLabel}
        />
      </div>
      {content.filter ? (
        <UsageActionButton action={content.filter}>
          <UsageGlyph name="filter" />
        </UsageActionButton>
      ) : null}
      <UsageCollectionView
        content={content}
        items={content.rows}
        render={(row) => (
          <article className="lumen-usage-seat-row hbar-app-ui-spotlight hbar-app-ui-seat-usage-row">
            <span className="lumen-usage-avatar hbar-app-ui-avatar">{row.initials}</span>
            <div>
              <strong>{row.name}</strong>
              <LumenText as="small" tone="muted">
                {row.detail}
              </LumenText>
            </div>
            <UsageProgress value={row.progress} label={row.progressLabel} />
            <b>{row.spend}</b>
          </article>
        )}
      />
    </UsageFrame>
  )
}

export function LumenUsageBudget(content: LumenUsageBudgetContent) {
  if (content.panel) {
    return <UsageBudgetPanel heading={content} panel={content.panel} />
  }
  return (
    <UsageFrame content={content} variant={5}>
      {content.status ? <LumenStatus value={content.status.label} tone={usageTone(content.status.tone)} /> : null}
      <form
        className="lumen-usage-budget-form hbar-app-ui-budget-form"
        aria-busy={content.busy}
        onSubmit={(event) => {
          event.preventDefault()
          if (!content.busy && content.canSave) {
            content.onSave()
          }
        }}
      >
        <label className="lumen-usage-cap">
          <LumenText as="span" variant="label">
            {content.labels.cap}
          </LumenText>
          <output>{content.cap.display}</output>
          <LumenInput
            aria-label={content.labels.cap}
            type={content.cap.input}
            min={content.cap.minimum}
            max={content.cap.maximum}
            step={content.cap.step}
            value={content.cap.value}
            onChange={(event) => content.onCapChange(event.currentTarget.value)}
            disabled={content.busy}
          />
        </label>
        {content.threshold ? <UsageChoiceControl choice={content.threshold} disabled={content.busy} /> : null}
        {content.hardStop ? (
          <div className="lumen-usage-toggle-row hbar-app-ui-toggle-row">
            <LumenText as="span" variant="label">
              {content.hardStop.label}
            </LumenText>
            <LumenToggleControl
              size="s"
              aria-label={content.hardStop.label}
              checked={content.hardStop.checked}
              disabled={content.busy}
              onChange={(event) => content.hardStop?.onChange(event.currentTarget.checked)}
            />
          </div>
        ) : null}
        {content.error ? (
          <LumenText as="p" tone="danger" role="alert">
            {content.error}
          </LumenText>
        ) : null}
        <div className="lumen-usage-actions hbar-app-ui-usage-actions">
          {content.clear ? <UsageActionButton action={content.clear} /> : null}
          <LumenButton type="submit" tone="primary" loading={content.busy} disabled={!content.canSave}>
            {content.busy ? content.labels.saving : content.labels.save}
          </LumenButton>
        </div>
      </form>
    </UsageFrame>
  )
}

export function LumenUsageOverage(content: LumenUsageOverageContent) {
  if (content.panel) {
    return <UsageOveragePanel heading={content} panel={content.panel} />
  }
  return (
    <UsageFrame content={content} variant={6}>
      <LumenStatus value={content.status} tone="warning" />
      <div className="lumen-usage-overage hbar-app-ui-overage-split">
        {uniqueLumenUsageItems(content.meters).map((meter) => (
          <UsageMeterCard key={meter.id} meter={meter} />
        ))}
      </div>
      {content.plan ? <UsageChoiceControl choice={content.plan} /> : null}
      {content.review ? <UsageActionButton action={content.review} /> : null}
    </UsageFrame>
  )
}

export function LumenUsageRequestLog(content: LumenUsageRequestLogContent) {
  if (content.table) return <UsageRequestTable heading={content} table={content.table} />
  return (
    <UsageFrame content={content} variant={7}>
      {content.filter ? (
        <UsageActionButton action={content.filter}>
          <UsageGlyph name="filter" />
        </UsageActionButton>
      ) : null}
      <UsageCollectionView
        content={content}
        items={content.rows}
        render={(row) => (
          <LumenDisclosure
            className="lumen-usage-request hbar-app-ui-request-row"
            summary={
              <span className="lumen-usage-request-summary">
                <UsageGlyph name="down" />
                <code>{row.id}</code>
                <span>{row.tokens}</span>
                <span>{row.latency}</span>
                <b>{row.cost}</b>
              </span>
            }
            aria-label={row.expandLabel}
          >
            <pre>{row.details}</pre>
          </LumenDisclosure>
        )}
      />
    </UsageFrame>
  )
}

export function LumenUsageCompact(content: LumenUsageCompactContent) {
  if (content.density === 'inline') {
    return (
      <section className="hbar-app-ui-inline-usage" aria-label={content.title} title={content.description}>
        <div className="hbar-app-ui-inline-usage-summary">
          <strong>{content.value}</strong>
          <span>{content.detail}</span>
        </div>
        <dl>
          {uniqueLumenUsageItems(content.metrics).map((metric) => (
            <div key={metric.id}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
        {content.action ? <UsageActionButton action={content.action} /> : null}
      </section>
    )
  }
  if (content.widget) return <UsageCompactWidget content={content} widget={content.widget} />
  return (
    <UsageFrame content={content} variant={8}>
      {content.action ? <UsageActionButton action={content.action} /> : null}
      <div className="lumen-usage-compact hbar-app-ui-compact-usage">
        <div className="lumen-usage-sparkline hbar-app-ui-sparkline" role="img" aria-label={content.sparklineLabel}>
          {uniqueLumenUsageItems(content.sparkline).map((point) => (
            <i
              key={point.id}
              style={{
                blockSize: `${Math.max(0, Math.min(1, Number.isFinite(point.value) ? point.value : 0)) * 100}%`,
              }}
            />
          ))}
        </div>
        <strong>{content.value}</strong>
        <LumenText as="small" tone="muted">
          {content.detail}
        </LumenText>
        {content.progress !== undefined ? (
          <UsageProgress value={content.progress} label={content.progressLabel} tone={content.tone} />
        ) : null}
        <div className="lumen-usage-secondary-metrics hbar-app-ui-secondary-meters">
          {uniqueLumenUsageItems(content.metrics).map((metric) => (
            <span key={metric.id}>
              {metric.label}
              <b>{metric.value}</b>
            </span>
          ))}
        </div>
      </div>
    </UsageFrame>
  )
}

export interface UsageRootProps extends Omit<LumenUsageProps, 'content'> {
  readonly presentation?: LumenUsageContent['presentation'] | undefined
  readonly children: React.ReactNode
  readonly chartOverview: boolean
  readonly modelTable: boolean
  readonly ratePanel: boolean
  readonly memberList: boolean
  readonly budgetPanel: boolean
  readonly overagePanel: boolean
  readonly requestTable: boolean
  readonly compactWidget: boolean
}

function UsageRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
  chartOverview,
  modelTable,
  ratePanel,
  memberList,
  budgetPanel,
  overagePanel,
  requestTable,
  compactWidget,
  presentation,
}: UsageRootProps) {
  const detailed =
    chartOverview ||
    modelTable ||
    ratePanel ||
    memberList ||
    budgetPanel ||
    overagePanel ||
    requestTable ||
    compactWidget
  const contentClassName = [
    'lumen-usage',
    presentation ? 'lumen-usage-preview' : '',
    'hbar-app-ui-usage-catalog',
    compactWidget ? 'lumen-usage-widget-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    requestTable ? 'lumen-usage-request-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    overagePanel ? 'lumen-usage-overage-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    chartOverview ? 'lumen-usage-chart-stage hbar-app-ui-stage-padding-owner' : '',
    modelTable ? 'lumen-usage-model-stage hbar-app-ui-stage-padding-owner' : '',
    budgetPanel ? 'lumen-usage-budget-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    memberList ? 'lumen-usage-member-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    ratePanel ? 'lumen-usage-rate-stage hbar-app-ui-stage-padding-owner hbar-app-ui-full-canvas-owner' : '',
    `hbar-app-ui-usage-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as={detailed ? 'div' : 'section'}
      boundary={detailed ? 'none' : 'horizontal'}
      className={`lumen-usage-root-surface${presentation ? ' lumen-usage-preview-root' : ''}${chartOverview ? ' lumen-usage-chart-surface' : ''}${modelTable ? ' lumen-usage-model-surface' : ''}${ratePanel ? ' lumen-usage-rate-surface' : ''}${memberList ? ' lumen-usage-member-surface' : ''}${budgetPanel ? ' lumen-usage-budget-surface' : ''}${overagePanel ? ' lumen-usage-overage-surface' : ''}${requestTable ? ' lumen-usage-request-surface' : ''}${compactWidget ? ' lumen-usage-widget-surface' : ''}`}
      contentClassName={contentClassName}
      data-lumen-component="usage"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {presentation?.notice ? (
        <p className="lumen-usage-preview-notice" role="status">
          {presentation.notice}
        </p>
      ) : null}
      {children}
    </LumenSurface>
  )
}

export function LumenUsage(props: LumenUsageProps) {
  const providerContent = useLumenUsageContent()
  const content = props.content ?? providerContent
  let view: React.ReactNode = null
  if (props.variant === 1 && content.overview) {
    view = <LumenUsageOverview {...content.overview} />
  }
  if (props.variant === 2 && content.modelSpend) {
    view = <LumenUsageModelSpend {...content.modelSpend} />
  }
  if (props.variant === 3 && content.rateLimits) {
    view = <LumenUsageRateLimits {...content.rateLimits} />
  }
  if (props.variant === 4 && content.seats) {
    view = <LumenUsageSeats {...content.seats} />
  }
  if (props.variant === 5 && content.budget) {
    view = <LumenUsageBudget {...content.budget} />
  }
  if (props.variant === 6 && content.overage) {
    view = <LumenUsageOverage {...content.overage} />
  }
  if (props.variant === 7 && content.requests) {
    view = <LumenUsageRequestLog {...content.requests} />
  }
  if (props.variant === 8 && content.compact) {
    view = <LumenUsageCompact {...content.compact} />
  }
  return (
    <UsageRoot
      {...props}
      key={content.presentation?.ownerId ?? props.variantId}
      presentation={content.presentation}
      chartOverview={props.variant === 1 && Boolean(content.overview?.chart)}
      modelTable={props.variant === 2 && Boolean(content.modelSpend?.table)}
      ratePanel={props.variant === 3 && Boolean(content.rateLimits?.panel)}
      memberList={props.variant === 4 && Boolean(content.seats?.members)}
      budgetPanel={props.variant === 5 && Boolean(content.budget?.panel)}
      overagePanel={props.variant === 6 && Boolean(content.overage?.panel)}
      requestTable={props.variant === 7 && Boolean(content.requests?.table)}
      compactWidget={props.variant === 8 && content.compact?.density !== 'inline' && Boolean(content.compact?.widget)}
    >
      {view}
    </UsageRoot>
  )
}

function createUsageVariant(variant: number) {
  function Component(props: LumenUsageVariantProps) {
    return <LumenUsage {...props} variant={variant} variantId={`hbar-app-ui-ai-usage-${variant}`} />
  }
  Component.displayName = `LumenUsage${String(variant).padStart(2, '0')}`
  return Component
}

export const LumenUsage01 = createUsageVariant(1)

export const LumenUsage02 = createUsageVariant(2)

export const LumenUsage03 = createUsageVariant(3)

export const LumenUsage04 = createUsageVariant(4)

export const LumenUsage05 = createUsageVariant(5)

export const LumenUsage06 = createUsageVariant(6)

export const LumenUsage07 = createUsageVariant(7)

export const LumenUsage08 = createUsageVariant(8)
