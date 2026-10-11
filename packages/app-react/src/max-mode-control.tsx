import { LumenFrame, LumenToggle, LumenContentText } from '@lumen/app-ui'
import { maximumContextWindow, type ModelContextTier } from '@hbar/contracts'
import type { ModelDescriptor } from '@hbar/contracts/commands/models'

export interface HbarMaxModeLabels {
  readonly title: string
  readonly description: string
  readonly unavailable: string
  readonly menu: string
  readonly badge: string
  readonly trigger: (label: string) => string
  readonly capacity: (standard: number, expanded: number) => string
  readonly baseRates: (input: number, output: number) => string
  readonly rule: (tier: ModelContextTier) => string
  readonly markup: (multiplier: number) => string
}

/** Shared by existing-session and first-send effort menus. Host catalog owns all
 * capacities and rates; at most eight tariffs grow within the menu's scroll area. */
export function HbarMaxModeControl({
  model,
  enabled,
  disabled,
  labels,
  onChange,
}: {
  readonly model: ModelDescriptor | null
  readonly enabled: boolean
  readonly disabled: boolean
  readonly labels: HbarMaxModeLabels
  readonly onChange: (enabled: boolean) => void
}) {
  if (!model) return null
  const maximum = maximumContextWindow(model)
  const supported = maximum > model.contextWindow
  return (
    <LumenFrame className="hbar-composer-max-mode">
      <LumenToggle
        checked={enabled}
        disabled={disabled || (!supported && !enabled)}
        label={labels.title}
        description={supported ? labels.description : labels.unavailable}
        aria-label={labels.title}
        aria-description={supported ? labels.description : labels.unavailable}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      {supported && (
        <LumenFrame className="hbar-composer-max-rates">
          <LumenContentText context="popover.description">
            {labels.capacity(model.contextWindow, maximum)}
          </LumenContentText>
          {model.inputPrice !== undefined && model.outputPrice !== undefined && (
            <LumenContentText context="popover.description">
              {labels.baseRates(model.inputPrice, model.outputPrice)}
            </LumenContentText>
          )}
          {model.contextTiers?.map((tier) => (
            <LumenContentText key={tier.id} context="popover.description">
              {labels.rule(tier)}
            </LumenContentText>
          ))}
          {(model.maxModePricingMultiplier ?? 1) > 1 && (
            <LumenContentText context="popover.description">
              {labels.markup(model.maxModePricingMultiplier!)}
            </LumenContentText>
          )}
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
