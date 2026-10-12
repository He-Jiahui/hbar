import { LumenFeedback, LumenFeedbackProvider as HbarAppUiFeedbackProvider, selectLumenFeedbackItem as selectHbarAppUiFeedbackItem, uniqueLumenFeedbackItems as uniqueHbarAppUiFeedbackItems, type LumenFeedbackContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiFeedbackProps = HbarAppUiVariantProps & {
  readonly feedbackContent?: LumenFeedbackContent | undefined
}

export { HbarAppUiFeedbackProvider, selectHbarAppUiFeedbackItem, uniqueHbarAppUiFeedbackItems }
export { uniqueLumenFeedbackReferenceTypes as uniqueHbarAppUiFeedbackReferenceTypes } from '@lumen/app-ui/catalog'
export { uniqueLumenFeedbackSurveyReasons as uniqueHbarAppUiFeedbackSurveyReasons, uniqueLumenFeedbackSurveyScores as uniqueHbarAppUiFeedbackSurveyScores } from '@lumen/app-ui/catalog'
export { uniqueLumenFeedbackRatingOptions as uniqueHbarAppUiFeedbackRatingOptions, uniqueLumenFeedbackRatingReasons as uniqueHbarAppUiFeedbackRatingReasons } from '@lumen/app-ui/catalog'
export { uniqueLumenFeedbackBoardRequests as uniqueHbarAppUiFeedbackBoardRequests, visibleLumenFeedbackBoardRequests as visibleHbarAppUiFeedbackBoardRequests } from '@lumen/app-ui/catalog'
export { uniqueLumenFeedbackInboxThreads as uniqueHbarAppUiFeedbackInboxThreads, selectLumenFeedbackInboxThread as selectHbarAppUiFeedbackInboxThread } from '@lumen/app-ui/catalog'
export { uniqueLumenFeedbackInsightsReferencePeriods as uniqueHbarAppUiFeedbackInsightsReferencePeriods, selectLumenFeedbackInsightsReferencePeriod as selectHbarAppUiFeedbackInsightsReferencePeriod } from '@lumen/app-ui/catalog'

export type { LumenFeedbackWidgetReferenceContent as HbarAppUiFeedbackWidgetReferenceContent, LumenFeedbackSurveyReferenceContent as HbarAppUiFeedbackSurveyReferenceContent, LumenFeedbackSurveyReferenceReason as HbarAppUiFeedbackSurveyReferenceReason, LumenFeedbackRatingReferenceContent as HbarAppUiFeedbackRatingReferenceContent, LumenFeedbackRatingReferenceOption as HbarAppUiFeedbackRatingReferenceOption, LumenFeedbackRatingReferenceReason as HbarAppUiFeedbackRatingReferenceReason, LumenFeedbackBoardReferenceContent as HbarAppUiFeedbackBoardReferenceContent, LumenFeedbackBoardReferenceRequest as HbarAppUiFeedbackBoardReferenceRequest, LumenFeedbackInboxReferenceContent as HbarAppUiFeedbackInboxReferenceContent, LumenFeedbackInboxReferenceThread as HbarAppUiFeedbackInboxReferenceThread, LumenFeedbackInboxReferenceDetail as HbarAppUiFeedbackInboxReferenceDetail, LumenFeedbackInsightsReferenceAction as HbarAppUiFeedbackInsightsReferenceAction, LumenFeedbackInsightsReferenceContent as HbarAppUiFeedbackInsightsReferenceContent, LumenFeedbackInsightsReferenceListStrategy as HbarAppUiFeedbackInsightsReferenceListStrategy, LumenFeedbackInsightsReferenceMetric as HbarAppUiFeedbackInsightsReferenceMetric, LumenFeedbackInsightsReferencePeriod as HbarAppUiFeedbackInsightsReferencePeriod, LumenFeedbackInsightsReferenceSentiment as HbarAppUiFeedbackInsightsReferenceSentiment, LumenFeedbackInsightsReferenceTheme as HbarAppUiFeedbackInsightsReferenceTheme, LumenFeedbackInsightsReferenceVolumePoint as HbarAppUiFeedbackInsightsReferenceVolumePoint, LumenFeedbackReferenceType as HbarAppUiFeedbackReferenceType, LumenFeedbackAttachment as HbarAppUiFeedbackAttachment, LumenFeedbackContent as HbarAppUiFeedbackContent, LumenFeedbackFeatureBoardContent as HbarAppUiFeedbackFeatureBoardContent, LumenFeedbackInboxContent as HbarAppUiFeedbackInboxContent, LumenFeedbackInboxDetail as HbarAppUiFeedbackInboxDetail, LumenFeedbackInboxMetric as HbarAppUiFeedbackInboxMetric, LumenFeedbackInboxThread as HbarAppUiFeedbackInboxThread, LumenFeedbackInsightsContent as HbarAppUiFeedbackInsightsContent, LumenFeedbackListStrategy as HbarAppUiFeedbackListStrategy, LumenFeedbackMetric as HbarAppUiFeedbackMetric, LumenFeedbackPostResolutionContent as HbarAppUiFeedbackPostResolutionContent, LumenFeedbackProviderProps as HbarAppUiFeedbackProviderProps, LumenFeedbackRatingOption as HbarAppUiFeedbackRatingOption, LumenFeedbackRequest as HbarAppUiFeedbackRequest, LumenFeedbackRequestStatus as HbarAppUiFeedbackRequestStatus, LumenFeedbackSentiment as HbarAppUiFeedbackSentiment, LumenFeedbackSurveyContent as HbarAppUiFeedbackSurveyContent, LumenFeedbackSurveyReason as HbarAppUiFeedbackSurveyReason, LumenFeedbackTheme as HbarAppUiFeedbackTheme, LumenFeedbackTicket as HbarAppUiFeedbackTicket, LumenFeedbackType as HbarAppUiFeedbackType, LumenFeedbackTypeOption as HbarAppUiFeedbackTypeOption, LumenFeedbackVolumePoint as HbarAppUiFeedbackVolumePoint, LumenFeedbackWidgetContent as HbarAppUiFeedbackWidgetContent } from '@lumen/app-ui/catalog'

/** Thin legacy-contract adapter; feedback rendering and interaction state are Lumen-owned. */
export function Feedback({ spec, onAction, feedbackContent, className }: HbarAppUiFeedbackProps) {
  return (
    <LumenFeedback
      variant={spec.variant}
      variantId={spec.id}
      content={feedbackContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
