'use client'

import { Check } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-4-reference.css'

export interface LumenOnboarding4ReferenceUseCase {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly accessibleName: string
  readonly checked: boolean
}

export interface LumenOnboarding4ReferenceTeamSize {
  readonly id: string
  readonly label: string
  readonly pressed: boolean
}

export interface LumenOnboarding4ReferenceContent {
  readonly stepLabel: string
  readonly heading: string
  readonly description: string
  readonly useCaseGroupLabel: string
  readonly emptyUseCasesText: string
  readonly useCases: readonly LumenOnboarding4ReferenceUseCase[]
  readonly teamSizeLegend: string
  readonly teamSizes: readonly LumenOnboarding4ReferenceTeamSize[]
  readonly backLabel: string
  readonly continueLabel: string
  readonly backEnabled: boolean
  readonly continueEnabled: boolean
}

export interface LumenOnboarding4ReferenceViewModel {
  readonly content: LumenOnboarding4ReferenceContent
  readonly onUseCaseSelectionRequest: (useCaseId: string) => void
  readonly onTeamSizeSelectionRequest: (teamSizeId: string) => void
  readonly onBackRequest: () => void
  readonly onContinueRequest: () => void
}

export interface LumenOnboarding4ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding4ReferenceViewModel
}

export function LumenOnboarding4Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding4ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding4-reference',
    'hbar-app-ui-onboarding-variant-4',
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
      className="lumen-onboarding4-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={4}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
      data-onboarding4-step="use-case"
    >
      <header className="lumen-onboarding4-header">
        <LumenText as="p" className="lumen-onboarding4-step" tone="muted">
          {content.stepLabel}
        </LumenText>
        <LumenText as="h2" variant="heading">
          {content.heading}
        </LumenText>
        <LumenText as="p" className="lumen-onboarding4-description" tone="muted" variant="supporting">
          {content.description}
        </LumenText>
      </header>

      {content.useCases.length ? (
        <div
          className="lumen-onboarding4-use-cases"
          role="radiogroup"
          aria-label={content.useCaseGroupLabel}
          data-onboarding4-use-case-list
        >
          {content.useCases.map((useCase) => (
            <LumenButton
              key={useCase.id}
              className="lumen-onboarding4-use-case"
              indicator="none"
              variant="outlined"
              role="radio"
              aria-label={useCase.accessibleName}
              aria-checked={useCase.checked}
              data-onboarding4-use-case-id={useCase.id}
              data-selected={useCase.checked ? 'true' : 'false'}
              onClick={() => viewModel.onUseCaseSelectionRequest(useCase.id)}
            >
              <span className="lumen-onboarding4-use-case-copy">
                <LumenText as="span" className="lumen-onboarding4-use-case-title" variant="label">
                  {useCase.title}
                </LumenText>
                <LumenText as="span" className="lumen-onboarding4-use-case-description" tone="muted">
                  {useCase.description}
                </LumenText>
              </span>
              {useCase.checked ? (
                <span className="lumen-onboarding4-selected-mark" aria-hidden="true">
                  <Check className="lumen-onboarding4-check-icon" />
                </span>
              ) : null}
            </LumenButton>
          ))}
        </div>
      ) : (
        <LumenText as="p" className="lumen-onboarding4-empty" tone="muted">
          {content.emptyUseCasesText}
        </LumenText>
      )}

      <fieldset className="lumen-onboarding4-team-size" data-onboarding4-team-size-group>
        <LumenText as="legend" variant="label">
          {content.teamSizeLegend}
        </LumenText>
        <div className="lumen-onboarding4-team-size-options">
          {content.teamSizes.map((teamSize) => (
            <LumenButton
              key={teamSize.id}
              className="lumen-onboarding4-team-size-option"
              indicator="none"
              variant="text"
              aria-pressed={teamSize.pressed}
              data-onboarding4-team-size={teamSize.id}
              data-pressed={teamSize.pressed ? 'true' : 'false'}
              onClick={() => viewModel.onTeamSizeSelectionRequest(teamSize.id)}
            >
              {teamSize.label}
            </LumenButton>
          ))}
        </div>
      </fieldset>

      <footer className="lumen-onboarding4-actions">
        <LumenButton
          className="lumen-onboarding4-back"
          indicator="none"
          variant="outlined"
          disabled={!content.backEnabled}
          data-onboarding4-back
          onClick={viewModel.onBackRequest}
        >
          {content.backLabel}
        </LumenButton>
        <LumenButton
          className="lumen-onboarding4-continue"
          indicator="none"
          tone="primary"
          disabled={!content.continueEnabled}
          data-onboarding4-continue
          onClick={viewModel.onContinueRequest}
        >
          {content.continueLabel}
        </LumenButton>
      </footer>
    </LumenSurface>
  )
}
