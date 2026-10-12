'use client'

import * as React from 'react'
import { LumenSelect } from './forms'
import type { LumenSchedulingAction, LumenSchedulingChoice, LumenSchedulingListStrategy } from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-deadline-reference.css'

export interface LumenSchedulingDeadlineReferencePreset extends LumenSchedulingChoice {
  readonly detail: string
  readonly icon: 'today' | 'tomorrow' | 'calendar' | 'next' | 'clear'
}

export interface LumenSchedulingDeadlineReferenceDay extends LumenSchedulingChoice {
  readonly selectable: boolean
}

export interface LumenSchedulingDeadlineReferenceContent {
  readonly labels: {
    readonly timezone: (zone: React.ReactNode) => React.ReactNode
    readonly previous: string
    readonly next: string
    readonly month: string
    readonly times: string
    readonly timeTitle: (day: string) => string
    readonly summary: (day: string, time: string) => React.ReactNode
    readonly cancel: string
    readonly apply: string
    readonly emptyPresets: string
    readonly emptyMonths: string
    readonly emptyDays: string
    readonly emptyTimes: string
  }
  readonly timezone: string
  readonly presets: readonly LumenSchedulingDeadlineReferencePreset[]
  /** Native month choices retain every record with browser-owned option scrolling. */
  readonly months: readonly LumenSchedulingChoice[]
  readonly weekdays: readonly LumenSchedulingChoice[]
  readonly days: readonly LumenSchedulingDeadlineReferenceDay[]
  readonly times: readonly LumenSchedulingChoice[]
  readonly presetId: string
  readonly monthId: string
  readonly dayId: string
  readonly timeId: string
  readonly presetStrategy: LumenSchedulingListStrategy
  readonly dayStrategy: LumenSchedulingListStrategy
  /** Times are a pane-owned list; the calendar owns its desktop cross-size. */
  readonly timeStrategy: { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }
  readonly onPresetChange?: ((id: string) => void) | undefined
  readonly onMonthChange?: ((id: string) => void) | undefined
  readonly onDayChange?: ((id: string) => void) | undefined
  readonly onTimeChange?: ((id: string) => void) | undefined
}

function DeadlineIcon({
  kind,
}: {
  readonly kind: LumenSchedulingDeadlineReferencePreset['icon'] | 'zone' | 'left' | 'right'
}): React.ReactElement {
  const paths = {
    today: 'M12 2v8m-4-4 4-4 4 4M3 16h2m14 0h2M4 20h16M8 16a4 4 0 0 1 8 0M5 10l2 2m10 0 2-2',
    tomorrow: 'M10 2h4M12 8a8 8 0 1 0 8 8 8 8 0 0 0-8-8m0 4v4l3-3',
    calendar:
      'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2M7 14h.01M12 14h.01M17 14h.01M7 18h.01M12 18h.01M17 18h.01',
    next: 'M8 2v4m8-4v4M3 10h18M14 20H3V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M17 17l3 3-3 3m-3-3h6',
    clear: 'M9 15l6-6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
    zone: 'M2 12h20M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 0a20 20 0 0 1 0 20 20 20 0 0 1 0-20',
    left: 'm15 18-6-6 6-6',
    right: 'm9 18 6-6-6-6',
  }
  return (
    <svg className={`lumen-scheduling-deadline-icon is-${kind}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

function TimePane({
  content,
  day,
  selected,
  onAction,
}: {
  readonly content: LumenSchedulingDeadlineReferenceContent
  readonly day: string
  readonly selected: string | undefined
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const times = uniqueLumenSchedulingItems(content.times)
  const pane = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const updateEdges = React.useCallback(() => {
    const element = pane.current
    if (!element) {
      return
    }
    const top = element.scrollTop > 1
    const bottom = element.scrollTop + element.clientHeight < element.scrollHeight - 1
    setEdges((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }))
  }, [])
  React.useEffect(() => {
    const element = pane.current
    if (!element) {
      return undefined
    }
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(element)
    for (const child of element.children) {
      observer.observe(child)
    }
    return () => observer.disconnect()
  }, [content.times, updateEdges])
  return (
    <div className="lumen-scheduling-deadline-times" data-hbar-app-ui-region="deadline-times">
      <p>{content.labels.timeTitle(day)}</p>
      <div
        ref={pane}
        role="radiogroup"
        aria-label={content.labels.times}
        className="lumen-scheduling-deadline-time-scroll"
        data-hbar-app-ui-list-strategy={content.timeStrategy.kind}
        data-scroll-top={edges.top}
        data-scroll-bottom={edges.bottom}
        onScroll={updateEdges}
      >
        {times.length ? (
          times.map((time) => (
            <button
              key={time.id}
              type="button"
              role="radio"
              aria-checked={selected === time.id}
              disabled={time.disabled}
              data-hbar-app-ui-action="select-time"
              data-hbar-app-ui-target={time.id}
              onClick={() => {
                content.onTimeChange?.(time.id)
                onAction?.({ actionId: 'select-time', value: time.id })
              }}
            >
              {time.label}
            </button>
          ))
        ) : (
          <p>{content.labels.emptyTimes}</p>
        )}
      </div>
    </div>
  )
}

export function LumenSchedulingDeadlineReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingDeadlineReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const presets = uniqueLumenSchedulingItems(content.presets)
  const months = uniqueLumenSchedulingItems(content.months)
  const days = uniqueLumenSchedulingItems(content.days)
  const preset = selectLumenSchedulingItem(presets, content.presetId)
  const month = selectLumenSchedulingItem(months, content.monthId)
  const day = selectLumenSchedulingItem(
    days.filter((item) => item.selectable),
    content.dayId,
  )
  const time = selectLumenSchedulingItem(uniqueLumenSchedulingItems(content.times), content.timeId)
  return (
    <section className="lumen-scheduling-deadline-card">
      <header>
        <DeadlineIcon kind="zone" />
        <p>{content.labels.timezone(<span>{content.timezone}</span>)}</p>
      </header>
      <div
        className="lumen-scheduling-deadline-presets"
        data-hbar-app-ui-region="deadline-presets"
        data-hbar-app-ui-list-strategy={content.presetStrategy.kind}
      >
        {presets.length ? (
          presets.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={preset?.id === item.id}
              disabled={item.disabled}
              data-hbar-app-ui-action="select-preset"
              data-hbar-app-ui-target={item.id}
              onClick={() => {
                content.onPresetChange?.(item.id)
                onAction?.({ actionId: 'select-preset', value: item.id })
              }}
            >
              <DeadlineIcon kind={item.icon} />
              <span>{item.label}</span>
              <span>{item.detail}</span>
            </button>
          ))
        ) : (
          <p>{content.labels.emptyPresets}</p>
        )}
      </div>
      <div className="lumen-scheduling-deadline-columns">
        <div className="lumen-scheduling-deadline-month" data-hbar-app-ui-region="deadline-calendar">
          <div className="lumen-scheduling-deadline-month-controls">
            <button
              type="button"
              aria-label={content.labels.previous}
              onClick={() => onAction?.({ actionId: 'previous-month' })}
            >
              <DeadlineIcon kind="left" />
            </button>
            <LumenSelect
              variant="plain"
              className="lumen-scheduling-deadline-select"
              aria-label={content.labels.month}
              value={month?.id ?? ''}
              disabled={!months.length}
              onChange={(event) => content.onMonthChange?.(event.currentTarget.value)}
            >
              {months.length ? (
                months.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.disabled}>
                    {item.label}
                  </option>
                ))
              ) : (
                <option value="">{content.labels.emptyMonths}</option>
              )}
            </LumenSelect>
            <button
              type="button"
              aria-label={content.labels.next}
              onClick={() => onAction?.({ actionId: 'next-month' })}
            >
              <DeadlineIcon kind="right" />
            </button>
          </div>
          <div className="lumen-scheduling-deadline-dates" data-hbar-app-ui-list-strategy={content.dayStrategy.kind}>
            {uniqueLumenSchedulingItems(content.weekdays).map((item) => (
              <div key={item.id} className="is-weekday">
                {item.label}
              </div>
            ))}
            {days.length ? (
              days.map((item) =>
                item.selectable ? (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={day?.id === item.id}
                    disabled={item.disabled}
                    data-hbar-app-ui-action="select-day"
                    data-hbar-app-ui-target={item.id}
                    onClick={() => {
                      content.onDayChange?.(item.id)
                      onAction?.({ actionId: 'select-day', value: item.id })
                    }}
                  >
                    {item.label}
                  </button>
                ) : (
                  <div key={item.id} className="is-outside" aria-hidden="true">
                    {item.label}
                  </div>
                ),
              )
            ) : (
              <p>{content.labels.emptyDays}</p>
            )}
          </div>
        </div>
        <TimePane
          content={content}
          day={day?.label ?? content.labels.emptyDays}
          selected={time?.id}
          onAction={onAction}
        />
      </div>
      <footer data-hbar-app-ui-region="deadline-footer">
        <p>
          {content.labels.summary(day?.label ?? content.labels.emptyDays, time?.label ?? content.labels.emptyTimes)}
        </p>
        <div>
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
