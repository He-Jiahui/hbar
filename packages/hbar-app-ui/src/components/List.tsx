import { LumenList, LumenListProvider as HbarAppUiListProvider, type LumenListContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiListProps = HbarAppUiVariantProps & {
  readonly listContent?: LumenListContent | undefined
}

export { HbarAppUiListProvider }
export {
  selectLumenListItem as selectHbarAppUiListItem,
  uniqueLumenListItems as uniqueHbarAppUiListItems,
  useLumenListContent as useHbarAppUiListContent,
} from '@lumen/app-ui'
export type {
  LumenListAction as HbarAppUiListAction,
  LumenListAsset as HbarAppUiListAsset,
  LumenListAssetsContent as HbarAppUiListAssetsContent,
  LumenListChoice as HbarAppUiListChoice,
  LumenListContact as HbarAppUiListContact,
  LumenListContactsContent as HbarAppUiListContactsContent,
  LumenListContent as HbarAppUiListContent,
  LumenListDeliveriesContent as HbarAppUiListDeliveriesContent,
  LumenListDelivery as HbarAppUiListDelivery,
  LumenListInboxContent as HbarAppUiListInboxContent,
  LumenListLeaderboardContent as HbarAppUiListLeaderboardContent,
  LumenListLeaderboardEntry as HbarAppUiListLeaderboardEntry,
  LumenListMessage as HbarAppUiListMessage,
  LumenListMetric as HbarAppUiListMetric,
  LumenListMetricsContent as HbarAppUiListMetricsContent,
  LumenListProviderProps as HbarAppUiListProviderProps,
  LumenListQueueContent as HbarAppUiListQueueContent,
  LumenListQueueItem as HbarAppUiListQueueItem,
  LumenListRunbookContent as HbarAppUiListRunbookContent,
  LumenListRunbookStep as HbarAppUiListRunbookStep,
  LumenListSecurityContent as HbarAppUiListSecurityContent,
  LumenListSecurityEvent as HbarAppUiListSecurityEvent,
  LumenListSpendContent as HbarAppUiListSpendContent,
  LumenListSpendItem as HbarAppUiListSpendItem,
  LumenListStrategy as HbarAppUiListStrategy,
  LumenListSupplier as HbarAppUiListSupplier,
  LumenListSuppliersContent as HbarAppUiListSuppliersContent,
  LumenListTreeContent as HbarAppUiListTreeContent,
  LumenListTreeNode as HbarAppUiListTreeNode,
} from '@lumen/app-ui'

export function List({ spec, onAction, listContent, className }: HbarAppUiListProps) {
  return (
    <LumenList
      variant={spec.variant}
      variantId={spec.id}
      content={listContent}
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
