'use client'

import * as React from 'react'
import { ChevronDown, Copy, Plus, RotateCcw, Trash2 } from 'lucide-react'
import LumenSurface from './LumenSurface'
import './forms-9-reference.css'

export interface LumenForms9Option {
  readonly id: string
  readonly label: string
}

export interface LumenForms9TimeOption {
  readonly minuteOfDay: number
  readonly label: string
}

export interface LumenForms9TimeInterval {
  readonly id: string
  readonly startMinute: number
  readonly endMinute: number
  readonly startLabel: string
  readonly endLabel: string
  readonly durationLabel: string
}

export interface LumenForms9Day {
  readonly id: string
  readonly label: string
  readonly isOpen: boolean
  readonly durationLabel: string
  readonly intervals: readonly LumenForms9TimeInterval[]
}

export interface LumenForms9Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly weeklyTotalLabel: string
  readonly intervalSeparatorLabel: string
  readonly timeZoneLabel: string
  readonly copyMondayToWeekdaysLabel: string
  readonly openDaySwitchLabel: (dayLabel: string) => string
  readonly intervalTimeLabel: (dayLabel: string, intervalNumber: number, edge: 'start' | 'end') => string
  readonly closedLabel: string
  readonly addHoursButtonLabel: string
  readonly removeTimeRangeButtonLabel: string
  readonly holidayBookingsLabel: string
  readonly savedStatus: string
  readonly unsavedStatus: string
  readonly resetLabel: string
  readonly saveLabel: string
}

export interface LumenForms9Content {
  readonly copy: LumenForms9Copy
  readonly timeZoneId: string
  readonly timeZoneOptions: {
    readonly completeness: 'partial'
    readonly items: readonly LumenForms9Option[]
  }
  readonly timeOptions: {
    readonly completeness: 'partial'
    readonly items: readonly LumenForms9TimeOption[]
  }
  readonly days: readonly LumenForms9Day[]
  readonly weeklyTotalLabel: string
  readonly acceptBookingsOnPublicHolidays: boolean
  readonly isDirty: boolean
  readonly canResetLocalDraft: boolean
  readonly canRequestSave: boolean
  readonly dayCollection: {
    readonly kind: 'pane-scroll'
    readonly dayCount: 7
    readonly intervalCapacityEvidence: 'not-observed'
  }
}

export interface LumenForms9Draft {
  readonly timeZoneId: string
  readonly days: readonly {
    readonly id: string
    readonly isOpen: boolean
    readonly intervals: readonly {
      readonly id: string
      readonly startMinute: number
      readonly endMinute: number
    }[]
  }[]
  readonly acceptBookingsOnPublicHolidays: boolean
}

export interface LumenForms9ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms9Content
  readonly onTimeZoneChange: (timeZoneId: string) => void
  readonly onDayOpenChange: (dayId: string, isOpen: boolean) => void
  readonly onIntervalMinuteChange: (
    dayId: string,
    intervalId: string,
    edge: 'startMinute' | 'endMinute',
    minuteOfDay: number,
  ) => void
  readonly onCopyMondayToWeekdays: () => void
  readonly onPublicHolidaysChange: (accept: boolean) => void
  readonly onAddTimeRangeRequest: (dayId: string) => void
  readonly onRemoveTimeRangeRequest: (dayId: string, intervalId: string) => void
  readonly onResetDraft: () => void
  readonly onSaveHoursRequest: (draft: LumenForms9Draft) => void
}

export type LumenForms9ViewModel = Omit<LumenForms9ReferenceProps, 'instanceId'>

function controlId(instanceId: string, name: string): string {
  return `${instanceId}-forms-9-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function LumenForms9Picker({
  id,
  label,
  value,
  options,
  onChoose,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly options: readonly LumenForms9Option[]
  readonly onChoose: (id: string) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const listboxId = `${id}-options`

  return (
    <div className="lumen-forms-9-picker">
      <button
        aria-label={label}
        aria-expanded={expanded}
        className="lumen-forms-9-picker-trigger"
        id={id}
        onClick={() => setExpanded((current) => !current)}
        role="combobox"
        type="button"
      >
        <span>{value}</span>
        <ChevronDown className="lumen-forms-9-icon lumen-forms-9-icon-xs" aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="lumen-forms-9-options" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              aria-selected={option.label === value}
              className="lumen-forms-9-option"
              key={option.id}
              onClick={() => {
                onChoose(option.id)
                setExpanded(false)
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LumenForms9TimePicker({
  id,
  label,
  minuteOfDay,
  value,
  options,
  onChoose,
}: {
  readonly id: string
  readonly label: string
  readonly minuteOfDay: number
  readonly value: string
  readonly options: readonly LumenForms9TimeOption[]
  readonly onChoose: (minuteOfDay: number) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const listboxId = `${id}-options`

  return (
    <div className="lumen-forms-9-picker">
      <button
        aria-label={label}
        aria-expanded={expanded}
        className="lumen-forms-9-time-trigger"
        id={id}
        onClick={() => setExpanded((current) => !current)}
        role="combobox"
        type="button"
      >
        <span>{value}</span>
        <ChevronDown className="lumen-forms-9-icon lumen-forms-9-icon-xs" aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="lumen-forms-9-options" id={listboxId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              aria-selected={option.minuteOfDay === minuteOfDay}
              className="lumen-forms-9-option"
              key={option.minuteOfDay}
              onClick={() => {
                onChoose(option.minuteOfDay)
                setExpanded(false)
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LumenForms9Reference({
  instanceId,
  content,
  onTimeZoneChange,
  onDayOpenChange,
  onIntervalMinuteChange,
  onCopyMondayToWeekdays,
  onPublicHolidaysChange,
  onAddTimeRangeRequest,
  onRemoveTimeRangeRequest,
  onResetDraft,
  onSaveHoursRequest,
}: LumenForms9ReferenceProps): React.ReactElement {
  const draft: LumenForms9Draft = {
    timeZoneId: content.timeZoneId,
    days: content.days.map((day) => ({
      id: day.id,
      isOpen: day.isOpen,
      intervals: day.intervals.map(({ id, startMinute, endMinute }) => ({
        id,
        startMinute,
        endMinute,
      })),
    })),
    acceptBookingsOnPublicHolidays: content.acceptBookingsOnPublicHolidays,
  }
  const currentTimeZone = content.timeZoneOptions.items.find((option) => option.id === content.timeZoneId)

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-9-surface"
      contentClassName="lumen-forms-9-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-9"
      data-hbar-app-ui-list-strategy={content.dayCollection.kind}
    >
      <div className="lumen-forms-9-heading">
        <div className="lumen-forms-9-title">
          <h2>{content.copy.pageTitle}</h2>
          <p>{content.copy.pageDescription}</p>
        </div>
        <div className="lumen-forms-9-weekly-total">
          <p>{content.copy.weeklyTotalLabel}</p>
          <p>{content.weeklyTotalLabel}</p>
        </div>
      </div>

      <div className="lumen-forms-9-toolbar">
        <div className="lumen-forms-9-zone-control">
          <label htmlFor={controlId(instanceId, 'time-zone')}>{content.copy.timeZoneLabel}</label>
          <LumenForms9Picker
            id={controlId(instanceId, 'time-zone')}
            label={content.copy.timeZoneLabel}
            value={currentTimeZone?.label ?? ''}
            options={content.timeZoneOptions.items}
            onChoose={onTimeZoneChange}
          />
        </div>
        <button className="lumen-forms-9-copy-button" onClick={onCopyMondayToWeekdays} type="button">
          <Copy className="lumen-forms-9-icon lumen-forms-9-icon-sm" aria-hidden="true" />
          {content.copy.copyMondayToWeekdaysLabel}
        </button>
      </div>

      <div className="lumen-forms-9-day-list" data-day-collection="pane-scroll">
        {content.days.map((day) => (
          <div className="lumen-forms-9-day" key={day.id} data-day-id={day.id}>
            <div className="lumen-forms-9-day-heading">
              <button
                aria-checked={day.isOpen}
                aria-label={content.copy.openDaySwitchLabel(day.label)}
                className="lumen-forms-9-day-switch"
                onClick={() => onDayOpenChange(day.id, !day.isOpen)}
                role="switch"
                type="button"
              >
                <span />
              </button>
              <span className="lumen-forms-9-day-label">{day.label}</span>
              <span className="lumen-forms-9-day-duration">
                {day.isOpen ? day.durationLabel : content.copy.closedLabel}
              </span>
            </div>

            {day.isOpen ? (
              <div className="lumen-forms-9-intervals">
                {day.intervals.map((interval, index) => {
                  const intervalNumber = index + 1
                  const startLabel = content.copy.intervalTimeLabel(day.label, intervalNumber, 'start')
                  const endLabel = content.copy.intervalTimeLabel(day.label, intervalNumber, 'end')
                  return (
                    <div className="lumen-forms-9-interval" key={interval.id} data-interval-id={interval.id}>
                      <LumenForms9TimePicker
                        id={controlId(instanceId, `${day.id}-${interval.id}-start`)}
                        label={startLabel}
                        minuteOfDay={interval.startMinute}
                        value={interval.startLabel}
                        options={content.timeOptions.items}
                        onChoose={(minuteOfDay) =>
                          onIntervalMinuteChange(day.id, interval.id, 'startMinute', minuteOfDay)
                        }
                      />
                      <span className="lumen-forms-9-to">{content.copy.intervalSeparatorLabel}</span>
                      <LumenForms9TimePicker
                        id={controlId(instanceId, `${day.id}-${interval.id}-end`)}
                        label={endLabel}
                        minuteOfDay={interval.endMinute}
                        value={interval.endLabel}
                        options={content.timeOptions.items}
                        onChoose={(minuteOfDay) =>
                          onIntervalMinuteChange(day.id, interval.id, 'endMinute', minuteOfDay)
                        }
                      />
                      <button
                        aria-label={content.copy.removeTimeRangeButtonLabel}
                        className="lumen-forms-9-remove-button"
                        disabled={day.intervals.length <= 1}
                        onClick={() => onRemoveTimeRangeRequest(day.id, interval.id)}
                        type="button"
                      >
                        <Trash2 className="lumen-forms-9-icon lumen-forms-9-icon-sm" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
                <button
                  className="lumen-forms-9-add-button"
                  onClick={() => onAddTimeRangeRequest(day.id)}
                  type="button"
                >
                  <Plus className="lumen-forms-9-icon lumen-forms-9-icon-sm" aria-hidden="true" />
                  {content.copy.addHoursButtonLabel}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="lumen-forms-9-holidays">
        <input
          checked={content.acceptBookingsOnPublicHolidays}
          id={controlId(instanceId, 'public-holidays')}
          onChange={(event) => onPublicHolidaysChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <label htmlFor={controlId(instanceId, 'public-holidays')}>{content.copy.holidayBookingsLabel}</label>
      </div>

      <div className="lumen-forms-9-footer">
        <p>{content.isDirty ? content.copy.unsavedStatus : content.copy.savedStatus}</p>
        <div className="lumen-forms-9-footer-actions">
          <button
            className="lumen-forms-9-reset-button"
            disabled={!content.canResetLocalDraft}
            onClick={onResetDraft}
            type="button"
          >
            <RotateCcw className="lumen-forms-9-icon lumen-forms-9-icon-xs" aria-hidden="true" />
            {content.copy.resetLabel}
          </button>
          <button
            className="lumen-forms-9-save-button"
            disabled={!content.canRequestSave}
            onClick={() => onSaveHoursRequest(draft)}
            type="button"
          >
            {content.copy.saveLabel}
          </button>
        </div>
      </div>
    </LumenSurface>
  )
}
