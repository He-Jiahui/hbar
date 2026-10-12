'use client'

import * as React from 'react'
import { ChevronRight } from 'lucide-react'
import { ChevronDown, Download, ListFilter, MoreHorizontal, RotateCcw, TriangleAlert } from './glyphs'
import type { LumenBillingRecoveryContent, LumenBillingSubscription } from './content'
import type { LumenBillingRecoveryReferenceLayout } from './reference-content'
import type { LumenBillingCompositionProps } from './primitives'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingIconButton,
  BillingStatus,
  BillingValueRows,
} from './primitives'
import './reference-recovery.css'

export interface ReferenceBillingRecoveryProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingRecoveryContent
  readonly layout: LumenBillingRecoveryReferenceLayout
}

function uniqueById<Item extends { readonly id: string }>(items: readonly Item[]): Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function uniqueMetricRows(
  rows: LumenBillingRecoveryReferenceLayout['metricRows'],
): LumenBillingRecoveryReferenceLayout['metricRows'] {
  const seen = new Set<string>()
  return rows.filter((group) => {
    if (!group.metricId.trim() || seen.has(group.metricId)) {
      return false
    }
    seen.add(group.metricId)
    return true
  })
}

export function ReferenceBillingRecovery({ spec, onAction, content, layout }: ReferenceBillingRecoveryProps) {
  const flow = content.referenceFlow
  const subscriptions = uniqueById(content.subscriptions)
  const subscriptionIds = new Set(subscriptions.map((subscription) => subscription.id))
  const initialExpandedIds = content.initialExpandedId ? [content.initialExpandedId] : []
  const requestedExpandedIds = flow?.expandedIds ?? initialExpandedIds
  const expandedIds = new Set(requestedExpandedIds.filter((id) => subscriptionIds.has(id)))
  const metricRowsById = new Map(
    uniqueMetricRows(layout.metricRows).map((group) => [group.metricId, uniqueById(group.rows)]),
  )

  const request = (actionId: string, value?: string) => {
    onAction?.(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }

  const toggleSubscription = (subscription: LumenBillingSubscription) => {
    if (flow) {
      flow.onToggleSubscription(subscription.id)
    } else {
      request('toggle-retry-attempts', subscription.id)
    }
  }

  return (
    <BillingFrame spec={spec} onAction={onAction} className="lumen-billing-recovery-reference-root">
      <main className="lumen-billing-recovery-reference">
        <header className="lumen-billing-recovery-reference-header">
          <div className="lumen-billing-recovery-reference-heading">
            <h2>{content.labels.pageTitle}</h2>
            <p>
              <span>{content.labels.pageDescriptionLeading}</span>
              <strong>{content.labels.pageDescriptionEmphasis}</strong>
            </p>
          </div>
          <div className="lumen-billing-recovery-reference-actions">
            <BillingButton
              type="button"
              data-hbar-app-ui-action="billing-recovery:rules"
              onClick={() => request('rules')}
            >
              <BillingIcon tier="sm">
                <ListFilter />
              </BillingIcon>
              {content.labels.rules}
            </BillingButton>
            <BillingButton
              type="button"
              data-hbar-app-ui-action="billing-recovery:export"
              onClick={() => request('export')}
            >
              <BillingIcon tier="sm">
                <Download />
              </BillingIcon>
              {content.labels.export}
            </BillingButton>
            <BillingButton
              tone="accent"
              type="button"
              data-hbar-app-ui-action="billing-recovery:retry-due"
              onClick={() => request('retry-due')}
            >
              <BillingIcon tier="sm">
                <RotateCcw />
              </BillingIcon>
              {content.labels.retryDue}
            </BillingButton>
          </div>
        </header>

        <section
          className="lumen-billing-recovery-reference-metrics"
          data-hbar-app-ui-region="recovery-metrics"
          data-hbar-app-ui-list-strategy="content-grown"
        >
          {uniqueById(content.metrics).map((metric) => (
            <article
              className={`lumen-billing-recovery-reference-metric lumen-billing-recovery-reference-tone-${metric.tone ?? 'neutral'}`}
              key={metric.id}
              data-hbar-app-ui-item-id={metric.id}
            >
              <header>
                <span>{metric.label}</span>
                {metric.trend ? <small>{metric.trend}</small> : null}
              </header>
              <strong>{metric.value}</strong>
              {metric.detail ? <p>{metric.detail}</p> : null}
              {metric.progress !== undefined ? (
                <span
                  className="lumen-billing-recovery-reference-progress"
                  role="progressbar"
                  aria-label={metric.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.max(0, Math.min(100, metric.progress))}
                >
                  <i style={{ inlineSize: `${Math.max(0, Math.min(100, metric.progress))}%` }} />
                </span>
              ) : null}
              {metricRowsById.has(metric.id) ? (
                <BillingValueRows
                  rows={metricRowsById.get(metric.id) ?? []}
                  className="lumen-billing-recovery-reference-metric-rows"
                />
              ) : null}
            </article>
          ))}
        </section>

        <section className="lumen-billing-recovery-reference-list">
          <header className="lumen-billing-recovery-reference-list-header">
            <div>
              <h3>{content.labels.listTitle}</h3>
              <p>{content.labels.listDescription}</p>
            </div>
            <BillingButton
              type="button"
              data-hbar-app-ui-action="billing-recovery:manage-playbooks"
              onClick={() => request('manage-playbooks')}
            >
              {content.labels.managePlaybooks}
            </BillingButton>
          </header>

          <div
            className="lumen-billing-recovery-reference-table-viewport"
            data-hbar-app-ui-region="recovery-subscriptions"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            role="region"
            aria-label={content.labels.listTitle}
          >
            <table className="lumen-billing-recovery-reference-table">
              <caption>{layout.labels.tableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{content.labels.customerColumn}</th>
                  <th scope="col">{content.labels.statusColumn}</th>
                  <th scope="col">{content.labels.billingColumn}</th>
                  <th scope="col">{content.labels.ownerColumn}</th>
                  <th scope="col" className="is-amount">
                    {content.labels.amountColumn}
                  </th>
                  <th scope="col">{content.labels.retryColumn}</th>
                  <th scope="col" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {subscriptions.length ? (
                  subscriptions.map((subscription) => {
                    const isExpanded = expandedIds.has(subscription.id)
                    const attempts = uniqueById(subscription.attempts)
                    return (
                      <React.Fragment key={subscription.id}>
                        <tr data-hbar-app-ui-item-id={subscription.id}>
                          <td>
                            <BillingButton
                              className="lumen-billing-recovery-reference-customer-trigger"
                              tone="quiet"
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={layout.labels.expand(subscription.customer)}
                              data-hbar-app-ui-action="billing-recovery:toggle-retry-attempts"
                              onClick={() => toggleSubscription(subscription)}
                            >
                              <BillingIcon tier="sm">{isExpanded ? <ChevronDown /> : <ChevronRight />}</BillingIcon>
                              <span className="lumen-billing-recovery-reference-customer-copy">
                                <strong>{subscription.customer}</strong>
                                <small>{subscription.customerMeta}</small>
                              </span>
                            </BillingButton>
                          </td>
                          <td>
                            <BillingStatus value={subscription.status} tone={subscription.statusTone} />
                          </td>
                          <td>
                            <strong>{subscription.plan}</strong>
                            <small>{subscription.planMeta}</small>
                          </td>
                          <td>{subscription.owner}</td>
                          <td className="is-amount">
                            <strong>{subscription.amount}</strong>
                            <small>{subscription.paymentMethod}</small>
                          </td>
                          <td>
                            <strong>{subscription.nextRetry}</strong>
                            <small>{subscription.attemptSummary}</small>
                          </td>
                          <td className="lumen-billing-recovery-reference-row-actions">
                            <BillingIconButton
                              type="button"
                              label={subscription.actionLabel}
                              data-hbar-app-ui-action="billing-recovery:subscription-actions"
                              onClick={() => request('subscription-actions', subscription.id)}
                            >
                              <BillingIcon tier="sm">
                                <MoreHorizontal />
                              </BillingIcon>
                            </BillingIconButton>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="lumen-billing-recovery-reference-details-row">
                            <td colSpan={7}>
                              <section
                                className="lumen-billing-recovery-reference-details"
                                data-hbar-app-ui-region="retry-attempts"
                                data-hbar-app-ui-subscription-id={subscription.id}
                              >
                                <header>
                                  <div>
                                    <h4>{subscription.retryTitle}</h4>
                                    <p>{subscription.retryDescription}</p>
                                  </div>
                                  <span>{subscription.invoice}</span>
                                </header>
                                {attempts.length ? (
                                  <ol>
                                    {attempts.map((attempt, index) => (
                                      <li key={attempt.id} data-hbar-app-ui-item-id={attempt.id}>
                                        <BillingIcon tier="sm">
                                          <TriangleAlert />
                                        </BillingIcon>
                                        <span>
                                          <strong>{content.labels.retryAttemptLabel(index + 1, attempt.title)}</strong>
                                          <small>{attempt.description}</small>
                                        </span>
                                        <code>{attempt.code}</code>
                                        <time>{attempt.date}</time>
                                      </li>
                                    ))}
                                  </ol>
                                ) : null}
                              </section>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7}>
                      <BillingEmptyState message={content.labels.emptySubscriptions} />
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
