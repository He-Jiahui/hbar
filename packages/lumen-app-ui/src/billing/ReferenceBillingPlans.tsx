import * as React from 'react'
import { LumenToggleControl } from '../forms'
import { Bolt, Database, Layers3, Pencil, Plus, Shield, Sparkles, Users } from './glyphs'
import type { LumenBillingPlanFeature, LumenBillingPlansContent } from './content'
import type { LumenBillingCompositionProps } from './primitives'
import type { LumenBillingPlansReferenceLayout } from './reference-content'
import {
  BillingButton,
  BillingEmptyState,
  BillingFrame,
  BillingIcon,
  BillingIconButton,
  BillingStatus,
} from './primitives'
import './reference-plans.css'

export interface ReferenceBillingPlansProps extends LumenBillingCompositionProps {
  readonly content: LumenBillingPlansContent
  readonly layout: LumenBillingPlansReferenceLayout
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

function FeatureIcon({ feature }: { readonly feature: LumenBillingPlanFeature }) {
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

function FeatureList({
  title,
  features,
}: {
  readonly title: string
  readonly features: readonly LumenBillingPlanFeature[]
}) {
  const uniqueFeatures = uniqueById(features)
  return (
    <section className="hbar-app-ui-billing-reference-plans-section">
      <h3 className="hbar-app-ui-billing-reference-plans-kicker">{title}</h3>
      <ul className="hbar-app-ui-billing-reference-plans-features">
        {uniqueFeatures.map((feature) => (
          <li key={feature.id} data-hbar-app-ui-item-id={feature.id}>
            <span className="hbar-app-ui-billing-reference-plans-feature-name">
              <BillingIcon tier="sm">
                <FeatureIcon feature={feature} />
              </BillingIcon>
              <strong>{feature.label}</strong>
            </span>
            <span className="hbar-app-ui-billing-reference-plans-feature-value">{feature.value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ReferenceBillingPlans({ spec, onAction, content, layout }: ReferenceBillingPlansProps) {
  const idPrefix = React.useId()
  const plans = uniqueById(content.plans)
  const validToggleKeys = new Set(
    plans.flatMap((plan) => uniqueById(plan.toggles).map((toggle) => JSON.stringify([plan.id, toggle.id]))),
  )
  const flags = new Map<string, boolean>()
  for (const flag of content.referenceFlow?.flags ?? []) {
    const key = JSON.stringify([flag.planId, flag.toggleId])
    if (validToggleKeys.has(key) && !flags.has(key)) {
      flags.set(key, flag.enabled)
    }
  }

  const flow = content.referenceFlow
  const dirty = flow?.dirty ?? content.initialDirty ?? false
  const showSaveState = dirty || Boolean(flow?.pending || flow?.error || flow?.feedback)

  return (
    <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-reference-plans-surface">
      <main className="hbar-app-ui-billing-reference-plans-page" data-hbar-app-ui-owner-id={layout.ownerId}>
        <header className="hbar-app-ui-billing-reference-plans-topbar">
          <div>
            <h1>{content.labels.pageTitle}</h1>
            <p>{content.labels.pageDescription}</p>
          </div>
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
        </header>

        {showSaveState ? (
          <section
            className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-plans-save-state"
            aria-busy={flow?.pending || undefined}
          >
            {dirty ? (
              <div className="hbar-app-ui-billing-reference-plans-save-copy">
                <strong>{content.labels.unsavedTitle}</strong>
                <p>{content.labels.unsavedDescription}</p>
              </div>
            ) : null}
            {flow?.error ? (
              <p className="hbar-app-ui-billing-reference-plans-error" role="alert">
                {flow.error}
              </p>
            ) : null}
            {flow?.feedback ? <p role="status">{flow.feedback}</p> : null}
            {dirty ? (
              <div className="hbar-app-ui-billing-reference-plans-save-actions">
                <BillingButton
                  tone="quiet"
                  type="button"
                  disabled={!flow || flow.pending}
                  onClick={() => flow?.onDiscard()}
                >
                  {content.labels.discard}
                </BillingButton>
                <BillingButton
                  tone="accent"
                  type="button"
                  disabled={!flow || flow.pending}
                  onClick={() => flow?.onSave()}
                >
                  {content.labels.save}
                </BillingButton>
              </div>
            ) : null}
          </section>
        ) : null}

        {plans.length ? (
          <div
            className="hbar-app-ui-billing-reference-plans-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {plans.map((plan, planIndex) => (
              <article
                className="hbar-app-ui-billing-reference-plans-column"
                key={plan.id}
                data-hbar-app-ui-item-id={plan.id}
              >
                <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-plans-card">
                  <header className="hbar-app-ui-billing-reference-plans-card-header">
                    <div>
                      <h2>{plan.name}</h2>
                      <BillingStatus value={plan.status} tone={plan.statusTone} />
                      <small>{plan.meta}</small>
                    </div>
                    <BillingIconButton
                      type="button"
                      label={content.labels.editPlan(plan.name)}
                      onClick={() => onAction?.({ variantId: spec.id, actionId: 'edit-plan', value: plan.id })}
                    >
                      <BillingIcon tier="sm">
                        <Pencil />
                      </BillingIcon>
                    </BillingIconButton>
                  </header>
                  <div className="hbar-app-ui-billing-reference-plans-price">
                    <strong>{plan.price}</strong>
                    <small>{plan.priceSuffix}</small>
                  </div>
                  <FeatureList title={content.labels.entitlementsTitle} features={plan.entitlements} />
                  <FeatureList title={content.labels.addOnsTitle} features={plan.addOns} />
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
                <section className="hbar-app-ui-billing-panel hbar-app-ui-billing-reference-plans-toggle-panel">
                  {uniqueById(plan.toggles).map((toggle, toggleIndex) => {
                    const key = JSON.stringify([plan.id, toggle.id])
                    const checked = flags.get(key) ?? toggle.enabled
                    return (
                      <label className="hbar-app-ui-billing-reference-plans-toggle-row" key={toggle.id}>
                        <span>{toggle.label}</span>
                        <LumenToggleControl
                          aria-label={content.labels.togglePlan(plan.name, toggle.label)}
                          checked={checked}
                          disabled={!flow || flow.pending}
                          id={`${idPrefix}-toggle-${planIndex}-${toggleIndex}`}
                          onChange={(event) => flow?.onToggle(plan.id, toggle.id, event.currentTarget.checked)}
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
