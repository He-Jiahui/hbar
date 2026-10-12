import { LumenMobile, LumenMobileProvider as HbarAppUiMobileProvider, type LumenMobileContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiMobileProps = HbarAppUiVariantProps & {
  readonly mobileContent?: LumenMobileContent | undefined
}
export { HbarAppUiMobileProvider }
export { selectLumenMobileItem as selectHbarAppUiMobileItem, uniqueLumenMobileItems as uniqueHbarAppUiMobileItems, useLumenMobileContent as useHbarAppUiMobileContent } from '@lumen/app-ui/catalog'
export type { LumenMobileAction as HbarAppUiMobileAction, LumenMobileActivityContent as HbarAppUiMobileActivityContent, LumenMobileContent as HbarAppUiMobileContent, LumenMobileFeedItem as HbarAppUiMobileFeedItem, LumenMobileHomeContent as HbarAppUiMobileHomeContent, LumenMobileListStrategy as HbarAppUiMobileListStrategy, LumenMobileOrder as HbarAppUiMobileOrder, LumenMobileOrdersContent as HbarAppUiMobileOrdersContent, LumenMobileProviderProps as HbarAppUiMobileProviderProps, LumenMobileRun as HbarAppUiMobileRun, LumenMobileRunsContent as HbarAppUiMobileRunsContent, LumenMobileTab as HbarAppUiMobileTab, LumenMobileTask as HbarAppUiMobileTask, LumenMobileTasksContent as HbarAppUiMobileTasksContent } from '@lumen/app-ui/catalog'

export function Mobile({ spec, onAction, mobileContent, className }: HbarAppUiMobileProps) {
  return (
    <LumenMobile
      variant={spec.variant}
      variantId={spec.id}
      content={mobileContent}
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
