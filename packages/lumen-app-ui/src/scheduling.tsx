'use client'

import * as React from 'react'
import { LumenFormField, LumenInput, LumenTextarea, LumenToggleControl, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './scheduling.css'
import { LumenSchedulingMonthReference, type LumenSchedulingMonthReferenceContent } from './scheduling-month-reference'
import { LumenSchedulingRangeReference, type LumenSchedulingRangeReferenceContent } from './scheduling-range-reference'
import { LumenSchedulingFormReference, type LumenSchedulingFormReferenceContent } from './scheduling-form-reference'
import {
  LumenSchedulingDeadlineReference,
  type LumenSchedulingDeadlineReferenceContent,
} from './scheduling-deadline-reference'
import {
  LumenSchedulingAvailabilityReference,
  type LumenSchedulingAvailabilityReferenceContent,
} from './scheduling-availability-reference'
import {
  LumenSchedulingTimelineReference,
  type LumenSchedulingTimelineReferenceContent,
} from './scheduling-timeline-reference'
import {
  LumenSchedulingBookingReference,
  type LumenSchedulingBookingReferenceContent,
} from './scheduling-booking-reference'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import { LumenMonthGrid } from './ui-compositions'
import { LumenTabs } from './ui-controls'

export { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'

export interface LumenSchedulingListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenSchedulingChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenSchedulingMonthDay extends LumenSchedulingChoice {
  readonly dateLabel: string
  readonly hasEvents?: boolean | undefined
}

export interface LumenSchedulingAgendaEvent {
  readonly id: string
  readonly dayId: string
  readonly time: string
  readonly title: string
  readonly detail: string
  readonly status?: string | undefined
}

export interface LumenSchedulingMonthContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly previousMonth: string
    readonly nextMonth: string
    readonly filter: string
    readonly agenda: (dateLabel: string) => string
    readonly empty: string
  }
  readonly monthLabel: string
  readonly days: readonly LumenSchedulingMonthDay[]
  readonly initialDayId: string
  readonly events: readonly LumenSchedulingAgendaEvent[]
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingTimeRangeContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly start: string
    readonly end: string
    readonly separator: string
    readonly durationGroup: string
    readonly confirm: (durationLabel: string) => string
  }
  readonly startOptions: readonly LumenSchedulingChoice[]
  readonly endOptions: readonly LumenSchedulingChoice[]
  readonly durationOptions: readonly LumenSchedulingChoice[]
  readonly initialStartId: string
  readonly initialEndId: string
  readonly initialDurationId: string
}

export interface LumenSchedulingAttendee {
  readonly id: string
  readonly name: string
  readonly initials: string
}

export interface LumenSchedulingFormContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly name: string
    readonly date: string
    readonly attendees: string
    readonly start: string
    readonly end: string
    readonly attachment: string
    readonly attachmentHint: string
    readonly notes: string
    readonly notesPlaceholder: string
    readonly addAttendee: string
    readonly removeAttendee: (name: string) => string
    readonly emptyAttendees: string
    readonly capacityReached: string
    readonly schedule: string
  }
  readonly initialName: string
  readonly initialDate: string
  readonly initialStart: string
  readonly initialEnd: string
  readonly attendees: readonly LumenSchedulingAttendee[]
  readonly initialAttendeeIds: readonly string[]
  readonly maximumAttendees: number
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingDeadlineDay extends LumenSchedulingChoice {
  readonly dateLabel: string
}

export interface LumenSchedulingDeadlineContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly presets: string
    readonly calendar: string
    readonly slots: string
    readonly emptySlots: string
  }
  readonly monthLabel: string
  readonly presets: readonly LumenSchedulingChoice[]
  readonly days: readonly LumenSchedulingDeadlineDay[]
  readonly slots: readonly LumenSchedulingChoice[]
  readonly initialPresetId: string
  readonly initialDayId: string
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingAvailabilityDay {
  readonly id: string
  readonly label: string
  readonly initiallyEnabled: boolean
  readonly start: string
  readonly end: string
}

export interface LumenSchedulingAvailabilityContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly unavailable: string
    readonly enableDay: (day: string) => string
    readonly start: (day: string) => string
    readonly end: (day: string) => string
    readonly separator?: string | undefined
    readonly addInterval: (day: string) => string
    readonly save: string
    readonly empty: string
  }
  readonly days: readonly LumenSchedulingAvailabilityDay[]
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingTimelineEvent {
  readonly id: string
  readonly dayId: string
  readonly title: string
  readonly time: string
  readonly topPercent: number
  readonly heightPercent: number
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenSchedulingTimelineContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly viewGroup: string
    readonly timeline: string
    readonly empty: string
  }
  readonly views: readonly LumenSchedulingChoice[]
  readonly initialViewId: string
  readonly hours: readonly LumenSchedulingChoice[]
  readonly days: readonly LumenSchedulingChoice[]
  readonly events: readonly LumenSchedulingTimelineEvent[]
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingBookingContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly days: string
    readonly slots: (dayLabel: string) => string
    readonly emptyDays: string
    readonly emptySlots: string
  }
  readonly summary: {
    readonly title: string
    readonly detail: string
    readonly timezone: string
    readonly status: string
  }
  readonly days: readonly LumenSchedulingChoice[]
  readonly slots: readonly LumenSchedulingChoice[]
  readonly initialDayId: string
  readonly listStrategy: LumenSchedulingListStrategy
}

export interface LumenSchedulingContent {
  readonly referenceMonth?: LumenSchedulingMonthReferenceContent | undefined
  readonly referenceRange?: LumenSchedulingRangeReferenceContent | undefined
  readonly referenceForm?: LumenSchedulingFormReferenceContent | undefined
  readonly referenceDeadline?: LumenSchedulingDeadlineReferenceContent | undefined
  readonly referenceAvailability?: LumenSchedulingAvailabilityReferenceContent | undefined
  readonly referenceTimeline?: LumenSchedulingTimelineReferenceContent | undefined
  readonly referenceBooking?: LumenSchedulingBookingReferenceContent | undefined
  readonly month?: LumenSchedulingMonthContent | undefined
  readonly timeRange?: LumenSchedulingTimeRangeContent | undefined
  readonly form?: LumenSchedulingFormContent | undefined
  readonly deadline?: LumenSchedulingDeadlineContent | undefined
  readonly availability?: LumenSchedulingAvailabilityContent | undefined
  readonly timeline?: LumenSchedulingTimelineContent | undefined
  readonly booking?: LumenSchedulingBookingContent | undefined
}

export interface LumenSchedulingProviderProps {
  readonly content: LumenSchedulingContent
  readonly children: React.ReactNode
}

export interface LumenSchedulingAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenSchedulingProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenSchedulingContent | undefined
  readonly onAction?: ((event: LumenSchedulingAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Runtime-owned regions of the numbered scheduling surface. */
  readonly slots?:
    | {
        readonly header?: React.ReactNode
        readonly body: React.ReactNode
        readonly footer?: React.ReactNode
      }
    | undefined
}

export type LumenSchedulingVariantProps = Omit<LumenSchedulingProps, 'variant' | 'variantId'>

const SchedulingContext = React.createContext<LumenSchedulingContent | undefined>(undefined)

export function LumenSchedulingProvider({ content, children }: LumenSchedulingProviderProps) {
  return <SchedulingContext.Provider value={content}>{children}</SchedulingContext.Provider>
}

export function useLumenSchedulingContent() {
  return React.useContext(SchedulingContext)
}

const report = (fn: LumenSchedulingProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { readonly name: 'left' | 'right' | 'filter' | 'plus' | 'close' }) {
  const paths = {
    left: 'm10 3-5 5 5 5',
    right: 'm6 3 5 5-5 5',
    filter: 'M2 3h12L9.5 8v4l-3 1V8Z',
    plus: 'M8 3v10M3 8h10',
    close: 'm4 4 8 8m0-8-8 8',
  }
  const path = paths[name]
  return (
    <svg className="lumen-scheduling-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenSchedulingProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-scheduling',
    `hbar-app-ui-scheduling-variant-${variant}`,
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
      as="section"
      boundary={
        className?.includes('scheduling-month-reference') ||
        className?.includes('scheduling-range-reference') ||
        className?.includes('scheduling-form-reference') ||
        className?.includes('scheduling-deadline-reference') ||
        className?.includes('scheduling-availability-reference') ||
        className?.includes('scheduling-timeline-reference') ||
        className?.includes('scheduling-booking-reference')
          ? 'none'
          : 'horizontal'
      }
      className="lumen-scheduling-surface"
      contentClassName={contentClassName}
      data-lumen-component="scheduling"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-scheduling-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Month(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingMonthContent }) {
  const days = uniqueLumenSchedulingItems(props.content.days)
  const events = uniqueLumenSchedulingItems(props.content.events)
  const [dayId, setDayId] = React.useState(props.content.initialDayId)
  const selected = selectLumenSchedulingItem(days, dayId)
  const agenda = selected ? events.filter((event) => event.dayId === selected.id) : []
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'filter')}>
            <Glyph name="filter" />
            {props.content.labels.filter}
          </LumenButton>
        }
      />
      <div className="lumen-scheduling-month-layout">
        <div className="lumen-scheduling-calendar">
          <div className="lumen-scheduling-calendar-header">
            <LumenIconButton
              label={props.content.labels.previousMonth}
              onClick={() => report(props.onAction, 'previous-month')}
            >
              <Glyph name="left" />
            </LumenIconButton>
            <LumenText as="strong" variant="label">
              {props.content.monthLabel}
            </LumenText>
            <LumenIconButton
              label={props.content.labels.nextMonth}
              onClick={() => report(props.onAction, 'next-month')}
            >
              <Glyph name="right" />
            </LumenIconButton>
          </div>
          <div className="lumen-scheduling-month-grid">
            {days.map((day) => (
              <LumenButton
                key={day.id}
                variant={selected?.id === day.id ? 'solid' : 'text'}
                aria-pressed={selected?.id === day.id}
                aria-label={day.dateLabel}
                disabled={day.disabled}
                onClick={() => setDayId(day.id)}
              >
                <span>{day.label}</span>
                {day.hasEvents ? <i aria-hidden="true" /> : null}
              </LumenButton>
            ))}
          </div>
        </div>
        <aside className="lumen-scheduling-agenda" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          <LumenText as="h3" variant="label">
            {selected ? props.content.labels.agenda(selected.dateLabel) : props.content.labels.empty}
          </LumenText>
          {agenda.length ? (
            agenda.map((event) => (
              <article key={event.id}>
                <LumenText as="strong" variant="label">
                  {event.title}
                </LumenText>
                <LumenText as="small" tone="muted" variant="supporting">
                  {event.time} {String.fromCharCode(0x00b7)} {event.detail}
                </LumenText>
                {event.status ? <LumenStatus value={event.status} /> : null}
              </article>
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.empty}
            </LumenText>
          )}
        </aside>
      </div>
    </Root>
  )
}

function TimeRange(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingTimeRangeContent }) {
  const starts = uniqueLumenSchedulingItems(props.content.startOptions)
  const ends = uniqueLumenSchedulingItems(props.content.endOptions)
  const durations = uniqueLumenSchedulingItems(props.content.durationOptions)
  const initialStart = selectLumenSchedulingItem(starts, props.content.initialStartId)?.id ?? ''
  const initialEnd = selectLumenSchedulingItem(ends, props.content.initialEndId)?.id ?? ''
  const [start, setStart] = React.useState(initialStart)
  const [end, setEnd] = React.useState(initialEnd)
  const [durationId, setDurationId] = React.useState(props.content.initialDurationId)
  const duration = selectLumenSchedulingItem(durations, durationId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-scheduling-time-range">
        <LumenFormField controlId={`${props.variantId}-start`} label={props.content.labels.start}>
          <LumenChoiceSelect
            id={`${props.variantId}-start`}
            label={props.content.labels.start}
            options={starts}
            value={start}
            onValueChange={setStart}
          />
        </LumenFormField>
        <LumenText as="span" tone="muted">
          {props.content.labels.separator}
        </LumenText>
        <LumenFormField controlId={`${props.variantId}-end`} label={props.content.labels.end}>
          <LumenChoiceSelect
            id={`${props.variantId}-end`}
            label={props.content.labels.end}
            options={ends}
            value={end}
            onValueChange={setEnd}
          />
        </LumenFormField>
      </div>
      <div className="lumen-scheduling-choice-row" role="group" aria-label={props.content.labels.durationGroup}>
        {durations.map((option) => (
          <LumenButton
            key={option.id}
            variant={duration?.id === option.id ? 'solid' : 'outlined'}
            aria-pressed={duration?.id === option.id}
            disabled={option.disabled}
            onClick={() => setDurationId(option.id)}
          >
            {option.label}
          </LumenButton>
        ))}
      </div>
      <footer className="lumen-scheduling-actions">
        <LumenButton
          tone="primary"
          disabled={!duration}
          onClick={() => report(props.onAction, 'select-range', `${start}:${end}:${duration?.id}`)}
        >
          {props.content.labels.confirm(duration?.label ?? '')}
        </LumenButton>
      </footer>
    </Root>
  )
}

function Form(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingFormContent }) {
  const attendees = uniqueLumenSchedulingItems(props.content.attendees)
  const validInitialIds = uniqueLumenSchedulingItems(props.content.initialAttendeeIds.map((id) => ({ id })))
    .map((item) => item.id)
    .filter((id) => attendees.some((attendee) => attendee.id === id))
    .slice(0, Math.max(0, props.content.maximumAttendees))
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>(validInitialIds)
  const selected = selectedIds
    .map((id) => attendees.find((attendee) => attendee.id === id))
    .filter((attendee): attendee is LumenSchedulingAttendee => Boolean(attendee))
  const next = attendees.find((attendee) => !selectedIds.includes(attendee.id))
  const atCapacity = selected.length >= Math.max(0, props.content.maximumAttendees)
  const [name, setName] = React.useState(props.content.initialName)
  const [date, setDate] = React.useState(props.content.initialDate)
  const [start, setStart] = React.useState(props.content.initialStart)
  const [end, setEnd] = React.useState(props.content.initialEnd)
  const [notes, setNotes] = React.useState('')
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-scheduling-form-grid">
        <LumenFormField controlId={`${props.variantId}-name`} label={props.content.labels.name}>
          <LumenInput value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </LumenFormField>
        <LumenFormField controlId={`${props.variantId}-date`} label={props.content.labels.date}>
          <LumenInput type="date" value={date} onChange={(event) => setDate(event.currentTarget.value)} />
        </LumenFormField>
        <div className="lumen-scheduling-attendees" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          <LumenText as="strong" variant="label">
            {props.content.labels.attendees}
          </LumenText>
          <div>
            {selected.length ? (
              selected.map((attendee) => (
                <span key={attendee.id}>
                  <i aria-hidden="true">{attendee.initials}</i>
                  {attendee.name}
                  <LumenIconButton
                    size="s"
                    label={props.content.labels.removeAttendee(attendee.name)}
                    onClick={() => {
                      setSelectedIds((current) => current.filter((id) => id !== attendee.id))
                      report(props.onAction, 'remove-attendee', attendee.id)
                    }}
                  >
                    <Glyph name="close" />
                  </LumenIconButton>
                </span>
              ))
            ) : (
              <LumenText as="span" tone="muted">
                {props.content.labels.emptyAttendees}
              </LumenText>
            )}
            <LumenButton
              variant="outlined"
              disabled={!next || atCapacity}
              title={atCapacity ? props.content.labels.capacityReached : undefined}
              onClick={() => {
                if (!next || atCapacity) {
                  return
                }
                setSelectedIds((current) => [...current, next.id])
                report(props.onAction, 'add-attendee', next.id)
              }}
            >
              <Glyph name="plus" />
              {atCapacity ? props.content.labels.capacityReached : props.content.labels.addAttendee}
            </LumenButton>
          </div>
        </div>
        <LumenFormField controlId={`${props.variantId}-start`} label={props.content.labels.start}>
          <LumenInput type="time" value={start} onChange={(event) => setStart(event.currentTarget.value)} />
        </LumenFormField>
        <LumenFormField controlId={`${props.variantId}-end`} label={props.content.labels.end}>
          <LumenInput type="time" value={end} onChange={(event) => setEnd(event.currentTarget.value)} />
        </LumenFormField>
        <LumenFormField
          controlId={`${props.variantId}-attachment`}
          label={props.content.labels.attachment}
          hint={props.content.labels.attachmentHint}
        >
          <LumenInput type="file" />
        </LumenFormField>
        <LumenFormField controlId={`${props.variantId}-notes`} label={props.content.labels.notes}>
          <LumenTextarea
            value={notes}
            placeholder={props.content.labels.notesPlaceholder}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
        </LumenFormField>
      </div>
      <footer className="lumen-scheduling-actions">
        <LumenButton
          tone="primary"
          disabled={!name.trim() || !date || !start || !end}
          onClick={() =>
            report(
              props.onAction,
              'schedule',
              JSON.stringify({
                name: name.trim(),
                date,
                start,
                end,
                attendeeIds: selectedIds,
                notes,
              }),
            )
          }
        >
          {props.content.labels.schedule}
        </LumenButton>
      </footer>
    </Root>
  )
}

function Deadline(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingDeadlineContent }) {
  const presets = uniqueLumenSchedulingItems(props.content.presets)
  const days = uniqueLumenSchedulingItems(props.content.days)
  const slots = uniqueLumenSchedulingItems(props.content.slots)
  const [presetId, setPresetId] = React.useState(props.content.initialPresetId)
  const [dayId, setDayId] = React.useState(props.content.initialDayId)
  const selectedPreset = selectLumenSchedulingItem(presets, presetId)
  const selectedDay = selectLumenSchedulingItem(days, dayId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-scheduling-choice-row" role="group" aria-label={props.content.labels.presets}>
        {presets.map((preset) => (
          <LumenButton
            key={preset.id}
            variant={selectedPreset?.id === preset.id ? 'solid' : 'outlined'}
            aria-pressed={selectedPreset?.id === preset.id}
            disabled={preset.disabled}
            onClick={() => setPresetId(preset.id)}
          >
            {preset.label}
          </LumenButton>
        ))}
      </div>
      <div className="lumen-scheduling-deadline-layout">
        <div className="lumen-scheduling-deadline-calendar" aria-label={props.content.labels.calendar}>
          <LumenText as="strong" variant="label">
            {props.content.monthLabel}
          </LumenText>
          <LumenMonthGrid
            label={props.content.labels.calendar}
            days={days}
            selectedId={selectedDay?.id ?? null}
            onSelect={setDayId}
          />
        </div>
        <div
          className="lumen-scheduling-slots"
          aria-label={props.content.labels.slots}
          data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
        >
          {slots.length ? (
            slots.map((slot) => (
              <LumenButton
                key={slot.id}
                variant="outlined"
                disabled={slot.disabled}
                onClick={() =>
                  report(
                    props.onAction,
                    'select-deadline',
                    `${selectedPreset?.id ?? ''}:${selectedDay?.id ?? ''}:${slot.id}`,
                  )
                }
              >
                {slot.label}
              </LumenButton>
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.emptySlots}
            </LumenText>
          )}
        </div>
      </div>
    </Root>
  )
}

function Availability(
  props: Omit<LumenSchedulingProps, 'content'> & {
    content: LumenSchedulingAvailabilityContent
  },
) {
  const days = uniqueLumenSchedulingItems(props.content.days)
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(days.map((day) => [day.id, day.initiallyEnabled])),
  )
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-scheduling-availability" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {days.length ? (
          days.map((day) => {
            const active = enabled[day.id] ?? day.initiallyEnabled
            return (
              <article key={day.id}>
                <LumenToggleControl
                  className="lumen-scheduling-switch"
                  aria-label={props.content.labels.enableDay(day.label)}
                  checked={active}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked
                    setEnabled((current) => ({
                      ...current,
                      [day.id]: checked,
                    }))
                  }}
                />
                <LumenText as="strong" variant="label">
                  {day.label}
                </LumenText>
                {active ? (
                  <React.Fragment>
                    <LumenInput
                      type="time"
                      defaultValue={day.start}
                      aria-label={props.content.labels.start(day.label)}
                    />
                    <LumenText as="span" tone="muted">
                      {String.fromCharCode(0x2013)}
                    </LumenText>
                    <LumenInput type="time" defaultValue={day.end} aria-label={props.content.labels.end(day.label)} />
                    <LumenIconButton
                      label={props.content.labels.addInterval(day.label)}
                      onClick={() => report(props.onAction, 'add-interval', day.id)}
                    >
                      <Glyph name="plus" />
                    </LumenIconButton>
                  </React.Fragment>
                ) : (
                  <LumenText as="span" tone="muted">
                    {props.content.labels.unavailable}
                  </LumenText>
                )}
              </article>
            )
          })
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <footer className="lumen-scheduling-actions">
        <LumenButton
          tone="primary"
          onClick={() =>
            report(
              props.onAction,
              'save-availability',
              days
                .filter((day) => enabled[day.id] ?? day.initiallyEnabled)
                .map((day) => day.id)
                .join(','),
            )
          }
        >
          {props.content.labels.save}
        </LumenButton>
      </footer>
    </Root>
  )
}

function Timeline(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingTimelineContent }) {
  const views = uniqueLumenSchedulingItems(props.content.views)
  const hours = uniqueLumenSchedulingItems(props.content.hours)
  const days = uniqueLumenSchedulingItems(props.content.days)
  const events = uniqueLumenSchedulingItems(props.content.events)
  const [viewId, setViewId] = React.useState(props.content.initialViewId)
  const selectedView = selectLumenSchedulingItem(views, viewId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenTabs
        className="lumen-scheduling-tabs"
        label={props.content.labels.viewGroup}
        items={views}
        selectedId={selectedView?.id ?? null}
        onChange={setViewId}
      />
      <div
        className="lumen-scheduling-timeline"
        aria-label={props.content.labels.timeline}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        <aside>
          {hours.map((hour) => (
            <LumenText key={hour.id} as="span" tone="muted" variant="supporting">
              {hour.label}
            </LumenText>
          ))}
        </aside>
        <main>
          {days.length ? (
            days.map((day) => (
              <section key={day.id}>
                <LumenText as="strong" variant="label">
                  {day.label}
                </LumenText>
                {events
                  .filter((event) => event.dayId === day.id)
                  .map((event) => (
                    <LumenButton
                      key={event.id}
                      className="lumen-scheduling-timeline-event"
                      variant="outlined"
                      tone={event.tone}
                      style={{
                        marginBlockStart: `${Math.max(0, Math.min(100, event.topPercent)) / 8}rem`,
                        blockSize: `${Math.max(8, Math.min(100, event.heightPercent))}%`,
                      }}
                      onClick={() => report(props.onAction, 'open-event', event.id)}
                    >
                      <span>{event.title}</span>
                      <small>{event.time}</small>
                    </LumenButton>
                  ))}
              </section>
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.empty}
            </LumenText>
          )}
        </main>
      </div>
    </Root>
  )
}

function Booking(props: Omit<LumenSchedulingProps, 'content'> & { content: LumenSchedulingBookingContent }) {
  const days = uniqueLumenSchedulingItems(props.content.days)
  const slots = uniqueLumenSchedulingItems(props.content.slots)
  const [dayId, setDayId] = React.useState(props.content.initialDayId)
  const selectedDay = selectLumenSchedulingItem(days, dayId)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <article className="lumen-scheduling-booking-summary">
        <div>
          <LumenText as="strong" variant="heading">
            {props.content.summary.title}
          </LumenText>
          <LumenText as="span" tone="muted">
            {props.content.summary.detail}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {props.content.summary.timezone}
          </LumenText>
        </div>
        <LumenStatus value={props.content.summary.status} tone="success" />
      </article>
      <div
        className="lumen-scheduling-choice-row lumen-scheduling-day-strip"
        role="group"
        aria-label={props.content.labels.days}
      >
        {days.length ? (
          days.map((day) => (
            <LumenButton
              key={day.id}
              variant={selectedDay?.id === day.id ? 'solid' : 'outlined'}
              aria-pressed={selectedDay?.id === day.id}
              disabled={day.disabled}
              onClick={() => setDayId(day.id)}
            >
              {day.label}
            </LumenButton>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.emptyDays}
          </LumenText>
        )}
      </div>
      <div
        className="lumen-scheduling-booking-slots"
        aria-label={props.content.labels.slots(selectedDay?.label ?? '')}
        data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}
      >
        {slots.length ? (
          slots.map((slot) => (
            <LumenButton
              key={slot.id}
              variant="outlined"
              disabled={slot.disabled || !selectedDay}
              onClick={() => report(props.onAction, 'book', `${selectedDay?.id ?? ''}:${slot.id}`)}
            >
              {slot.label}
            </LumenButton>
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.emptySlots}
          </LumenText>
        )}
      </div>
    </Root>
  )
}

function empty(props: LumenSchedulingProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenScheduling(props: LumenSchedulingProps) {
  const inheritedContent = useLumenSchedulingContent()
  if (props.slots) {
    return (
      <Root {...props} className={['lumen-scheduling-controlled', props.className].filter(Boolean).join(' ')}>
        {props.slots.header}
        {props.slots.body}
        {props.slots.footer}
      </Root>
    )
  }
  const content = props.content ?? inheritedContent
  if (props.variant === 1 && content?.referenceMonth) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-month-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingMonthReference content={content.referenceMonth} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 2 && content?.referenceRange) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-range-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingRangeReference content={content.referenceRange} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 3 && content?.referenceForm) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-form-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingFormReference content={content.referenceForm} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 4 && content?.referenceDeadline) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-deadline-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingDeadlineReference content={content.referenceDeadline} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 5 && content?.referenceAvailability) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-availability-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingAvailabilityReference content={content.referenceAvailability} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 6 && content?.referenceTimeline) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-timeline-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingTimelineReference content={content.referenceTimeline} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 7 && content?.referenceBooking) {
    return (
      <Root
        {...props}
        className={[
          'lumen-scheduling-booking-reference',
          'hbar-app-ui-stage-padding-owner',
          'hbar-app-ui-full-canvas-owner',
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LumenSchedulingBookingReference content={content.referenceBooking} onAction={props.onAction} />
      </Root>
    )
  }
  if (props.variant === 1) {
    return content?.month ? <Month {...props} content={content.month} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.timeRange ? <TimeRange {...props} content={content.timeRange} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.form ? <Form {...props} content={content.form} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.deadline ? <Deadline {...props} content={content.deadline} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.availability ? <Availability {...props} content={content.availability} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.timeline ? <Timeline {...props} content={content.timeline} /> : empty(props)
  }
  if (props.variant === 7) {
    return content?.booking ? <Booking {...props} content={content.booking} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenSchedulingVariantProps) {
  return <LumenScheduling {...props} variant={value} variantId={`hbar-app-ui-scheduling-${value}`} />
}

export const LumenScheduling01 = (props: LumenSchedulingVariantProps) => variant(1, props)

export const LumenScheduling02 = (props: LumenSchedulingVariantProps) => variant(2, props)

export const LumenScheduling03 = (props: LumenSchedulingVariantProps) => variant(3, props)

export const LumenScheduling04 = (props: LumenSchedulingVariantProps) => variant(4, props)

export const LumenScheduling05 = (props: LumenSchedulingVariantProps) => variant(5, props)

export const LumenScheduling06 = (props: LumenSchedulingVariantProps) => variant(6, props)

export const LumenScheduling07 = (props: LumenSchedulingVariantProps) => variant(7, props)
