import { LumenAppShellWorkflows, LumenAppShellWorkflowsProvider as HbarAppUiAppShellProvider, type LumenAppShellContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAppShellProps = HbarAppUiVariantProps & {
  readonly appShellContent?: LumenAppShellContent | undefined
}
export { HbarAppUiAppShellProvider }
export { selectLumenAppShellItem as selectHbarAppUiAppShellItem, uniqueLumenAppShellItems as uniqueHbarAppUiAppShellItems, useLumenAppShellWorkflowsContent as useHbarAppUiAppShellContent } from '@lumen/app-ui/catalog'
export type { LumenAppShellChoice as HbarAppUiAppShellChoice, LumenAppShellContent as HbarAppUiAppShellContent, LumenAppShellListStrategy as HbarAppUiAppShellListStrategy, LumenAppShellMetric as HbarAppUiAppShellMetric, LumenAppShellRecord as HbarAppUiAppShellRecord, LumenAppShellScope as HbarAppUiAppShellScope, LumenAppShellWorkflowAction as HbarAppUiAppShellAction, LumenAppShellWorkflowsProviderProps as HbarAppUiAppShellProviderProps } from '@lumen/app-ui/catalog'

export function AppShell({ spec, onAction, appShellContent, className }: HbarAppUiAppShellProps) {
  return (
    <LumenAppShellWorkflows
      variant={spec.variant}
      variantId={spec.id}
      content={appShellContent}
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
