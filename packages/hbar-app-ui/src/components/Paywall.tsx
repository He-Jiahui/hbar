import type {HbarAppUiVariantProps} from '../types'
import {ArticlePaywall} from './paywall/ArticlePaywall'
import {FeatureGatePaywall} from './paywall/FeatureGatePaywall'
import {MeteredReadsPaywall} from './paywall/MeteredReadsPaywall'
import {PlanComparisonPaywall} from './paywall/PlanComparisonPaywall'
import {SeatRequestPaywall} from './paywall/SeatRequestPaywall'
import {TrialExpiredPaywall} from './paywall/TrialExpiredPaywall'
import {UsageLimitPaywall} from './paywall/UsageLimitPaywall'
import {HbarAppUiPaywallProvider, useHbarAppUiPaywallContent} from './paywall/PaywallContent'

export {HbarAppUiPaywallProvider}
export type {
    HbarAppUiPaywallAdmin,
    HbarAppUiPaywallArticleContent,
    HbarAppUiPaywallContent,
    HbarAppUiPaywallFeature,
    HbarAppUiPaywallFeatureGateContent,
    HbarAppUiPaywallListStrategy,
    HbarAppUiPaywallPlan,
    HbarAppUiPaywallPlanContent,
    HbarAppUiPaywallReadsContent,
    HbarAppUiPaywallSeatContent,
    HbarAppUiPaywallTrialContent,
    HbarAppUiPaywallTrialRow,
    HbarAppUiPaywallUsageContent,
    HbarAppUiPaywallUsageMeter,
    HbarAppUiPaywallProviderProps,
} from './paywall/PaywallContent'
export {uniqueHbarAppUiPaywallItems} from './paywall/PaywallContent'

function EmptyPaywallSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <section className="hbar-app-ui-variant hbar-app-ui-paywall-surface hbar-app-ui-paywall-empty" data-hbar-app-ui-component={spec.id} data-hbar-app-ui-state={spec.profile.initialState} onClick={() => onAction?.({variantId: spec.id, actionId: 'empty'})} />
}

export function Paywall({spec, onAction}: HbarAppUiVariantProps) {
    const content = useHbarAppUiPaywallContent()
    if (!content) return <EmptyPaywallSurface spec={spec} onAction={onAction} />
    switch (spec.variant) {
        case 1:
            return content.article ? <ArticlePaywall spec={spec} onAction={onAction} content={content.article} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 2:
            return content.featureGate ? <FeatureGatePaywall spec={spec} onAction={onAction} content={content.featureGate} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 3:
            return content.plans ? <PlanComparisonPaywall spec={spec} onAction={onAction} content={content.plans} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 4:
            return content.usage ? <UsageLimitPaywall spec={spec} onAction={onAction} content={content.usage} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 5:
            return content.trial ? <TrialExpiredPaywall spec={spec} onAction={onAction} content={content.trial} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 6:
            return content.reads ? <MeteredReadsPaywall spec={spec} onAction={onAction} content={content.reads} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        case 7:
            return content.seat ? <SeatRequestPaywall spec={spec} onAction={onAction} content={content.seat} /> : <EmptyPaywallSurface spec={spec} onAction={onAction} />
        default:
            return <EmptyPaywallSurface spec={spec} onAction={onAction} />
    }
}
