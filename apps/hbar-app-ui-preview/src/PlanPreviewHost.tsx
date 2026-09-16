import { useState, type ReactNode } from 'react'
import { HbarAppUiAgentPlanProvider, type HbarAppUiAgentPlanContent } from 'hbar-app-ui/catalog'

export function PlanPreviewHost({
  content,
  children,
}: {
  readonly content: HbarAppUiAgentPlanContent
  readonly children: ReactNode
}) {
  const [source, setSource] = useState(content)
  const [steps, setSteps] = useState(content.editable?.steps ?? [])
  const [draft, setDraft] = useState('')
  if (source !== content) {
    setSource(content)
    setSteps(content.editable?.steps ?? [])
    setDraft('')
  }
  const editable = content.editable
  return (
    <HbarAppUiAgentPlanProvider
      content={{
        ...content,
        editable: editable && {
          ...editable,
          steps,
          draft,
          canAdd: true,
          canSubmit: steps.some((step) => step.state !== 'skipped'),
          onDraftChange: setDraft,
          onAdd() {
            if (!draft.trim()) return
            setSteps((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                title: draft.trim(),
                state: 'queued',
                stateLabel: editable.labels.newStepStateLabel,
              },
            ])
            setDraft('')
          },
          onMove(id, direction) {
            setSteps((current) => {
              const index = current.findIndex((step) => step.id === id),
                target = index + direction
              if (index < 0 || target < 0 || target >= current.length) return current
              const next = [...current],
                item = next[index]!,
                other = next[target]!
              next[index] = other
              next[target] = item
              return next
            })
          },
          onRemove(id) {
            setSteps((current) =>
              current.map((step) =>
                step.id === id ? { ...step, state: step.state === 'skipped' ? 'queued' : 'skipped' } : step,
              ),
            )
          },
          onSubmit() {
            setSteps((current) =>
              current.map((step) => (step.state === 'skipped' ? step : { ...step, state: 'running' })),
            )
          },
        },
      }}
    >
      {children}
    </HbarAppUiAgentPlanProvider>
  )
}
