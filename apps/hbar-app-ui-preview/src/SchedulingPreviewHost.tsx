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
  useEffect(() => {
    setDayId(content.referenceMonth?.activeDayId ?? '')
    setMonthId(content.referenceMonth?.monthId ?? '')
    setYearId(content.referenceMonth?.yearId ?? '')
    setFilterId(content.referenceMonth?.filterId ?? '')
    setStartId(content.referenceRange?.startId ?? '')
    setEndId(content.referenceRange?.endId ?? '')
    setDurationId(content.referenceRange?.durationId ?? '')
  }, [content])
  return <HbarAppUiSchedulingProvider content={{...content, referenceMonth: content.referenceMonth && {
    ...content.referenceMonth, activeDayId: dayId, monthId, yearId, filterId,
    onDayChange: setDayId, onMonthChange: setMonthId, onYearChange: setYearId, onFilterChange: setFilterId,
  }, referenceRange: content.referenceRange && {
    ...content.referenceRange, startId, endId, durationId,
    onStartChange: setStartId, onEndChange: setEndId, onDurationChange: setDurationId,
  }}}>{children}</HbarAppUiSchedulingProvider>
}
