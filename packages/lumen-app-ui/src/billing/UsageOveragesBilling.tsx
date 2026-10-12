'use client'
import * as React from 'react'
import { Bell, Bolt, Database, Mail, Users } from './glyphs'
import type { LumenBillingCompositionProps } from './primitives'
import type { LumenBillingUsageContent, LumenBillingUsageMeter } from './content'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingMetricCard,
  BillingProgress,
  BillingStatus,
} from './primitives'

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

export default function UsageOveragesBilling({
  spec,
  onAction,
  content,
}: LumenBillingCompositionProps & {
  readonly content: LumenBillingUsageContent
}) {
  const periods = React.useMemo(() => {
    const seen = new Set<string>()
    return content.periods.filter((period) => {
      if (seen.has(period.id)) {
        return false
      }
      seen.add(period.id)
      return true
    })
  }, [content.periods])
  const initialPeriod = periods.some((period) => period.id === content.initialPeriodId)
    ? content.initialPeriodId
    : (periods[0]?.id ?? '')
  const [periodId, setPeriodId] = React.useState(initialPeriod)

  return (
    <BillingFrame spec={spec} className="hbar-app-ui-billing-usage-surface">
      <main className="hbar-app-ui-billing-usage-page">
        <header className="hbar-app-ui-billing-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-billing-periods" role="group" aria-label={content.labels.periodGroup}>
            {periods.map((period) => (
              <BillingButton
                type="button"
                key={period.id}
                aria-pressed={period.id === periodId}
                onClick={() => {
                  setPeriodId(period.id)
                  onAction?.({ variantId: spec.id, actionId: 'change-period', value: period.id })
                }}
              >
                {period.label}
              </BillingButton>
            ))}
          </div>
        </header>

        <div className="hbar-app-ui-billing-usage-metrics" data-hbar-app-ui-list-strategy="content-grown">
          {content.metrics.map((metric) => (
            <BillingMetricCard key={metric.id} metric={metric} progressLabel={metric.label} />
          ))}
        </div>

        <section className="hbar-app-ui-billing-section-head">
          <div>
            <h2>{content.labels.meterTitle}</h2>
            <p>{content.labels.meterDescription}</p>
          </div>
          <BillingButton type="button" onClick={() => onAction?.({ variantId: spec.id, actionId: 'set-alert' })}>
            <BillingIcon tier="sm">
              <Bell />
            </BillingIcon>
            {content.labels.setAlert}
          </BillingButton>
        </section>
        {content.meters.length ? (
          <div
            className="hbar-app-ui-billing-usage-list"
            role="list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {content.meters.map((meter) => (
              <article
                className={`hbar-app-ui-billing-usage-meter hbar-app-ui-billing-tone-${meter.statusTone ?? 'neutral'}`}
                role="listitem"
                key={meter.id}
                data-hbar-app-ui-item-id={meter.id}
              >
                <header>
                  <span>
                    <BillingIcon tier="sm">
                      <UsageMeterIcon meter={meter} />
                    </BillingIcon>
                    <strong>{meter.label}</strong>
                    {meter.status && <BillingStatus value={meter.status} tone={meter.statusTone} />}
                  </span>
                  <span>{meter.currentValue}</span>
                  <span>{meter.percentageLabel}</span>
                </header>
                <BillingProgress
                  value={meter.percentage}
                  label={content.labels.meterProgress(meter.label)}
                  tone={meter.statusTone}
                />
                <footer>
                  <span>{meter.detail}</span>
                  <b>{meter.amount}</b>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <BillingEmptyState message={content.labels.emptyMeters} />
        )}
        <div className="hbar-app-ui-billing-cycle-notice">
          <span>{content.labels.cycleNotice}</span>
          <b>{content.cycleAmount}</b>
        </div>
      </main>
    </BillingFrame>
  )
}
