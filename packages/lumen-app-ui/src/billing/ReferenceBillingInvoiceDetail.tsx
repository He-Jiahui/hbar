import * as React from 'react'
import { Mail, Zap } from './glyphs'
import type { LumenBillingInvoiceDetailContent, LumenBillingValueRow } from './content'
import { uniqueLumenBillingItems } from './content'
import type { LumenBillingInvoiceDetailReferenceLayout } from './reference-content'
import type { LumenBillingCompositionProps } from './primitives'
import { BillingButton, BillingEmptyState, BillingFrame, BillingIcon, BillingStatus } from './primitives'
import './reference-invoice-detail.css'

export interface ReferenceBillingInvoiceDetailProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingInvoiceDetailContent
  readonly layout: LumenBillingInvoiceDetailReferenceLayout
}

const tableScrollRegionTabIndex = { tabIndex: 0 }

function ReferenceValueRows({
  rows,
  className,
}: {
  readonly rows: readonly LumenBillingValueRow[]
  readonly className: string
}) {
  return (
    <dl className={className}>
      {uniqueLumenBillingItems(rows).map((row) => (
        <div
          className={`lumen-billing-invoice-reference-value hbar-app-ui-billing-tone-${row.tone ?? 'neutral'}`}
          key={row.id}
        >
          <dt>{row.label}</dt>
          <dd>
            <span>{row.value}</span>
            {row.detail && <small>{row.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function ReferenceBillingInvoiceDetail({ spec, onAction, content, layout }: ReferenceBillingInvoiceDetailProps) {
  const instanceId = React.useId()
  const titleId = `${instanceId}-invoice-title`
  const billedToId = `${instanceId}-billed-to`
  const activityId = `${instanceId}-activity`
  const collectionId = `${instanceId}-collection`
  const lines = uniqueLumenBillingItems(content.lines)
  const activities = uniqueLumenBillingItems(content.activities)

  return (
    <BillingFrame spec={spec} onAction={onAction} className="lumen-billing-invoice-reference-surface">
      <main className="lumen-billing-invoice-reference" aria-labelledby={layout.showHeader ? titleId : undefined}>
        {layout.showHeader && (
          <header className="lumen-billing-invoice-reference-header">
            <div>
              <h1 id={titleId}>{content.invoice}</h1>
              <p>
                <BillingStatus value={content.status} tone={content.statusTone} />
                {content.description}
              </p>
            </div>
          </header>
        )}

        <div className="lumen-billing-invoice-reference-layout">
          <div className="lumen-billing-invoice-reference-main">
            <section className="lumen-billing-invoice-reference-party" aria-labelledby={billedToId}>
              <div className="lumen-billing-invoice-reference-address">
                <h2 id={billedToId}>{content.labels.billedTo}</h2>
                {content.addressLines.map((line, index) =>
                  index === 0 ? (
                    <strong key={`${line}-${index}`}>{line}</strong>
                  ) : (
                    <span key={`${line}-${index}`}>{line}</span>
                  ),
                )}
              </div>
              <ReferenceValueRows className="lumen-billing-invoice-reference-metadata" rows={content.metadata} />
            </section>

            {lines.length > 0 ? (
              <div
                {...tableScrollRegionTabIndex}
                className="lumen-billing-invoice-reference-table-scroll"
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}
                aria-label={content.labels.lineItemsTitle}
                role="region"
              >
                <table aria-label={content.labels.lineItemsTitle}>
                  <thead>
                    <tr>
                      <th scope="col">{content.labels.descriptionColumn}</th>
                      <th scope="col">{content.labels.quantityColumn}</th>
                      <th scope="col">{content.labels.rateColumn}</th>
                      <th scope="col">{content.labels.amountColumn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} data-hbar-app-ui-item-id={line.id}>
                        <td>
                          <strong>{line.description}</strong>
                          <small>{line.detail}</small>
                        </td>
                        <td>{line.quantity}</td>
                        <td>{line.rate}</td>
                        <td>
                          <strong>{line.amount}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <BillingEmptyState message={content.labels.emptyLines} />
            )}

            <section className="lumen-billing-invoice-reference-totals">
              <ReferenceValueRows className="lumen-billing-invoice-reference-total-rows" rows={content.totals} />
            </section>
          </div>

          <aside className="lumen-billing-invoice-reference-aside">
            <section className="lumen-billing-invoice-reference-panel" aria-labelledby={activityId}>
              <h2 id={activityId}>{content.labels.activityTitle}</h2>
              {activities.length > 0 && (
                <ol className="lumen-billing-invoice-reference-activity">
                  {activities.map((activity) => (
                    <li
                      className={`lumen-billing-invoice-reference-activity-item hbar-app-ui-billing-tone-${activity.tone ?? 'neutral'}`}
                      key={activity.id}
                    >
                      <span aria-hidden="true" />
                      <div>
                        <strong>{activity.title}</strong>
                        <span>{activity.description}</span>
                        <time>{activity.date}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section
              className="lumen-billing-invoice-reference-panel lumen-billing-invoice-reference-collection"
              aria-labelledby={collectionId}
            >
              <h2 id={collectionId}>{content.labels.collectionTitle}</h2>
              <ReferenceValueRows
                className="lumen-billing-invoice-reference-collection-rows"
                rows={content.collection}
              />
              <BillingButton
                data-hbar-app-ui-action="charge-now"
                data-hbar-app-ui-target={content.invoice}
                onClick={() =>
                  onAction?.({
                    variantId: spec.id,
                    actionId: 'charge-now',
                    value: content.invoice,
                  })
                }
                type="button"
              >
                <BillingIcon tier="sm">
                  <Zap />
                </BillingIcon>
                {content.labels.chargeNow}
              </BillingButton>
            </section>

            <p className="lumen-billing-invoice-reference-help">
              <BillingIcon tier="sm">
                <Mail />
              </BillingIcon>
              <span>{content.labels.helpNotice}</span>
            </p>
          </aside>
        </div>
      </main>
    </BillingFrame>
  )
}
