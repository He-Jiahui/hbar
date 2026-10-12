import { LumenToolCalls } from '@lumen/app-ui'
import { LumenToolCallsProvider as HbarAppUiToolCallsProvider, selectLumenToolCallsItem as selectHbarAppUiToolCallsItem, uniqueLumenToolCallsItems as uniqueHbarAppUiToolCallsItems, type LumenToolCallsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiToolCallsProps = HbarAppUiVariantProps & {
  readonly toolCallsContent?: LumenToolCallsContent | undefined
}

export { HbarAppUiToolCallsProvider, selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems }

export type { LumenToolCallsActivityContent as HbarAppUiToolCallsActivityContent, LumenToolCallsActivityFilter as HbarAppUiToolCallsActivityFilter, LumenToolCallsActivityItem as HbarAppUiToolCallsActivityItem, LumenToolCallsCommandContent as HbarAppUiToolCallsCommandContent, LumenToolCallsContent as HbarAppUiToolCallsContent, LumenToolCallsDiffContent as HbarAppUiToolCallsDiffContent, LumenToolCallsDiffFile as HbarAppUiToolCallsDiffFile, LumenToolCallsDiffLine as HbarAppUiToolCallsDiffLine, LumenToolCallsDiffLineKind as HbarAppUiToolCallsDiffLineKind, LumenToolCallsListStrategy as HbarAppUiToolCallsListStrategy, LumenToolCallsOutputTab as HbarAppUiToolCallsOutputTab, LumenToolCallsPermissionAction as HbarAppUiToolCallsPermissionAction, LumenToolCallsPermissionGroup as HbarAppUiToolCallsPermissionGroup, LumenToolCallsPermissionItem as HbarAppUiToolCallsPermissionItem, LumenToolCallsPermissionItemKind as HbarAppUiToolCallsPermissionItemKind, LumenToolCallsPermissionsContent as HbarAppUiToolCallsPermissionsContent, LumenToolCallsProviderProps as HbarAppUiToolCallsProviderProps, LumenToolCallsSearchContent as HbarAppUiToolCallsSearchContent, LumenToolCallsSearchResult as HbarAppUiToolCallsSearchResult, LumenToolCallsState as HbarAppUiToolCallsState, LumenToolCallsTraceContent as HbarAppUiToolCallsTraceContent, LumenToolCallsTraceItem as HbarAppUiToolCallsTraceItem } from '@lumen/app-ui/catalog'

/** Thin legacy-contract adapter; tool workflow rendering and state are Lumen-owned. */
export function ToolCalls({ spec, onAction, toolCallsContent, className }: HbarAppUiToolCallsProps) {
  return (
    <LumenToolCalls
      variant={spec.variant}
      variantId={spec.id}
      content={toolCallsContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(
                value === undefined
                  ? { variantId: spec.id, actionId }
                  : { variantId: spec.id, actionId, value },
              )
          : undefined
      }
    />
  )
}
