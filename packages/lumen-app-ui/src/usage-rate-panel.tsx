'use client'

import { Check, Info } from 'lucide-react'
import { LumenButton } from './primitives'
import type { LumenUsageAction, LumenUsageChoice, LumenUsageHeading } from './usage'
import './usage-rate-panel.css'

export interface LumenUsageRatePanelMeter {
  readonly id: string
  readonly label: string
  readonly detail: string
  readonly current: string
  /** Localized suffix, including its separator and unit. */
  readonly capacity: string
  readonly progress: number
  readonly progressLabel: string
  readonly nearCapacity: boolean
}

export interface LumenUsageRatePanelContent {
  /** Short content-grown resource set, normally four (recommended maximum 12).
   * Larger inventories should be host-aggregated/paged. Supplied rows are never dropped.
   */
  readonly meters: readonly LumenUsageRatePanelMeter[]
  readonly emptyLabel: string
  readonly nearCapacity: boolean
  readonly tier?: LumenUsageChoice | undefined
  readonly footer: {
    readonly description: string
    readonly icon: 'info' | 'check'
    readonly action?: LumenUsageAction | undefined
  }
}

export interface RatePanelMeterProps {
  readonly meter: LumenUsageRatePanelMeter
}

function RatePanelMeter({ meter }: RatePanelMeterProps) {
  const progress = Number.isFinite(meter.progress) ? Math.min(100, Math.max(0, meter.progress)) : 0
  return (
    <div className="lumen-usage-rate-meter" data-limit-id={meter.id}>
      <div className="lumen-usage-rate-value-row">
        <div className="lumen-usage-rate-labels">
          <p>{meter.label}</p>
          <p>{meter.detail}</p>
        </div>
        <p className="lumen-usage-rate-value">
          <span>{meter.current}</span>
          {meter.capacity}
        </p>
      </div>
      <div
        className="lumen-usage-rate-progress"
        role="progressbar"
        aria-label={meter.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div data-near-capacity={meter.nearCapacity} style={{ inlineSize: `${progress}%` }} />
      </div>
    </div>
  )
}

export interface UsageRatePanelProps {
  readonly heading: LumenUsageHeading
  readonly panel: LumenUsageRatePanelContent
}

export function UsageRatePanel({ heading, panel }: UsageRatePanelProps) {
  const rows = [...new Map(panel.meters.map((meter) => [meter.id, meter])).values()]
  const choice = panel.tier
  const action = panel.footer.action
  return (
    <div className="lumen-usage-rate-panel hbar-app-ui-usage-variant-3">
      <div className="lumen-usage-rate-heading">
        <div>
          <h2>{heading.title}</h2>
          <p>
            <span aria-hidden="true" data-near-capacity={panel.nearCapacity} />
            {heading.description}
          </p>
        </div>
        {choice ? (
          <div className="lumen-usage-rate-tabs" role="tablist" aria-label={choice.label}>
            {[...new Map(choice.options.map((option) => [option.id, option])).values()].map((option) => (
              <LumenButton
                key={option.id}
                type="button"
                variant="text"
                size="s"
                role="tab"
                indicatorState={option.id === choice.value ? 'selected' : 'idle'}
                aria-selected={option.id === choice.value}
                onClick={() => choice.onChange(option.id)}
              >
                {option.label}
              </LumenButton>
            ))}
          </div>
        ) : null}
      </div>
      <div className="lumen-usage-rate-frame">
        <div className="lumen-usage-rate-meters">
          {rows.length ? (
            rows.map((meter) => <RatePanelMeter key={meter.id} meter={meter} />)
          ) : (
            <p className="lumen-usage-rate-empty">{panel.emptyLabel}</p>
          )}
        </div>
        <div className="lumen-usage-rate-footer">
          <p>
            {panel.footer.icon === 'check' ? <Check aria-hidden="true" /> : <Info aria-hidden="true" />}
            <span>{panel.footer.description}</span>
          </p>
          {action ? (
            <LumenButton type="button" variant="outlined" size="s" disabled={action.disabled} onClick={action.onInvoke}>
              {action.label}
            </LumenButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}
