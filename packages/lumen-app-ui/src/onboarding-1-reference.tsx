'use client'

import { CircleUserRound } from 'lucide-react'
import { LumenCheckBox, LumenFormField, LumenInput, LumenSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-1-reference.css'

export interface LumenOnboarding1ReferenceTimezoneOption {
  readonly id: string
  readonly label: string
}

export interface LumenOnboarding1ReferenceContent {
  readonly copy: {
    readonly title: string
    readonly introduction: string
    readonly uploadPhoto: string
    readonly photoRequirements: string
    readonly fullNameLabel: string
    readonly requiredMarker: string
    readonly fullNamePlaceholder: string
    readonly jobTitleLabel: string
    readonly jobTitlePlaceholder: string
    readonly timezoneLabel: string
    readonly timezonePlaceholder: string
    readonly productUpdatesOptIn: string
    readonly continueLabel: string
    readonly directoryPreviewTitle: string
    readonly directoryTimezoneLabel: string
    readonly directoryUpdatesLabel: string
    readonly directoryPreviewDescription: string
  }
  readonly form: {
    readonly fullName: { readonly value: string; readonly placeholder: string }
    readonly jobTitle: { readonly value: string; readonly placeholder: string }
    readonly timezone: {
      readonly selectedId: string | null
      readonly placeholder: string
      readonly options: readonly LumenOnboarding1ReferenceTimezoneOption[]
    }
    readonly productUpdatesOptIn: boolean
  }
  readonly photoUpload: {
    readonly requestOutcomeEvidence: 'typed-host-request-only'
  }
  readonly continue: {
    readonly enabledInCapturedDefault: true
    readonly outcomeEvidence: 'typed-host-request-only'
  }
  readonly directoryPreview: {
    readonly avatarInitials: string | null
    readonly fullName: string
    readonly jobTitle: string
    readonly timezone: {
      readonly label: string
      readonly value: string | null
    }
    readonly updates: {
      readonly label: string
      readonly value: string | null
    }
    readonly description: string
  }
}

export interface LumenOnboarding1ReferenceViewModel {
  readonly content: LumenOnboarding1ReferenceContent
  readonly onFullNameChange: (value: string) => void
  readonly onJobTitleChange: (value: string) => void
  readonly onTimezoneChange: (value: string) => void
  readonly onProductUpdatesChange: (enabled: boolean) => void
  readonly onPhotoRequest: () => void
  readonly onContinueRequest: () => void
}

export interface LumenOnboarding1ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding1ReferenceViewModel
}

export function LumenOnboarding1Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding1ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding1-reference',
    'hbar-app-ui-onboarding-variant-1',
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
      as="section"
      material="solid"
      className="lumen-onboarding1-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={1}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <form
        className="lumen-onboarding1-form-pane"
        aria-label={content.copy.title}
        onSubmit={(event) => event.preventDefault()}
      >
        <header className="lumen-onboarding1-heading">
          <LumenText as="h2" variant="heading">
            {content.copy.title}
          </LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {content.copy.introduction}
          </LumenText>
        </header>

        <div className="lumen-onboarding1-photo-row" data-onboarding1-photo-row>
          <span className="lumen-onboarding1-photo-placeholder" aria-hidden="true">
            <CircleUserRound className="lumen-onboarding1-photo-icon" />
          </span>
          <div className="lumen-onboarding1-photo-content">
            <LumenButton
              className="lumen-onboarding1-photo-button"
              indicator="none"
              variant="outlined"
              type="button"
              data-onboarding1-upload-photo
              onClick={viewModel.onPhotoRequest}
            >
              {content.copy.uploadPhoto}
            </LumenButton>
            <LumenText as="small" tone="muted" variant="supporting">
              {content.copy.photoRequirements}
            </LumenText>
          </div>
        </div>

        <div className="lumen-onboarding1-fields">
          <LumenFormField
            controlId={`${variantId}-full-name`}
            className="lumen-onboarding1-field"
            label={content.copy.fullNameLabel}
            required
            requiredIndicator={content.copy.requiredMarker}
          >
            <LumenInput
              data-onboarding1-full-name
              variant="boxed"
              autoComplete="name"
              value={content.form.fullName.value}
              placeholder={content.form.fullName.placeholder}
              onChange={(event) => viewModel.onFullNameChange(event.currentTarget.value)}
            />
          </LumenFormField>

          <LumenFormField
            controlId={`${variantId}-job-title`}
            className="lumen-onboarding1-field"
            label={content.copy.jobTitleLabel}
          >
            <LumenInput
              data-onboarding1-job-title
              variant="boxed"
              autoComplete="organization-title"
              value={content.form.jobTitle.value}
              placeholder={content.form.jobTitle.placeholder}
              onChange={(event) => viewModel.onJobTitleChange(event.currentTarget.value)}
            />
          </LumenFormField>

          <LumenFormField
            controlId={`${variantId}-timezone`}
            className="lumen-onboarding1-field"
            label={content.copy.timezoneLabel}
          >
            <LumenSelect
              data-onboarding1-timezone
              variant="boxed"
              value={content.form.timezone.selectedId ?? ''}
              onChange={(event) => viewModel.onTimezoneChange(event.currentTarget.value)}
            >
              <option value="">{content.form.timezone.placeholder}</option>
              {content.form.timezone.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </LumenSelect>
          </LumenFormField>
        </div>

        <LumenCheckBox
          id={`${variantId}-product-updates`}
          className="lumen-onboarding1-updates"
          data-onboarding1-product-updates
          label={content.copy.productUpdatesOptIn}
          checked={content.form.productUpdatesOptIn}
          onChange={(event) => viewModel.onProductUpdatesChange(event.currentTarget.checked)}
        />

        <LumenButton
          className="lumen-onboarding1-continue"
          indicator="none"
          tone="primary"
          type="button"
          data-onboarding1-continue
          onClick={viewModel.onContinueRequest}
        >
          {content.copy.continueLabel}
        </LumenButton>
      </form>

      <aside className="lumen-onboarding1-preview-pane" aria-label={content.copy.directoryPreviewTitle}>
        <div className="lumen-onboarding1-preview-content">
          <LumenText as="p" className="lumen-onboarding1-preview-title" variant="label">
            {content.copy.directoryPreviewTitle}
          </LumenText>
          <div className="lumen-onboarding1-directory-card">
            <div className="lumen-onboarding1-directory-person">
              <span className="lumen-onboarding1-directory-avatar">{content.directoryPreview.avatarInitials}</span>
              <span className="lumen-onboarding1-directory-person-copy">
                <LumenText as="strong" variant="label">
                  {content.directoryPreview.fullName}
                </LumenText>
                <LumenText as="small" tone="muted" variant="supporting">
                  {content.directoryPreview.jobTitle}
                </LumenText>
              </span>
            </div>
            <dl className="lumen-onboarding1-directory-details">
              <div>
                <dt>{content.directoryPreview.timezone.label}</dt>
                <dd>{content.directoryPreview.timezone.value}</dd>
              </div>
              <div>
                <dt>{content.directoryPreview.updates.label}</dt>
                <dd>{content.directoryPreview.updates.value}</dd>
              </div>
            </dl>
          </div>
          <LumenText as="p" className="lumen-onboarding1-preview-description" tone="muted" variant="supporting">
            {content.directoryPreview.description}
          </LumenText>
        </div>
      </aside>
    </LumenSurface>
  )
}
