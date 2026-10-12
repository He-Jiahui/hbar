'use client'

import { LumenButton } from './primitives'
import type { LumenUsageAction, LumenUsageHeading } from './usage'
import './usage-overage-panel.css'

export interface LumenUsageOveragePlan {
  readonly id: string
  readonly label: string
  readonly price: string
  /** Content-grown benefits; normally three, recommended maximum six. */
  readonly benefits: readonly { readonly id: string; readonly label: string }[]
  readonly disabled?: boolean | undefined
}
export interface LumenUsageOveragePanelContent {
  readonly summary: {
    readonly label: string
    readonly used: string
    readonly allowance: string
    readonly includedPercent: number
    readonly includedLabel: string
    readonly overageLabel: string
  }
  readonly plansLabel: string
  readonly groupLabel: string
  /** Content-grown choices (normally two, recommended maximum six).
   * Hosts group larger catalogues; supplied choices are never silently truncated.
   */
  readonly plans: readonly LumenUsageOveragePlan[]
  /** A missing ID renders no selection and disables upgrade until a valid choice. */
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
  readonly emptyLabel: string
  readonly note: string
  readonly stay: LumenUsageAction
  readonly upgrade: LumenUsageAction
}
export interface UsageOveragePanelProps {
  readonly heading: LumenUsageHeading
  readonly panel: LumenUsageOveragePanelContent
}
function OverageGlyph({ kind }: { readonly kind: 'check' | 'circle' | 'next' }) {
  return (
    <svg className="lumen-usage-overage-glyph" viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'circle' ? <circle cx="12" cy="12" r="10" /> : null}
      {kind === 'check' ? <path d="m4 12 5 5L20 6" /> : null}
      {kind === 'next' ? <path d="m9 6 6 6-6 6" /> : null}
    </svg>
  )
}
export function UsageOveragePanel({ heading, panel }: UsageOveragePanelProps) {
  const plans = [...new Map(panel.plans.map((plan) => [plan.id, plan])).values()]
  const selected = plans.find((plan) => plan.id === panel.selectedId && !plan.disabled)
  const ratio = Number.isFinite(panel.summary.includedPercent)
    ? Math.max(0, Math.min(100, panel.summary.includedPercent))
    : 0
  return (
    <div className="lumen-usage-overage-panel hbar-app-ui-usage-variant-6">
      <div className="lumen-usage-overage-heading">
        <h2>{heading.title}</h2>
        <p>{heading.description}</p>
      </div>
      <div className="lumen-usage-overage-frame">
        <div className="lumen-usage-overage-summary">
          <div className="lumen-usage-overage-value-row">
            <p>{panel.summary.label}</p>
            <p>
              <span>{panel.summary.used}</span>
              {panel.summary.allowance}
            </p>
          </div>
          <div className="lumen-usage-overage-split-bar" aria-hidden="true">
            <div style={{ inlineSize: `${ratio}%` }} />
            <div style={{ inlineSize: `${100 - ratio}%` }} />
          </div>
          <div className="lumen-usage-overage-legend">
            <span>
              <span aria-hidden="true" />
              {panel.summary.includedLabel}
            </span>
            <span>
              <span aria-hidden="true" />
              {panel.summary.overageLabel}
            </span>
          </div>
        </div>
        <div className="lumen-usage-overage-picker">
          <p>{panel.plansLabel}</p>
          <div className="lumen-usage-overage-plans" role="radiogroup" aria-label={panel.groupLabel}>
            {plans.length ? (
              plans.map((plan) => (
                <LumenButton
                  key={plan.id}
                  className="lumen-usage-overage-plan"
                  role="radio"
                  aria-checked={selected?.id === plan.id}
                  disabled={plan.disabled}
                  variant="outlined"
                  indicatorState={selected?.id === plan.id ? 'selected' : 'idle'}
                  onClick={() => panel.onSelect(plan.id)}
                >
                  <div className="lumen-usage-overage-plan-title">
                    <span>{plan.label}</span>
                    <OverageGlyph kind={selected?.id === plan.id ? 'check' : 'circle'} />
                  </div>
                  <p>{plan.price}</p>
                  <ul>
                    {[...new Map(plan.benefits.map((item) => [item.id, item])).values()].map((benefit) => (
                      <li key={benefit.id}>
                        <OverageGlyph kind="check" />
                        <span>{benefit.label}</span>
                      </li>
                    ))}
                  </ul>
                </LumenButton>
              ))
            ) : (
              <p>{panel.emptyLabel}</p>
            )}
          </div>
        </div>
        <div className="lumen-usage-overage-footer">
          <p title={panel.note}>{panel.note}</p>
          <div className="lumen-usage-overage-actions">
            <LumenButton variant="text" size="s" disabled={panel.stay.disabled} onClick={panel.stay.onInvoke}>
              {panel.stay.label}
            </LumenButton>
            <LumenButton size="s" disabled={!selected || panel.upgrade.disabled} onClick={panel.upgrade.onInvoke}>
              {panel.upgrade.label}
              <OverageGlyph kind="next" />
            </LumenButton>
          </div>
        </div>
      </div>
    </div>
  )
}
