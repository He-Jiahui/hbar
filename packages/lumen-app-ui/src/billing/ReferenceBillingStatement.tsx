'use client'

import * as React from 'react'
import { ArrowUpRight, Download, MoreHorizontal, Plus, Search } from 'lucide-react'
import { LumenInput } from '../forms'
import type { LumenBillingStatementContent } from './content'
import type { LumenBillingStatementReferenceLayout } from './reference-content'
import type { LumenBillingCompositionProps } from './primitives'
import { BillingButton, BillingFrame, BillingIcon, BillingIconButton, BillingStatus } from './primitives'
import './reference-statement.css'

export interface ReferenceBillingStatementProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingStatementContent
  readonly layout: LumenBillingStatementReferenceLayout
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function ReferenceBillingStatement({ spec, onAction, content, layout }: ReferenceBillingStatementProps) {
  const searchId = React.useId()
  const flow = content.referenceFlow
  const query = flow?.query ?? ''
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const invoices = uniqueById(content.invoices).filter((invoice) =>
    [
      invoice.customer,
      invoice.customerMeta,
      invoice.invoice,
      invoice.invoiceMeta,
      invoice.plan,
      invoice.amount,
      invoice.paymentMethod,
      invoice.dueDate,
      invoice.dueDetail,
      invoice.status,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  )

  const request = (actionId: string, value?: string) => {
    onAction?.(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }

  return (
    <BillingFrame spec={spec} onAction={onAction} className="lumen-billing-statement-reference-root">
      <main className="lumen-billing-statement-reference">
        <header className="lumen-billing-statement-reference-header">
          <div className="lumen-billing-statement-reference-heading">
            <h2>{content.labels.pageTitle}</h2>
            <p>{content.labels.pageDescription}</p>
          </div>
          <BillingButton
            className="lumen-billing-statement-reference-export"
            type="button"
            data-hbar-app-ui-action="billing-statement:export"
            onClick={() => request('export')}
          >
            <BillingIcon tier="sm">
              <Download />
            </BillingIcon>
            {content.labels.export}
          </BillingButton>
        </header>

        <section className="lumen-billing-statement-reference-overview">
          <div className="lumen-billing-statement-reference-balance">
            <span className="lumen-billing-statement-reference-balance-label">{content.labels.balanceLabel}</span>
            <strong className="lumen-billing-statement-reference-balance-amount">{content.balance.amount}</strong>
            <p>{content.balance.detail}</p>
          </div>
          <dl className="lumen-billing-statement-reference-metrics">
            {uniqueById(content.balance.metrics).map((metric) => (
              <div key={metric.id}>
                <dt>{metric.label}</dt>
                <dd className={`lumen-billing-statement-reference-tone-${metric.tone ?? 'neutral'}`}>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lumen-billing-statement-reference-recovery">
          <p>
            <span>{content.labels.recoveryLeading}</span>
            <strong>{content.labels.recoveryEmphasis}</strong>
            <span>{content.labels.recoveryTrailing}</span>
          </p>
          <div className="lumen-billing-statement-reference-recovery-actions">
            <BillingButton
              type="button"
              tone="quiet"
              data-hbar-app-ui-action="billing-statement:view-statement"
              onClick={() => request('view-statement')}
            >
              {content.labels.viewStatement}
            </BillingButton>
            <BillingButton
              type="button"
              tone="accent"
              data-hbar-app-ui-action="billing-statement:start-recovery"
              onClick={() => request('start-recovery')}
            >
              {content.labels.startRecovery}
              <BillingIcon tier="sm">
                <ArrowUpRight />
              </BillingIcon>
            </BillingButton>
          </div>
        </section>

        <section className="lumen-billing-statement-reference-ledger">
          <header className="lumen-billing-statement-reference-ledger-header">
            <div>
              <h3>{content.labels.ledgerTitle}</h3>
              <p>{content.labels.ledgerSummary}</p>
            </div>
            <div className="lumen-billing-statement-reference-ledger-actions">
              <label className="lumen-billing-statement-reference-search" htmlFor={searchId}>
                <BillingIcon tier="sm">
                  <Search />
                </BillingIcon>
                <LumenInput
                  id={searchId}
                  type="search"
                  variant="plain"
                  aria-label={content.labels.searchLabel}
                  autoComplete="off"
                  data-hbar-app-ui-action="billing-statement:search"
                  data-hbar-app-ui-field="invoice-search"
                  placeholder={content.labels.searchPlaceholder}
                  readOnly={!flow}
                  value={query}
                  onChange={(event) => flow?.onQueryChange(event.currentTarget.value)}
                />
              </label>
              <BillingButton
                type="button"
                tone="accent"
                data-hbar-app-ui-action="billing-statement:new-invoice"
                onClick={() => request('new-invoice')}
              >
                <BillingIcon tier="sm">
                  <Plus />
                </BillingIcon>
                {content.labels.newInvoice}
              </BillingButton>
            </div>
          </header>

          <div
            className="lumen-billing-statement-reference-table-viewport"
            data-hbar-app-ui-region="invoice-ledger"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            role="region"
            aria-label={content.labels.ledgerTitle}
          >
            <table className="lumen-billing-statement-reference-table">
              <caption className="lumen-billing-statement-reference-table-caption">
                {layout.labels.tableCaption}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{content.labels.customerColumn}</th>
                  <th scope="col">{content.labels.invoiceColumn}</th>
                  <th scope="col">{content.labels.planColumn}</th>
                  <th scope="col" className="is-amount">
                    {content.labels.amountColumn}
                  </th>
                  <th scope="col">{content.labels.dueColumn}</th>
                  <th scope="col">{content.labels.statusColumn}</th>
                  <th scope="col" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {invoices.length ? (
                  invoices.map((invoice) => (
                    <tr key={invoice.id} data-hbar-app-ui-item-id={invoice.id}>
                      <td>
                        <strong>{invoice.customer}</strong>
                        <small>{invoice.customerMeta}</small>
                      </td>
                      <td>
                        <strong>{invoice.invoice}</strong>
                        <small>{invoice.invoiceMeta}</small>
                      </td>
                      <td>
                        <strong>{invoice.plan}</strong>
                        <small>{invoice.paymentMethod}</small>
                      </td>
                      <td className="is-amount">
                        <strong>{invoice.amount}</strong>
                      </td>
                      <td>
                        <strong>{invoice.dueDate}</strong>
                        <small>{invoice.dueDetail}</small>
                      </td>
                      <td>
                        <BillingStatus value={invoice.status} tone={invoice.statusTone} />
                      </td>
                      <td className="is-row-action">
                        <BillingIconButton
                          type="button"
                          label={content.labels.actionsForInvoice(invoice.invoice)}
                          data-hbar-app-ui-action="billing-statement:invoice-actions"
                          onClick={() => request('invoice-actions', invoice.id)}
                        >
                          <MoreHorizontal />
                        </BillingIconButton>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <p className="lumen-billing-statement-reference-empty">{content.labels.emptyLedger}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </BillingFrame>
  )
}
