'use client'

import * as React from 'react'
import { Bell, Bolt, Database, Mail, Users } from './glyphs'
import type { LumenBillingUsageContent, LumenBillingUsageMeter } from './content'
import { uniqueLumenBillingItems } from './content'
import type { LumenBillingUsageReferenceLayout } from './reference-content'
import type { LumenBillingCompositionProps } from './primitives'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingMetricCard,
  BillingStatus,
} from './primitives'
import './reference-usage.css'

export interface ReferenceBillingUsageProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingUsageContent
  readonly layout: LumenBillingUsageReferenceLayout
}

function UsageMeterIcon({ meter }: { readonly meter: LumenBillingUsageMeter }) {
  switch (meter.icon) {
    case 'people':
      return <Users />
    case 'bolt':
      return <Bolt />
    case 'storage':
      return <Database />
    case 'mail':
      return <Mail />
    default:
      return null
  }
}

export function ReferenceBillingUsage({ spec, onAction, content, layout }: ReferenceBillingUsageProps) {
  const instanceId = React.useId()
  const periodButtons = React.useRef<Array<HTMLButtonElement | null>>([])
  const periods = uniqueLumenBillingItems(content.periods)
  const metrics = uniqueLumenBillingItems(content.metrics)
  const meters = uniqueLumenBillingItems(content.meters)
  const controlledPeriodId = content.referenceFlow?.periodId
  const requestedPeriodIndex = periods.findIndex((period) => period.id === controlledPeriodId)
  const initialPeriodIndex = periods.findIndex((period) => period.id === content.initialPeriodId)
  let activeIndex = 0
  if (requestedPeriodIndex >= 0) {
    activeIndex = requestedPeriodIndex
  } else if (initialPeriodIndex >= 0) {
    activeIndex = initialPeriodIndex
  }
  const titleId = `${instanceId}-title`
  const metersTitleId = `${instanceId}-meters-title`

  const requestPeriodChange = (periodId: string) => {
    if (content.referenceFlow) {
      content.referenceFlow.onPeriodChange(periodId)
      return
    }
    onAction?.({ variantId: spec.id, actionId: 'change-period', value: periodId })
  }

  const handlePeriodKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (periods.length === 0) {
      return
    }
    let nextIndex: number | undefined
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % periods.length
        break
      case 'ArrowLeft':
        nextIndex = (index - 1 + periods.length) % periods.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = periods.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    periodButtons.current[nextIndex]?.focus()
    const nextPeriod = periods[nextIndex]
    if (nextPeriod) {
      requestPeriodChange(nextPeriod.id)
    }
  }

  return (
    <BillingFrame spec={spec} onAction={onAction} className="lumen-billing-usage-reference-surface">
      <main className="lumen-billing-usage-reference" aria-labelledby={titleId} data-hbar-app-ui-owner={layout.ownerId}>
        <header className="lumen-billing-usage-reference-header">
          <div>
            <h1 id={titleId}>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          {periods.length > 0 && (
            <div
              className="lumen-billing-usage-reference-periods"
              role="tablist"
              aria-label={content.labels.periodGroup}
            >
              {periods.map((period, index) => (
                <BillingButton
                  aria-selected={index === activeIndex}
                  data-hbar-app-ui-action="change-period"
                  data-hbar-app-ui-target={period.id}
                  id={`${instanceId}-period-${index}`}
                  key={period.id}
                  onClick={() => requestPeriodChange(period.id)}
                  onKeyDown={(event) => handlePeriodKeyDown(event, index)}
                  ref={(element) => {
                    periodButtons.current[index] = element
                  }}
                  role="tab"
                  tabIndex={index === activeIndex ? 0 : -1}
                  type="button"
                >
                  {period.label}
                </BillingButton>
              ))}
            </div>
          )}
        </header>

        <div className="lumen-billing-usage-reference-metrics" data-hbar-app-ui-list-strategy="content-grown">
          {metrics.map((metric) => (
            <BillingMetricCard key={metric.id} metric={metric} progressLabel={metric.label} />
          ))}
        </div>

        <section className="lumen-billing-usage-reference-meter-section" aria-labelledby={metersTitleId}>
          <header className="lumen-billing-usage-reference-meter-heading">
            <div>
              <h2 id={metersTitleId}>{content.labels.meterTitle}</h2>
              <p>{content.labels.meterDescription}</p>
            </div>
            <BillingButton
              data-hbar-app-ui-action="set-alert"
              data-hbar-app-ui-target={layout.ownerId}
              onClick={() =>
                onAction?.({
                  variantId: spec.id,
                  actionId: 'set-alert',
                  value: layout.ownerId,
                })
              }
              type="button"
            >
              <BillingIcon tier="sm">
                <Bell />
              </BillingIcon>
              {content.labels.setAlert}
            </BillingButton>
          </header>

          {meters.length > 0 ? (
            <div
              className={`lumen-billing-usage-reference-meters lumen-billing-usage-reference-meters-${content.listStrategy.kind}`}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
              role="list"
            >
              {meters.map((meter) => {
                const progress = Number.isFinite(meter.percentage) ? Math.max(0, Math.min(100, meter.percentage)) : 0
                return (
                  <article
                    className={`lumen-billing-usage-reference-meter hbar-app-ui-billing-tone-${meter.statusTone ?? 'neutral'}`}
                    data-hbar-app-ui-item-id={meter.id}
                    key={meter.id}
                    role="listitem"
                  >
                    <header>
                      <span className="lumen-billing-usage-reference-meter-label">
                        <BillingIcon tier="sm">
                          <UsageMeterIcon meter={meter} />
                        </BillingIcon>
                        <strong>{meter.label}</strong>
                        {meter.status && <BillingStatus value={meter.status} tone={meter.statusTone} />}
                      </span>
                      <span>{meter.currentValue}</span>
                    </header>
                    <div className="lumen-billing-usage-reference-meter-progress">
                      <span
                        aria-label={content.labels.meterProgress(meter.label)}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={progress}
                        aria-valuetext={meter.percentageLabel}
                        className="lumen-billing-usage-reference-progress-track"
                        role="progressbar"
                      >
                        <i style={{ inlineSize: `${progress}%` }} />
                      </span>
                      <span>{meter.percentageLabel}</span>
                    </div>
                    <footer>
                      <span>{meter.detail}</span>
                      <strong>{meter.amount}</strong>
                    </footer>
                  </article>
                )
              })}
            </div>
          ) : (
            <BillingEmptyState message={content.labels.emptyMeters} />
          )}
        </section>

        <footer className="lumen-billing-usage-reference-cycle">
          <span>{content.labels.cycleNotice}</span>
          <strong>{content.cycleAmount}</strong>
        </footer>
      </main>
    </BillingFrame>
  )
}
