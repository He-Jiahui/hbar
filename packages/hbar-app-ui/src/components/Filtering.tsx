import { LumenFiltering, LumenFilteringProvider as HbarAppUiFilteringProvider, type LumenFilteringContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiFilteringProps = HbarAppUiVariantProps & {
  readonly filteringContent?: LumenFilteringContent | undefined
}
export { HbarAppUiFilteringProvider }
export { selectLumenFilteringItem as selectHbarAppUiFilteringItem, uniqueLumenFilteringItems as uniqueHbarAppUiFilteringItems, useLumenFilteringContent as useHbarAppUiFilteringContent } from '@lumen/app-ui/catalog'
export type { LumenFilteringAction as HbarAppUiFilteringAction, LumenFilteringAsset as HbarAppUiFilteringAsset, LumenFilteringAssetsContent as HbarAppUiFilteringAssetsContent, LumenFilteringCandidate as HbarAppUiFilteringCandidate, LumenFilteringCandidateContent as HbarAppUiFilteringCandidateContent, LumenFilteringChoice as HbarAppUiFilteringChoice, LumenFilteringContent as HbarAppUiFilteringContent, LumenFilteringCuisineContent as HbarAppUiFilteringCuisineContent, LumenFilteringDrawerContent as HbarAppUiFilteringDrawerContent, LumenFilteringFlight as HbarAppUiFilteringFlight, LumenFilteringFlightsContent as HbarAppUiFilteringFlightsContent, LumenFilteringListStrategy as HbarAppUiFilteringListStrategy, LumenFilteringLogContent as HbarAppUiFilteringLogContent, LumenFilteringProductCategory as HbarAppUiFilteringProductCategory, LumenFilteringProductContent as HbarAppUiFilteringProductContent, LumenFilteringPropertyContent as HbarAppUiFilteringPropertyContent, LumenFilteringProviderProps as HbarAppUiFilteringProviderProps, LumenFilteringQueryContent as HbarAppUiFilteringQueryContent, LumenFilteringResult as HbarAppUiFilteringResult, LumenFilteringRule as HbarAppUiFilteringRule, LumenFilteringSwatch as HbarAppUiFilteringSwatch } from '@lumen/app-ui/catalog'

export function Filtering({ spec, onAction, filteringContent, className }: HbarAppUiFilteringProps) {
  return (
    <LumenFiltering
      variant={spec.variant}
      variantId={spec.id}
      content={filteringContent}
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
