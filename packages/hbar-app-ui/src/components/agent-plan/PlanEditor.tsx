import { ArrowDown, ArrowUp, CornerUpLeft, Play, Plus, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'
import { uniqueItems } from '../../collection'
import type { HbarAppUiAgentPlanEditableContent, HbarAppUiAgentPlanState } from './AgentPlanContent'
import './PlanEditor.css'

export interface HbarAppUiPlanEditorControls {
  readonly draft: string
  readonly busy: boolean
  readonly canAdd: boolean
  readonly canSubmit: boolean
  readonly error?: string | undefined
  readonly before?: ReactNode
  readonly after?: ReactNode
  readonly actions?: ReactNode
  readonly onDraftChange: (value: string) => void
  readonly onAdd: () => void
  readonly onMove: (id: string, direction: -1 | 1) => void
  readonly onRemove: (id: string) => void
  readonly onSubmit: () => void
  readonly editing?:
    | {
        readonly titleLabel: (index: number) => string
        readonly statusLabel: (index: number) => string
        readonly statuses: readonly { readonly id: HbarAppUiAgentPlanState; readonly label: string }[]
        readonly onTitleChange: (id: string, value: string) => void
        readonly onStatusChange: (id: string, value: HbarAppUiAgentPlanState) => void
      }
    | undefined
}

/** Bounded plan editor. The host owns drafts, stable IDs, limits and all mutations. */
export function HbarAppUiPlanEditor({
  labels,
  steps: input,
  listStrategy,
  ...control
}: HbarAppUiAgentPlanEditableContent) {
  const steps = uniqueItems(input)
  return (
    <section className="hbar-app-ui-plan-editor" aria-label={labels.title} aria-busy={control.busy}>
      <header className="hbar-app-ui-agent-plan-heading">
        <h2>{labels.title}</h2>
        <span>{labels.summary}</span>
      </header>
      {control.before}
      <main className="hbar-app-ui-agent-plan-editable-body">
        {steps.length ? (
          <div className="hbar-app-ui-agent-plan-editable-card" data-hbar-app-ui-list-strategy={listStrategy.kind}>
            <div className="hbar-app-ui-agent-plan-editable-list-viewport">
              <ol>
                {steps.map((step, index) => (
                  <li key={step.id} className={step.state === 'skipped' ? 'is-skipped' : ''}>
                    <span aria-hidden="true" className="hbar-app-ui-agent-plan-number">
                      {index + 1}
                    </span>
                    {control.editing ? (
                      <div className="hbar-app-ui-plan-step-fields">
                        <input
                          aria-label={control.editing.titleLabel(index + 1)}
                          value={step.title}
                          disabled={control.busy}
                          onChange={(event) => control.editing?.onTitleChange(step.id, event.target.value)}
                        />
                        <select
                          aria-label={control.editing.statusLabel(index + 1)}
                          value={step.state}
                          disabled={control.busy}
                          onChange={(event) => {
                            const status = control.editing?.statuses.find((item) => item.id === event.target.value)
                            if (status) control.editing?.onStatusChange(step.id, status.id)
                          }}
                        >
                          {control.editing.statuses.map((status) => (
                            <option key={status.id} value={status.id}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="hbar-app-ui-agent-plan-step-title">{step.title}</span>
                    )}
                    <div className="hbar-app-ui-agent-plan-row-actions">
                      <button
                        type="button"
                        className="hbar-app-ui-agent-plan-button"
                        aria-label={labels.moveUp(step.title)}
                        disabled={control.busy || index === 0}
                        onClick={() => control.onMove(step.id, -1)}
                      >
                        <HbarAppUiIcon icon={ArrowUp} tier="sm" />
                      </button>
                      <button
                        type="button"
                        className="hbar-app-ui-agent-plan-button"
                        aria-label={labels.moveDown(step.title)}
                        disabled={control.busy || index === steps.length - 1}
                        onClick={() => control.onMove(step.id, 1)}
                      >
                        <HbarAppUiIcon icon={ArrowDown} tier="sm" />
                      </button>
                      <button
                        type="button"
                        className="hbar-app-ui-agent-plan-button"
                        aria-label={step.state === 'skipped' ? labels.restore(step.title) : labels.skip(step.title)}
                        disabled={control.busy}
                        onClick={() => control.onRemove(step.id)}
                      >
                        <HbarAppUiIcon icon={step.state === 'skipped' ? CornerUpLeft : X} tier="sm" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <p className="hbar-app-ui-agent-plan-empty">{labels.empty}</p>
        )}
        <form
          className="hbar-app-ui-agent-plan-add-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (control.canAdd && !control.busy) control.onAdd()
          }}
        >
          <input
            aria-label={labels.addPlaceholder}
            placeholder={labels.addPlaceholder}
            value={control.draft}
            onChange={(event) => control.onDraftChange(event.target.value)}
            disabled={control.busy || !control.canAdd}
          />
          <button className="hbar-app-ui-agent-plan-button" type="submit" disabled={control.busy || !control.canAdd}>
            <HbarAppUiIcon icon={Plus} tier="sm" />
            <span>{labels.add}</span>
          </button>
        </form>
      </main>
      {control.after}
      {control.error && <p role="alert">{control.error}</p>}
      <footer className="hbar-app-ui-agent-plan-editable-footer">
        <p className="hbar-app-ui-agent-plan-editable-review">{labels.review}</p>
        <div className="hbar-app-ui-plan-editor-actions">
          {control.actions}
          <button
            type="button"
            className="hbar-app-ui-agent-plan-button is-primary"
            disabled={control.busy || !control.canSubmit}
            onClick={control.onSubmit}
          >
            <HbarAppUiIcon icon={Play} tier="sm" />
            <span>{labels.start(steps.filter((step) => step.state !== 'skipped').length)}</span>
          </button>
        </div>
      </footer>
    </section>
  )
}
