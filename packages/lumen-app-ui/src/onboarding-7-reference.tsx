'use client'

import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-7-reference.css'

export interface LumenOnboarding7ReferenceRegion {
  readonly id: string
  readonly label: string
}

export interface LumenOnboarding7ReferenceContent {
  readonly title: string
  readonly description: string
  readonly workspaceNameLabel: string
  readonly workspaceNamePlaceholder: string
  readonly workspaceUrlLabel: string
  readonly workspaceUrlPlaceholder: string
  readonly memberReachHint: string
  readonly dataRegionLabel: string
  readonly regionPermanentHint: string
  readonly privateWorkspaceLabel: string
  readonly privateWorkspaceDescription: string
  readonly backLabel: string
  readonly continueLabel: string
  readonly workspaceName: string
  readonly slug: string
  readonly urlPrefix: string
  readonly regionId: string
  readonly regionOptions: readonly LumenOnboarding7ReferenceRegion[]
  readonly privateWorkspace: boolean
}

export interface LumenOnboarding7ReferenceViewModel {
  readonly content: LumenOnboarding7ReferenceContent
  readonly onWorkspaceNameChange: (value: string) => void
  readonly onSlugChangeRequest: (value: string) => void
  readonly onRegionChange: (regionId: string) => void
  readonly onPrivateWorkspaceChange: (checked: boolean) => void
  readonly onBackRequest: () => void
  readonly onContinueRequest: () => void
}

export interface LumenOnboarding7ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding7ReferenceViewModel
}

export function LumenOnboarding7Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding7ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding7-reference',
    'hbar-app-ui-onboarding-variant-7',
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
      as="form"
      material="solid"
      className="lumen-onboarding7-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={7}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
      onSubmit={(event) => {
        event.preventDefault()
        viewModel.onContinueRequest()
      }}
    >
      <header className="lumen-onboarding7-header">
        <LumenText as="h2" variant="heading">
          {content.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.description}
        </LumenText>
      </header>

      <div className="lumen-onboarding7-fields">
        <div className="lumen-onboarding7-field">
          <label htmlFor={`${variantId}-workspace-name`}>{content.workspaceNameLabel}</label>
          <input
            id={`${variantId}-workspace-name`}
            type="text"
            autoComplete="organization"
            placeholder={content.workspaceNamePlaceholder}
            value={content.workspaceName}
            data-onboarding7-name
            onChange={(event) => viewModel.onWorkspaceNameChange(event.currentTarget.value)}
          />
        </div>

        <div className="lumen-onboarding7-field">
          <label htmlFor={`${variantId}-slug`}>{content.workspaceUrlLabel}</label>
          <div className="lumen-onboarding7-url-control">
            <span>{content.urlPrefix}</span>
            <input
              id={`${variantId}-slug`}
              type="text"
              placeholder={content.workspaceUrlPlaceholder}
              defaultValue={content.slug}
              data-onboarding7-slug
              onChange={(event) => viewModel.onSlugChangeRequest(event.currentTarget.value)}
            />
          </div>
          <LumenText as="p" tone="muted" className="lumen-onboarding7-hint">
            {content.memberReachHint}
          </LumenText>
        </div>

        <div className="lumen-onboarding7-field">
          <label htmlFor={`${variantId}-region`}>{content.dataRegionLabel}</label>
          <select
            id={`${variantId}-region`}
            value={content.regionId}
            data-onboarding7-region
            onChange={(event) => viewModel.onRegionChange(event.currentTarget.value)}
          >
            {content.regionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <LumenText as="p" tone="muted" className="lumen-onboarding7-hint">
            {content.regionPermanentHint}
          </LumenText>
        </div>

        <div className="lumen-onboarding7-privacy">
          <div>
            <LumenText as="p">{content.privateWorkspaceLabel}</LumenText>
            <LumenText as="p" tone="muted">
              {content.privateWorkspaceDescription}
            </LumenText>
          </div>
          <button
            type="button"
            role="switch"
            aria-label={content.privateWorkspaceLabel}
            aria-checked={content.privateWorkspace}
            data-onboarding7-private
            onClick={() => viewModel.onPrivateWorkspaceChange(!content.privateWorkspace)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      <footer className="lumen-onboarding7-actions">
        <LumenButton
          className="lumen-onboarding7-back"
          indicator="none"
          variant="outlined"
          type="button"
          data-onboarding7-back
          onClick={viewModel.onBackRequest}
        >
          {content.backLabel}
        </LumenButton>
        <LumenButton
          className="lumen-onboarding7-continue"
          indicator="none"
          tone="primary"
          type="submit"
          data-onboarding7-continue
        >
          {content.continueLabel}
        </LumenButton>
      </footer>
    </LumenSurface>
  )
}
