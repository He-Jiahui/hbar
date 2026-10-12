'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { LumenButton } from './primitives'
import type { LumenUsageChoice, LumenUsageHeading } from './usage'
import './usage-model-table.css'

export interface LumenUsageModelTableRow {
  readonly id: string
  readonly model: string
  readonly provider: string
  readonly requests: string
  readonly input: string
  readonly output: string
  readonly compactSummary: string
  readonly cost: string
  readonly change: string
  readonly direction: 'up' | 'down' | 'unchanged'
  /** Percentage of the current sorting metric's maximum, supplied by the host. */
  readonly share: number
  readonly shareEmphasis: boolean
}

export interface LumenUsageModelTableContent {
  /** Content-grown for short model catalogs (normally six, recommended maximum 50).
   * Larger catalogs must be host-paged; this view never silently drops records.
   */
  readonly rows: readonly LumenUsageModelTableRow[]
  readonly emptyLabel: string
  readonly columns: {
    readonly model: string
    readonly requests: string
    readonly input: string
    readonly output: string
    readonly share: string
    readonly cost: string
  }
  readonly sortBy?: LumenUsageChoice | undefined
  readonly pagination?:
    | {
        readonly label: string
        readonly previousLabel: string
        readonly nextLabel: string
        readonly canPrevious: boolean
        readonly canNext: boolean
        readonly onPrevious: () => void
        readonly onNext: () => void
      }
    | undefined
}

export interface CostProps {
  readonly row: LumenUsageModelTableRow
  readonly className: string
}

function Cost({ row, className }: CostProps) {
  return (
    <div className={`lumen-usage-model-cost ${className}`}>
      <span>{row.cost}</span>
      <span className="lumen-usage-model-delta">
        {row.direction === 'up' ? (
          <ArrowUp aria-hidden="true" />
        ) : row.direction === 'down' ? (
          <ArrowDown aria-hidden="true" />
        ) : null}
        {row.change}
      </span>
    </div>
  )
}

export interface ModelRowProps {
  readonly row: LumenUsageModelTableRow
}

function ModelRow({ row }: ModelRowProps) {
  const share = Number.isFinite(row.share) ? Math.min(100, Math.max(0, row.share)) : 0
  return (
    <div className="lumen-usage-model-table-row" data-model-id={row.id}>
      <div className="lumen-usage-model-identity">
        <div className="lumen-usage-model-name">
          <p>{row.model}</p>
          <p>{row.provider}</p>
        </div>
        <Cost row={row} className="lumen-usage-model-mobile-cost" />
      </div>
      <p className="lumen-usage-model-summary">{row.compactSummary}</p>
      <p className="lumen-usage-model-number">{row.requests}</p>
      <p className="lumen-usage-model-number">{row.input}</p>
      <p className="lumen-usage-model-number">{row.output}</p>
      <div className="lumen-usage-model-share">
        <div data-emphasis={row.shareEmphasis} style={{ inlineSize: `${share}%` }} />
      </div>
      <Cost row={row} className="lumen-usage-model-desktop-cost" />
    </div>
  )
}

export interface UsageModelTableProps {
  readonly heading: LumenUsageHeading
  readonly table: LumenUsageModelTableContent
}

export function UsageModelTable({ heading, table }: UsageModelTableProps) {
  const rows = [...new Map(table.rows.map((row) => [row.id, row])).values()]
  const choice = table.sortBy
  const pagination = table.pagination
  return (
    <div className="lumen-usage-model-table hbar-app-ui-usage-variant-2">
      <div className="lumen-usage-model-heading">
        <div>
          <h2>{heading.title}</h2>
          <p>{heading.description}</p>
        </div>
        {choice ? (
          <div className="lumen-usage-model-tabs" role="tablist" aria-label={choice.label}>
            {[...new Map(choice.options.map((option) => [option.id, option])).values()].map((option) => (
              <LumenButton
                key={option.id}
                type="button"
                variant="text"
                size="s"
                indicatorState={option.id === choice.value ? 'selected' : 'idle'}
                role="tab"
                aria-selected={option.id === choice.value}
                onClick={() => choice.onChange(option.id)}
              >
                {option.label}
              </LumenButton>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lumen-usage-model-frame">
        <div className="lumen-usage-model-records">
          <div className="lumen-usage-model-columns">
            <span>{table.columns.model}</span>
            <span>{table.columns.requests}</span>
            <span>{table.columns.input}</span>
            <span>{table.columns.output}</span>
            <span>{table.columns.share}</span>
            <span>{table.columns.cost}</span>
          </div>
          {rows.length ? (
            rows.map((row) => <ModelRow key={row.id} row={row} />)
          ) : (
            <p className="lumen-usage-model-empty">{table.emptyLabel}</p>
          )}
        </div>
      </div>
      {pagination ? (
        <div className="lumen-usage-model-pagination">
          <LumenButton
            type="button"
            size="s"
            variant="text"
            disabled={!pagination.canPrevious}
            onClick={pagination.onPrevious}
          >
            {pagination.previousLabel}
          </LumenButton>
          <p>{pagination.label}</p>
          <LumenButton type="button" size="s" variant="text" disabled={!pagination.canNext} onClick={pagination.onNext}>
            {pagination.nextLabel}
          </LumenButton>
        </div>
      ) : null}
    </div>
  )
}
