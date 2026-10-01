import type { HbarAppUiSchedulingContent } from 'hbar-app-ui/catalog'
import { uniqueSchedulingPreviewItems, type SchedulingPreviewStoreApi } from './schedulingPreviewModel'

export function projectSchedulingPreview(
  input: HbarAppUiSchedulingContent,
  store: SchedulingPreviewStoreApi,
): HbarAppUiSchedulingContent {
  const state = store.getState()
  const { flow, scope } = state
  switch (scope.variant) {
    case 1: {
      const content = input.referenceMonth
      return {
        month: input.month,
        referenceMonth:
          content && flow.kind === 'month'
            ? {
                ...content,
                activeDayId: flow.dayId,
                monthId: flow.monthId,
                yearId: flow.yearId,
                filterId: flow.filterId,
                onDayChange: (id) => {
                  state.choose(scope, 'dayId', id)
                },
                onMonthChange: (id) => {
                  state.choose(scope, 'monthId', id)
                },
                onYearChange: (id) => {
                  state.choose(scope, 'yearId', id)
                },
                onFilterChange: (id) => {
                  state.choose(scope, 'filterId', id)
                },
              }
            : content,
      }
    }
    case 2: {
      const content = input.referenceRange
      return {
        timeRange: input.timeRange,
        referenceRange:
          content && flow.kind === 'range'
            ? {
                ...content,
                startId: flow.startId,
                endId: flow.endId,
                durationId: flow.durationId,
                onStartChange: (id) => {
                  state.choose(scope, 'startId', id)
                },
                onEndChange: (id) => {
                  state.choose(scope, 'endId', id)
                },
                onDurationChange: (id) => {
                  state.choose(scope, 'durationId', id)
                },
              }
            : content,
      }
    }
    case 3: {
      const content = input.referenceForm
      return {
        form: input.form,
        referenceForm:
          content && flow.kind === 'form'
            ? {
                ...content,
                name: flow.name,
                attendeeQuery: flow.attendeeQuery,
                attendees: uniqueSchedulingPreviewItems(content.attendees).filter((item) =>
                  flow.attendeeIds.includes(item.id),
                ),
                date: flow.date,
                startId: flow.startId,
                endId: flow.endId,
                meetingLink: flow.meetingLink,
                notes: flow.notes,
                onNameChange: (value) => {
                  state.draft(scope, 'name', value)
                },
                onAttendeeQueryChange: (value) => {
                  state.draft(scope, 'attendeeQuery', value)
                },
                onRemoveAttendee: (id) => {
                  state.removeAttendee(scope, id)
                },
                onDateChange: (value) => {
                  state.draft(scope, 'date', value)
                },
                onStartChange: (id) => {
                  state.choose(scope, 'startId', id)
                },
                onEndChange: (id) => {
                  state.choose(scope, 'endId', id)
                },
                onMeetingLinkChange: (value) => {
                  state.draft(scope, 'meetingLink', value)
                },
                onNotesChange: (value) => {
                  state.draft(scope, 'notes', value)
                },
              }
            : content,
      }
    }
    case 4: {
      const content = input.referenceDeadline
      return {
        deadline: input.deadline,
        referenceDeadline:
          content && flow.kind === 'deadline'
            ? {
                ...content,
                presetId: flow.presetId,
                monthId: flow.monthId,
                dayId: flow.dayId,
                timeId: flow.timeId,
                onPresetChange: (id) => {
                  state.choose(scope, 'presetId', id)
                },
                onMonthChange: (id) => {
                  state.choose(scope, 'monthId', id)
                },
                onDayChange: (id) => {
                  state.choose(scope, 'dayId', id)
                },
                onTimeChange: (id) => {
                  state.choose(scope, 'timeId', id)
                },
              }
            : content,
      }
    }
    case 5: {
      const content = input.referenceAvailability
      return {
        availability: input.availability,
        referenceAvailability:
          content && flow.kind === 'availability'
            ? {
                ...content,
                timezoneId: flow.timezoneId,
                days: flow.days,
                onTimezoneChange: (id) => {
                  state.choose(scope, 'timezoneId', id)
                },
                onDayChange: (id, enabled) => {
                  state.toggleDay(scope, id, enabled)
                },
                onIntervalAdd: (id) => {
                  state.addInterval(scope, id)
                },
                onIntervalRemove: (id, intervalId) => {
                  state.removeInterval(scope, id, intervalId)
                },
                onIntervalStartChange: (id, intervalId, timeId) => {
                  state.changeInterval(scope, id, intervalId, 'startId', timeId)
                },
                onIntervalEndChange: (id, intervalId, timeId) => {
                  state.changeInterval(scope, id, intervalId, 'endId', timeId)
                },
              }
            : content,
      }
    }
  }
}
