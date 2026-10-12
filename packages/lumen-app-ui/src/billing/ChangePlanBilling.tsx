'use client'
import * as React from 'react'
import { LumenInput } from '../forms'
import { LumenBadge } from '../ui-controls'
import { ArrowRight } from './glyphs'
import type { LumenBillingCompositionProps } from './primitives'
import type { LumenBillingChangePlanContent } from './content'
import { selectLumenBillingItem } from './content'
import { BillingButton, BillingFrame, BillingIcon, BillingValueRows, BillingWorkflowSteps } from './primitives'

export default function ChangePlanBilling({
  spec,
  onAction,
  content,
}: LumenBillingCompositionProps & {
  readonly content: LumenBillingChangePlanContent
}) {
  const choices = React.useMemo(() => {
    const seen = new Set<string>()
    return content.choices.filter((choice) => {
      if (seen.has(choice.id)) {
        return false
      }
      seen.add(choice.id)
      return true
    })
  }, [content.choices])
  const initialChoice = selectLumenBillingItem(choices, content.initialChoiceId)
  const [choiceId, setChoiceId] = React.useState(initialChoice?.id ?? '')
  const [stepId, setStepId] = React.useState(content.steps[0]?.id ?? '')
  const selectedChoice = choices.find((choice) => choice.id === choiceId) ?? choices[0]

  const choose = (nextId: string) => {
    setChoiceId(nextId)
    onAction?.({ variantId: spec.id, actionId: 'select-plan', value: nextId })
  }

  const continueFlow = () => {
    const currentIndex = content.steps.findIndex((step) => step.id === stepId)
    const next = content.steps[Math.min(Math.max(currentIndex, 0) + 1, Math.max(content.steps.length - 1, 0))]
    if (next) {
      setStepId(next.id)
    }
    const selectedId = selectedChoice?.id
    if (selectedId) {
      onAction?.({ variantId: spec.id, actionId: 'continue', value: selectedId })
    } else {
      onAction?.({ variantId: spec.id, actionId: 'continue' })
    }
  }

  return (
    <BillingFrame spec={spec} className="hbar-app-ui-billing-change-plan-surface">
      <main className="hbar-app-ui-billing-centered-page">
        <div className="hbar-app-ui-billing-change-shell">
          <header className="hbar-app-ui-billing-change-head">
            <div>
              <h1>{content.labels.pageTitle}</h1>
              <p>{content.labels.pageDescription}</p>
            </div>
            <span className="hbar-app-ui-billing-draft">
              <i aria-hidden="true" />
              {content.labels.draft}
            </span>
          </header>
          <div className="hbar-app-ui-billing-change-body">
            <BillingWorkflowSteps steps={content.steps} activeId={stepId} />
            <div
              className="hbar-app-ui-billing-change-choices"
              role="radiogroup"
              aria-label={content.labels.planSelection}
            >
              {choices.map((choice) => (
                <label className="hbar-app-ui-billing-change-choice" key={choice.id}>
                  <LumenInput
                    type="radio"
                    name={`hbar-app-ui-billing-plan-${spec.id}`}
                    value={choice.id}
                    checked={choice.id === selectedChoice?.id}
                    aria-label={choice.accessibleLabel}
                    onChange={() => choose(choice.id)}
                  />
                  <span>
                    <strong>{choice.name}</strong>
                    {choice.marker && <em>{choice.marker}</em>}
                    <small>{choice.description}</small>
                  </span>
                  <b>
                    {choice.price}
                    <small>{choice.priceSuffix}</small>
                  </b>
                </label>
              ))}
            </div>
            <aside className="hbar-app-ui-billing-change-summary">
              <header>
                <div>
                  <h2>{content.summary.title}</h2>
                  <p>{content.summary.description}</p>
                </div>
                <LumenBadge value={content.summary.actionBadge} />
              </header>
              <section className="hbar-app-ui-billing-due-card">
                <span>{content.summary.dueLabel}</span>
                <b>{content.summary.dueAmount}</b>
                <small>{content.summary.dueDetail}</small>
              </section>
              <BillingValueRows rows={content.summary.rows} />
              <ul className="hbar-app-ui-billing-assurances">
                {content.summary.assurances.map((assurance) => (
                  <li key={assurance}>
                    <i aria-hidden="true" />
                    <span>{assurance}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
          <footer className="hbar-app-ui-billing-change-footer">
            <p>{content.labels.footerNotice}</p>
            <div className="hbar-app-ui-billing-footer-actions">
              <BillingButton
                tone="quiet"
                type="button"
                onClick={() => onAction?.({ variantId: spec.id, actionId: 'cancel' })}
              >
                {content.labels.cancel}
              </BillingButton>
              <BillingButton tone="accent" type="button" disabled={!selectedChoice} onClick={continueFlow}>
                {content.labels.continue}
                <BillingIcon tier="sm">
                  <ArrowRight />
                </BillingIcon>
              </BillingButton>
            </div>
          </footer>
        </div>
      </main>
    </BillingFrame>
  )
}
