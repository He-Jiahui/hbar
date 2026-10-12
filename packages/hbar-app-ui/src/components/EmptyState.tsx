import { LumenEmptyState, type LumenEmptyStateContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export interface HbarAppUiEmptyStateProps extends HbarAppUiVariantProps {
  readonly emptyStateContent?: LumenEmptyStateContent | undefined
}

export { LumenEmptyStateProvider as HbarAppUiEmptyStateProvider, useLumenEmptyStateContent as useHbarAppUiEmptyStateContent, uniqueLumenEmptyStateItems as uniqueHbarAppUiEmptyStateItems } from '@lumen/app-ui/catalog'
export type { LumenEmptyStateContent as HbarAppUiEmptyStateContent, LumenEmptyStateFirstRunContent as HbarAppUiEmptyStateFirstRunContent, LumenEmptyStateNoResultsContent as HbarAppUiEmptyStateNoResultsContent, LumenEmptyStateCaughtUpContent as HbarAppUiEmptyStateCaughtUpContent, LumenEmptyStateLoadFailureContent as HbarAppUiEmptyStateLoadFailureContent, LumenEmptyStateFolderContent as HbarAppUiEmptyStateFolderContent, LumenEmptyStateChoice as HbarAppUiEmptyStateChoice, LumenEmptyStateFilter as HbarAppUiEmptyStateFilter, LumenEmptyStateSuggestion as HbarAppUiEmptyStateSuggestion, LumenEmptyStateMetric as HbarAppUiEmptyStateMetric, LumenEmptyStateDetail as HbarAppUiEmptyStateDetail, LumenEmptyStateListStrategy as HbarAppUiEmptyStateListStrategy } from '@lumen/app-ui/catalog'

/** Public bridge only: copy, collections and business drafts belong to the Host. */
export function EmptyState({ spec, emptyStateContent, onAction, className }: HbarAppUiEmptyStateProps) {
  return (
    <LumenEmptyState
      variant={spec.variant}
      variantId={spec.id}
      content={emptyStateContent}
      className={className}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
          : undefined
      }
    />
  )
}
