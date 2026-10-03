import { LumenKanban, LumenKanbanProvider as HbarAppUiKanbanProvider, type LumenKanbanContent } from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiKanbanProps = HbarAppUiVariantProps & {
  readonly kanbanContent?: LumenKanbanContent | undefined
  /** Keep the selected Kanban variant layout while disabling state-changing moves. */
  readonly readOnly?: boolean | undefined
}
export { HbarAppUiKanbanProvider }
export {
  selectLumenKanbanItem as selectHbarAppUiKanbanItem,
  uniqueLumenKanbanItems as uniqueHbarAppUiKanbanItems,
  useLumenKanbanContent as useHbarAppUiKanbanContent,
} from '@lumen/app-ui'
export type {
  LumenKanbanAction as HbarAppUiKanbanAction,
  LumenKanbanCard as HbarAppUiKanbanCard,
  LumenKanbanChoice as HbarAppUiKanbanChoice,
  LumenKanbanColumn as HbarAppUiKanbanColumn,
  LumenKanbanContent as HbarAppUiKanbanContent,
  LumenKanbanLane as HbarAppUiKanbanLane,
  LumenKanbanListStrategy as HbarAppUiKanbanListStrategy,
  LumenKanbanMetric as HbarAppUiKanbanMetric,
  LumenKanbanProviderProps as HbarAppUiKanbanProviderProps,
} from '@lumen/app-ui'
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
