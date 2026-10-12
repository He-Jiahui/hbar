'use client'

import type { LumenWizardContent } from '../wizard'

export default function InformationReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceInformation
  if (!flow) {
    return null
  }
  const steps = flow.steps.filter((step, index) => flow.steps.findIndex((other) => other.id === step.id) === index)
  const fields = flow.fields.filter((field, index) => flow.fields.findIndex((other) => other.id === field.id) === index)
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === flow.stepId),
  )
  const move = (delta: number) => {
    const target = steps[Math.max(0, Math.min(steps.length - 1, activeIndex + delta))]
    if (target) {
      flow.onStepChange(target.id)
    }
  }
  return (
    <form
      className="hbar-app-ui-wizard-information-form"
      onSubmit={(event) => {
        event.preventDefault()
        move(1)
      }}
    >
      <ol className="hbar-app-ui-wizard-information-steps">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button type="button" onClick={() => flow.onStepChange(step.id)}>
              <span
                className={`hbar-app-ui-wizard-information-step-number ${index < activeIndex ? 'is-complete' : ''} ${index === activeIndex ? 'is-current' : ''}`}
                aria-hidden="true"
              >
                {index < activeIndex ? (
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="m3.5 8 3 3 6-6" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="hbar-app-ui-wizard-information-step-label">{step.label}</span>
            </button>
            {index < steps.length - 1 && (
              <span className="hbar-app-ui-wizard-information-step-line" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
      <div className="hbar-app-ui-wizard-information-body">
        <h2>{flow.labels.title}</h2>
        <p className="hbar-app-ui-wizard-information-detail">{flow.labels.detail}</p>
        {fields.length ? (
          <div className="hbar-app-ui-wizard-information-fields">
            {fields.map((field) => (
              <div key={field.id} className="hbar-app-ui-wizard-information-field">
                <label htmlFor={`wizard-information-${field.id}`}>
                  {field.label}
                  {field.required && (
                    <span className="hbar-app-ui-wizard-information-required" aria-hidden="true">
                      {flow.labels.required}
                    </span>
                  )}
                </label>
                {field.kind === 'select' ? (
                  <select
                    id={`wizard-information-${field.id}`}
                    value={field.value}
                    onChange={(event) => flow.onFieldChange(field.id, event.target.value)}
                  >
                    {(field.options ?? []).map((option) => (
                      <option value={option.id} key={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="hbar-app-ui-wizard-information-input-wrap">
                    {field.prefix && <span aria-hidden="true">{field.prefix}</span>}
                    <input
                      id={`wizard-information-${field.id}`}
                      type={field.kind === 'email' ? 'email' : undefined}
                      value={field.value}
                      onChange={(event) => flow.onFieldChange(field.id, event.target.value)}
                    />
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="hbar-app-ui-wizard-information-empty">{flow.labels.empty}</p>
        )}
        <p className="hbar-app-ui-wizard-information-hint">{flow.labels.emailHint}</p>
      </div>
      <div className="hbar-app-ui-wizard-information-footer">
        <button type="button" disabled={activeIndex === 0} onClick={() => move(-1)}>
          {flow.labels.back}
        </button>
        <button type="submit">
          {flow.labels.next}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m6 3 5 5-5 5M3 8h8" />
          </svg>
        </button>
      </div>
    </form>
  )
}
