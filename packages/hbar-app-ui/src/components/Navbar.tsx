import { LumenNavbar, LumenNavbarProvider as HbarAppUiNavbarProvider, type LumenNavbarContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'
export type HbarAppUiNavbarProps = HbarAppUiVariantProps & { readonly navbarContent?: LumenNavbarContent | undefined }
export { HbarAppUiNavbarProvider }
export { selectLumenNavbarItem as selectHbarAppUiNavbarItem, uniqueLumenNavbarItems as uniqueHbarAppUiNavbarItems, useLumenNavbarContent as useHbarAppUiNavbarContent } from '@lumen/app-ui/catalog'
export type { LumenNavbarActionLabelSet as HbarAppUiNavbarActionLabelSet, LumenNavbarActivityContent as HbarAppUiNavbarActivityContent, LumenNavbarActivityItem as HbarAppUiNavbarActivityItem, LumenNavbarAnalyticsContent as HbarAppUiNavbarAnalyticsContent, LumenNavbarArticleContent as HbarAppUiNavbarArticleContent, LumenNavbarCommerceContent as HbarAppUiNavbarCommerceContent, LumenNavbarContent as HbarAppUiNavbarContent, LumenNavbarDeploymentContent as HbarAppUiNavbarDeploymentContent, LumenNavbarDeploymentStat as HbarAppUiNavbarDeploymentStat, LumenNavbarDocumentContent as HbarAppUiNavbarDocumentContent, LumenNavbarDocsContent as HbarAppUiNavbarDocsContent, LumenNavbarFilterContent as HbarAppUiNavbarFilterContent, LumenNavbarFilterItem as HbarAppUiNavbarFilterItem, LumenNavbarLandingContent as HbarAppUiNavbarLandingContent, LumenNavbarListStrategy as HbarAppUiNavbarListStrategy, LumenNavbarMetric as HbarAppUiNavbarMetric, LumenNavbarPortfolioContent as HbarAppUiNavbarPortfolioContent, LumenNavbarProduct as HbarAppUiNavbarProduct, LumenNavbarProjectBoardContent as HbarAppUiNavbarProjectBoardContent, LumenNavbarProjectColumn as HbarAppUiNavbarProjectColumn, LumenNavbarProviderProps as HbarAppUiNavbarProviderProps, LumenNavbarTaskListContent as HbarAppUiNavbarTaskListContent, LumenNavbarTaskRow as HbarAppUiNavbarTaskRow } from '@lumen/app-ui/catalog'
export function Navbar({ spec, onAction, navbarContent, className }: HbarAppUiNavbarProps) {
  return (
    <LumenNavbar
      variant={spec.variant}
      variantId={spec.id}
      content={navbarContent}
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
