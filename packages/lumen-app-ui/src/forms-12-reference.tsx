'use client'

import * as React from 'react'
import { Check, Pencil } from 'lucide-react'
import './forms-12-reference.css'

export type LumenForms12StepId = 'business' | 'coverage' | 'property' | 'review'
export type LumenForms12SectionId = 'business-details' | 'coverage' | 'property-location' | 'contact'
export type LumenForms12ConsentId = 'information-accuracy' | 'policy-terms'
export type LumenForms12FieldId =
  | 'legal-business-name'
  | 'industry'
  | 'employee-count'
  | 'cover-types'
  | 'aggregate-limit'
  | 'primary-address'
  | 'territory'
  | 'cover-start-date'
  | 'named-contact'
  | 'email'
  | 'phone'

export interface LumenForms12Step {
  readonly id: LumenForms12StepId
  readonly label: string
  readonly status: 'complete' | 'current' | 'upcoming'
}

export interface LumenForms12ReviewField {
  readonly fieldId: LumenForms12FieldId
  readonly label: string
  readonly value: string
  readonly controlKind?: 'textbox' | 'combobox' | 'spinbutton' | 'not-observed' | undefined
}

export interface LumenForms12ReviewSection {
  readonly id: LumenForms12SectionId
  readonly title: string
  readonly editLabel: string
  readonly editDisabled: boolean
  readonly editing: boolean
  readonly rows: readonly LumenForms12ReviewField[]
  readonly editorFields: readonly LumenForms12ReviewField[]
  readonly cancelLabel: string
  readonly saveLabel: string
}

export interface LumenForms12Consent {
  readonly id: LumenForms12ConsentId
  readonly label: string
  readonly checked: boolean
}

export interface LumenForms12Content {
  readonly steps: readonly LumenForms12Step[]
  readonly sections: readonly LumenForms12ReviewSection[]
  readonly premium: {
    readonly heading: string
    readonly description: string
    readonly lines: readonly {
      readonly id: string
      readonly label: string
      readonly formattedAmount: string
    }[]
    readonly annualTotal: {
      readonly label: string
      readonly formattedAmount: string
    }
  }
  readonly consents: readonly LumenForms12Consent[]
  readonly requestBoundQuote: {
    readonly label: string
    readonly disabled: true
  }
}

export interface LumenForms12ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms12Content
  readonly onEditSection: (sectionId: LumenForms12SectionId) => void
  readonly onFieldChange: (fieldId: LumenForms12FieldId, value: string) => void
  readonly onCancelEdit: (sectionId: LumenForms12SectionId) => void
  readonly onSaveSection: (sectionId: LumenForms12SectionId) => void
  readonly onConsentChange: (consentId: LumenForms12ConsentId, checked: boolean) => void
  readonly onBoundQuoteRequest: () => void
}

export type LumenForms12ViewModel = Omit<LumenForms12ReferenceProps, 'instanceId'>

function controlId(instanceId: string, fieldId: LumenForms12FieldId): string {
  return `${instanceId}-forms-12-${fieldId}`
}

function Forms12StepList({ steps }: { readonly steps: readonly LumenForms12Step[] }) {
  return (
    <ol className="lumen-forms-12-steps">
      {steps.map((step, index) => (
        <li className="lumen-forms-12-step" key={step.id}>
          <div className="lumen-forms-12-step-content">
            <span aria-hidden="true" className={`lumen-forms-12-step-marker lumen-forms-12-step-marker-${step.status}`}>
              {step.status === 'complete' ? (
                <Check className="lumen-forms-12-icon lumen-forms-12-icon-sm" />
              ) : (
                index + 1
              )}
            </span>
            <span className="lumen-forms-12-step-label">{step.label}</span>
          </div>
          {index < steps.length - 1 ? <span aria-hidden="true" className="lumen-forms-12-step-rule" /> : null}
        </li>
      ))}
    </ol>
  )
}

function ReviewSection({
  instanceId,
  section,
  onEditSection,
  onFieldChange,
  onCancelEdit,
  onSaveSection,
}: {
  readonly instanceId: string
  readonly section: LumenForms12ReviewSection
  readonly onEditSection: (sectionId: LumenForms12SectionId) => void
  readonly onFieldChange: (fieldId: LumenForms12FieldId, value: string) => void
  readonly onCancelEdit: (sectionId: LumenForms12SectionId) => void
  readonly onSaveSection: (sectionId: LumenForms12SectionId) => void
}) {
  const observedEditorFields = section.editorFields.filter(
    (field) => field.controlKind !== undefined && field.controlKind !== 'not-observed',
  )
  const canShowObservedEditor = section.editing && observedEditorFields.length > 0

  return (
    <div className="lumen-forms-12-review-section" data-forms12-section={section.id}>
      <div className="lumen-forms-12-section-heading">
        <h3>{section.title}</h3>
        {!section.editing ? (
          <button
            className="lumen-forms-12-edit"
            disabled={section.editDisabled}
            onClick={() => onEditSection(section.id)}
            type="button"
          >
            <Pencil aria-hidden="true" className="lumen-forms-12-icon lumen-forms-12-icon-xs" />
            <span>{section.editLabel}</span>
          </button>
        ) : null}
      </div>
      <div className="lumen-forms-12-section-body">
        {canShowObservedEditor ? (
          <div className="lumen-forms-12-editor">
            {observedEditorFields.map((field) => {
              const id = controlId(instanceId, field.fieldId)
              return (
                <div className="lumen-forms-12-editor-field" key={field.fieldId}>
                  <label htmlFor={id}>{field.label}</label>
                  {field.controlKind === 'combobox' ? (
                    <select
                      id={id}
                      onChange={(event) => onFieldChange(field.fieldId, event.currentTarget.value)}
                      value={field.value}
                    >
                      <option value={field.value}>{field.value}</option>
                    </select>
                  ) : (
                    <input
                      id={id}
                      onChange={(event) => onFieldChange(field.fieldId, event.currentTarget.value)}
                      type={field.controlKind === 'spinbutton' ? 'number' : 'text'}
                      value={field.value}
                    />
                  )}
                </div>
              )
            })}
            <div className="lumen-forms-12-editor-actions">
              <button onClick={() => onCancelEdit(section.id)} type="button">
                {section.cancelLabel}
              </button>
              <button onClick={() => onSaveSection(section.id)} type="button">
                {section.saveLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className="lumen-forms-12-summary">
            {section.rows.map((row) => (
              <div className="lumen-forms-12-summary-row" key={row.fieldId}>
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function LumenForms12Reference({
  instanceId,
  content,
  onEditSection,
  onFieldChange,
  onCancelEdit,
  onSaveSection,
  onConsentChange,
  onBoundQuoteRequest,
}: LumenForms12ReferenceProps): React.ReactElement {
  return (
    <div className="lumen-forms-12-reference" data-hbar-app-ui-component="hbar-app-ui-forms-12">
      <Forms12StepList steps={content.steps} />
      <div className="lumen-forms-12-review-layout">
        <div className="lumen-forms-12-sections">
          {content.sections.map((section) => (
            <ReviewSection
              instanceId={instanceId}
              key={section.id}
              onCancelEdit={onCancelEdit}
              onEditSection={onEditSection}
              onFieldChange={onFieldChange}
              onSaveSection={onSaveSection}
              section={section}
            />
          ))}
        </div>
        <div className="lumen-forms-12-checkout">
          <div className="lumen-forms-12-premium">
            <div className="lumen-forms-12-premium-heading">
              <h3>{content.premium.heading}</h3>
              <p>{content.premium.description}</p>
            </div>
            <div className="lumen-forms-12-premium-body">
              {content.premium.lines.map((line) => (
                <div className="lumen-forms-12-premium-row" key={line.id}>
                  <span>{line.label}</span>
                  <span>{line.formattedAmount}</span>
                </div>
              ))}
              <div className="lumen-forms-12-premium-total">
                <span>{content.premium.annualTotal.label}</span>
                <span>{content.premium.annualTotal.formattedAmount}</span>
              </div>
            </div>
          </div>
          <div className="lumen-forms-12-consents">
            {content.consents.map((consent) => (
              <label className="lumen-forms-12-consent" key={consent.id}>
                <input
                  checked={consent.checked}
                  onChange={(event) => onConsentChange(consent.id, event.currentTarget.checked)}
                  type="checkbox"
                />
                <span>{consent.label}</span>
              </label>
            ))}
          </div>
          <button
            className="lumen-forms-12-request"
            disabled={content.requestBoundQuote.disabled}
            onClick={onBoundQuoteRequest}
            type="button"
          >
            {content.requestBoundQuote.label}
          </button>
        </div>
      </div>
    </div>
  )
}
