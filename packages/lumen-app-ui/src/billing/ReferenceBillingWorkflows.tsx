'use client'

import * as React from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { LumenInput, LumenSelect } from '../forms'
import { LumenButton, LumenText } from '../primitives'
import { uniqueLumenBillingItems } from './content'
import type {
  LumenBillingChangePlanContent,
  LumenBillingInvoiceComposerContent,
  LumenBillingInvoiceField,
  LumenBillingWorkflowStep,
} from './content'
import { BillingFrame, type LumenBillingCompositionProps } from './primitives'
import type {
  LumenBillingChangePlanReferenceLayout,
  LumenBillingInvoiceComposerReferenceLayout,
} from './reference-content'
import './reference-workflows.css'

export interface ReferenceBillingInvoiceComposerProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingInvoiceComposerContent
  readonly layout: LumenBillingInvoiceComposerReferenceLayout
}
export interface ReferenceBillingChangePlanProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingChangePlanContent
  readonly layout: LumenBillingChangePlanReferenceLayout
}

interface WorkflowStepsProps {
  readonly steps: readonly LumenBillingWorkflowStep[]
  readonly activeId: string
  readonly numberLabel: (position: number) => string
}

function WorkflowSteps({ steps, activeId, numberLabel }: WorkflowStepsProps) {
  return (
    <ol className="lumen-billing-workflow-steps">
      {uniqueLumenBillingItems(steps).map((step, index) => (
        <li key={step.id} aria-current={step.id === activeId ? 'step' : undefined}>
          <span className="lumen-billing-workflow-number">{numberLabel(index + 1)}</span>
          <LumenText as="p" variant="label">
            {step.label}
          </LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {step.description}
          </LumenText>
        </li>
      ))}
    </ol>
  )
}

interface ReferenceInvoiceFieldProps {
  readonly field: LumenBillingInvoiceField
  readonly value: string
  readonly valueLimit: number
  readonly disabled: boolean
  readonly onChange: (value: string) => void
}

function ReferenceInvoiceField({ field, value, valueLimit, disabled, onChange }: ReferenceInvoiceFieldProps) {
  const fieldId = React.useId()
  const descriptionId = React.useId()
  const common = {
    id: fieldId,
    name: field.id,
    value,
    disabled,
    'aria-describedby': field.description ? descriptionId : undefined,
    'data-hbar-app-ui-field': field.id,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.currentTarget.value),
  }
  return (
    <div className="lumen-billing-workflow-field">
      <label htmlFor={fieldId}>{field.label}</label>
      <div className="lumen-billing-workflow-field-control">
        {field.prefix ? <span aria-hidden="true">{field.prefix}</span> : null}
        {field.kind === 'select' ? (
          <LumenSelect {...common}>
            {uniqueLumenBillingItems(field.choices ?? []).map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </LumenSelect>
        ) : (
          <LumenInput {...common} type={field.kind} placeholder={field.placeholder} maxLength={valueLimit} />
        )}
        {field.clearLabel && value ? (
          <LumenButton
            variant="text"
            indicator="none"
            aria-label={field.clearLabel}
            disabled={disabled}
            data-hbar-app-ui-action="clear-field"
            onClick={() => onChange('')}
          >
            <X className="lumen-billing-workflow-icon" aria-hidden="true" />
          </LumenButton>
        ) : null}
      </div>
      {field.description ? (
        <LumenText as="p" id={descriptionId} tone="muted" variant="supporting">
          {field.description}
        </LumenText>
      ) : null}
    </div>
  )
}

export function ReferenceBillingInvoiceComposer({
  spec,
  onAction,
  content,
  layout,
}: ReferenceBillingInvoiceComposerProps) {
  const flow = content.referenceFlow
  const steps = uniqueLumenBillingItems(content.steps)
  const active = steps.find(({ id }) => id === content.initialStepId) ?? steps[0]
  const index = active ? steps.findIndex(({ id }) => id === active.id) : -1
  const sections = uniqueLumenBillingItems(content.sections)
  const requestNext = () => {
    if (flow) {
      flow.onNext()
    } else {
      onAction?.({ variantId: spec.id, actionId: 'invoice-next-step', value: layout.draftId })
    }
  }
  return (
    <BillingFrame spec={spec} className="lumen-billing-workflow-root">
      <form
        className="lumen-billing-workflow"
        data-hbar-app-ui-region="invoice-composer"
        onSubmit={(event) => {
          event.preventDefault()
          requestNext()
        }}
      >
        <header className="lumen-billing-workflow-header">
          <div>
            <LumenText as="h2" variant="heading">
              {content.labels.pageTitle}
            </LumenText>
            <LumenText as="p" tone="muted" variant="supporting">
              {content.labels.stepDetail(index + 1, steps.length, active?.label ?? '')}
            </LumenText>
          </div>
          <LumenText as="span" className="lumen-billing-workflow-draft" variant="supporting">
            {content.labels.draft}
          </LumenText>
        </header>
        <div className="lumen-billing-workflow-body">
          <WorkflowSteps steps={steps} activeId={active?.id ?? ''} numberLabel={layout.stepNumber} />
          {sections.map((section) => (
            <section key={section.id} className="lumen-billing-workflow-section" aria-label={section.title}>
              <header>
                <LumenText as="h3" variant="heading">
                  {section.title}
                </LumenText>
                <LumenText as="p" tone="muted" variant="supporting">
                  {section.description}
                </LumenText>
              </header>
              <div className="lumen-billing-workflow-fields">
                {uniqueLumenBillingItems(section.fields).map((field) => (
                  <ReferenceInvoiceField
                    key={field.id}
                    field={field}
                    value={flow?.values[field.id] ?? field.value}
                    valueLimit={layout.valueLimit}
                    disabled={!flow || flow.pending}
                    onChange={(value) => flow?.onFieldChange(field.id, value)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="lumen-billing-workflow-footer" aria-busy={flow?.pending || undefined}>
          <div className="lumen-billing-workflow-notice">
            <LumenText as="p" tone="muted" variant="supporting">
              {content.labels.pageDescription}
            </LumenText>
            {flow?.error ? (
              <LumenText as="p" tone="danger" role="alert">
                {flow.error}
              </LumenText>
            ) : null}
            {flow?.feedback ? (
              <LumenText as="p" tone="muted" role="status">
                {flow.feedback}
              </LumenText>
            ) : null}
          </div>
          <div className="lumen-billing-workflow-actions">
            <LumenButton
              indicator="none"
              variant="outlined"
              data-hbar-app-ui-action="save-draft"
              disabled={!flow || flow.pending}
              onClick={() => flow?.onSaveDraft()}
            >
              {content.labels.saveDraft}
            </LumenButton>
            <LumenButton
              indicator="none"
              type="submit"
              tone="primary"
              data-hbar-app-ui-action="invoice-next-step"
              disabled={flow?.pending}
            >
              {content.labels.nextStep}
              <ArrowRight className="lumen-billing-workflow-icon" aria-hidden="true" />
            </LumenButton>
          </div>
        </footer>
      </form>
    </BillingFrame>
  )
}

export function ReferenceBillingChangePlan({ spec, onAction, content, layout }: ReferenceBillingChangePlanProps) {
  const instanceId = React.useId()
  const legendId = React.useId()
  const flow = content.referenceFlow
  const choices = uniqueLumenBillingItems(content.choices)
  const choiceId = flow ? flow.choiceId : content.initialChoiceId
  const selected = choices.find(({ id }) => id === choiceId) ?? choices[0]
  const summary = layout.summaries.find(({ choiceId: id }) => id === selected?.id)?.summary ?? content.summary
  return (
    <BillingFrame spec={spec} className="lumen-billing-workflow-root">
      <section className="lumen-billing-workflow" data-hbar-app-ui-region="change-plan">
        <header className="lumen-billing-workflow-header">
          <div>
            <LumenText as="h2" variant="heading">
              {content.labels.pageTitle}
            </LumenText>
            <LumenText as="p" tone="muted" variant="supporting">
              {content.labels.pageDescription}
            </LumenText>
          </div>
          <LumenText as="span" className="lumen-billing-workflow-draft" variant="supporting">
            {content.labels.draft}
          </LumenText>
        </header>
        <div className="lumen-billing-workflow-body">
          <WorkflowSteps steps={content.steps} activeId={layout.initialStepId} numberLabel={layout.stepNumber} />
          <div className="lumen-billing-change-columns">
            <fieldset className="lumen-billing-change-choices" aria-labelledby={legendId}>
              <legend className="lumen-billing-workflow-sr-label" id={legendId}>
                {content.labels.planSelection}
              </legend>
              {choices.map((choice) => (
                <label key={choice.id} className="lumen-billing-change-choice">
                  <LumenInput
                    type="radio"
                    name={`billing-choice-${instanceId}`}
                    value={choice.id}
                    checked={choice.id === selected?.id}
                    aria-label={choice.accessibleLabel}
                    data-hbar-app-ui-field="plan-choice"
                    onChange={() => {
                      if (flow) {
                        flow.onChoiceChange(choice.id)
                      } else {
                        onAction?.({
                          variantId: spec.id,
                          actionId: 'select-plan',
                          value: choice.id,
                        })
                      }
                    }}
                  />
                  <span className="lumen-billing-change-choice-copy">
                    <span>
                      <LumenText as="strong" variant="label">
                        {choice.name}
                      </LumenText>
                      {choice.marker ? (
                        <LumenText as="small" tone="muted">
                          {choice.marker}
                        </LumenText>
                      ) : null}
                    </span>
                    <LumenText as="small" tone="muted" variant="supporting">
                      {choice.description}
                    </LumenText>
                  </span>
                  <span className="lumen-billing-change-price">
                    {choice.price}
                    {choice.priceSuffix}
                  </span>
                </label>
              ))}
            </fieldset>
            <aside className="lumen-billing-change-summary">
              <header>
                <LumenText as="h3" variant="heading">
                  {summary.title}
                </LumenText>
                <LumenText as="small" tone="muted">
                  {summary.actionBadge}
                </LumenText>
              </header>
              <LumenText as="p" tone="muted" variant="supporting">
                {summary.description}
              </LumenText>
              <div className="lumen-billing-change-due">
                <LumenText as="p" tone="muted" variant="supporting">
                  {summary.dueLabel}
                </LumenText>
                <LumenText as="p" className="lumen-billing-change-amount">
                  {summary.dueAmount}
                </LumenText>
                <LumenText as="p" tone="muted" variant="supporting">
                  {summary.dueDetail}
                </LumenText>
              </div>
              <dl className="lumen-billing-change-values">
                {uniqueLumenBillingItems(summary.rows).map((row) => (
                  <div key={row.id}>
                    <dt>
                      {row.label}
                      {row.detail ? (
                        <LumenText as="small" tone="muted" variant="supporting">
                          {row.detail}
                        </LumenText>
                      ) : null}
                    </dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="lumen-billing-change-assurances">
                {summary.assurances.map((assurance, index) => (
                  <li key={index}>
                    <Check className="lumen-billing-workflow-icon" aria-hidden="true" />
                    {assurance}
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
        <footer className="lumen-billing-workflow-footer">
          <LumenText as="p" tone="muted" variant="supporting">
            {content.labels.footerNotice}
          </LumenText>
          <div className="lumen-billing-workflow-actions">
            <LumenButton
              variant="text"
              indicator="none"
              data-hbar-app-ui-action="cancel-plan-change"
              onClick={() => {
                if (flow) {
                  flow.onCancel()
                } else {
                  onAction?.({ variantId: spec.id, actionId: 'cancel', value: layout.ownerId })
                }
              }}
            >
              {content.labels.cancel}
            </LumenButton>
            <LumenButton
              tone="primary"
              indicator="none"
              data-hbar-app-ui-action="continue-plan-change"
              disabled={!selected}
              onClick={() => {
                if (flow) {
                  flow.onContinue()
                } else {
                  onAction?.({ variantId: spec.id, actionId: 'continue', value: selected?.id })
                }
              }}
            >
              {content.labels.continue}
              <ArrowRight className="lumen-billing-workflow-icon" aria-hidden="true" />
            </LumenButton>
          </div>
        </footer>
      </section>
    </BillingFrame>
  )
}
