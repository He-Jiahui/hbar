'use client'

import * as React from 'react'
import { LumenSelect } from './forms'
import type { LumenSchedulingAction, LumenSchedulingChoice, LumenSchedulingListStrategy } from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-month-reference.css'

export interface LumenSchedulingMonthReferenceDay {
  readonly id: string
  readonly label: string
  readonly selectable: boolean
  readonly hasEvents?: boolean | undefined
}
export interface LumenSchedulingMonthReferenceEvent {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly needsReply: boolean
  readonly participants: readonly { readonly id: string; readonly initials: string }[]
  readonly time: string
  readonly location: string
}
export interface LumenSchedulingMonthReferenceContent {
  readonly labels: {
    readonly previous: string
    readonly next: string
    readonly month: string
    readonly year: string
    readonly filter: string
    readonly add: string
    readonly dateTitle: (day: string) => string
    readonly summary: (events: number, awaitingReply: number) => string
    readonly emptyDays: string
    readonly emptyEvents: string
  }
  readonly months: readonly LumenSchedulingChoice[]
  readonly years: readonly LumenSchedulingChoice[]
  readonly filters: readonly LumenSchedulingChoice[]
  readonly monthId: string
  readonly yearId: string
  readonly filterId: string
  readonly weekdays: readonly LumenSchedulingChoice[]
  readonly days: readonly LumenSchedulingMonthReferenceDay[]
  readonly activeDayId: string
  readonly events: readonly LumenSchedulingMonthReferenceEvent[]
  /** Finite date cells grow in seven-column flow; Host owns the calendar range. */
  readonly dayStrategy: LumenSchedulingListStrategy
  /** Short agendas grow; larger explicit panes keep the header outside scrolling. */
  readonly eventStrategy: LumenSchedulingListStrategy
  readonly onDayChange?: ((id: string) => void) | undefined
  readonly onMonthChange?: ((id: string) => void) | undefined
  readonly onYearChange?: ((id: string) => void) | undefined
  readonly onFilterChange?: ((id: string) => void) | undefined
}
function MonthIcon({ kind }: { readonly kind: 'previous' | 'next' | 'add' | 'time' | 'location' }): React.ReactElement {
  const paths = {
    previous: 'm10 4-4 4 4 4',
    next: 'm6 4 4 4-4 4',
    add: 'M8 3v10M3 8h10',
    time: 'M8 4v4l3 2',
    location: 'M13 6c0 4-5 8-5 8S3 10 3 6a5 5 0 0 1 10 0Z',
  }
  return (
    <svg className={`lumen-scheduling-month-icon is-${kind}`} viewBox="0 0 16 16" aria-hidden="true">
      {kind === 'time' ? <circle cx="8" cy="8" r="6" /> : null}
      <path d={paths[kind]} />
      {kind === 'location' ? <circle cx="8" cy="6" r="1.5" /> : null}
    </svg>
  )
}
function MonthChoice({
  items,
  value,
  label,
  className,
  onChange,
}: {
  readonly items: readonly LumenSchedulingChoice[]
  readonly value: string
  readonly label: string
  readonly className: string
  readonly onChange: ((id: string) => void) | undefined
}): React.ReactElement {
  const options = uniqueLumenSchedulingItems(items)
  const selected = selectLumenSchedulingItem(options, value)
  return (
    <LumenSelect
      variant="plain"
      className={`lumen-scheduling-month-choice ${className}`}
      aria-label={label}
      value={selected?.id ?? ''}
      disabled={!options.length}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </LumenSelect>
  )
}
export function LumenSchedulingMonthReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingMonthReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const days = uniqueLumenSchedulingItems(content.days)
  const selectable = days.filter((day) => day.selectable)
  const selected = selectLumenSchedulingItem(selectable, content.activeDayId)
  const events = uniqueLumenSchedulingItems(content.events)
  return (
    <section className="lumen-scheduling-month-reference-layout">
      <div className="lumen-scheduling-month-calendar" data-hbar-app-ui-region="month-calendar">
        <div className="lumen-scheduling-month-calendar-toolbar">
          <button
            type="button"
            aria-label={content.labels.previous}
            onClick={() => onAction?.({ actionId: 'previous-month' })}
          >
            <MonthIcon kind="previous" />
          </button>
          <MonthChoice
            items={content.months}
            value={content.monthId}
            label={content.labels.month}
            className="is-month"
            onChange={content.onMonthChange}
          />
          <MonthChoice
            items={content.years}
            value={content.yearId}
            label={content.labels.year}
            className="is-year"
            onChange={content.onYearChange}
          />
          <button type="button" aria-label={content.labels.next} onClick={() => onAction?.({ actionId: 'next-month' })}>
            <MonthIcon kind="next" />
          </button>
        </div>
        <div className="lumen-scheduling-month-dates" data-hbar-app-ui-list-strategy={content.dayStrategy.kind}>
          {uniqueLumenSchedulingItems(content.weekdays).map((day) => (
            <div className="lumen-scheduling-month-weekday" key={day.id}>
              {day.label}
            </div>
          ))}
          {days.length ? (
            days.map((day) =>
              day.selectable ? (
                <button
                  type="button"
                  key={day.id}
                  className={`lumen-scheduling-month-date${day.hasEvents ? ' has-events' : ''}`}
                  aria-pressed={day.id === selected?.id}
                  data-hbar-app-ui-action="select-day"
                  data-hbar-app-ui-target={day.id}
                  onClick={() => {
                    content.onDayChange?.(day.id)
                    onAction?.({ actionId: 'select-day', value: day.id })
                  }}
                >
                  {day.label}
                </button>
              ) : (
                <div className="lumen-scheduling-month-date is-outside" key={day.id} aria-hidden="true">
                  {day.label}
                </div>
              ),
            )
          ) : (
            <p className="lumen-scheduling-month-empty">{content.labels.emptyDays}</p>
          )}
        </div>
      </div>
      <div className="lumen-scheduling-month-agenda">
        <header data-hbar-app-ui-region="month-agenda-header">
          <div>
            <h2>{selected ? content.labels.dateTitle(selected.label) : content.labels.emptyDays}</h2>
            <p>{content.labels.summary(events.length, events.filter((event) => event.needsReply).length)}</p>
          </div>
          <div className="lumen-scheduling-month-agenda-actions">
            <MonthChoice
              items={content.filters}
              value={content.filterId}
              label={content.labels.filter}
              className="is-filter"
              onChange={content.onFilterChange}
            />
            <button type="button" onClick={() => onAction?.({ actionId: 'add' })}>
              <MonthIcon kind="add" />
              {content.labels.add}
            </button>
          </div>
        </header>
        <div
          className="lumen-scheduling-month-events"
          data-hbar-app-ui-region="month-events"
          data-hbar-app-ui-list-strategy={content.eventStrategy.kind}
        >
          {events.length ? (
            events.map((event) => (
              <article key={event.id} data-hbar-app-ui-target={event.id}>
                <h3>{event.title}</h3>
                <div className="lumen-scheduling-month-event-meta">
                  <span className="lumen-scheduling-month-status">{event.status}</span>
                  {event.participants.length ? (
                    <span className="lumen-scheduling-month-participants">
                      {uniqueLumenSchedulingItems(event.participants).map((person) => (
                        <span key={person.id}>{person.initials}</span>
                      ))}
                    </span>
                  ) : null}
                  <span className="lumen-scheduling-month-detail">
                    <MonthIcon kind="time" />
                    {event.time}
                  </span>
                  <span className="lumen-scheduling-month-detail">
                    <MonthIcon kind="location" />
                    <span>{event.location}</span>
                  </span>
                </div>
              </article>
            ))
          ) : (
            <p className="lumen-scheduling-month-empty">{content.labels.emptyEvents}</p>
          )}
        </div>
      </div>
    </section>
  )
}
