'use client'

import { Check } from 'lucide-react'
import { LumenFormField, LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-2-reference.css'

export type LumenOnboarding2ReferenceStepStatus = 'complete' | 'current' | 'upcoming'
export type LumenOnboarding2ReferenceProfileFieldId = 'full-name' | 'job-title'

export interface LumenOnboarding2ReferenceStep {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly status: LumenOnboarding2ReferenceStepStatus
}

export interface LumenOnboarding2ReferenceContent {
  readonly currentStepId: 'profile' | 'role'
  readonly narrowProgressText: string
  readonly steps: readonly LumenOnboarding2ReferenceStep[]
  readonly profileForm: {
    readonly heading: string
    readonly description: string
    readonly fields: readonly {
      readonly id: LumenOnboarding2ReferenceProfileFieldId
      readonly label: string
      readonly placeholder: string
      readonly value: string
    }[]
    readonly continueLabel: string
  } | null
  readonly roleForm: {
    readonly heading: string
    readonly description: string
    readonly groupLabel: string
    readonly options: readonly {
      readonly id: string
      readonly label: string
      readonly selected: boolean
    }[]
    readonly backLabel: string
    readonly continueLabel: string
  } | null
}

export interface LumenOnboarding2ReferenceViewModel {
  readonly content: LumenOnboarding2ReferenceContent
  readonly onProfileFieldChange: (fieldId: LumenOnboarding2ReferenceProfileFieldId, value: string) => void
  readonly onContinueProfile: () => void
  readonly onStepNavigationRequest: (stepId: string) => void
  readonly onBackRequest: () => void
  readonly onRoleSelectionRequest: (roleId: string) => void
  readonly onContinueRoleRequest: () => void
}

export interface LumenOnboarding2ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding2ReferenceViewModel
}

function ProfileForm({
  variantId,
  form,
  onFieldChange,
  onContinue,
}: {
  readonly variantId: string
  readonly form: NonNullable<LumenOnboarding2ReferenceContent['profileForm']>
  readonly onFieldChange: LumenOnboarding2ReferenceViewModel['onProfileFieldChange']
  readonly onContinue: LumenOnboarding2ReferenceViewModel['onContinueProfile']
}) {
  return (
    <form
      className="lumen-onboarding2-form lumen-onboarding2-profile-form"
      onSubmit={(event) => event.preventDefault()}
    >
      <header className="lumen-onboarding2-form-heading">
        <LumenText as="h2" variant="heading">
          {form.heading}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {form.description}
        </LumenText>
      </header>
      <div className="lumen-onboarding2-fields">
        {form.fields.map((field) => (
          <LumenFormField
            key={field.id}
            controlId={`${variantId}-${field.id}`}
            className="lumen-onboarding2-field"
            label={field.label}
          >
            <LumenInput
              data-onboarding2-field={field.id}
              variant="boxed"
              autoComplete={field.id === 'full-name' ? 'name' : 'organization-title'}
              value={field.value}
              placeholder={field.placeholder}
              onChange={(event) => onFieldChange(field.id, event.currentTarget.value)}
            />
          </LumenFormField>
        ))}
      </div>
      <LumenButton
        className="lumen-onboarding2-primary"
        indicator="none"
        tone="primary"
        type="button"
        data-onboarding2-continue-profile
        onClick={onContinue}
      >
        {form.continueLabel}
      </LumenButton>
    </form>
  )
}

function RoleForm({
  form,
  onRoleSelectionRequest,
  onBackRequest,
  onContinueRequest,
}: {
  readonly form: NonNullable<LumenOnboarding2ReferenceContent['roleForm']>
  readonly onRoleSelectionRequest: LumenOnboarding2ReferenceViewModel['onRoleSelectionRequest']
  readonly onBackRequest: LumenOnboarding2ReferenceViewModel['onBackRequest']
  readonly onContinueRequest: LumenOnboarding2ReferenceViewModel['onContinueRoleRequest']
}) {
  return (
    <form className="lumen-onboarding2-form lumen-onboarding2-role-form" onSubmit={(event) => event.preventDefault()}>
      <header className="lumen-onboarding2-form-heading">
        <LumenText as="h2" variant="heading">
          {form.heading}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {form.description}
        </LumenText>
      </header>
      <div className="lumen-onboarding2-role-group" role="radiogroup" aria-label={form.groupLabel}>
        {form.options.map((option) => (
          <LumenButton
            key={option.id}
            className="lumen-onboarding2-role-option"
            indicator="none"
            variant="outlined"
            role="radio"
            aria-checked={option.selected}
            data-onboarding2-role={option.id}
            data-selected={option.selected ? 'true' : 'false'}
            onClick={() => onRoleSelectionRequest(option.id)}
          >
            <span className="lumen-onboarding2-radio" aria-hidden="true" />
            <span>{option.label}</span>
          </LumenButton>
        ))}
      </div>
      <footer className="lumen-onboarding2-role-actions">
        <LumenButton
          className="lumen-onboarding2-back"
          indicator="none"
          variant="outlined"
          data-onboarding2-back
          onClick={onBackRequest}
        >
          {form.backLabel}
        </LumenButton>
        <LumenButton
          className="lumen-onboarding2-primary"
          indicator="none"
          tone="primary"
          data-onboarding2-continue-role
          onClick={onContinueRequest}
        >
          {form.continueLabel}
        </LumenButton>
      </footer>
    </form>
  )
}

export function LumenOnboarding2Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding2ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding2-reference',
    'hbar-app-ui-onboarding-variant-2',
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
      className="lumen-onboarding2-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={2}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
      data-onboarding2-step={content.currentStepId}
    >
      <div className="lumen-onboarding2-rail">
        <ol className="lumen-onboarding2-step-list" data-onboarding2-step-list>
          {content.steps.map((step, index) => (
            <li key={step.id} className="lumen-onboarding2-step-item">
              <LumenButton
                className={`lumen-onboarding2-step-action is-${step.status}`}
                indicator="none"
                variant="text"
                data-onboarding2-step-id={step.id}
                data-step-status={step.status}
                onClick={() => viewModel.onStepNavigationRequest(step.id)}
              >
                <span className="lumen-onboarding2-step-number" aria-hidden="true">
                  {step.status === 'complete' ? (
                    <Check className="lumen-onboarding2-complete-icon" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="lumen-onboarding2-step-copy">
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </span>
              </LumenButton>
              {index < content.steps.length - 1 ? (
                <span className="lumen-onboarding2-step-connector" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      <main className="lumen-onboarding2-panel">
        <p className="lumen-onboarding2-narrow-progress">{content.narrowProgressText}</p>
        <div className="lumen-onboarding2-panel-content">
          {content.profileForm ? (
            <ProfileForm
              variantId={variantId}
              form={content.profileForm}
              onFieldChange={viewModel.onProfileFieldChange}
              onContinue={viewModel.onContinueProfile}
            />
          ) : null}
          {content.roleForm ? (
            <RoleForm
              form={content.roleForm}
              onRoleSelectionRequest={viewModel.onRoleSelectionRequest}
              onBackRequest={viewModel.onBackRequest}
              onContinueRequest={viewModel.onContinueRoleRequest}
            />
          ) : null}
        </div>
      </main>
    </LumenSurface>
  )
}
