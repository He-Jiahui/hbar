import { LumenInput, LumenTextarea } from '@lumen/app-ui'
import { HbarAppUiButton } from '../../primitives'
import type { ReactNode } from 'react'
import './ObjectiveForm.css'

export interface HbarAppUiObjectiveFormProps {
  readonly labels: {
    readonly title: string
    readonly objective: string
    readonly objectiveHint: string
    readonly budget: string
    readonly unlimited: string
    readonly save: string
    readonly reset: string
    readonly stale: string
  }
  readonly objective: string
  readonly objectiveMaximum: number
  readonly budget: string
  readonly busy: boolean
  readonly canSave: boolean
  readonly stale: boolean
  readonly error: string | undefined
  readonly onObjectiveChange: (value: string) => void
  readonly onBudgetChange: (value: string) => void
  readonly onSave: () => void
  readonly onReset: () => void
  readonly summary?: ReactNode
  readonly actions?: ReactNode
}

/** The host owns the objective draft, optional token limit, validation and persistence. */
export function HbarAppUiObjectiveForm(content: HbarAppUiObjectiveFormProps) {
  return (
    <form
      className="hbar-app-ui-objective-form"
      aria-label={content.labels.title}
      aria-busy={content.busy}
      onSubmit={(event) => {
        event.preventDefault()
        if (content.canSave && !content.busy && !content.stale) content.onSave()
      }}
    >
      {content.summary}
      {content.stale && (
        <div role="status">
          <p>{content.labels.stale}</p>
          <HbarAppUiButton disabled={content.busy} onClick={content.onReset}>
            {content.labels.reset}
          </HbarAppUiButton>
        </div>
      )}
      <label>
        {content.labels.objective}
        <LumenTextarea
          value={content.objective}
          maxLength={content.objectiveMaximum}
          placeholder={content.labels.objectiveHint}
          disabled={content.busy}
          onChange={(event) => content.onObjectiveChange(event.currentTarget.value)}
        />
      </label>
      <label>
        {content.labels.budget}
        <LumenInput
          type="number"
          min={1}
          step={1}
          value={content.budget}
          placeholder={content.labels.unlimited}
          disabled={content.busy}
          onChange={(event) => content.onBudgetChange(event.currentTarget.value)}
        />
      </label>
      {content.error && <p role="alert">{content.error}</p>}
      <footer>
        {content.actions}
        <HbarAppUiButton type="submit" tone="accent" disabled={content.busy || content.stale || !content.canSave}>
          {content.labels.save}
        </HbarAppUiButton>
      </footer>
    </form>
  )
}
