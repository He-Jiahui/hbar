'use client'

import * as React from 'react'
import { LumenSelect } from './forms'
import type { LumenSchedulingAction, LumenSchedulingChoice, LumenSchedulingListStrategy } from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-range-reference.css'

export interface LumenSchedulingRangeReferenceContent {
  readonly person: { readonly initials: string; readonly name: string; readonly role: string }
  readonly labels: {
    readonly more: string
    readonly start: string
    readonly end: string
    readonly duration: string
    readonly cancel: string
    readonly apply: string
    readonly emptyStart: string
    readonly emptyEnd: string
    readonly emptyDurations: string
    /** The Host owns grammar and inline placement of the emphasized duration. */
    readonly summary: (duration: React.ReactNode) => React.ReactNode
  }
  /** Native option lists retain all Host records and use browser-owned scrolling. */
  readonly starts: readonly LumenSchedulingChoice[]
  readonly ends: readonly LumenSchedulingChoice[]
  readonly durations: readonly LumenSchedulingChoice[]
  readonly startId: string
  readonly endId: string
  readonly durationId: string
  readonly durationStrategy: LumenSchedulingListStrategy
  readonly onStartChange?: ((id: string) => void) | undefined
  readonly onEndChange?: ((id: string) => void) | undefined
  readonly onDurationChange?: ((id: string) => void) | undefined
}

function RangeIcon({ kind }: { readonly kind: 'more' | 'info' }): React.ReactElement {
  return (
    <svg className={`lumen-scheduling-range-icon is-${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'more' ? (
        <React.Fragment>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </React.Fragment>
      ) : (
        <React.Fragment>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 12v4M12 8h.01" />
        </React.Fragment>
      )}
    </svg>
  )
}

function RangeChoice({
  id,
  label,
  empty,
  items,
  value,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly empty: string
  readonly items: readonly LumenSchedulingChoice[]
  readonly value: string
  readonly onChange: ((id: string) => void) | undefined
}): React.ReactElement {
  const options = uniqueLumenSchedulingItems(items)
  const selected = selectLumenSchedulingItem(options, value)
  return (
    <div className="lumen-scheduling-range-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <LumenSelect
          id={id}
          variant="plain"
          value={selected?.id ?? ''}
          disabled={!options.length}
          className="lumen-scheduling-range-select"
          onChange={(event) => onChange?.(event.currentTarget.value)}
        >
          {options.length ? (
            options.map((option) => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          ) : (
            <option value="">{empty}</option>
          )}
        </LumenSelect>
      </div>
    </div>
  )
}

export function LumenSchedulingRangeReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingRangeReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const instanceId = React.useId()
  const durations = uniqueLumenSchedulingItems(content.durations)
  const duration = selectLumenSchedulingItem(durations, content.durationId)
  return (
    <section className="lumen-scheduling-range-card">
      <header data-hbar-app-ui-region="range-person">
        <span className="lumen-scheduling-range-avatar" aria-hidden="true">
          {content.person.initials}
        </span>
        <div>
          <p>{content.person.name}</p>
          <p>{content.person.role}</p>
        </div>
        <button type="button" aria-label={content.labels.more} onClick={() => onAction?.({ actionId: 'more-options' })}>
          <RangeIcon kind="more" />
        </button>
      </header>
      <div className="lumen-scheduling-range-body">
        <div className="lumen-scheduling-range-times" data-hbar-app-ui-region="range-times">
          <RangeChoice
            id={`${instanceId}-start`}
            label={content.labels.start}
            empty={content.labels.emptyStart}
            items={content.starts}
            value={content.startId}
            onChange={content.onStartChange}
          />
          <RangeChoice
            id={`${instanceId}-end`}
            label={content.labels.end}
            empty={content.labels.emptyEnd}
            items={content.ends}
            value={content.endId}
            onChange={content.onEndChange}
          />
        </div>
        <p className="lumen-scheduling-range-duration-label">{content.labels.duration}</p>
        <div
          className="lumen-scheduling-range-durations"
          role="radiogroup"
          aria-label={content.labels.duration}
          data-hbar-app-ui-list-strategy={content.durationStrategy.kind}
        >
          {durations.length ? (
            durations.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={duration?.id === option.id}
                disabled={option.disabled}
                data-hbar-app-ui-action="select-duration"
                data-hbar-app-ui-target={option.id}
                onClick={() => {
                  content.onDurationChange?.(option.id)
                  onAction?.({ actionId: 'select-duration', value: option.id })
                }}
              >
                {option.label}
              </button>
            ))
          ) : (
            <p>{content.labels.emptyDurations}</p>
          )}
        </div>
      </div>
      <footer data-hbar-app-ui-region="range-footer">
        <p>
          <RangeIcon kind="info" />
          <span>
            {content.labels.summary(
              <span className="lumen-scheduling-range-summary-value">
                {duration?.label ?? content.labels.emptyDurations}
              </span>,
            )}
          </span>
        </p>
        <div className="lumen-scheduling-range-actions">
          <button type="button" onClick={() => onAction?.({ actionId: 'cancel' })}>
            {content.labels.cancel}
          </button>
          <button type="button" className="is-apply" onClick={() => onAction?.({ actionId: 'apply' })}>
            {content.labels.apply}
          </button>
        </div>
      </footer>
    </section>
  )
}
