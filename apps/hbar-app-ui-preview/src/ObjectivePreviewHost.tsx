import { useState } from 'react'
import { HbarAppUiObjectiveForm, type HbarAppUiObjectiveFormProps } from 'hbar-app-ui/forms'

const labels: HbarAppUiObjectiveFormProps['labels'] = {
  title: 'Goal settings',
  objective: 'Objective',
  objectiveHint: 'Describe the next milestone',
  budget: 'Token budget (optional)',
  unlimited: 'Unlimited',
  save: 'Save Goal',
  reset: 'Load latest Goal',
  stale: 'This goal changed elsewhere. Review the latest version before saving.',
}
const fixture = {
  objective: 'Complete the workspace integration and its acceptance checks.',
  budget: '5000',
  objectiveMaximum: 4000,
}
/** The gallery supplies the draft and simulated acknowledgement; the form is the production component. */
export function ObjectivePreviewHost() {
  const [draft, setDraft] = useState(fixture)
  return (
    <HbarAppUiObjectiveForm
      labels={labels}
      objective={draft.objective}
      objectiveMaximum={fixture.objectiveMaximum}
      budget={draft.budget}
      busy={false}
      canSave={Boolean(draft.objective.trim())}
      stale={false}
      error={undefined}
      onObjectiveChange={(objective) => setDraft((current) => ({ ...current, objective }))}
      onBudgetChange={(budget) => setDraft((current) => ({ ...current, budget }))}
      onSave={() => setDraft((current) => ({ ...current, objective: current.objective.trim() }))}
      onReset={() => setDraft(fixture)}
    />
  )
}
