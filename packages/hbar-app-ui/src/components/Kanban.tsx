import { type LumenKanbanContent } from '@lumen/app-ui/catalog'
import { LumenKanban, LumenKanbanProvider as HbarAppUiKanbanProvider } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiKanbanProps = HbarAppUiVariantProps & {
  readonly kanbanContent?: LumenKanbanContent | undefined
  /** Keep the selected Kanban variant layout while disabling state-changing moves. */
  readonly readOnly?: boolean | undefined
}
export { HbarAppUiKanbanProvider }
export { selectLumenKanbanItem as selectHbarAppUiKanbanItem, uniqueLumenKanbanItems as uniqueHbarAppUiKanbanItems, useLumenKanbanContent as useHbarAppUiKanbanContent } from '@lumen/app-ui/catalog'
export type { LumenKanbanAction as HbarAppUiKanbanAction, LumenKanbanContent as HbarAppUiKanbanContent } from '@lumen/app-ui/catalog'
export type { LumenKanbanCard as HbarAppUiKanbanCard, LumenKanbanChoice as HbarAppUiKanbanChoice, LumenKanbanColumn as HbarAppUiKanbanColumn, LumenKanbanLane as HbarAppUiKanbanLane, LumenKanbanListStrategy as HbarAppUiKanbanListStrategy, LumenKanbanMetric as HbarAppUiKanbanMetric, LumenKanbanProviderProps as HbarAppUiKanbanProviderProps } from '@lumen/app-ui/catalog'
export function Kanban({ spec, onAction, kanbanContent, className, readOnly }: HbarAppUiKanbanProps) {
  return (
    <LumenKanban
      variant={spec.variant}
      variantId={spec.id}
      content={kanbanContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      readOnly={readOnly}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
