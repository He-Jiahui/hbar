import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { HbarAppUiAgentPlanProvider, type HbarAppUiAgentPlanContent } from 'hbar-app-ui/catalog'
import { createChecklistPreviewStore, projectChecklistPreviewContent } from './checklist-preview-model'
import { createPlanReviewPreviewStore, projectPlanReviewPreviewContent } from './plan-review-preview-model'

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
  return (
    <HbarAppUiAgentPlanProvider
      content={{
        ...content,
        checklist,
        editable,
      }}
    >
      {children}
    </HbarAppUiAgentPlanProvider>
  )
}
