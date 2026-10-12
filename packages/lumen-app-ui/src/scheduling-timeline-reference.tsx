'use client'

import * as React from 'react'
import type { LumenSchedulingAction, LumenSchedulingChoice } from './scheduling'
import { uniqueLumenSchedulingItems } from './scheduling-model'
import { groupLumenTimelineIntervals, snapLumenTimelineMinutes } from './scheduling-timeline-model'
import './scheduling-timeline-reference.css'

export interface LumenSchedulingTimelineReferenceDay {
  readonly id: string
  readonly label: string
  readonly date: string
  readonly isToday?: boolean | undefined
}

export interface LumenSchedulingTimelineReferenceEvent {
  readonly id: string
  readonly dayId: string
  readonly title: string
  readonly startMinutes: number
  readonly durationMinutes: number
}

export interface LumenSchedulingTimelineReferenceContent {
  readonly labels: {
    readonly previous: string
    readonly next: string
    readonly today: string
    readonly view: string
    readonly day: string
    readonly week: string
    readonly create: string
    readonly title: string
    readonly duration: string
    readonly delete: string
    readonly close: string
    readonly hint: string
    readonly newTitle: string
    readonly navigation: (view: 'day' | 'week', direction: -1 | 1) => string
    readonly weekHeading: (days: readonly LumenSchedulingTimelineReferenceDay[]) => string
    readonly dayHeading: (day: LumenSchedulingTimelineReferenceDay) => string
    readonly emptyDays: string
    readonly emptyDurations: string
    readonly time: (minutes: number) => string
    readonly summary: (event: LumenSchedulingTimelineReferenceEvent) => string
  }
  readonly heading: string
  readonly days: readonly LumenSchedulingTimelineReferenceDay[]
  readonly events: readonly LumenSchedulingTimelineReferenceEvent[]
  readonly hours: readonly Readonly<{ id: string; label: string }>[]
  readonly durations: readonly LumenSchedulingChoice[]
  readonly startMinutes: number
  readonly endMinutes: number
  readonly newEventStartMinutes: number
  readonly newEventDurationMinutes: number
  readonly view: 'day' | 'week'
  readonly activeDayId: string
  readonly selectedEventId: string
  /** Date columns grow together in normal flow; no horizontal coordinate canvas. */
  readonly dayStrategy: Readonly<{ kind: 'content-grown'; expectedMaximum: number }>
  /** A time-scaled chart owns vertical scrolling, with the editor outside it. */
  readonly eventStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximum: number }>
  readonly onNavigate?: ((direction: -1 | 1) => void) | undefined
  readonly onToday?: (() => void) | undefined
  readonly onViewChange?: ((view: 'day' | 'week') => void) | undefined
  readonly onDayChange?: ((id: string) => void) | undefined
  readonly onEventSelect?: ((id: string) => void) | undefined
  readonly onEventChange?: ((event: LumenSchedulingTimelineReferenceEvent) => void) | undefined
  readonly onEventCreate?: ((dayId: string, startMinutes: number, durationMinutes: number) => void) | undefined
  readonly onEventDelete?: ((id: string) => void) | undefined
  readonly onEditorClose?: (() => void) | undefined
}

function TimelineIcon({
  kind,
}: {
  readonly kind: 'previous' | 'next' | 'create' | 'delete' | 'close'
}): React.ReactElement {
  const paths = {
    previous: 'm15 18-6-6 6-6',
    next: 'm9 18 6-6-6-6',
    create: 'M12 5v14M5 12h14',
    delete: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6',
    close: 'm6 6 12 12M18 6 6 18',
  }
  return (
    <svg className="lumen-scheduling-timeline-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

function TimeSpace({
  minutes,
  children,
}: {
  readonly minutes: number
  readonly children?: React.ReactNode
}): React.ReactElement | null {
  return minutes > 0 ? (
    <div
      className="lumen-scheduling-timeline-time-span"
      style={{ '--timeline-minutes': minutes } as React.CSSProperties}
    >
      {children}
    </div>
  ) : null
}

type Gesture = Readonly<{
  pointerId: number
  kind: 'create' | 'move' | 'resize'
  x: number
  y: number
  dayId: string
  startMinutes: number
  event?: LumenSchedulingTimelineReferenceEvent
  moved: boolean
}>

export function LumenSchedulingTimelineReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingTimelineReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const allDays = uniqueLumenSchedulingItems(content.days)
  const days = content.view === 'day' ? allDays.filter((day) => day.id === content.activeDayId).slice(0, 1) : allDays
  const events = uniqueLumenSchedulingItems(content.events)
  const durations = uniqueLumenSchedulingItems(content.durations)
  const selected = events.find((event) => event.id === content.selectedEventId)
  const chartRef = React.useRef<HTMLDivElement>(null)
  const gestureRef = React.useRef<Gesture | undefined>(undefined)
  const suppressClick = React.useRef(false)
  const minuteAt = (y: number): number => {
    const chart = chartRef.current
    if (!chart) return content.startMinutes
    const style = getComputedStyle(chart)
    const hourSize =
      Number.parseFloat(style.getPropertyValue('--timeline-hour-size')) *
      Number.parseFloat(getComputedStyle(chart.ownerDocument.documentElement).fontSize)
    const padding = Number.parseFloat(
      getComputedStyle(chart.querySelector('[data-timeline-day]') ?? chart).paddingBlockStart,
    )
    return snapLumenTimelineMinutes(
      content.startMinutes + ((y - chart.getBoundingClientRect().y - padding) / hourSize) * 60,
      content.startMinutes,
      content.endMinutes - 15,
    )
  }
  const dayAt = (x: number): string => {
    const columns = chartRef.current?.querySelectorAll<HTMLElement>('[data-timeline-day]')
    const owner =
      columns &&
      [...columns].find((column) => {
        const r = column.getBoundingClientRect()
        return x >= r.x && x <= r.right
      })
    return owner?.dataset.timelineDay ?? ''
  }
  const startGesture = (
    event: React.PointerEvent<HTMLElement>,
    dayId: string,
    item?: LumenSchedulingTimelineReferenceEvent,
  ) => {
    if (event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    gestureRef.current = {
      pointerId: event.pointerId,
      kind: item ? (event.clientY >= rect.bottom - 6 ? 'resize' : 'move') : 'create',
      x: event.clientX,
      y: event.clientY,
      dayId,
      startMinutes: minuteAt(event.clientY),
      ...(item ? { event: item } : {}),
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
  }
  const finishGesture = (event: React.PointerEvent<HTMLElement>, cancelled: boolean) => {
    const gesture = gestureRef.current
    gestureRef.current = undefined
    if (!gesture || cancelled) return
    if (gesture.moved) {
      suppressClick.current = gesture.kind !== 'create'
      if (gesture.kind === 'create') {
        const end = minuteAt(event.clientY)
        const start = Math.min(end, gesture.startMinutes)
        content.onEventCreate?.(gesture.dayId, start, Math.max(15, Math.abs(end - gesture.startMinutes)))
      } else if (gesture.event) {
        const difference = minuteAt(event.clientY) - gesture.startMinutes
        const item = gesture.event
        content.onEventChange?.(
          gesture.kind === 'resize'
            ? {
                ...item,
                durationMinutes: snapLumenTimelineMinutes(
                  item.durationMinutes + difference,
                  15,
                  content.endMinutes - item.startMinutes,
                ),
              }
            : {
                ...item,
                dayId: dayAt(event.clientX) || gesture.dayId,
                startMinutes: snapLumenTimelineMinutes(
                  item.startMinutes + difference,
                  content.startMinutes,
                  content.endMinutes - item.durationMinutes,
                ),
              },
        )
        content.onEventSelect?.(item.id)
      }
    }
  }
  const renderEvent = (item: LumenSchedulingTimelineReferenceEvent) => (
    <TimeSpace key={item.id} minutes={item.durationMinutes}>
      <button
        type="button"
        className="lumen-scheduling-timeline-reservation"
        aria-pressed={item.id === content.selectedEventId}
        data-hbar-app-ui-action="select-event"
        data-hbar-app-ui-target={item.id}
        onPointerDown={(event) => startGesture(event, item.dayId, item)}
        onPointerMove={(event) => {
          const gesture = gestureRef.current
          if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 3)
            gestureRef.current = { ...gesture, moved: true }
        }}
        onPointerUp={(event) => finishGesture(event, false)}
        onPointerCancel={(event) => finishGesture(event, true)}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          content.onEventSelect?.(item.id)
          onAction?.({ actionId: 'select-event', value: item.id })
        }}
      >
        <span className="lumen-scheduling-timeline-event-copy">
          <span>{item.title}</span>
          {item.durationMinutes > 30 && <small>{content.labels.time(item.startMinutes)}</small>}
        </span>
        {item.id === content.selectedEventId && (
          <span className="lumen-scheduling-timeline-resize-grip" aria-hidden="true" />
        )}
      </button>
    </TimeSpace>
  )
  return (
    <div className="lumen-scheduling-timeline-reference-layout">
      <header role="banner">
        <div className="lumen-scheduling-timeline-navigation">
          {(['previous', 'next'] as const).map((kind) => (
            <button
              type="button"
              key={kind}
              aria-label={content.labels[kind]}
              onClick={() => content.onNavigate?.(kind === 'previous' ? -1 : 1)}
            >
              <TimelineIcon kind={kind} />
            </button>
          ))}
        </div>
        <button type="button" className="lumen-scheduling-timeline-today" onClick={() => content.onToday?.()}>
          {content.labels.today}
        </button>
        <h1>{content.heading}</h1>
        <div role="tablist" aria-label={content.labels.view} className="lumen-scheduling-timeline-views">
          {(['day', 'week'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={content.view === view}
              onClick={() => content.onViewChange?.(view)}
            >
              {content.labels[view]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="lumen-scheduling-timeline-create"
          onClick={() =>
            content.onEventCreate?.(content.activeDayId, content.newEventStartMinutes, content.newEventDurationMinutes)
          }
        >
          <TimelineIcon kind="create" />
          {content.labels.create}
        </button>
      </header>
      <div className="lumen-scheduling-timeline-day-headings" data-hbar-app-ui-list-strategy={content.dayStrategy.kind}>
        <div className="lumen-scheduling-timeline-rail-spacer" />
        <div>
          {days.length ? (
            days.map((day) => (
              <button
                type="button"
                key={day.id}
                className={day.isToday ? 'is-today' : ''}
                data-hbar-app-ui-action="select-day"
                data-hbar-app-ui-target={day.id}
                onClick={() => content.onDayChange?.(day.id)}
              >
                <span>{day.label}</span>
                <span>{day.date}</span>
              </button>
            ))
          ) : (
            <p>{content.labels.emptyDays}</p>
          )}
        </div>
      </div>
      <div
        className="lumen-scheduling-timeline-scroll"
        data-hbar-app-ui-region="timeline"
        data-hbar-app-ui-list-strategy={content.eventStrategy.kind}
      >
        <div className="lumen-scheduling-timeline-chart" ref={chartRef}>
          <div className="lumen-scheduling-timeline-hours">
            {uniqueLumenSchedulingItems(content.hours).map((hour) => (
              <div key={hour.id}>{hour.label}</div>
            ))}
          </div>
          <div className="lumen-scheduling-timeline-days">
            {days.map((day) => {
              let cursor = content.startMinutes
              const groups = groupLumenTimelineIntervals(
                events.filter((item) => item.dayId === day.id),
                content.startMinutes,
                content.endMinutes,
              )
              return (
                <div
                  key={day.id}
                  className="lumen-scheduling-timeline-day"
                  data-timeline-day={day.id}
                  onPointerDown={(event) => startGesture(event, day.id)}
                  onPointerMove={(event) => {
                    const gesture = gestureRef.current
                    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 3)
                      gestureRef.current = { ...gesture, moved: true }
                  }}
                  onPointerUp={(event) => finishGesture(event, false)}
                  onPointerCancel={(event) => finishGesture(event, true)}
                >
                  {groups.map((group) => {
                    const gap = group.startMinutes - cursor
                    cursor = group.endMinutes
                    return (
                      <React.Fragment key={group.lanes[0]?.[0]?.id}>
                        <TimeSpace minutes={gap} />
                        <div className="lumen-scheduling-timeline-collision-group">
                          {group.lanes.map((lane) => {
                            let laneCursor = group.startMinutes
                            return (
                              <div className="lumen-scheduling-timeline-lane" key={lane[0]?.id}>
                                {lane.map((item) => {
                                  const intervalGap = item.startMinutes - laneCursor
                                  laneCursor = item.startMinutes + item.durationMinutes
                                  return (
                                    <React.Fragment key={item.id}>
                                      <TimeSpace minutes={intervalGap} />
                                      {renderEvent(item)}
                                    </React.Fragment>
                                  )
                                })}
                                <TimeSpace minutes={group.endMinutes - laneCursor} />
                              </div>
                            )
                          })}
                        </div>
                      </React.Fragment>
                    )
                  })}
                  <TimeSpace minutes={content.endMinutes - cursor} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <footer>
        {selected ? (
          <>
            <input
              className="lumen-scheduling-timeline-title"
              aria-label={content.labels.title}
              value={selected.title}
              onChange={(event) => content.onEventChange?.({ ...selected, title: event.currentTarget.value })}
            />
            <select
              className="lumen-scheduling-timeline-duration"
              aria-label={content.labels.duration}
              value={String(selected.durationMinutes / 60)}
              disabled={!durations.length}
              onChange={(event) => {
                const duration = Number(event.currentTarget.value)
                if (Number.isFinite(duration) && duration > 0)
                  content.onEventChange?.({ ...selected, durationMinutes: duration * 60 })
              }}
            >
              {durations.length ? (
                durations.map((duration) => (
                  <option key={duration.id} value={duration.id} disabled={duration.disabled}>
                    {duration.label}
                  </option>
                ))
              ) : (
                <option value="">{content.labels.emptyDurations}</option>
              )}
            </select>
            <p>{content.labels.summary(selected)}</p>
            <button
              type="button"
              aria-label={content.labels.delete}
              className="lumen-scheduling-timeline-delete"
              onClick={() => content.onEventDelete?.(selected.id)}
            >
              <TimelineIcon kind="delete" />
            </button>
            <button type="button" aria-label={content.labels.close} onClick={() => content.onEditorClose?.()}>
              <TimelineIcon kind="close" />
            </button>
          </>
        ) : (
          <p>{content.labels.hint}</p>
        )}
      </footer>
    </div>
  )
}
