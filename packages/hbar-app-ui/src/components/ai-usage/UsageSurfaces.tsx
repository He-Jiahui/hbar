import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Gauge, Search, SlidersHorizontal } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import {
  HbarAppUiButton,
  HbarAppUiMetricStrip,
  HbarAppUiProgress,
  HbarAppUiSpotlight,
  HbarAppUiStatus,
  HbarAppUiTabs,
} from '../../primitives'
import { HbarAppUiVirtualList } from '../../VirtualList'
import { uniqueItems } from '../../collection'
import type {
  HbarAppUiBudgetSettingsContent,
  HbarAppUiCompactUsageContent,
  HbarAppUiModelSpendContent,
  HbarAppUiOverageContent,
  HbarAppUiRateLimitsContent,
  HbarAppUiSeatUsageContent,
  HbarAppUiUsageOverviewContent,
  HbarAppUiUsageRequestLogContent,
  UsageAction,
  UsageChoice,
  UsageCollection,
  UsageHeading,
  UsageMeter,
} from './UsageContent'
import './UsageSurfaces.css'

function Frame({
  content,
  variant,
  children,
}: {
  readonly content: UsageHeading
  readonly variant: number
  readonly children: ReactNode
}) {
  return (
    <section className={`hbar-app-ui-usage-content hbar-app-ui-usage-variant-${variant}`} aria-label={content.title}>
      <header className="hbar-app-ui-toolbar">
        <div>
          <h2>{content.title}</h2>
          <small>{content.description}</small>
        </div>
      </header>
      {children}
    </section>
  )
}
function Action({ action, children }: { readonly action: UsageAction; readonly children?: ReactNode }) {
  return (
    <HbarAppUiButton type="button" disabled={action.disabled} onClick={action.onInvoke}>
      {children}
      {action.label}
    </HbarAppUiButton>
  )
}
function Choice({ choice, disabled = false }: { readonly choice: UsageChoice; readonly disabled?: boolean }) {
  return (
    <label>
      {choice.label}
      <select
        aria-label={choice.label}
        value={choice.options.some((option) => option.id === choice.value) ? choice.value : ''}
        disabled={disabled}
        onChange={(event) => choice.onChange(event.target.value)}
      >
        <option value="" hidden disabled />
        {uniqueItems(choice.options).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
function Meter({ meter }: { readonly meter: UsageMeter }) {
  return (
    <HbarAppUiSpotlight>
      <div>
        <strong>{meter.label}</strong>
        <b>{meter.value}</b>
      </div>
      <HbarAppUiProgress value={meter.progress} label={meter.progressLabel} tone={meter.tone} />
      <small>{meter.detail}</small>
    </HbarAppUiSpotlight>
  )
}
function Collection<T extends { readonly id: string }>({
  content,
  items,
  render,
}: {
  readonly content: UsageCollection & UsageHeading
  readonly items: readonly T[]
  readonly render: (item: T) => ReactNode
}) {
  const records = uniqueItems(items),
    empty = <p>{content.emptyLabel}</p>
  return content.strategy === 'virtual' ? (
    <HbarAppUiVirtualList items={records} label={content.title} empty={empty} renderRow={render} />
  ) : records.length ? (
    <div role="list" className="hbar-app-ui-usage-list">
      {records.map((item) => (
        <div role="listitem" key={item.id}>
          {render(item)}
        </div>
      ))}
    </div>
  ) : (
    empty
  )
}
export function HbarAppUiUsageOverview(content: HbarAppUiUsageOverviewContent) {
  return (
    <Frame content={content} variant={1}>
      {content.range && (
        <HbarAppUiTabs
          label={content.range.label}
          value={content.range.value}
          options={uniqueItems(content.range.options)}
          onChange={content.range.onChange}
        />
      )}
      <HbarAppUiMetricStrip metrics={content.metrics} />
      <div className="hbar-app-ui-stacked-bars">
        {uniqueItems(content.meters).map((meter) => (
          <Meter key={meter.id} meter={meter} />
        ))}
      </div>
    </Frame>
  )
}
export function HbarAppUiModelSpend(content: HbarAppUiModelSpendContent) {
  return (
    <Frame content={content} variant={2}>
      {content.sort && (
        <Action action={content.sort}>
          <HbarAppUiIcon icon={SlidersHorizontal} tier="sm" />
        </Action>
      )}
      <div className="hbar-app-ui-table-heading">
        <span>{content.columns.model}</span>
        <span>{content.columns.share}</span>
        <span>{content.columns.spend}</span>
        <span>{content.columns.change}</span>
      </div>
      <Collection
        content={content}
        items={content.rows}
        render={(row) => (
          <div className="hbar-app-ui-model-spend-row">
            <strong>{row.model}</strong>
            <HbarAppUiProgress value={row.share} label={row.shareLabel} />
            <span>{row.spend}</span>
            <b className={`is-${row.direction}`}>
              {row.direction !== 'unchanged' && (
                <HbarAppUiIcon icon={row.direction === 'down' ? ArrowDown : ArrowUp} tier="xs" />
              )}
              {row.change}
            </b>
          </div>
        )}
      />
    </Frame>
  )
}
export function HbarAppUiRateLimits(content: HbarAppUiRateLimitsContent) {
  return (
    <Frame content={content} variant={3}>
      {content.tier && <Choice choice={content.tier} />}
      <div className="hbar-app-ui-rate-limits">
        {content.meters.length ? (
          uniqueItems(content.meters).map((meter) => (
            <div key={meter.id}>
              <HbarAppUiIcon icon={Gauge} tier="sm" />
              <Meter meter={meter} />
            </div>
          ))
        ) : (
          <p>{content.emptyLabel}</p>
        )}
      </div>
    </Frame>
  )
}
export function HbarAppUiSeatUsage(content: HbarAppUiSeatUsageContent) {
  return (
    <Frame content={content} variant={4}>
      <div className="hbar-app-ui-inline-search">
        <HbarAppUiIcon icon={Search} tier="sm" />
        <input
          value={content.query}
          onChange={(event) => content.onQueryChange(event.target.value)}
          placeholder={content.searchLabel}
          aria-label={content.searchLabel}
        />
      </div>
      {content.filter && <Action action={content.filter} />}
      <Collection
        content={content}
        items={content.rows}
        render={(row) => (
          <HbarAppUiSpotlight className="hbar-app-ui-seat-usage-row">
            <span className="hbar-app-ui-avatar">{row.initials}</span>
            <div>
              <strong>{row.name}</strong>
              <small>{row.detail}</small>
            </div>
            <HbarAppUiProgress value={row.progress} label={row.progressLabel} />
            <b>{row.spend}</b>
          </HbarAppUiSpotlight>
        )}
      />
    </Frame>
  )
}
export function HbarAppUiBudgetSettings(content: HbarAppUiBudgetSettingsContent) {
  return (
    <Frame content={content} variant={5}>
      {content.status && <HbarAppUiStatus value={content.status.label} tone={content.status.tone} />}
      <form
        className="hbar-app-ui-budget-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!content.busy && content.canSave) content.onSave()
        }}
        aria-busy={content.busy}
      >
        <label>
          {content.labels.cap}
          <output>{content.cap.display}</output>
          <input
            aria-label={content.labels.cap}
            type={content.cap.input}
            min={content.cap.minimum}
            max={content.cap.maximum}
            step={content.cap.step}
            value={content.cap.value}
            onChange={(event) => content.onCapChange(event.target.value)}
            disabled={content.busy}
          />
        </label>
        {content.threshold && <Choice choice={content.threshold} disabled={content.busy} />}
        {content.hardStop && (
          <label className="hbar-app-ui-toggle-row">
            <span>{content.hardStop.label}</span>
            <button
              type="button"
              role="switch"
              aria-label={content.hardStop.label}
              aria-checked={content.hardStop.checked}
              disabled={content.busy}
              className={`hbar-app-ui-switch ${content.hardStop.checked ? 'is-on' : ''}`}
              onClick={() => content.hardStop?.onChange(!content.hardStop.checked)}
            >
              <i />
            </button>
          </label>
        )}
        {content.error && <p role="alert">{content.error}</p>}
        <div className="hbar-app-ui-usage-actions">
          {content.clear && <Action action={content.clear} />}
          <HbarAppUiButton type="submit" tone="accent" disabled={content.busy || !content.canSave}>
            {content.busy ? content.labels.saving : content.labels.save}
          </HbarAppUiButton>
        </div>
      </form>
    </Frame>
  )
}
export function HbarAppUiUsageOverage(content: HbarAppUiOverageContent) {
  return (
    <Frame content={content} variant={6}>
      <HbarAppUiStatus value={content.status} tone="warning" />
      <div className="hbar-app-ui-overage-split">
        {uniqueItems(content.meters).map((meter) => (
          <Meter key={meter.id} meter={meter} />
        ))}
      </div>
      {content.plan && <Choice choice={content.plan} />}
      {content.review && <Action action={content.review} />}
    </Frame>
  )
}
export function HbarAppUiUsageRequestLog(content: HbarAppUiUsageRequestLogContent) {
  const [openId, setOpenId] = useState<string>()
  return (
    <Frame content={content} variant={7}>
      {content.filter && <Action action={content.filter} />}
      <Collection
        content={content}
        items={content.rows}
        render={(row) => (
          <div className={`hbar-app-ui-request-row ${row.id === openId ? 'is-open' : ''}`}>
            <button
              type="button"
              aria-label={row.expandLabel}
              aria-expanded={openId === row.id}
              onClick={() => setOpenId(openId === row.id ? undefined : row.id)}
            >
              <HbarAppUiIcon icon={ChevronDown} tier="sm" />
              <code>{row.id}</code>
              <span>{row.tokens}</span>
              <span>{row.latency}</span>
              <b>{row.cost}</b>
            </button>
            {openId === row.id && <pre>{row.details}</pre>}
          </div>
        )}
      />
    </Frame>
  )
}
export function HbarAppUiCompactUsage(content: HbarAppUiCompactUsageContent) {
  return (
    <Frame content={content} variant={8}>
      {content.action && <Action action={content.action} />}
      <div className="hbar-app-ui-compact-usage">
        <div className="hbar-app-ui-sparkline" role="img" aria-label={content.sparklineLabel}>
          {uniqueItems(content.sparkline).map((point) => (
            <i
              key={point.id}
              style={{
                blockSize: `${Math.max(0, Math.min(1, Number.isFinite(point.value) ? point.value : 0)) * 100}%`,
              }}
            />
          ))}
        </div>
        <strong>{content.value}</strong>
        <small>{content.detail}</small>
        <HbarAppUiProgress value={content.progress} label={content.progressLabel} tone={content.tone} />
        <div className="hbar-app-ui-secondary-meters">
          {uniqueItems(content.metrics).map((metric) => (
            <span key={metric.id}>
              {metric.label}
              <b>{metric.value}</b>
            </span>
          ))}
        </div>
      </div>
    </Frame>
  )
}
