'use client'

import { ArrowRight } from 'lucide-react'
import type { LumenWizardContent } from '../wizard'

export default function UpgradeReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceUpgrade
  if (!flow) {
    return null
  }
  const steps = flow.steps.filter((step, index) => flow.steps.findIndex((other) => other.id === step.id) === index)
  const plans = flow.plans.filter((plan, index) => flow.plans.findIndex((other) => other.id === plan.id) === index)
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === flow.stepId),
  )
  const next = steps[Math.min(steps.length - 1, stepIndex + 1)]
  return (
    <section className="hbar-app-ui-wizard-upgrade-card">
      <header className="hbar-app-ui-wizard-upgrade-header">
        <div className="hbar-app-ui-wizard-upgrade-intro">
          <div>
            <h2>{flow.labels.title}</h2>
            <p>{flow.labels.detail}</p>
          </div>
          <span className="hbar-app-ui-wizard-upgrade-draft">
            <span aria-hidden="true" />
            {flow.labels.draft}
          </span>
        </div>
        <ol className="hbar-app-ui-wizard-upgrade-steps">
          {steps.map((step, index) => (
            <li key={step.id}>
              <button type="button" onClick={() => flow.onStepChange(step.id)}>
                <span
                  className={`hbar-app-ui-wizard-upgrade-step-number ${index < stepIndex ? 'is-complete' : ''} ${index === stepIndex ? 'is-current' : ''}`}
                  aria-hidden="true"
                >
                  {index < stepIndex ? (
                    <svg viewBox="0 0 16 16">
                      <path d="m3.5 8 3 3 6-6" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hbar-app-ui-wizard-upgrade-step-label">{step.label}</span>
              </button>
              {index < steps.length - 1 && <span className="hbar-app-ui-wizard-upgrade-step-line" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </header>
      <div className="hbar-app-ui-wizard-upgrade-body">
        <div className="hbar-app-ui-wizard-upgrade-plan" role="radiogroup" aria-label={flow.labels.plan}>
          <h3>{flow.labels.plan}</h3>
          <div className="hbar-app-ui-wizard-upgrade-options" data-hbar-app-ui-list-strategy={flow.listStrategy.kind}>
            {plans.map((plan) => (
              <button
                type="button"
                role="radio"
                aria-checked={plan.id === flow.selectedPlanId}
                key={plan.id}
                onClick={() => flow.onPlanChange(plan.id)}
              >
                <span className="hbar-app-ui-wizard-upgrade-radio" aria-hidden="true" />
                <span className="hbar-app-ui-wizard-upgrade-option-copy">
                  <span>
                    <span>{plan.label}</span>
                    {plan.badge && <small>{plan.badge}</small>}
                  </span>
                  <span>{plan.detail}</span>
                </span>
                <span className="hbar-app-ui-wizard-upgrade-price">{plan.price}</span>
              </button>
            ))}
          </div>
          <p>{flow.labels.seatNote}</p>
        </div>
        <aside className="hbar-app-ui-wizard-upgrade-invoice">
          <div className="hbar-app-ui-wizard-upgrade-invoice-header">
            <h3>{flow.labels.invoice}</h3>
            <span>{flow.labels.annual}</span>
          </div>
          <div className="hbar-app-ui-wizard-upgrade-summary">
            <div className="hbar-app-ui-wizard-upgrade-total">
              <p>{flow.labels.due}</p>
              <p>{flow.total}</p>
              <p>{flow.labels.totalDetail}</p>
            </div>
            <dl className="hbar-app-ui-wizard-upgrade-rows">
              {flow.summaryRows.map((row) => (
                <div key={row.id}>
                  <span>
                    <dt>{row.label}</dt>
                    <p>{row.detail}</p>
                  </span>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <dl className="hbar-app-ui-wizard-upgrade-meta">
              {flow.metadataRows.map((row) => (
                <div key={row.id}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
      <div className="hbar-app-ui-wizard-upgrade-footer">
        <p>{flow.labels.footer}</p>
        <button type="button" onClick={() => next && flow.onStepChange(next.id)}>
          {flow.labels.next}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
