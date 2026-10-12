'use client'

import * as React from 'react'
import { LumenSelect } from './forms'
import type { LumenSchedulingAction, LumenSchedulingChoice, LumenSchedulingListStrategy } from './scheduling'
import { selectLumenSchedulingItem, uniqueLumenSchedulingItems } from './scheduling-model'
import './scheduling-availability-reference.css'

export interface LumenSchedulingAvailabilityReferenceInterval {
  readonly id: string
  readonly startId: string
  readonly endId: string
}

export interface LumenSchedulingAvailabilityReferenceDay {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  readonly intervals: readonly LumenSchedulingAvailabilityReferenceInterval[]
}

export interface LumenSchedulingAvailabilityReferenceContent {
  readonly labels: {
    readonly title: string
    readonly description: (enabledDays: number) => string
    readonly timezone: string
    readonly availability: (day: string) => string
    readonly from: string
    readonly to: string
    readonly remove: (day: string) => string
    readonly add: (day: string) => string
    readonly copy: (day: string) => string
    readonly unavailable: string
    readonly footer: string
    readonly save: string
    readonly emptyDays: string
    readonly emptyTimes: string
    readonly emptyIntervals: string
    readonly emptyTimezones: string
  }
  readonly timezones: readonly LumenSchedulingChoice[]
  readonly timezoneId: string
  readonly times: readonly LumenSchedulingChoice[]
  readonly days: readonly LumenSchedulingAvailabilityReferenceDay[]
  /** The seven-day list grows in flow. Over-bound data may opt into pane scrolling. */
  readonly dayStrategy: LumenSchedulingListStrategy
  /** Each day grows with its short interval set; explicit stress panes scroll. */
  readonly intervalStrategy: LumenSchedulingListStrategy
  readonly onTimezoneChange?: ((id: string) => void) | undefined
  readonly onDayChange?: ((id: string, enabled: boolean) => void) | undefined
  readonly onIntervalAdd?: ((dayId: string) => void) | undefined
  readonly onIntervalRemove?: ((dayId: string, intervalId: string) => void) | undefined
  readonly onIntervalStartChange?: ((dayId: string, intervalId: string, timeId: string) => void) | undefined
  readonly onIntervalEndChange?: ((dayId: string, intervalId: string, timeId: string) => void) | undefined
}

function AvailabilityIcon({ kind }: { readonly kind: 'add' | 'copy' | 'remove' }): React.ReactElement {
  const paths = {
    add: 'M12 5v14M5 12h14',
    copy: 'M8 10a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2ZM16 6V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2',
    remove: 'M6 6l12 12M18 6 6 18',
  }
  return (
    <svg className="lumen-scheduling-availability-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  )
}

function AvailabilityTime({
  options,
  value,
  label,
  onChange,
  empty,
}: {
  readonly options: readonly LumenSchedulingChoice[]
  readonly value: string
  readonly label: string
  readonly onChange: ((id: string) => void) | undefined
  readonly empty: string
}): React.ReactElement {
  const selected = selectLumenSchedulingItem(options, value)
  return (
    <LumenSelect
      variant="plain"
      className="lumen-scheduling-availability-select"
      aria-label={label}
      value={selected?.id ?? ''}
      disabled={!options.length}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    >
      {options.length ? (
        options.map((item) => (
          <option key={item.id} value={item.id} disabled={item.disabled}>
            {item.label}
          </option>
        ))
      ) : (
        <option value="">{empty}</option>
      )}
    </LumenSelect>
  )
}

export function LumenSchedulingAvailabilityReference({
  content,
  onAction,
}: {
  readonly content: LumenSchedulingAvailabilityReferenceContent
  readonly onAction: ((event: LumenSchedulingAction) => void) | undefined
}): React.ReactElement {
  const days = uniqueLumenSchedulingItems(content.days)
  const times = uniqueLumenSchedulingItems(content.times)
  const zones = uniqueLumenSchedulingItems(content.timezones)
  const zone = selectLumenSchedulingItem(zones, content.timezoneId)
  const enabledCount = days.filter((day) => day.enabled).length
  return (
    <section className="lumen-scheduling-availability-card">
      <header data-hbar-app-ui-region="availability-header">
        <div>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.description(enabledCount)}</p>
        </div>
        <LumenSelect
          variant="plain"
          className="lumen-scheduling-availability-zone"
          aria-label={content.labels.timezone}
          value={zone?.id ?? ''}
          disabled={!zones.length}
          onChange={(event) => content.onTimezoneChange?.(event.currentTarget.value)}
        >
          {zones.length ? (
            zones.map((item) => (
              <option key={item.id} value={item.id} disabled={item.disabled}>
                {item.label}
              </option>
            ))
          ) : (
            <option value="">{content.labels.emptyTimezones}</option>
          )}
        </LumenSelect>
      </header>
      <div
        className="lumen-scheduling-availability-days"
        data-hbar-app-ui-region="availability-days"
        data-hbar-app-ui-list-strategy={content.dayStrategy.kind}
      >
        {days.length ? (
          days.map((day) => {
            const intervals = uniqueLumenSchedulingItems(day.intervals)
            return (
              <div className="lumen-scheduling-availability-day" key={day.id} data-hbar-app-ui-target={day.id}>
                <div className="lumen-scheduling-availability-day-heading">
                  <button
                    type="button"
                    role="switch"
                    aria-label={content.labels.availability(day.label)}
                    aria-checked={day.enabled}
                    data-hbar-app-ui-action="toggle-day"
                    data-hbar-app-ui-target={day.id}
                    onClick={() => {
                      content.onDayChange?.(day.id, !day.enabled)
                      onAction?.({ actionId: 'toggle-day', value: day.id })
                    }}
                  >
                    <span />
                  </button>
                  <span>{day.label}</span>
                </div>
                <div
                  className="lumen-scheduling-availability-intervals"
                  data-hbar-app-ui-list-strategy={content.intervalStrategy.kind}
                >
                  {day.enabled ? (
                    intervals.length ? (
                      intervals.map((interval) => (
                        <div
                          className="lumen-scheduling-availability-interval"
                          key={interval.id}
                          data-hbar-app-ui-interval={interval.id}
                        >
                          <AvailabilityTime
                            options={times}
                            value={interval.startId}
                            label={content.labels.from}
                            empty={content.labels.emptyTimes}
                            onChange={(id) => content.onIntervalStartChange?.(day.id, interval.id, id)}
                          />
                          <AvailabilityTime
                            options={times}
                            value={interval.endId}
                            label={content.labels.to}
                            empty={content.labels.emptyTimes}
                            onChange={(id) => content.onIntervalEndChange?.(day.id, interval.id, id)}
                          />
                          <button
                            type="button"
                            aria-label={content.labels.remove(day.label)}
                            disabled={intervals.length <= 1}
                            data-hbar-app-ui-action="remove-interval"
                            data-hbar-app-ui-target={`${day.id}:${interval.id}`}
                            onClick={() => {
                              content.onIntervalRemove?.(day.id, interval.id)
                              onAction?.({ actionId: 'remove-interval', value: `${day.id}:${interval.id}` })
                            }}
                          >
                            <AvailabilityIcon kind="remove" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p>{content.labels.emptyIntervals}</p>
                    )
                  ) : (
                    <p>{content.labels.unavailable}</p>
                  )}
                </div>
                <div className="lumen-scheduling-availability-actions">
                  <button
                    type="button"
                    aria-label={content.labels.add(day.label)}
                    disabled={!day.enabled}
                    data-hbar-app-ui-action="add-interval"
                    data-hbar-app-ui-target={day.id}
                    onClick={() => {
                      content.onIntervalAdd?.(day.id)
                      onAction?.({ actionId: 'add-interval', value: day.id })
                    }}
                  >
                    <AvailabilityIcon kind="add" />
                  </button>
                  <button
                    type="button"
                    aria-label={content.labels.copy(day.label)}
                    disabled={!day.enabled}
                    data-hbar-app-ui-action="copy-day"
                    data-hbar-app-ui-target={day.id}
                    onClick={() => onAction?.({ actionId: 'copy-day', value: day.id })}
                  >
                    <AvailabilityIcon kind="copy" />
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <p>{content.labels.emptyDays}</p>
        )}
      </div>
      <footer data-hbar-app-ui-region="availability-footer">
        <p>{content.labels.footer}</p>
        <button type="button" onClick={() => onAction?.({ actionId: 'save-hours' })}>
          {content.labels.save}
        </button>
      </footer>
    </section>
  )
}
