import {
  LumenDataTable,
  LumenDataTableProvider as HbarAppUiDataTableProvider,
  type LumenDataTableContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiDataTableProps = HbarAppUiVariantProps & {
  readonly dataTableContent?: LumenDataTableContent | undefined
}

export { HbarAppUiDataTableProvider }
export {
  selectLumenDataTableItem as selectHbarAppUiDataTableItem,
  uniqueLumenDataTableItems as uniqueHbarAppUiDataTableItems,
  useLumenDataTableContent as useHbarAppUiDataTableContent,
} from '@lumen/app-ui'
export type {
  LumenDataTableAction as HbarAppUiDataTableAction,
  LumenDataTableChoice as HbarAppUiDataTableChoice,
  LumenDataTableContent as HbarAppUiDataTableContent,
  LumenDataTableEditContent as HbarAppUiDataTableEditContent,
  LumenDataTableExpandableContent as HbarAppUiDataTableExpandableContent,
  LumenDataTableFacetedContent as HbarAppUiDataTableFacetedContent,
  LumenDataTableGroupedContent as HbarAppUiDataTableGroupedContent,
  LumenDataTableListStrategy as HbarAppUiDataTableListStrategy,
  LumenDataTableMasterDetailContent as HbarAppUiDataTableMasterDetailContent,
  LumenDataTableProviderProps as HbarAppUiDataTableProviderProps,
  LumenDataTableRow as HbarAppUiDataTableRow,
  LumenDataTableSelectableContent as HbarAppUiDataTableSelectableContent,
  LumenDataTableStatesContent as HbarAppUiDataTableStatesContent,
  LumenDataTableWideContent as HbarAppUiDataTableWideContent,
} from '@lumen/app-ui'

export function DataTable({ spec, onAction, dataTableContent, className }: HbarAppUiDataTableProps) {
  return (
    <LumenDataTable
      variant={spec.variant}
      variantId={spec.id}
      content={dataTableContent}
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
