'use client'

import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './paywall-4-reference.css'

export interface LumenPaywall4ReferenceMeter {
  readonly id: string
  readonly label: string
  readonly usedText: string
  readonly limitText: string
  readonly fraction: number
}

export interface LumenPaywall4ReferenceContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly meterList: string
    readonly emptyMeters: string
    readonly proTitle: string
    readonly proDescription: string
    readonly topUp: string
    readonly upgrade: string
  }
  readonly meters: readonly LumenPaywall4ReferenceMeter[]
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
}

export interface LumenPaywall4ReferenceViewModel {
  readonly content: LumenPaywall4ReferenceContent
  readonly onTopUpRequest: () => void
  readonly onUpgradeRequest: () => void
}

export interface LumenPaywall4ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenPaywall4ReferenceViewModel
}

export function uniqueLumenPaywall4Meters(meters: readonly LumenPaywall4ReferenceMeter[]) {
  const seen = new Set<string>()
  return meters.filter((meter) => {
    if (!meter.id.trim() || seen.has(meter.id)) {
      return false
    }
    seen.add(meter.id)
    return true
  })
}

export function LumenPaywall4Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenPaywall4ReferenceProps) {
  const { content } = viewModel
  const meters = uniqueLumenPaywall4Meters(content.meters)
  const scrollMeters = content.listStrategy.kind === 'pane-scroll'
  const rootClassName = [
    'lumen-paywall',
    'lumen-paywall4-reference',
    'hbar-app-ui-paywall-variant-4',
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
      className="lumen-paywall4-surface"
      contentClassName={rootClassName}
      data-lumen-component="paywall"
      data-lumen-variant={4}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <header className="lumen-paywall4-header">
        <span className="lumen-paywall4-alert" aria-hidden="true">
          <svg data-tier="md" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
          </svg>
        </span>
        <div>
          <LumenText as="h2" variant="heading">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.description}
          </LumenText>
        </div>
      </header>

      <div
        className="lumen-paywall4-meters"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-paywall4-meters
        role={scrollMeters ? 'region' : undefined}
        aria-label={scrollMeters ? content.labels.meterList : undefined}
        tabIndex={scrollMeters ? 0 : undefined}
      >
        {meters.length === 0 ? (
          <LumenText as="p" tone="muted" className="lumen-paywall4-empty">
            {content.labels.emptyMeters}
          </LumenText>
        ) : (
          meters.map((meter) => {
            const fraction = Number.isFinite(meter.fraction) ? Math.max(0, Math.min(1, meter.fraction)) : 0
            return (
              <div className="lumen-paywall4-meter" key={meter.id} data-paywall4-meter-id={meter.id}>
                <div className="lumen-paywall4-meter-heading">
                  <LumenText as="p">{meter.label}</LumenText>
                  <LumenText as="p" tone="muted">
                    <span>{meter.usedText}</span>
                    {meter.limitText}
                  </LumenText>
                </div>
                <div className="lumen-paywall4-track" aria-hidden="true">
                  <span data-capped={fraction >= 1} style={{ inlineSize: `${fraction * 100}%` }} />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="lumen-paywall4-upgrade-card">
        <div>
          <LumenText as="p">{content.labels.proTitle}</LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.proDescription}
          </LumenText>
        </div>
        <div className="lumen-paywall4-actions">
          <LumenButton
            indicator="none"
            variant="outlined"
            className="lumen-paywall4-top-up"
            data-paywall4-top-up
            onClick={viewModel.onTopUpRequest}
          >
            {content.labels.topUp}
          </LumenButton>
          <LumenButton
            indicator="none"
            tone="primary"
            className="lumen-paywall4-upgrade"
            data-paywall4-upgrade
            onClick={viewModel.onUpgradeRequest}
          >
            {content.labels.upgrade}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}
