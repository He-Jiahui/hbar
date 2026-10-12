'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { LumenButton } from './primitives'
import type { LumenUsageChoice, LumenUsageHeading } from './usage'
import './usage-request-table.css'

export interface LumenUsageRequestRecord {
  readonly id: string
  readonly time: string
  readonly endpoint: string
  readonly model: string
  readonly mobileSummary: string
  readonly tokens: string
  readonly latency: string
  readonly cost: string
  readonly status: 'success' | 'capped' | 'error'
  /** Short content-grown detail facts, normally six; recommended maximum twelve. */
  readonly details: readonly {
    readonly id: string
    readonly label: string
    readonly value: string
  }[]
}
export interface LumenUsageRequestTableContent {
  /** Content-grown current page, normally eight calls. Hosts page collections above 50. */
  readonly rows: readonly LumenUsageRequestRecord[]
  readonly filter: LumenUsageChoice
  readonly expandedId: string | null
  readonly onToggle: (id: string) => void
  /** Optional independent action for opening the source session/run. */
  readonly openLabel?: string | undefined
  readonly onOpen?: ((id: string) => void) | undefined
  readonly columns: {
    readonly time: string
    readonly request: string
    readonly model: string
    readonly tokens: string
    readonly latency: string
    readonly cost: string
  }
  readonly emptyLabel: string
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
export interface UsageRequestTableProps {
  readonly heading: LumenUsageHeading
  readonly table: LumenUsageRequestTableContent
}
export function UsageRequestTable({ heading, table }: UsageRequestTableProps) {
  const rows = [...new Map(table.rows.map((row) => [row.id, row])).values()]
  const filter = table.filter,
    columns = table.columns,
    pagination = table.pagination
  return (
    <div className="lumen-usage-request-table hbar-app-ui-usage-variant-7">
      <div className="lumen-usage-request-heading">
        <div>
          <h2>{heading.title}</h2>
          <p>{heading.description}</p>
        </div>
        <div className="lumen-usage-request-tabs" role="tablist" aria-label={filter.label}>
          {[...new Map(filter.options.map((option) => [option.id, option])).values()].map((option) => (
            <LumenButton
              key={option.id}
              size="s"
              variant="text"
              role="tab"
              aria-selected={option.id === filter.value}
              indicatorState={option.id === filter.value ? 'selected' : 'idle'}
              onClick={() => filter.onChange(option.id)}
            >
              {option.label}
            </LumenButton>
          ))}
        </div>
      </div>
      <div className="lumen-usage-request-frame">
        <div className="lumen-usage-request-records" data-lumen-list-strategy="content-grown">
          <div className="lumen-usage-request-columns">
            <span className="lumen-usage-request-time">{columns.time}</span>
            <span className="lumen-usage-request-endpoint">{columns.request}</span>
            <span className="lumen-usage-request-model">{columns.model}</span>
            <span className="lumen-usage-request-tokens">{columns.tokens}</span>
            <span className="lumen-usage-request-latency">{columns.latency}</span>
            <span className="lumen-usage-request-cost">{columns.cost}</span>
            <span className="lumen-usage-request-chevron" />
          </div>
          {rows.length ? (
            rows.map((row) => {
              const expanded = table.expandedId === row.id
              return (
                <div className="lumen-usage-request-entry" key={row.id} data-request-id={row.id}>
                  <LumenButton
                    className="lumen-usage-request-trigger"
                    variant="text"
                    indicator="none"
                    aria-expanded={expanded}
                    onClick={() => table.onToggle(row.id)}
                  >
                    <span className="lumen-usage-request-time">{row.time}</span>
                    <span className="lumen-usage-request-endpoint">
                      <span className="lumen-usage-request-dot" data-status={row.status} aria-hidden="true" />
                      <span>
                        <span>{row.endpoint}</span>
                        <span className="lumen-usage-request-mobile-summary">{row.mobileSummary}</span>
                      </span>
                    </span>
                    <span className="lumen-usage-request-model">{row.model}</span>
                    <span className="lumen-usage-request-tokens">{row.tokens}</span>
                    <span className="lumen-usage-request-latency">{row.latency}</span>
                    <span className="lumen-usage-request-cost">{row.cost}</span>
                    {expanded ? (
                      <ChevronUp className="lumen-usage-request-chevron" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="lumen-usage-request-chevron" aria-hidden="true" />
                    )}
                  </LumenButton>
                  {expanded ? (
                    <div className="lumen-usage-request-details">
                      {[...new Map(row.details.map((detail) => [detail.id, detail])).values()].map((detail) => (
                        <div key={detail.id}>
                          <p>{detail.label}</p>
                          <p title={detail.value}>{detail.value}</p>
                        </div>
                      ))}
                      {table.openLabel && table.onOpen ? (
                        <LumenButton size="s" variant="text" onClick={() => table.onOpen?.(row.id)}>
                          {table.openLabel}
                        </LumenButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })
          ) : (
            <p className="lumen-usage-request-empty">{table.emptyLabel}</p>
          )}
        </div>
      </div>
      {pagination ? (
        <div className="lumen-usage-request-pagination">
          <LumenButton size="s" variant="text" disabled={!pagination.canPrevious} onClick={pagination.onPrevious}>
            {pagination.previousLabel}
          </LumenButton>
          <p>{pagination.label}</p>
          <LumenButton size="s" variant="text" disabled={!pagination.canNext} onClick={pagination.onNext}>
            {pagination.nextLabel}
          </LumenButton>
        </div>
      ) : null}
    </div>
  )
}
