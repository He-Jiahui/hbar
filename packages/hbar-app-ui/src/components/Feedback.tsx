import type {HbarAppUiVariantProps} from '../types'
import {FeatureRequestBoard} from './feedback/FeatureRequestBoard'
import {FeedbackInbox} from './feedback/FeedbackInbox'
import {
    HbarAppUiFeedbackProvider,
    useHbarAppUiFeedbackContent,
    type HbarAppUiFeedbackContent,
} from './feedback/FeedbackContent'
import {FeedbackInsights} from './feedback/FeedbackInsights'
import {FeedbackFrame} from './feedback/FeedbackPrimitives'
import {PostResolutionFeedback} from './feedback/PostResolutionFeedback'
import {SurveyFeedback} from './feedback/SurveyFeedback'
import {FeedbackWidget} from './feedback/FeedbackWidget'

export type HbarAppUiFeedbackProps = HbarAppUiVariantProps & {
    readonly feedbackContent?: HbarAppUiFeedbackContent | undefined
}

export {HbarAppUiFeedbackProvider}
export type {
    HbarAppUiFeedbackContent,
    HbarAppUiFeedbackFeatureBoardContent,
    HbarAppUiFeedbackInboxContent,
    HbarAppUiFeedbackInboxDetail,
    HbarAppUiFeedbackInboxMetric,
    HbarAppUiFeedbackInboxThread,
    HbarAppUiFeedbackInsightsContent,
    HbarAppUiFeedbackListStrategy,
    HbarAppUiFeedbackMetric,
    HbarAppUiFeedbackPostResolutionContent,
    HbarAppUiFeedbackRatingOption,
    HbarAppUiFeedbackRequest,
    HbarAppUiFeedbackRequestStatus,
    HbarAppUiFeedbackSentiment,
    HbarAppUiFeedbackSurveyContent,
    HbarAppUiFeedbackSurveyReason,
    HbarAppUiFeedbackTicket,
    HbarAppUiFeedbackTheme,
    HbarAppUiFeedbackType,
    HbarAppUiFeedbackTypeOption,
    HbarAppUiFeedbackVolumePoint,
    HbarAppUiFeedbackWidgetContent,
    HbarAppUiFeedbackProviderProps,
} from './feedback/FeedbackContent'
export {selectHbarAppUiFeedbackItem, uniqueHbarAppUiFeedbackItems} from './feedback/FeedbackContent'

function emptyFeedbackSurface({spec}: Pick<HbarAppUiVariantProps, 'spec'>) {
    return <FeedbackFrame spec={spec} className="hbar-app-ui-feedback-empty-surface"><span className="hbar-app-ui-feedback-empty" /></FeedbackFrame>
}

/** Dispatches each feedback workflow to its independently maintained surface. */
export function Feedback({spec, onAction, feedbackContent}: HbarAppUiFeedbackProps) {
    const providerContent = useHbarAppUiFeedbackContent()
    const content = feedbackContent ?? providerContent
    switch (spec.variant) {
        case 1:
            return content?.widget ? <FeedbackWidget spec={spec} onAction={onAction} content={content.widget} /> : emptyFeedbackSurface({spec})
        case 2:
            return content?.survey ? <SurveyFeedback spec={spec} onAction={onAction} content={content.survey} /> : emptyFeedbackSurface({spec})
        case 3:
            return content?.postResolution ? <PostResolutionFeedback spec={spec} onAction={onAction} content={content.postResolution} /> : emptyFeedbackSurface({spec})
        case 4:
            return content?.featureBoard ? <FeatureRequestBoard spec={spec} onAction={onAction} content={content.featureBoard} /> : emptyFeedbackSurface({spec})
        case 5:
            return content?.inbox ? <FeedbackInbox spec={spec} onAction={onAction} content={content.inbox} /> : emptyFeedbackSurface({spec})
        case 6:
            return content?.insights ? <FeedbackInsights spec={spec} onAction={onAction} content={content.insights} /> : emptyFeedbackSurface({spec})
        default:
            return emptyFeedbackSurface({spec})
    }
}
