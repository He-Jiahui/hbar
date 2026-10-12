import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenPaywallProvider, useLumenPaywallContent, type LumenPaywall3ReferenceViewModel, type LumenPaywallContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Paywall3PreviewFixture } from './paywall3PreviewFixtures'
import { createPaywall3PreviewStore } from './paywall3PreviewStore'

export function Paywall3PreviewHost({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: HbarAppUiVariantProps & {
  readonly content: LumenPaywallContent
  readonly referenceFixture: Paywall3PreviewFixture
  readonly children: ReactNode
}) {
  const parentContent = useLumenPaywallContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createPaywall3PreviewStore(referenceFixture.seed), [referenceFixture.seed])
  const state = useStore(store)
  if (spec.category !== 'paywall' || spec.variant !== 3) return children

  const preview = referenceFixture.contentFor(state)
  const notifyRequest = (actionId: string, request: unknown) => {
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const planReference: LumenPaywall3ReferenceViewModel = {
    content: {
      labels: {
        title: preview.labels.title,
        description: preview.labels.description,
        billingPeriod: preview.labels.billingPeriod,
        monthly: preview.labels.monthly,
        yearly: preview.labels.yearly,
        compare: preview.labels.compare,
        priceNote: preview.labels.priceNote,
        emptyPlans: preview.labels.emptyPlans,
      },
      period: preview.period,
      periodNote: preview.periodNote,
      plans: preview.plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        amount: plan.prices[preview.period].amount,
        priceSuffix: plan.prices[preview.period].suffix,
        features: plan.features,
        isCurrent: plan.isCurrent,
        badge:
          plan.badge === 'current'
            ? preview.labels.currentBadge
            : plan.badge === 'recommended'
              ? preview.labels.recommended
              : null,
        actionLabel: plan.actionLabel,
        canRequestSelection: plan.canRequestSelection,
      })),
      listStrategy: preview.listStrategy,
    },
    onPeriodChange(period) {
      state.setBillingPeriod(period)
    },
    onPlanSelectionRequest(planId) {
      const request = store.getState().requestPlanSelection(planId)
      if (request) notifyRequest('request-plan-selection', request)
    },
    onFeatureComparisonRequest() {
      notifyRequest('request-feature-comparison', store.getState().requestFeatureComparison())
    },
  }

  return (
    <LumenPaywallProvider content={{ ...(parentContent ?? content), plansReference: planReference }}>
      {children}
    </LumenPaywallProvider>
  )
}
