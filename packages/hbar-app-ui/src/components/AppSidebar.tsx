import {
  LumenAppSidebarWorkflows,
  LumenAppSidebarWorkflowsProvider as HbarAppUiAppSidebarProvider,
  type LumenAppSidebarContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAppSidebarProps = HbarAppUiVariantProps & {
  readonly appSidebarContent?: LumenAppSidebarContent | undefined
}
export { HbarAppUiAppSidebarProvider }
export {
  selectLumenAppSidebarItem as selectHbarAppUiAppSidebarItem,
  uniqueLumenAppSidebarItems as uniqueHbarAppUiAppSidebarItems,
  useLumenAppSidebarWorkflowsContent as useHbarAppUiAppSidebarContent,
} from '@lumen/app-ui'
export type {
  LumenAppSidebarContent as HbarAppUiAppSidebarContent,
  LumenAppSidebarGroup as HbarAppUiAppSidebarGroup,
  LumenAppSidebarItem as HbarAppUiAppSidebarItem,
  LumenAppSidebarListStrategy as HbarAppUiAppSidebarListStrategy,
  LumenAppSidebarTreeNode as HbarAppUiAppSidebarTreeNode,
  LumenAppSidebarWorkflowAction as HbarAppUiAppSidebarAction,
  LumenAppSidebarWorkflowsProviderProps as HbarAppUiAppSidebarProviderProps,
} from '@lumen/app-ui'

export function AppSidebar({ spec, onAction, appSidebarContent, className }: HbarAppUiAppSidebarProps) {
  return (
    <LumenAppSidebarWorkflows
      variant={spec.variant}
      variantId={spec.id}
      content={appSidebarContent}
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
