import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenOnboardingProvider, useLumenOnboardingContent, type LumenOnboarding3ReferenceViewModel, type LumenOnboardingContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Onboarding3PreviewFixture } from './onboarding3PreviewFixtures'
import { createOnboarding3PreviewStore } from './onboarding3PreviewStore'

type Onboarding3PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenOnboardingContent
  readonly referenceFixture: Onboarding3PreviewFixture
  readonly children: ReactNode
}

export function Onboarding3PreviewHost(props: Onboarding3PreviewHostProps) {
  if (props.spec.category !== 'onboarding' || props.spec.variant !== 3) return props.children
  return <Onboarding3PreviewHostOwner key={props.spec.id} {...props} />
}

function Onboarding3PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Onboarding3PreviewHostProps) {
  const parentContent = useLumenOnboardingContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createOnboarding3PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyRequest = (actionId: string, request: unknown) => {
    if (request !== null) notify(actionId, JSON.stringify(request))
  }

  const checklistReference: LumenOnboarding3ReferenceViewModel = {
    content: {
      title: preview.labels.title,
      description: preview.labels.description,
      progressLabel: preview.labels.progressLabel,
      progressText: preview.progress.text,
      completedCount: preview.progress.completedCount,
      totalCount: preview.progress.totalCount,
      visualFillPercent: preview.progress.visualFillPercent,
      tasks: preview.tasks.map((task) => ({
        id: task.id,
        label: task.label,
        detail: task.detail,
        checked: task.checked,
        checkboxLabel: task.checkboxLabel,
        actionLabel: task.action.label,
      })),
      footerText: preview.labels.footerText,
      emptyTasksText: preview.labels.emptyTasksText,
    },
    onCompletionChangeRequest(taskId, checked) {
      const result = store.getState().changeCompletion(taskId, checked)
      if (!result) return
      notifyRequest(
        result.kind === 'observed-local-completion-change'
          ? 'observed-task-completion-change'
          : 'request-task-completion-change',
        result,
      )
    },
    onTaskActionRequest(taskId) {
      notifyRequest('request-task-action', store.getState().requestTaskAction(taskId))
    },
  }

  return (
    <LumenOnboardingProvider content={{ ...(parentContent ?? content), checklistReference }}>
      {children}
    </LumenOnboardingProvider>
  )
}
