'use client'

import { ArrowRight, Check } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-6-reference.css'

export interface LumenOnboarding6ReferenceSummaryRow {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenOnboarding6ReferenceContent {
  readonly title: string
  readonly description: string
  readonly summaryRows: readonly LumenOnboarding6ReferenceSummaryRow[]
  readonly openWorkspaceLabel: string
  readonly takeTourLabel: string
  readonly inboxNote: string
}

export interface LumenOnboarding6ReferenceViewModel {
  readonly content: LumenOnboarding6ReferenceContent
  readonly onOpenWorkspaceRequest: () => void
  readonly onTakeTourRequest: () => void
}

export interface LumenOnboarding6ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding6ReferenceViewModel
}

export function LumenOnboarding6Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding6ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding6-reference',
    'hbar-app-ui-onboarding-variant-6',
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
      className="lumen-onboarding6-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={6}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <span className="lumen-onboarding6-success" aria-hidden="true">
        <Check className="lumen-onboarding6-check-icon" />
      </span>
      <LumenText as="h2" variant="heading" className="lumen-onboarding6-title">
        {content.title}
      </LumenText>
      <LumenText as="p" tone="muted" className="lumen-onboarding6-description">
        {content.description}
      </LumenText>

      <dl className="lumen-onboarding6-summary" data-onboarding6-summary>
        {content.summaryRows.map((row) => (
          <div className="lumen-onboarding6-summary-row" key={row.id} data-onboarding6-summary-id={row.id}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="lumen-onboarding6-actions">
        <LumenButton
          className="lumen-onboarding6-open"
          indicator="none"
          tone="primary"
          data-onboarding6-open
          onClick={viewModel.onOpenWorkspaceRequest}
        >
          {content.openWorkspaceLabel}
          <ArrowRight className="lumen-onboarding6-arrow-icon" aria-hidden="true" />
        </LumenButton>
        <LumenButton
          className="lumen-onboarding6-tour"
          indicator="none"
          variant="outlined"
          data-onboarding6-tour
          onClick={viewModel.onTakeTourRequest}
        >
          {content.takeTourLabel}
        </LumenButton>
      </div>
      <LumenText as="p" tone="muted" className="lumen-onboarding6-inbox-note">
        {content.inboxNote}
      </LumenText>
    </LumenSurface>
  )
}
