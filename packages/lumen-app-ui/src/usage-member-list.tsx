'use client'

import { Search } from 'lucide-react'
import { LumenInput } from './forms'
import LumenField from './LumenField'
import { LumenButton } from './primitives'
import type { LumenUsageChoice, LumenUsageSeatContent, LumenUsageSeatRow } from './usage'
import './usage-member-list.css'

export interface LumenUsageMemberRow extends Omit<LumenUsageSeatRow, 'filterId'> {
  readonly capacity: string
  readonly nearCapacity: boolean
}
export interface LumenUsageMemberListContent {
  /** Content-grown, normally seven members; hosts page inventories above 50.
   * No supplied row is silently dropped by this renderer.
   */
  readonly rows: readonly LumenUsageMemberRow[]
  readonly team?: LumenUsageChoice | undefined
  readonly emptyDescription: string
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
export interface UsageMemberListProps {
  readonly content: LumenUsageSeatContent
  readonly members: LumenUsageMemberListContent
}
export function UsageMemberList({ content, members }: UsageMemberListProps) {
  const rows = [...new Map(members.rows.map((row) => [row.id, row])).values()]
  const team = members.team
  const pagination = members.pagination
  return (
    <div className="lumen-usage-member-list hbar-app-ui-usage-variant-4">
      <div className="lumen-usage-member-heading">
        <div>
          <h2>{content.title}</h2>
          <p>{content.description}</p>
        </div>
        <LumenField boundary="horizontal" className="lumen-usage-member-search">
          <div className="lumen-usage-member-search-content">
            <Search aria-hidden="true" />
            <LumenInput
              type="search"
              size="s"
              variant="plain"
              value={content.query}
              placeholder={content.searchLabel}
              aria-label={content.searchLabel}
              onChange={(event) => content.onQueryChange(event.currentTarget.value)}
            />
          </div>
        </LumenField>
      </div>
      <div className="lumen-usage-member-frame">
        {team ? (
          <div className="lumen-usage-member-tabs" role="tablist" aria-label={team.label}>
            {[...new Map(team.options.map((option) => [option.id, option])).values()].map((option) => (
              <LumenButton
                key={option.id}
                type="button"
                variant="text"
                size="s"
                role="tab"
                indicatorState={option.id === team.value ? 'selected' : 'idle'}
                aria-selected={option.id === team.value}
                onClick={() => team.onChange(option.id)}
              >
                {option.label}
              </LumenButton>
            ))}
          </div>
        ) : null}
        <div className="lumen-usage-member-records" data-lumen-list-strategy="content-grown">
          {rows.length ? (
            rows.map((row) => (
              <div className="lumen-usage-member-row" data-member-id={row.id} key={row.id}>
                <span className="lumen-usage-member-avatar" aria-hidden="true">
                  {row.initials}
                </span>
                <div className="lumen-usage-member-identity">
                  <p>{row.name}</p>
                  <p>{row.detail}</p>
                </div>
                <div className="lumen-usage-member-capacity">
                  <div className="lumen-usage-member-track" aria-hidden="true">
                    <div
                      data-near-capacity={row.nearCapacity}
                      style={{
                        inlineSize: `${Number.isFinite(row.progress) ? Math.max(0, Math.min(100, row.progress)) : 0}%`,
                      }}
                    />
                  </div>
                  <p>{row.capacity}</p>
                </div>
                <p className="lumen-usage-member-spend">{row.spend}</p>
              </div>
            ))
          ) : (
            <div className="lumen-usage-member-empty">
              <p>{content.emptyLabel}</p>
              <p>{members.emptyDescription}</p>
            </div>
          )}
        </div>
      </div>
      {pagination ? (
        <div className="lumen-usage-member-pagination">
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
