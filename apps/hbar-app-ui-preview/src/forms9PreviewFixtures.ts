import {
  FORMS9_DAY_ORDER,
  forms9DayMinutes,
  forms9WeeklyMinutes,
  isForms9DraftDirty,
  type Forms9Day,
  type Forms9DayId,
  type Forms9PreviewStoreSeed,
  type Forms9PreviewStoreState,
  type Forms9TimeInterval,
} from './forms9PreviewStore'

export type Forms9PreviewLocale = 'en' | 'de'

export interface Forms9TimeZoneOption {
  readonly id: string
  readonly label: string
}

export interface Forms9TimeOption {
  readonly minuteOfDay: number
  readonly label: string
}

export interface Forms9PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly weeklyTotalLabel: string
  readonly intervalSeparatorLabel: string
  readonly timeZoneLabel: string
  readonly copyMondayToWeekdaysLabel: string
  readonly addHoursButtonLabel: string
  readonly removeTimeRangeButtonLabel: string
  readonly dayLabels: Readonly<Record<Forms9DayId, string>>
  readonly openDaySwitchLabel: (dayLabel: string) => string
  readonly intervalTimeLabel: (dayLabel: string, intervalNumber: number, edge: 'start' | 'end') => string
  readonly closedLabel: string
  readonly addHoursLabel: (dayLabel: string) => string
  readonly removeTimeRangeLabel: (dayLabel: string, intervalNumber: number) => string
  readonly holidayBookingsLabel: string
  readonly savedStatus: string
  readonly unsavedStatus: string
  readonly resetLabel: string
  readonly saveLabel: string
  readonly formatWeeklyTotal: (minutes: number) => string
  readonly formatDayDuration: (minutes: number) => string
  readonly formatTime: (minuteOfDay: number) => string
}

export interface Forms9TimeIntervalContent extends Forms9TimeInterval {
  readonly startLabel: string
  readonly endLabel: string
  readonly durationMinutes: number
  readonly durationLabel: string
}

export interface Forms9DayContent extends Omit<Forms9Day, 'intervals'> {
  readonly label: string
  readonly durationMinutes: number
  readonly durationLabel: string
  readonly intervals: readonly Forms9TimeIntervalContent[]
}

export interface Forms9PreviewContent {
  readonly copy: Forms9PreviewCopy
  readonly timeZoneId: string
  readonly timeZoneOptions: {
    readonly completeness: 'partial'
    readonly items: readonly Forms9TimeZoneOption[]
  }
  readonly timeOptions: {
    readonly completeness: 'partial'
    readonly items: readonly Forms9TimeOption[]
  }
  readonly days: readonly Forms9DayContent[]
  readonly weeklyTotalMinutes: number
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
  readonly overlapEvidence: 'source-docs-mention-rule-behavior-unobserved'
}

export interface Forms9PreviewFixture {
  readonly locale: Forms9PreviewLocale
  readonly copy: Forms9PreviewCopy
  readonly storeSeed: Forms9PreviewStoreSeed
  readonly contentFor: (state: Forms9PreviewStoreState) => Forms9PreviewContent
}

const TIME_ZONE_ID = 'america-chicago'

function makeFormatters(
  locale: Forms9PreviewLocale,
): Pick<Forms9PreviewCopy, 'formatWeeklyTotal' | 'formatDayDuration' | 'formatTime'> {
  const numberLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const unit = locale === 'de' ? 'Std.' : 'h'
  const formatHours = (minutes: number) =>
    new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(minutes / 60)

  return {
    formatWeeklyTotal: (minutes) => formatHours(minutes) + ' ' + unit,
    formatDayDuration: (minutes) => formatHours(minutes) + ' ' + unit,
    formatTime: (minuteOfDay) => {
      const hour = Math.floor(minuteOfDay / 60)
      const minute = minuteOfDay % 60
      const minuteText = String(minute).padStart(2, '0')
      if (locale === 'de') return String(hour).padStart(2, '0') + ':' + minuteText
      const period = hour >= 12 ? 'PM' : 'AM'
      const hour12 = hour % 12 || 12
      return String(hour12) + ':' + minuteText + ' ' + period
    },
  }
}

function copyFor(locale: Forms9PreviewLocale): Forms9PreviewCopy {
  const formatters = makeFormatters(locale)
  if (locale === 'de') {
    return {
      pageTitle: 'Öffnungszeiten',
      pageDescription:
        'Legen Sie fest, wann Ihre Tierarztpraxis Termine annimmt, und prüfen Sie die gesamte wöchentliche Verfügbarkeit für Ihr Team.',
      weeklyTotalLabel: 'Wöchentliche Gesamtzeit',
      intervalSeparatorLabel: 'bis',
      timeZoneLabel: 'Zeitzone',
      copyMondayToWeekdaysLabel: 'Montag auf Werktage kopieren',
      addHoursButtonLabel: 'Zeitraum hinzufügen',
      removeTimeRangeButtonLabel: 'Zeitraum entfernen',
      dayLabels: {
        monday: 'Montag',
        tuesday: 'Dienstag',
        wednesday: 'Mittwoch',
        thursday: 'Donnerstag',
        friday: 'Freitag',
        saturday: 'Samstag',
        sunday: 'Sonntag',
      },
      openDaySwitchLabel: (dayLabel) => dayLabel + ' geöffnet',
      intervalTimeLabel: (dayLabel, intervalNumber, edge) =>
        dayLabel + ' Zeitbereich ' + intervalNumber + (edge === 'start' ? ' beginnt um' : ' endet um'),
      closedLabel: 'Geschlossen',
      addHoursLabel: (dayLabel) => 'Zeitraum für ' + dayLabel + ' hinzufügen',
      removeTimeRangeLabel: (dayLabel, intervalNumber) =>
        'Zeitraum ' + intervalNumber + ' für ' + dayLabel + ' entfernen',
      holidayBookingsLabel: 'Termine an Feiertagen annehmen',
      savedStatus: 'Alle Öffnungszeiten sind auf dem neuesten Stand.',
      unsavedStatus: 'Sie haben nicht gespeicherte Änderungen.',
      resetLabel: 'Zurücksetzen',
      saveLabel: 'Öffnungszeiten speichern',
      ...formatters,
    }
  }

  return {
    pageTitle: 'Opening hours',
    pageDescription: 'When your veterinary practice takes appointments.',
    weeklyTotalLabel: 'Weekly total',
    intervalSeparatorLabel: 'to',
    timeZoneLabel: 'Time zone',
    copyMondayToWeekdaysLabel: 'Copy Monday to weekdays',
    addHoursButtonLabel: 'Add hours',
    removeTimeRangeButtonLabel: 'Remove time range',
    dayLabels: {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    },
    openDaySwitchLabel: (dayLabel) => dayLabel + ' open',
    intervalTimeLabel: (dayLabel, intervalNumber, edge) =>
      dayLabel + ' interval ' + intervalNumber + (edge === 'start' ? ' opens at' : ' closes at'),
    closedLabel: 'Closed',
    addHoursLabel: (dayLabel) => 'Add hours for ' + dayLabel,
    removeTimeRangeLabel: (dayLabel, intervalNumber) => 'Remove time range ' + intervalNumber + ' for ' + dayLabel,
    holidayBookingsLabel: 'Accept bookings on public holidays',
    savedStatus: 'All hours are up to date.',
    unsavedStatus: 'You have unsaved changes.',
    resetLabel: 'Reset',
    saveLabel: 'Save hours',
    ...formatters,
  }
}

function interval(id: string, startMinute: number, endMinute: number): Forms9TimeInterval {
  return { id, startMinute, endMinute }
}

function sourceDays(): readonly Forms9Day[] {
  return [
    {
      id: 'monday',
      isOpen: true,
      intervals: [interval('monday-morning', 8 * 60, 12 * 60), interval('monday-afternoon', 13 * 60, 18 * 60)],
    },
    {
      id: 'tuesday',
      isOpen: true,
      intervals: [interval('tuesday-morning', 8 * 60, 12 * 60), interval('tuesday-afternoon', 13 * 60, 18 * 60)],
    },
    {
      id: 'wednesday',
      isOpen: true,
      intervals: [interval('wednesday-morning', 8 * 60, 12 * 60), interval('wednesday-afternoon', 13 * 60, 18 * 60)],
    },
    {
      id: 'thursday',
      isOpen: true,
      intervals: [interval('thursday-morning', 8 * 60, 12 * 60), interval('thursday-afternoon', 13 * 60, 19 * 60)],
    },
    {
      id: 'friday',
      isOpen: true,
      intervals: [interval('friday-morning', 8 * 60, 12 * 60), interval('friday-afternoon', 13 * 60, 17 * 60)],
    },
    {
      id: 'saturday',
      isOpen: true,
      intervals: [interval('saturday-single', 9 * 60, 13 * 60)],
    },
    { id: 'sunday', isOpen: false, intervals: [] },
  ]
}

function timeZoneOptions(): Forms9PreviewContent['timeZoneOptions'] {
  return {
    completeness: 'partial',
    items: [{ id: TIME_ZONE_ID, label: 'Chicago (GMT-06:00)' }],
  }
}

function timeOptions(copy: Forms9PreviewCopy): Forms9PreviewContent['timeOptions'] {
  const observedMinuteValues = [8 * 60, 9 * 60, 12 * 60, 13 * 60, 17 * 60, 18 * 60, 19 * 60]
  return {
    completeness: 'partial',
    items: observedMinuteValues.map((minuteOfDay) => ({
      minuteOfDay,
      label: copy.formatTime(minuteOfDay),
    })),
  }
}

export function createForms9PreviewFixture(locale: Forms9PreviewLocale = 'en'): Forms9PreviewFixture {
  const copy = copyFor(locale)
  const storeSeed: Forms9PreviewStoreSeed = {
    timeZoneId: TIME_ZONE_ID,
    days: sourceDays(),
    acceptBookingsOnPublicHolidays: false,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const days = state.draft.days.map((day) => {
        const durationMinutes = forms9DayMinutes(day)
        return {
          ...day,
          label: copy.dayLabels[day.id],
          durationMinutes,
          durationLabel: copy.formatDayDuration(durationMinutes),
          intervals: day.intervals.map((item) => {
            const durationMinutes = item.endMinute > item.startMinute ? item.endMinute - item.startMinute : 0
            return {
              ...item,
              startLabel: copy.formatTime(item.startMinute),
              endLabel: copy.formatTime(item.endMinute),
              durationMinutes,
              durationLabel: copy.formatDayDuration(durationMinutes),
            }
          }),
        }
      })
      const weeklyTotalMinutes = forms9WeeklyMinutes(state.draft)
      const isDirty = isForms9DraftDirty(state)
      return {
        copy,
        timeZoneId: state.draft.timeZoneId,
        timeZoneOptions: timeZoneOptions(),
        timeOptions: timeOptions(copy),
        days,
        weeklyTotalMinutes,
        weeklyTotalLabel: copy.formatWeeklyTotal(weeklyTotalMinutes),
        acceptBookingsOnPublicHolidays: state.draft.acceptBookingsOnPublicHolidays,
        isDirty,
        canResetLocalDraft: isDirty,
        canRequestSave: isDirty,
        dayCollection: {
          kind: 'pane-scroll',
          dayCount: FORMS9_DAY_ORDER.length,
          intervalCapacityEvidence: 'not-observed',
        },
        overlapEvidence: 'source-docs-mention-rule-behavior-unobserved',
      }
    },
  }
}
