import { useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiFeedbackProvider,
  type HbarAppUiFeedbackContent,
  type HbarAppUiVariantSpec,
} from 'hbar-app-ui/catalog'
import { createFeedbackWidgetPreviewStore } from './feedbackWidgetPreviewStore'
import { createFeedbackSurveyPreviewStore } from './feedbackSurveyPreviewStore'
import { createFeedbackRatingPreviewStore } from './feedbackRatingPreviewStore'
import { createFeedbackBoardPreviewStore } from './feedbackBoardPreviewStore'
import { createFeedbackInboxPreviewStore } from './feedbackInboxPreviewStore'
import { createFeedbackInsightsPreviewStore } from './feedbackInsightsPreviewStore'
import {
  projectFeedbackWidget,
  projectFeedbackSurvey,
  projectFeedbackRating,
  projectFeedbackBoard,
  projectFeedbackInbox,
  projectFeedbackInsights,
} from './feedbackPreviewProjection'

interface HostProps {
  readonly spec: HbarAppUiVariantSpec
  readonly content: HbarAppUiFeedbackContent
  readonly children: ReactNode
}
export function FeedbackPreviewHost(props: HostProps) {
  if (props.spec.category !== 'feedback') return <>{props.children}</>
  const key = props.spec.id
  switch (props.spec.variant) {
    case 1:
      return <WidgetOwner key={key} {...props} />
    case 2:
      return <SurveyOwner key={key} {...props} />
    case 3:
      return <RatingOwner key={key} {...props} />
    case 4:
      return <BoardOwner key={key} {...props} />
    case 5:
      return <InboxOwner key={key} {...props} />
    case 6:
      return <InsightsOwner key={key} {...props} />
    default:
      return <>{props.children}</>
  }
}
function WidgetOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackWidgetPreviewStore(content.referenceWidget), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackWidget(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
function SurveyOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackSurveyPreviewStore(content.referenceSurvey), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackSurvey(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
function RatingOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackRatingPreviewStore(content.referenceRating), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackRating(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
function BoardOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackBoardPreviewStore(content.referenceBoard), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackBoard(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
function InboxOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackInboxPreviewStore(content.referenceInbox), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackInbox(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
function InsightsOwner({ content, children }: HostProps) {
  const store = useMemo(() => createFeedbackInsightsPreviewStore(content.referenceInsights), [content])
  const state = useStore(store)
  return (
    <HbarAppUiFeedbackProvider content={projectFeedbackInsights(content, state)}>{children}</HbarAppUiFeedbackProvider>
  )
}
