'use client'

import * as React from 'react'
import type { LumenSchedulingAction, LumenSchedulingChoice } from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-booking-reference.css'

export interface LumenSchedulingBookingReferenceDay {
  readonly id: string
  readonly weekday: string
  readonly date: string
  readonly availability: string
  readonly disabled?: boolean | undefined
}

export interface LumenSchedulingBookingReferenceContent {
  readonly summary: {
    readonly initials: string
    readonly person: string
    readonly title: string
    readonly description: string
    readonly duration: string
    readonly medium: string
    readonly timezone: string
    readonly policy: string
  }
  readonly labels: {
    readonly detail: string
    readonly pickDay: string
    readonly month: string
    readonly availableDays: string
    readonly availableTimes: string
    readonly timesOn: (day: LumenSchedulingBookingReferenceDay) => string
    readonly selection: (day: LumenSchedulingBookingReferenceDay, time: LumenSchedulingChoice) => React.ReactNode
    readonly confirm: string
    readonly emptyDays: string
    readonly emptyTimes: string
    readonly noSelection: string
  }
  readonly days: readonly LumenSchedulingBookingReferenceDay[]
  readonly times: readonly LumenSchedulingChoice[]
  readonly dayStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly timeStrategy: Readonly<{ kind: 'content-grown'; expectedMaximum: number }>
  readonly dayId: string
  readonly timeId: string
  readonly onDayChange?: ((id: string) => void) | undefined
  readonly onTimeChange?: ((id: string) => void) | undefined
}

function BookingIcon({ kind }: { readonly kind: 'duration' | 'medium' | 'timezone' }): React.ReactElement {
  const paths = {
    duration: 'M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    medium: 'M3 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm14 3 5-3v10l-5-3',
    timezone: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c3 3 4 6 4 10s-1 7-4 10c-3-3-4-6-4-10s1-7 4-10Z',
  }
  return (
    <svg className="lumen-scheduling-booking-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

export function LumenSchedulingBookingReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingBookingReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const days = uniqueLumenSchedulingItems(content.days)
  const times = uniqueLumenSchedulingItems(content.times)
  const day = selectLumenSchedulingItem(
    days.filter((item) => !item.disabled),
    content.dayId,
  )
  const time = selectLumenSchedulingItem(
    times.filter((item) => !item.disabled),
    content.timeId,
  )
  const stripRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ before: false, after: true })
  const updateEdges = React.useCallback(() => {
    const strip = stripRef.current
    if (!strip) return
    const before = strip.scrollLeft > 1
    const after = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1
    setEdges((current) => (current.before === before && current.after === after ? current : { before, after }))
  }, [])
  React.useEffect(() => {
    const strip = stripRef.current
    if (!strip) return undefined
    const observer = new ResizeObserver(updateEdges)
    observer.observe(strip)
    updateEdges()
    return () => observer.disconnect()
  }, [content.days, updateEdges])
  return (
    <section className="lumen-scheduling-booking-card">
      <div className="lumen-scheduling-booking-person">
        <span className="lumen-scheduling-booking-avatar" aria-hidden="true">
          {content.summary.initials}
        </span>
        <p className="lumen-scheduling-booking-name">{content.summary.person}</p>
        <h2>{content.summary.title}</h2>
        <p className="lumen-scheduling-booking-description">{content.summary.description}</p>
        <dl>
          {(['duration', 'medium', 'timezone'] as const).map((kind) => (
            <div key={kind}>
              <dt className="lumen-scheduling-booking-visually-hidden">{content.labels.detail}</dt>
              <dd>
                <BookingIcon kind={kind} />
                {content.summary[kind]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="lumen-scheduling-booking-policy">{content.summary.policy}</p>
      </div>
      <div className="lumen-scheduling-booking-picker">
        <div className="lumen-scheduling-booking-heading">
          <h3>{content.labels.pickDay}</h3>
          <p>{content.labels.month}</p>
        </div>
        <div
          className="lumen-scheduling-booking-day-window"
          data-scroll-before={edges.before}
          data-scroll-after={edges.after}
        >
          <div
            className="lumen-scheduling-booking-days"
            ref={stripRef}
            onScroll={updateEdges}
            role="radiogroup"
            aria-label={content.labels.availableDays}
            data-hbar-app-ui-list-strategy={content.dayStrategy.kind}
          >
            {days.length ? (
              days.map((item) => (
                <button
                  type="button"
                  role="radio"
                  key={item.id}
                  aria-checked={day?.id === item.id}
                  disabled={item.disabled}
                  data-hbar-app-ui-action="select-day"
                  data-hbar-app-ui-target={item.id}
                  onClick={() => content.onDayChange?.(item.id)}
                >
                  <span>{item.weekday}</span>
                  <span>{item.date}</span>
                  <span>{item.availability}</span>
                </button>
              ))
            ) : (
              <p>{content.labels.emptyDays}</p>
            )}
          </div>
        </div>
        <h3 className="lumen-scheduling-booking-time-heading">
          {day ? content.labels.timesOn(day) : content.labels.noSelection}
        </h3>
        <div
          className="lumen-scheduling-booking-times"
          role="radiogroup"
          aria-label={content.labels.availableTimes}
          data-hbar-app-ui-list-strategy={content.timeStrategy.kind}
        >
          {times.length ? (
            times.map((item) => (
              <button
                type="button"
                role="radio"
                key={item.id}
                aria-checked={time?.id === item.id}
                disabled={item.disabled || !day}
                data-hbar-app-ui-action="select-time"
                data-hbar-app-ui-target={item.id}
                onClick={() => content.onTimeChange?.(item.id)}
              >
                {item.label}
              </button>
            ))
          ) : (
            <p>{content.labels.emptyTimes}</p>
          )}
        </div>
        <footer>
          <p>{day && time ? content.labels.selection(day, time) : content.labels.noSelection}</p>
          <button
            type="button"
            disabled={!day || !time}
            onClick={() => onAction?.({ actionId: 'confirm', value: `${day?.id ?? ''}:${time?.id ?? ''}` })}
          >
            {content.labels.confirm}
          </button>
        </footer>
      </div>
    </section>
  )
}
