import { LumenPaywall, LumenPaywallProvider as HbarAppUiPaywallProvider, type LumenPaywallContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiPaywallProps = HbarAppUiVariantProps & {
  readonly paywallContent?: LumenPaywallContent | undefined
}

export { HbarAppUiPaywallProvider }
export { uniqueLumenPaywallItems as uniqueHbarAppUiPaywallItems, useLumenPaywallContent as useHbarAppUiPaywallContent } from '@lumen/app-ui/catalog'
export type { LumenPaywallAdmin as HbarAppUiPaywallAdmin, LumenPaywallArticleContent as HbarAppUiPaywallArticleContent, LumenPaywallContent as HbarAppUiPaywallContent, LumenPaywallFeature as HbarAppUiPaywallFeature, LumenPaywallFeatureGateContent as HbarAppUiPaywallFeatureGateContent, LumenPaywallListStrategy as HbarAppUiPaywallListStrategy, LumenPaywallPlan as HbarAppUiPaywallPlan, LumenPaywallPlanContent as HbarAppUiPaywallPlanContent, LumenPaywallProviderProps as HbarAppUiPaywallProviderProps, LumenPaywallReadsContent as HbarAppUiPaywallReadsContent, LumenPaywallSeatContent as HbarAppUiPaywallSeatContent, LumenPaywallTrialContent as HbarAppUiPaywallTrialContent, LumenPaywallTrialRow as HbarAppUiPaywallTrialRow, LumenPaywallUsageContent as HbarAppUiPaywallUsageContent, LumenPaywallUsageMeter as HbarAppUiPaywallUsageMeter } from '@lumen/app-ui/catalog'

export function Paywall({ spec, onAction, paywallContent, className }: HbarAppUiPaywallProps) {
  return (
    <LumenPaywall
      variant={spec.variant}
      variantId={spec.id}
      content={paywallContent}
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
