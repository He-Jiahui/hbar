import { useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiSchedulingProvider,
  type HbarAppUiSchedulingContent,
  type HbarAppUiVariantSpec,
} from 'hbar-app-ui/catalog'
import { createSchedulingTimelinePreviewStore, timelinePreviewProjection } from './schedulingTimelinePreviewStore'
import { createSchedulingBookingPreviewStore } from './schedulingBookingPreviewStore'
import {
  createSchedulingPreviewStore,
  type SchedulingPreviewScope,
  type SchedulingPreviewVariant,
} from './schedulingPreviewModel'
import { projectSchedulingPreview } from './schedulingPreviewProjection'

interface HostProps {
  readonly spec: HbarAppUiVariantSpec
  readonly content: HbarAppUiSchedulingContent
  readonly children: ReactNode
}
export function SchedulingPreviewHost(props: HostProps) {
  if (props.spec.category !== 'scheduling') return <>{props.children}</>
  const key = props.spec.id
  switch (props.spec.variant) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return <SchedulingOwner key={key} {...props} variant={props.spec.variant} />
    case 6:
      return <TimelineOwner key={key} {...props} />
    case 7:
      return <BookingOwner key={key} {...props} />
    default:
      return <>{props.children}</>
  }
}
function SchedulingOwner({
  spec,
  content: input,
  variant,
  children,
}: HostProps & { readonly variant: SchedulingPreviewVariant }) {
  const scope = useMemo<SchedulingPreviewScope>(() => ({ variant, ownerId: spec.id }), [spec.id, variant])
  const store = useMemo(() => createSchedulingPreviewStore(input, scope), [input, scope])
  useStore(store, (state) => state.flow)
  return (
    <HbarAppUiSchedulingProvider content={projectSchedulingPreview(input, store)}>
      {children}
    </HbarAppUiSchedulingProvider>
  )
}
function TimelineOwner({ content, children }: HostProps) {
  const store = useMemo(() => createSchedulingTimelinePreviewStore(content.referenceTimeline), [content])
  const state = useStore(store)
  return (
    <HbarAppUiSchedulingProvider
      content={{
        timeline: content.timeline,
        referenceTimeline: content.referenceTimeline && timelinePreviewProjection(content.referenceTimeline, state),
      }}
    >
      {children}
    </HbarAppUiSchedulingProvider>
  )
}
function BookingOwner({ content, children }: HostProps) {
  const store = useMemo(() => createSchedulingBookingPreviewStore(content.referenceBooking), [content])
  const state = useStore(store)
  return (
    <HbarAppUiSchedulingProvider
      content={{
        booking: content.booking,
        referenceBooking: content.referenceBooking && {
          ...content.referenceBooking,
          dayId: state.dayId,
          timeId: state.timeId,
          onDayChange: state.setDay,
          onTimeChange: state.setTime,
        },
      }}
    >
      {children}
    </HbarAppUiSchedulingProvider>
  )
}
