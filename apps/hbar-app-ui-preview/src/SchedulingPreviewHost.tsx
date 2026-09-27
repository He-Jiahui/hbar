import {useEffect, useState, type ReactNode} from 'react'
import {HbarAppUiSchedulingProvider, type HbarAppUiSchedulingContent} from 'hbar-app-ui/catalog'

export function SchedulingPreviewHost({content, children}: {readonly content: HbarAppUiSchedulingContent; readonly children: ReactNode}) {
  const [dayId, setDayId] = useState(content.referenceMonth?.activeDayId ?? '')
  const [monthId, setMonthId] = useState(content.referenceMonth?.monthId ?? '')
  const [yearId, setYearId] = useState(content.referenceMonth?.yearId ?? '')
  const [filterId, setFilterId] = useState(content.referenceMonth?.filterId ?? '')
  const [startId, setStartId] = useState(content.referenceRange?.startId ?? '')
  const [endId, setEndId] = useState(content.referenceRange?.endId ?? '')
  const [durationId, setDurationId] = useState(content.referenceRange?.durationId ?? '')
  const [formName, setFormName] = useState(content.referenceForm?.name ?? '')
  const [formQuery, setFormQuery] = useState(content.referenceForm?.attendeeQuery ?? '')
  const [formAttendees, setFormAttendees] = useState(content.referenceForm?.attendees ?? [])
  const [formDate, setFormDate] = useState(content.referenceForm?.date ?? '')
  const [formStartId, setFormStartId] = useState(content.referenceForm?.startId ?? '')
  const [formEndId, setFormEndId] = useState(content.referenceForm?.endId ?? '')
  const [formLink, setFormLink] = useState(content.referenceForm?.meetingLink ?? '')
  const [formNotes, setFormNotes] = useState(content.referenceForm?.notes ?? '')
  const [deadlinePresetId, setDeadlinePresetId] = useState(content.referenceDeadline?.presetId ?? '')
  const [deadlineMonthId, setDeadlineMonthId] = useState(content.referenceDeadline?.monthId ?? '')
  const [deadlineDayId, setDeadlineDayId] = useState(content.referenceDeadline?.dayId ?? '')
  const [deadlineTimeId, setDeadlineTimeId] = useState(content.referenceDeadline?.timeId ?? '')
  const [availabilityZoneId, setAvailabilityZoneId] = useState(content.referenceAvailability?.timezoneId ?? '')
  const [availabilityDays, setAvailabilityDays] = useState(content.referenceAvailability?.days ?? [])
  const [availabilityNextInterval, setAvailabilityNextInterval] = useState(0)
  useEffect(() => {
    setDayId(content.referenceMonth?.activeDayId ?? '')
    setMonthId(content.referenceMonth?.monthId ?? '')
    setYearId(content.referenceMonth?.yearId ?? '')
    setFilterId(content.referenceMonth?.filterId ?? '')
    setStartId(content.referenceRange?.startId ?? '')
    setEndId(content.referenceRange?.endId ?? '')
    setDurationId(content.referenceRange?.durationId ?? '')
    setFormName(content.referenceForm?.name ?? '')
    setFormQuery(content.referenceForm?.attendeeQuery ?? '')
    setFormAttendees(content.referenceForm?.attendees ?? [])
    setFormDate(content.referenceForm?.date ?? '')
    setFormStartId(content.referenceForm?.startId ?? '')
    setFormEndId(content.referenceForm?.endId ?? '')
    setFormLink(content.referenceForm?.meetingLink ?? '')
    setFormNotes(content.referenceForm?.notes ?? '')
    setDeadlinePresetId(content.referenceDeadline?.presetId ?? '')
    setDeadlineMonthId(content.referenceDeadline?.monthId ?? '')
    setDeadlineDayId(content.referenceDeadline?.dayId ?? '')
    setDeadlineTimeId(content.referenceDeadline?.timeId ?? '')
    setAvailabilityZoneId(content.referenceAvailability?.timezoneId ?? '')
    setAvailabilityDays(content.referenceAvailability?.days ?? [])
    setAvailabilityNextInterval(0)
  }, [content])
  return <HbarAppUiSchedulingProvider content={{...content, referenceMonth: content.referenceMonth && {
    ...content.referenceMonth, activeDayId: dayId, monthId, yearId, filterId,
    onDayChange: setDayId, onMonthChange: setMonthId, onYearChange: setYearId, onFilterChange: setFilterId,
  }, referenceRange: content.referenceRange && {
    ...content.referenceRange, startId, endId, durationId,
    onStartChange: setStartId, onEndChange: setEndId, onDurationChange: setDurationId,
  }, referenceDeadline: content.referenceDeadline && {
    ...content.referenceDeadline, presetId: deadlinePresetId, monthId: deadlineMonthId, dayId: deadlineDayId, timeId: deadlineTimeId,
    onPresetChange: setDeadlinePresetId, onMonthChange: setDeadlineMonthId, onDayChange: setDeadlineDayId, onTimeChange: setDeadlineTimeId,
  }, referenceAvailability: content.referenceAvailability && {
    ...content.referenceAvailability, timezoneId: availabilityZoneId, days: availabilityDays,
    onTimezoneChange: setAvailabilityZoneId,
    onDayChange: (id: string, enabled: boolean) => setAvailabilityDays((current) => current.map((day) => day.id === id
      ? {...day, enabled, intervals: enabled ? [{id: `${id}-default`, startId: '09:00', endId: '17:00'}] : []} : day)),
    onIntervalAdd: (id: string) => {
      setAvailabilityDays((current) => current.map((day) => day.id === id && day.enabled
        ? {...day, intervals: [...day.intervals, {id: `${id}-new-${availabilityNextInterval}`, startId: '13:00', endId: '17:00'}]} : day))
      setAvailabilityNextInterval((current) => current + 1)
    },
    onIntervalRemove: (dayId: string, intervalId: string) => setAvailabilityDays((current) => current.map((day) => day.id === dayId && day.intervals.length > 1
      ? {...day, intervals: day.intervals.filter((interval) => interval.id !== intervalId)} : day)),
    onIntervalStartChange: (dayId: string, intervalId: string, timeId: string) => setAvailabilityDays((current) => current.map((day) => day.id === dayId
      ? {...day, intervals: day.intervals.map((interval) => interval.id === intervalId ? {...interval, startId: timeId} : interval)} : day)),
    onIntervalEndChange: (dayId: string, intervalId: string, timeId: string) => setAvailabilityDays((current) => current.map((day) => day.id === dayId
      ? {...day, intervals: day.intervals.map((interval) => interval.id === intervalId ? {...interval, endId: timeId} : interval)} : day)),
  }, referenceForm: content.referenceForm && {
    ...content.referenceForm, name: formName, attendeeQuery: formQuery, attendees: formAttendees, date: formDate,
    startId: formStartId, endId: formEndId, meetingLink: formLink, notes: formNotes,
    onNameChange: setFormName, onAttendeeQueryChange: setFormQuery,
    onRemoveAttendee: (id: string) => setFormAttendees((current) => current.filter((person) => person.id !== id)),
    onDateChange: setFormDate, onStartChange: setFormStartId, onEndChange: setFormEndId,
    onMeetingLinkChange: setFormLink, onNotesChange: setFormNotes,
  }}}>{children}</HbarAppUiSchedulingProvider>
}
