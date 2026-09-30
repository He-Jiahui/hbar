import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenAgentPlanProvider as HbarAppUiAgentPlanProvider,
  type LumenAgentPlanContent as HbarAppUiAgentPlanContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { createChecklistPreviewStore, projectChecklistPreviewContent } from './checklist-preview-model'
import { createPlanReviewPreviewStore, projectPlanReviewPreviewContent } from './plan-review-preview-model'
import { createPlanTreePreviewStore, projectPlanTreePreviewContent } from './plan-tree-preview-model'
import { createPlanSummaryPreviewStore, projectPlanSummaryPreviewContent } from './plan-summary-preview-model'
import { createPlanPreviewCopy, projectPlanPreviewCopy } from './planPreviewCopy'

interface PlanPreviewHostProps extends Pick<HbarAppUiVariantProps, 'spec'> {
  readonly content: HbarAppUiAgentPlanContent
  readonly localized: boolean
  readonly children: ReactNode
}

export function PlanPreviewHost(props: PlanPreviewHostProps) {
  if (props.spec.category !== 'agent-plan')
    return <HbarAppUiAgentPlanProvider content={props.content}>{props.children}</HbarAppUiAgentPlanProvider>
  return <PlanPreviewOwner key={props.spec.id} {...props} />
}

function PlanPreviewOwner({ content, spec, localized, children }: PlanPreviewHostProps) {
  const source = useMemo(() => projectPlanPreviewCopy(content, localized), [content, localized])
  const checklistSource = spec.variant === 1 ? source.checklist : undefined
  const [checklistStore] = useState(() => createChecklistPreviewStore(checklistSource))
  useLayoutEffect(() => checklistStore.getState().replace(checklistSource), [checklistSource, checklistStore])
  const checklistState = useStore(checklistStore)
  const checklist = useMemo(() => projectChecklistPreviewContent(checklistState), [checklistState])
  const reviewSource = spec.variant === 2 ? source.editable : undefined
  const [reviewStore] = useState(() => createPlanReviewPreviewStore(reviewSource))
  useLayoutEffect(() => reviewStore.getState().replace(reviewSource), [reviewSource, reviewStore])
  const reviewState = useStore(reviewStore)
  const editable = useMemo(() => projectPlanReviewPreviewContent(reviewState), [reviewState])
  const treeSource = spec.variant === 3 ? source.tree : undefined
  const [treeStore] = useState(() => createPlanTreePreviewStore(treeSource))
  useLayoutEffect(() => treeStore.getState().replace(treeSource), [treeSource, treeStore])
  const treeState = useStore(treeStore)
  const tree = useMemo(() => projectPlanTreePreviewContent(treeState), [treeState])
  const summarySource = spec.variant === 6 ? source.summary : undefined
  const [summaryStore] = useState(() => createPlanSummaryPreviewStore(summarySource))
  useLayoutEffect(() => summaryStore.getState().replace(summarySource), [summarySource, summaryStore])
  const summaryState = useStore(summaryStore)
  const summary = useMemo(() => projectPlanSummaryPreviewContent(summaryState), [summaryState])
  const changedReview =
    reviewSource &&
    (reviewState.running ||
      reviewState.announcement ||
      reviewState.steps.length !== reviewSource.steps.length ||
      reviewState.steps.some(
        (step, index) => step.id !== reviewSource.steps[index]?.id || step.state !== reviewSource.steps[index]?.state,
      ))
  const locallyChanged =
    (checklistSource && checklistState.paused !== checklistSource.paused) ||
    changedReview ||
    treeState.retried.length > 0 ||
    (summarySource && (summaryState.editing || summaryState.running || summaryState.goal !== summarySource.goal))
  return (
    <HbarAppUiAgentPlanProvider
      content={{
        ...source,
        presentation: {
          ownerId: `plan-preview-${spec.id}`,
          notice: locallyChanged ? createPlanPreviewCopy(localized).notice : undefined,
        },
        checklist: spec.variant === 1 ? checklist : source.checklist,
        editable: spec.variant === 2 ? editable : source.editable,
        tree: spec.variant === 3 ? tree : source.tree,
        summary: spec.variant === 6 ? summary : source.summary,
      }}
    >
      {children}
    </HbarAppUiAgentPlanProvider>
  )
}
