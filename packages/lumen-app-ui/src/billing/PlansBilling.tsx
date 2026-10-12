import { LumenToggleControl } from '../forms'
import { Bolt, Database, Layers3, Pencil, Plus, Shield, Sparkles, Users } from './glyphs'
import { useMemo, useState } from 'react'
import {
  type LumenBillingCompositionProps,
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingIconButton,
  BillingStatus,
} from './primitives'
import { type LumenBillingPlanFeature, type LumenBillingPlansContent } from './content'

function PlanFeatureIcon({ feature }: { readonly feature: LumenBillingPlanFeature }) {
  switch (feature.icon) {
    case 'people':
      return <Users />
    case 'bolt':
      return <Bolt />
    case 'storage':
      return <Database />
    case 'layers':
      return <Layers3 />
    case 'shield':
      return <Shield />
    case 'sparkles':
      return <Sparkles />
    default:
      return null
  }
}

export function PlansBilling({
  spec,
  onAction,
  content,
}: LumenBillingCompositionProps & {
  readonly content: LumenBillingPlansContent
}) {
  const plans = useMemo(() => {
    const seen = new Set<string>()
    return content.plans.filter((plan) => {
      if (seen.has(plan.id)) return false
      seen.add(plan.id)
      return true
    })
  }, [content.plans])
  const [dirty, setDirty] = useState(content.initialDirty ?? false)
  const [toggleValues, setToggleValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      plans.flatMap((plan) => plan.toggles.map((toggle) => [`${plan.id}:${toggle.id}`, toggle.enabled])),
    ),
  )

  const updateToggle = (planId: string, toggleId: string, enabled: boolean) => {
    setToggleValues((current) => ({ ...current, [`${planId}:${toggleId}`]: enabled }))
    setDirty(true)
    onAction?.({
      variantId: spec.id,
      actionId: 'toggle-plan',
      value: `${planId}:${toggleId}:${enabled}`,
    })
  }

  return (
    <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-plans-surface">
      <main className="hbar-app-ui-billing-page">
        <header className="hbar-app-ui-billing-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
          <div className="hbar-app-ui-billing-actions">
            <BillingButton
              tone="accent"
              type="button"
              onClick={() => onAction?.({ variantId: spec.id, actionId: 'new-plan' })}
            >
              <BillingIcon tier="sm">
                <Plus />
              </BillingIcon>
              {content.labels.newPlan}
            </BillingButton>
          </div>
        </header>
        {dirty && (
          <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-unsaved">
            <div>
              <strong>{content.labels.unsavedTitle}</strong>
              <p>{content.labels.unsavedDescription}</p>
            </div>
            <div className="hbar-app-ui-billing-actions">
              <BillingButton tone="quiet" type="button" onClick={() => setDirty(false)}>
                {content.labels.discard}
              </BillingButton>
              <BillingButton
                tone="accent"
                type="button"
                onClick={() => {
                  setDirty(false)
                  onAction?.({ variantId: spec.id, actionId: 'save-plans' })
                }}
              >
                {content.labels.save}
              </BillingButton>
            </div>
          </section>
        )}
        {plans.length ? (
          <div className="hbar-app-ui-billing-plans-columns" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {plans.map((plan) => (
              <article className="hbar-app-ui-billing-plan-column" key={plan.id} data-hbar-app-ui-item-id={plan.id}>
                <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-plan-card">
                  <header>
                    <div>
                      <h2>{plan.name}</h2>
                      <span>
                        <BillingStatus value={plan.status} tone={plan.statusTone} />
                      </span>
                      <small>{plan.meta}</small>
                    </div>
                    <BillingIconButton
                      type="button"
                      label={content.labels.editPlan(plan.name)}
                      onClick={() => onAction?.({ variantId: spec.id, actionId: 'edit-plan', value: plan.id })}
                    >
                      <Pencil />
                    </BillingIconButton>
                  </header>
                  <div className="hbar-app-ui-billing-plan-price">
                    <b>{plan.price}</b>
                    <small>{plan.priceSuffix}</small>
                  </div>
                  <div className="hbar-app-ui-billing-plan-section">
                    <span className="hbar-app-ui-billing-kicker">{content.labels.entitlementsTitle}</span>
                    {plan.entitlements.map((feature) => (
                      <div className="hbar-app-ui-billing-plan-feature" key={feature.id}>
                        <span>
                          <BillingIcon tier="sm">
                            <PlanFeatureIcon feature={feature} />
                          </BillingIcon>
                          <strong>{feature.label}</strong>
                        </span>
                        <span>{feature.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="hbar-app-ui-billing-plan-section">
                    <span className="hbar-app-ui-billing-kicker">{content.labels.addOnsTitle}</span>
                    {plan.addOns.map((feature) => (
                      <div className="hbar-app-ui-billing-plan-feature" key={feature.id}>
                        <span>
                          <BillingIcon tier="sm">
                            <PlanFeatureIcon feature={feature} />
                          </BillingIcon>
                          <strong>{feature.label}</strong>
                        </span>
                        <span>{feature.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <BillingButton
                  type="button"
                  onClick={() => onAction?.({ variantId: spec.id, actionId: 'add-entitlement', value: plan.id })}
                >
                  <BillingIcon tier="sm">
                    <Plus />
                  </BillingIcon>
                  {content.labels.addEntitlement}
                </BillingButton>
                <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-toggle-panel">
                  {plan.toggles.map((toggle) => {
                    const key = `${plan.id}:${toggle.id}`
                    const checked = toggleValues[key] ?? toggle.enabled
                    return (
                      <label className="hbar-app-ui-billing-toggle-row" key={toggle.id}>
                        <span>{toggle.label}</span>
                        <LumenToggleControl
                          aria-label={content.labels.togglePlan(plan.name, toggle.label)}
                          checked={checked}
                          onChange={(event) => updateToggle(plan.id, toggle.id, event.target.checked)}
                        />
                      </label>
                    )
                  })}
                </section>
              </article>
            ))}
          </div>
        ) : (
          <BillingEmptyState message={content.labels.emptyPlans} />
        )}
      </main>
    </BillingFrame>
  )
}
;('use client')
