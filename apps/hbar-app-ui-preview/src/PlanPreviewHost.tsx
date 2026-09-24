import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiAgentPlanProvider, type HbarAppUiAgentPlanContent } from 'hbar-app-ui/catalog'
import { createChecklistPreviewStore, projectChecklistPreviewContent } from './checklist-preview-model'
import { createPlanReviewPreviewStore, projectPlanReviewPreviewContent } from './plan-review-preview-model'
import { createPlanTreePreviewStore, projectPlanTreePreviewContent } from './plan-tree-preview-model'
import { createPlanSummaryPreviewStore, projectPlanSummaryPreviewContent } from './plan-summary-preview-model'

export function PlanPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiAgentPlanContent
  readonly children: ReactNode
}) {
  const [checklistStore] = useState(() => createChecklistPreviewStore(content.checklist))
  useLayoutEffect(() => checklistStore.getState().replace(content.checklist), [content.checklist, checklistStore])
  const checklistState = useStore(checklistStore)
  const checklist = useMemo(() => projectChecklistPreviewContent(checklistState), [checklistState])
  const [reviewStore] = useState(() => createPlanReviewPreviewStore(content.editable))
  useLayoutEffect(() => reviewStore.getState().replace(content.editable), [content.editable, reviewStore])
  const reviewState = useStore(reviewStore)
  const editable = useMemo(() => projectPlanReviewPreviewContent(reviewState), [reviewState])
  const [treeStore] = useState(() => createPlanTreePreviewStore(content.tree))
  useLayoutEffect(() => treeStore.getState().replace(content.tree), [content.tree, treeStore])
  const treeState = useStore(treeStore)
  const tree = useMemo(() => projectPlanTreePreviewContent(treeState), [treeState])
  const [summaryStore] = useState(() => createPlanSummaryPreviewStore(content.summary))
  useLayoutEffect(() => summaryStore.getState().replace(content.summary), [content.summary, summaryStore])
  const summaryState = useStore(summaryStore)
  const summary = useMemo(() => projectPlanSummaryPreviewContent(summaryState), [summaryState])
  return (
    <HbarAppUiAgentPlanProvider
      content={{
        ...content,
        checklist,
        editable,
        tree,
        summary,
      }}
    >
      {children}
    </HbarAppUiAgentPlanProvider>
  )
}
