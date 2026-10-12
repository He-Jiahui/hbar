'use client'

import * as React from 'react'
import { ArrowRight, Building2, CalendarDays, ChevronDown, Hash, Info, X } from 'lucide-react'
import type { LumenWizardContent, LumenWizardReferenceInvoiceField } from '../wizard'

export default function InvoiceReference({ content }: { readonly content: LumenWizardContent }) {
  const flow = content.referenceInvoice
  if (!flow) {
    return null
  }
  const unique = (fields: readonly LumenWizardReferenceInvoiceField[]) =>
    fields.filter((field, index) => fields.findIndex((other) => other.id === field.id) === index)
  const fieldView = (field: LumenWizardReferenceInvoiceField) => (
    <div className="hbar-app-ui-wizard-invoice-field" key={field.id}>
      <label htmlFor={`wizard-invoice-${field.id}`}>
        {field.label}
        {field.information && <Info aria-hidden="true" />}
      </label>
      <span className="hbar-app-ui-wizard-invoice-control">
        {field.icon === 'building' && <Building2 aria-hidden="true" />}
        {field.icon === 'hash' && <Hash aria-hidden="true" />}
        {field.kind === 'select' ? (
          <select
            id={`wizard-invoice-${field.id}`}
            value={field.value}
            onChange={(event) => flow.onFieldChange(field.id, event.target.value)}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`wizard-invoice-${field.id}`}
            value={field.value}
            onChange={(event) => flow.onFieldChange(field.id, event.target.value)}
          />
        )}
        {field.clear && (
          <button type="button" aria-label={flow.labels.clearCustomer}>
            <X aria-hidden="true" />
          </button>
        )}
        {field.icon === 'calendar' && <CalendarDays aria-hidden="true" />}
        {field.kind === 'select' && <ChevronDown aria-hidden="true" />}
      </span>
    </div>
  )
  return (
    <React.Fragment>
      <header className="hbar-app-ui-wizard-invoice-header">
        <button type="button" aria-label={flow.labels.close}>
          <X aria-hidden="true" />
        </button>
        <span className="hbar-app-ui-wizard-invoice-header-divider" aria-hidden="true" />
        <h1>{flow.labels.title}</h1>
        <div
          className="hbar-app-ui-wizard-invoice-progress"
          role="progressbar"
          aria-label={flow.labels.progressBar}
          aria-valuemin={0}
          aria-valuemax={flow.totalSteps}
          aria-valuenow={flow.step}
        >
          <span
            style={{
              inlineSize: `${Math.max(0, Math.min(100, flow.totalSteps ? (flow.step / flow.totalSteps) * 100 : 0))}%`,
            }}
          />
        </div>
        <p>{flow.labels.progress(flow.step, flow.totalSteps)}</p>
      </header>
      <div className="hbar-app-ui-wizard-invoice-scroll" data-hbar-app-ui-list-strategy={flow.listStrategy.kind}>
        <section className="hbar-app-ui-wizard-invoice-card">
          <div className="hbar-app-ui-wizard-invoice-card-header">
            <div>
              <h2>{flow.labels.customer}</h2>
              <p>{flow.labels.customerDetail}</p>
            </div>
            <span>{flow.labels.currencyBadge}</span>
          </div>
          <div className="hbar-app-ui-wizard-invoice-card-body">
            <div className="hbar-app-ui-wizard-invoice-group-heading">
              <h3>{flow.labels.customerGroup}</h3>
              <span>{flow.labels.required}</span>
            </div>
            <p className="hbar-app-ui-wizard-invoice-group-detail">{flow.labels.customerGroupDetail}</p>
            <div className="hbar-app-ui-wizard-invoice-fields">{unique(flow.customerFields).map(fieldView)}</div>
            <div className="hbar-app-ui-wizard-invoice-terms">
              <div className="hbar-app-ui-wizard-invoice-group-heading">
                <h3>{flow.labels.terms}</h3>
                <span>{flow.labels.termsBadge}</span>
              </div>
              <p className="hbar-app-ui-wizard-invoice-group-detail">{flow.labels.termsDetail}</p>
              <div className="hbar-app-ui-wizard-invoice-fields">{unique(flow.termsFields).map(fieldView)}</div>
            </div>
          </div>
        </section>
      </div>
      <div className="hbar-app-ui-wizard-invoice-footer">
        <button type="button">{flow.labels.save}</button>
        <button type="button">
          {flow.labels.next}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </React.Fragment>
  )
}
