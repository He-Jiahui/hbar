'use client'

import * as React from 'react'
import { LumenButton } from './primitives'
import { LumenRange } from './range'
import { LumenToggleButton } from './toggle-button'
import type { LumenUsageHeading } from './usage'
import './usage-budget-panel.css'

export interface LumenUsageBudgetThreshold {
  readonly id: string
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}
export interface LumenUsageBudgetSwitch extends LumenUsageBudgetThreshold {
  readonly description: string
  readonly disabled?: boolean | undefined
}
export interface LumenUsageBudgetPanelContent {
  readonly summary: {
    readonly label: string
    readonly spent: string
    /** Localized inline suffix including separator and formatted budget. */
    readonly capacity: string
    readonly progress: number
    readonly progressLabel: string
    readonly forecast: string
    readonly overBudget: boolean
  }
  readonly cap: {
    readonly label: string
    readonly value: number
    readonly display: string
    readonly minimum: number
    readonly maximum: number
    readonly step: number
    readonly disabled?: boolean | undefined
    readonly onChange: (value: number) => void
  }
  readonly notifyLabel: string
  /** Content-grown short choices (normally three, recommended maximum six).
   * Larger collections must be host-grouped; supplied choices are never truncated.
   */
  readonly thresholds: readonly LumenUsageBudgetThreshold[]
  readonly emptyThresholds: string
  /** Short independent settings (normally two, recommended maximum eight). */
  readonly switches: readonly LumenUsageBudgetSwitch[]
  readonly emptySwitches: string
}
export interface UsageBudgetPanelProps {
  readonly heading: LumenUsageHeading
  readonly panel: LumenUsageBudgetPanelContent
}
export function UsageBudgetPanel({ heading, panel }: UsageBudgetPanelProps) {
  const inputId = React.useId()
  const { summary, cap } = panel
  const thresholds = [...new Map(panel.thresholds.map((item) => [item.id, item])).values()]
  const switches = [...new Map(panel.switches.map((item) => [item.id, item])).values()]
  const progress = Number.isFinite(summary.progress) ? Math.max(0, Math.min(100, summary.progress)) : 0
  return (
    <div className="lumen-usage-budget-panel hbar-app-ui-usage-variant-5">
      <div className="lumen-usage-budget-heading">
        <h2>{heading.title}</h2>
        <p>{heading.description}</p>
      </div>
      <div className="lumen-usage-budget-frame">
        <div className="lumen-usage-budget-summary">
          <div className="lumen-usage-budget-value-row">
            <p>{summary.label}</p>
            <p>
              <span>{summary.spent}</span>
              {summary.capacity}
            </p>
          </div>
          <div
            className="lumen-usage-budget-progress"
            role="progressbar"
            aria-label={summary.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div style={{ inlineSize: `${progress}%` }} />
          </div>
          <div className="lumen-usage-budget-forecast">
            <span aria-hidden="true" data-over-budget={summary.overBudget} />
            <span>{summary.forecast}</span>
          </div>
        </div>
        <div className="lumen-usage-budget-controls">
          <label htmlFor={inputId}>{cap.label}</label>
          <div className="lumen-usage-budget-cap-row">
            <LumenRange
              id={inputId}
              min={cap.minimum}
              max={cap.maximum}
              step={cap.step}
              value={cap.value}
              disabled={cap.disabled}
              onChange={(event) => cap.onChange(event.currentTarget.valueAsNumber)}
            />
            <span>{cap.display}</span>
          </div>
          <p className="lumen-usage-budget-notify">{panel.notifyLabel}</p>
          <div className="lumen-usage-budget-thresholds">
            {thresholds.length ? (
              thresholds.map((choice) => (
                <LumenButton
                  key={choice.id}
                  type="button"
                  size="s"
                  variant="outlined"
                  aria-pressed={choice.checked}
                  indicatorState={choice.checked ? 'selected' : 'idle'}
                  onClick={() => choice.onChange(!choice.checked)}
                >
                  {choice.label}
                </LumenButton>
              ))
            ) : (
              <p>{panel.emptyThresholds}</p>
            )}
          </div>
        </div>
        <div className="lumen-usage-budget-switches">
          {switches.length ? (
            switches.map((choice) => (
              <div className="lumen-usage-budget-switch-row" key={choice.id} data-setting-id={choice.id}>
                <div>
                  <p>{choice.label}</p>
                  <p>{choice.description}</p>
                </div>
                <LumenToggleButton
                  label={choice.label}
                  checked={choice.checked}
                  disabled={choice.disabled}
                  onCheckedChange={choice.onChange}
                />
              </div>
            ))
          ) : (
            <p className="lumen-usage-budget-empty">{panel.emptySwitches}</p>
          )}
        </div>
      </div>
    </div>
  )
}
