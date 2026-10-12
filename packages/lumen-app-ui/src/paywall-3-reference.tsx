'use client'

import { Check } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './paywall-3-reference.css'

export interface LumenPaywall3ReferencePlan {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly amount: string
  readonly priceSuffix: string
  readonly features: readonly string[]
  readonly isCurrent: boolean
  readonly badge: string | null
  readonly actionLabel: string
  readonly canRequestSelection: boolean
}

export interface LumenPaywall3ReferenceContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly billingPeriod: string
    readonly monthly: string
    readonly yearly: string
    readonly compare: string
    readonly priceNote: string
    readonly emptyPlans: string
  }
  readonly period: 'monthly' | 'yearly'
  readonly periodNote: string
  readonly plans: readonly LumenPaywall3ReferencePlan[]
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
}

export interface LumenPaywall3ReferenceViewModel {
  readonly content: LumenPaywall3ReferenceContent
  readonly onPeriodChange: (period: 'monthly' | 'yearly') => void
  readonly onPlanSelectionRequest: (planId: string) => void
  readonly onFeatureComparisonRequest: () => void
}

export interface LumenPaywall3ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenPaywall3ReferenceViewModel
}

function isRecommendedPlan(plan: LumenPaywall3ReferencePlan) {
  return !plan.isCurrent && plan.badge !== null
}

function planBadgeKind(plan: LumenPaywall3ReferencePlan) {
  if (plan.isCurrent) {
    return 'current'
  }
  return isRecommendedPlan(plan) ? 'recommended' : 'none'
}

export function LumenPaywall3Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenPaywall3ReferenceProps) {
  const { content } = viewModel
  const scrollPlans = content.listStrategy.kind === 'pane-scroll'
  const rootClassName = [
    'lumen-paywall',
    'lumen-paywall3-reference',
    'hbar-app-ui-paywall-variant-3',
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <LumenSurface
      as="div"
      material="solid"
      className="lumen-paywall3-surface"
      contentClassName={rootClassName}
      data-lumen-component="paywall"
      data-lumen-variant={3}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <header className="lumen-paywall3-header">
        <div className="lumen-paywall3-heading">
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.description}
          </LumenText>
        </div>
        <div className="lumen-paywall3-period-control">
          <div className="lumen-paywall3-period-tabs" role="tablist" aria-label={content.labels.billingPeriod}>
            <LumenButton
              className="lumen-paywall3-period-tab"
              indicator="none"
              variant="text"
              role="tab"
              aria-selected={content.period === 'monthly'}
              tabIndex={0}
              data-paywall3-period="monthly"
              onClick={() => viewModel.onPeriodChange('monthly')}
            >
              {content.labels.monthly}
            </LumenButton>
            <LumenButton
              className="lumen-paywall3-period-tab"
              indicator="none"
              variant="text"
              role="tab"
              aria-selected={content.period === 'yearly'}
              tabIndex={0}
              data-paywall3-period="yearly"
              onClick={() => viewModel.onPeriodChange('yearly')}
            >
              {content.labels.yearly}
            </LumenButton>
          </div>
        </div>
      </header>

      <LumenText as="p" className="lumen-paywall3-period-note" tone="muted" data-paywall3-period-note>
        {content.periodNote}
      </LumenText>

      <div
        className="lumen-paywall3-plans"
        data-paywall3-plans
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        role={scrollPlans ? 'region' : undefined}
        aria-label={scrollPlans ? content.labels.title : undefined}
        tabIndex={scrollPlans ? 0 : undefined}
      >
        {content.plans.length === 0 ? (
          <LumenText as="p" className="lumen-paywall3-empty" tone="muted">
            {content.labels.emptyPlans}
          </LumenText>
        ) : (
          content.plans.map((plan) => (
            <div
              className="lumen-paywall3-plan"
              key={plan.id}
              data-paywall3-plan-id={plan.id}
              data-current={plan.isCurrent ? 'true' : 'false'}
              data-badge-kind={planBadgeKind(plan)}
            >
              <div className="lumen-paywall3-plan-heading">
                <div className="lumen-paywall3-plan-title-row">
                  <LumenText as="p" className="lumen-paywall3-plan-name">
                    {plan.name}
                  </LumenText>
                  {plan.badge ? (
                    <LumenText
                      as="span"
                      className="lumen-paywall3-badge"
                      data-badge-kind={plan.isCurrent ? 'current' : 'recommended'}
                    >
                      {plan.badge}
                    </LumenText>
                  ) : null}
                </div>
              </div>
              <div className="lumen-paywall3-price">
                <LumenText as="span" className="lumen-paywall3-price-amount">
                  {plan.amount}
                </LumenText>
                <LumenText as="span" className="lumen-paywall3-price-suffix" tone="muted">
                  {plan.priceSuffix}
                </LumenText>
              </div>
              <LumenText as="p" className="lumen-paywall3-plan-description" tone="muted">
                {plan.description}
              </LumenText>
              <ul className="lumen-paywall3-features">
                {plan.features.map((feature, index) => (
                  <li key={`${plan.id}-feature-${index}`}>
                    <Check aria-hidden="true" className="lumen-paywall3-feature-check" />
                    <LumenText as="span">{feature}</LumenText>
                  </li>
                ))}
              </ul>
              <LumenButton
                className="lumen-paywall3-plan-action"
                indicator="none"
                variant={isRecommendedPlan(plan) ? 'solid' : 'outlined'}
                tone={isRecommendedPlan(plan) ? 'primary' : 'neutral'}
                disabled={plan.isCurrent || !plan.canRequestSelection}
                data-paywall3-plan-action={plan.id}
                onClick={() => viewModel.onPlanSelectionRequest(plan.id)}
              >
                {plan.actionLabel}
              </LumenButton>
            </div>
          ))
        )}
      </div>

      <footer className="lumen-paywall3-footer">
        <LumenText as="p" className="lumen-paywall3-price-note" tone="muted">
          {content.labels.priceNote}
        </LumenText>
        <LumenButton
          className="lumen-paywall3-compare"
          indicator="none"
          variant="text"
          data-paywall3-compare
          onClick={viewModel.onFeatureComparisonRequest}
        >
          {content.labels.compare}
        </LumenButton>
      </footer>
    </LumenSurface>
  )
}
