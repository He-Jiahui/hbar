'use client'

import { Check, Pencil } from 'lucide-react'
import type { LumenWizardContent } from '../wizard'

export default function ReviewReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceReview
  if (!flow) {
    return null
  }
  const steps = flow.steps.filter((step, index) => flow.steps.findIndex((other) => other.id === step.id) === index)
  const sections = flow.sections.filter(
    (section, index) => flow.sections.findIndex((other) => other.id === section.id) === index,
  )
  return (
    <section className="hbar-app-ui-wizard-review-card">
      <ol className="hbar-app-ui-wizard-review-steps">
        {steps.map((step, index) => {
          const complete = flow.completedStepIds.includes(step.id)
          const current = step.id === flow.currentStepId
          return (
            <li key={step.id}>
              <span
                className={`hbar-app-ui-wizard-review-step-number ${complete ? 'is-complete' : ''} ${current ? 'is-current' : ''}`}
                aria-hidden="true"
              >
                {complete ? <Check /> : index + 1}
              </span>
              <span className="hbar-app-ui-wizard-review-step-label">{step.label}</span>
              {index < steps.length - 1 && <span className="hbar-app-ui-wizard-review-step-line" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
      <div className="hbar-app-ui-wizard-review-body">
        <h2>{flow.labels.title}</h2>
        <p className="hbar-app-ui-wizard-review-detail">{flow.labels.detail}</p>
        {sections.length ? (
          <div className="hbar-app-ui-wizard-review-sections" data-hbar-app-ui-list-strategy={flow.listStrategy.kind}>
            {sections.map((section) => {
              const rows = section.rows.filter(
                (row, index) => section.rows.findIndex((other) => other.id === row.id) === index,
              )
              return (
                <div className="hbar-app-ui-wizard-review-section" key={section.id}>
                  <div className="hbar-app-ui-wizard-review-section-header">
                    <h3>{section.title}</h3>
                    <button type="button" aria-label={flow.labels.editSection(section.title)}>
                      <Pencil aria-hidden="true" />
                      {flow.labels.edit}
                    </button>
                  </div>
                  <dl>
                    {rows.map((row) => (
                      <div key={row.id}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="hbar-app-ui-wizard-review-empty">{flow.labels.empty}</p>
        )}
        <label className="hbar-app-ui-wizard-review-confirmation">
          <button
            type="button"
            role="checkbox"
            aria-checked={flow.confirmed}
            onClick={() => flow.onConfirmationChange(!flow.confirmed)}
          >
            {flow.confirmed && <Check aria-hidden="true" />}
          </button>
          <span>{flow.labels.confirmation}</span>
        </label>
      </div>
      <div className="hbar-app-ui-wizard-review-footer">
        <button type="button">{flow.labels.back}</button>
        <button type="button" disabled={!flow.confirmed}>
          {flow.labels.send}
        </button>
      </div>
    </section>
  )
}
