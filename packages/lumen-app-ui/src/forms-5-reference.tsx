'use client'

import * as React from 'react'
import { Check, ChevronDown, Circle, Eye, EyeOff } from 'lucide-react'
import { LumenInput } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-5-reference.css'

export type LumenForms5TextFieldId =
  'organisationName' | 'workspaceAddress' | 'adminEmail' | 'password' | 'confirmPassword'
export type LumenForms5PasswordRequirementId = 'minimumLength' | 'mixedCase' | 'number' | 'symbol'

export interface LumenForms5RegionChoice {
  readonly id: string
  readonly label: string
}

export interface LumenForms5PlanChoice {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly priceLabel: string
}

export interface LumenForms5Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly organisationNameLabel: string
  readonly organisationNamePlaceholder: string
  readonly organisationNameHelper: string
  readonly workspaceAddressLabel: string
  readonly workspaceAddressPlaceholder: string
  readonly workspaceAddressSuffix: string
  readonly workspaceAddressHelper: string
  readonly adminEmailLabel: string
  readonly adminEmailPlaceholder: string
  readonly adminEmailHelper: string
  readonly passwordLabel: string
  readonly passwordPlaceholder: string
  readonly showPasswordLabel: string
  readonly hidePasswordLabel: string
  readonly confirmPasswordLabel: string
  readonly confirmPasswordPlaceholder: string
  readonly confirmPasswordHelper: string
  readonly dataRegionLabel: string
  readonly dataRegionHelper: string
  readonly planLegend: string
  readonly consentLabel: string
  readonly createWorkspaceLabel: string
  readonly statusText: string
  readonly requiredMarker: string
}

export interface LumenForms5PasswordRequirements {
  readonly minimumLength: { readonly label: string; readonly met: boolean }
  readonly mixedCase: { readonly label: string; readonly met: boolean }
  readonly number: { readonly label: string; readonly met: boolean }
  readonly symbol: { readonly label: string; readonly met: boolean }
}

export interface LumenForms5Content {
  readonly copy: LumenForms5Copy
  readonly organisationName: { readonly value: string; readonly valid: boolean }
  readonly workspaceAddress: {
    readonly value: string
    readonly suffix: string
    readonly valid: boolean
    readonly availability: string | null
  }
  readonly adminEmail: { readonly value: string; readonly valid: boolean }
  readonly password: {
    readonly value: string
    readonly visible: boolean
    readonly requirements: LumenForms5PasswordRequirements
  }
  readonly confirmPassword: { readonly value: string; readonly matches: boolean }
  readonly dataRegion: {
    readonly selectedId: string
    readonly choices: readonly LumenForms5RegionChoice[]
  }
  readonly plan: {
    readonly selectedId: string
    readonly choices: readonly LumenForms5PlanChoice[]
  }
  readonly consent: { readonly checked: boolean }
  readonly createWorkspaceEnabled: boolean
  readonly statusText: string
}

export interface LumenForms5ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms5Content
  readonly onTextChange: (fieldId: LumenForms5TextFieldId, value: string) => void
  readonly onCheckWorkspaceAddress: (value: string) => void
  readonly onPasswordVisibilityToggle: () => void
  readonly onRegionChange: (regionId: string) => void
  readonly onPlanChange: (planId: string) => void
  readonly onConsentChange: (checked: boolean) => void
  readonly onCreateWorkspace: () => void
}

function RequiredLabel({
  id,
  label,
  marker,
}: {
  readonly id: string
  readonly label: string
  readonly marker: string
}) {
  return (
    <label className="lumen-forms-5-label" htmlFor={id}>
      <span>{label}</span>
      <span className="lumen-forms-5-required" aria-hidden="true">
        {marker}
      </span>
    </label>
  )
}

function RegionCombobox({
  id,
  selectedId,
  choices,
  onChange,
}: {
  readonly id: string
  readonly selectedId: string
  readonly choices: readonly LumenForms5RegionChoice[]
  readonly onChange: (regionId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = choices.find((choice) => choice.id === selectedId)

  return (
    <div
      className="lumen-forms-5-region-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
        }
      }}
    >
      <LumenButton
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        variant="outlined"
        size="s"
        indicator="none"
        className="lumen-forms-5-region-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
          }
          if (event.key === 'ArrowDown' && !open) {
            setOpen(true)
          }
        }}
      >
        <span>{selected?.label ?? ''}</span>
        <ChevronDown className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
      </LumenButton>
      {open ? (
        <ul className="lumen-forms-5-region-options" id={`${id}-options`} role="listbox">
          {choices.map((choice) => (
            <li
              key={choice.id}
              className="lumen-forms-5-region-option"
              role="option"
              aria-selected={choice.id === selectedId}
              tabIndex={0}
              onClick={() => {
                onChange(choice.id)
                setOpen(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onChange(choice.id)
                  setOpen(false)
                }
                if (event.key === 'Escape') {
                  setOpen(false)
                }
              }}
            >
              <span>{choice.label}</span>
              {choice.id === selectedId ? (
                <Check className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function LumenForms5Reference({
  instanceId,
  content,
  onTextChange,
  onCheckWorkspaceAddress,
  onPasswordVisibilityToggle,
  onRegionChange,
  onPlanChange,
  onConsentChange,
  onCreateWorkspace,
}: LumenForms5ReferenceProps): React.ReactElement {
  const ids = {
    organisationName: `${instanceId}-organisation-name`,
    workspaceAddress: `${instanceId}-workspace-address`,
    adminEmail: `${instanceId}-admin-email`,
    password: `${instanceId}-password`,
    confirmPassword: `${instanceId}-confirm-password`,
    dataRegion: `${instanceId}-data-region`,
    consent: `${instanceId}-consent`,
  }
  const passwordRequirementEntries: readonly [
    LumenForms5PasswordRequirementId,
    { readonly label: string; readonly met: boolean },
  ][] = [
    ['minimumLength', content.password.requirements.minimumLength],
    ['mixedCase', content.password.requirements.mixedCase],
    ['number', content.password.requirements.number],
    ['symbol', content.password.requirements.symbol],
  ]

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-5-surface"
      contentClassName="lumen-forms-5-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-5"
      data-hbar-app-ui-list-strategy="pane-scroll"
    >
      <div className="lumen-forms-5-heading" data-hbar-app-ui-region="workspace-heading">
        <h2>{content.copy.pageTitle}</h2>
        <p>{content.copy.pageDescription}</p>
      </div>

      <div
        className="lumen-forms-5-fields"
        data-hbar-app-ui-region="workspace-fields"
        data-hbar-app-ui-scroll-owner="workspace-form"
      >
        <div className="lumen-forms-5-field">
          <RequiredLabel
            id={ids.organisationName}
            label={content.copy.organisationNameLabel}
            marker={content.copy.requiredMarker}
          />
          <LumenInput
            id={ids.organisationName}
            autoComplete="organization"
            aria-invalid={content.organisationName.value.length > 0 && !content.organisationName.valid}
            aria-describedby={`${ids.organisationName}-helper`}
            value={content.organisationName.value}
            placeholder={content.copy.organisationNamePlaceholder}
            required
            variant="boxed"
            onChange={(event) => onTextChange('organisationName', event.currentTarget.value)}
          />
          <p className="lumen-forms-5-helper" id={`${ids.organisationName}-helper`}>
            {content.copy.organisationNameHelper}
          </p>
        </div>

        <div className="lumen-forms-5-field">
          <RequiredLabel
            id={ids.workspaceAddress}
            label={content.copy.workspaceAddressLabel}
            marker={content.copy.requiredMarker}
          />
          <div className="lumen-forms-5-domain-control">
            <LumenInput
              id={ids.workspaceAddress}
              autoComplete="off"
              aria-invalid={content.workspaceAddress.value.length > 0 && !content.workspaceAddress.valid}
              aria-describedby={`${ids.workspaceAddress}-helper`}
              value={content.workspaceAddress.value}
              placeholder={content.copy.workspaceAddressPlaceholder}
              pattern="[a-z0-9-]+"
              required
              variant="plain"
              onChange={(event) => {
                const value = event.currentTarget.value
                onTextChange('workspaceAddress', value)
                if (value) {
                  onCheckWorkspaceAddress(value)
                }
              }}
            />
            <span className="lumen-forms-5-domain-suffix">{content.workspaceAddress.suffix}</span>
          </div>
          <p className="lumen-forms-5-helper" id={`${ids.workspaceAddress}-helper`}>
            {content.copy.workspaceAddressHelper}
          </p>
          {content.workspaceAddress.availability ? (
            <p className="lumen-forms-5-availability" aria-live="polite">
              {content.workspaceAddress.availability}
            </p>
          ) : null}
        </div>

        <div className="lumen-forms-5-field">
          <RequiredLabel
            id={ids.adminEmail}
            label={content.copy.adminEmailLabel}
            marker={content.copy.requiredMarker}
          />
          <LumenInput
            id={ids.adminEmail}
            type="email"
            autoComplete="email"
            aria-invalid={content.adminEmail.value.length > 0 && !content.adminEmail.valid}
            aria-describedby={`${ids.adminEmail}-helper`}
            value={content.adminEmail.value}
            placeholder={content.copy.adminEmailPlaceholder}
            required
            variant="boxed"
            onChange={(event) => onTextChange('adminEmail', event.currentTarget.value)}
          />
          <p className="lumen-forms-5-helper" id={`${ids.adminEmail}-helper`}>
            {content.copy.adminEmailHelper}
          </p>
        </div>

        <div className="lumen-forms-5-password-fields">
          <div className="lumen-forms-5-field">
            <RequiredLabel id={ids.password} label={content.copy.passwordLabel} marker={content.copy.requiredMarker} />
            <div className="lumen-forms-5-password-control">
              <LumenInput
                id={ids.password}
                type={content.password.visible ? 'text' : 'password'}
                autoComplete="new-password"
                aria-invalid={
                  content.password.value.length > 0 && passwordRequirementEntries.some(([, rule]) => !rule.met)
                }
                aria-describedby={`${ids.password}-requirements`}
                value={content.password.value}
                placeholder={content.copy.passwordPlaceholder}
                required
                variant="plain"
                onChange={(event) => onTextChange('password', event.currentTarget.value)}
              />
              <LumenButton
                type="button"
                variant="text"
                size="s"
                indicator="none"
                aria-label={content.password.visible ? content.copy.hidePasswordLabel : content.copy.showPasswordLabel}
                className="lumen-forms-5-password-toggle"
                onClick={onPasswordVisibilityToggle}
              >
                {content.password.visible ? (
                  <EyeOff className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
                ) : (
                  <Eye className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
                )}
              </LumenButton>
            </div>
          </div>

          <div className="lumen-forms-5-field">
            <RequiredLabel
              id={ids.confirmPassword}
              label={content.copy.confirmPasswordLabel}
              marker={content.copy.requiredMarker}
            />
            <LumenInput
              id={ids.confirmPassword}
              type="password"
              autoComplete="new-password"
              aria-invalid={content.confirmPassword.value.length > 0 && !content.confirmPassword.matches}
              aria-describedby={`${ids.confirmPassword}-helper`}
              value={content.confirmPassword.value}
              placeholder={content.copy.confirmPasswordPlaceholder}
              required
              variant="boxed"
              onChange={(event) => onTextChange('confirmPassword', event.currentTarget.value)}
            />
            <p className="lumen-forms-5-helper" id={`${ids.confirmPassword}-helper`}>
              {content.copy.confirmPasswordHelper}
            </p>
          </div>
        </div>

        <ul className="lumen-forms-5-password-requirements" id={`${ids.password}-requirements`}>
          {passwordRequirementEntries.map(([id, requirement]) => (
            <li className="lumen-forms-5-password-requirement" data-met={requirement.met} key={id}>
              {requirement.met ? (
                <Check className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
              ) : (
                <Circle className="lumen-forms-5-icon lumen-forms-5-icon-xs" aria-hidden="true" />
              )}
              <span>{requirement.label}</span>
            </li>
          ))}
        </ul>

        <div className="lumen-forms-5-field">
          <label className="lumen-forms-5-label" htmlFor={ids.dataRegion}>
            {content.copy.dataRegionLabel}
          </label>
          <RegionCombobox
            id={ids.dataRegion}
            selectedId={content.dataRegion.selectedId}
            choices={content.dataRegion.choices}
            onChange={onRegionChange}
          />
          <p className="lumen-forms-5-helper">{content.copy.dataRegionHelper}</p>
        </div>

        <fieldset className="lumen-forms-5-plan-fieldset">
          <legend className="lumen-forms-5-label">{content.copy.planLegend}</legend>
          <div className="lumen-forms-5-plan-options">
            {content.plan.choices.map((plan) => (
              <label
                className="lumen-forms-5-plan-option"
                data-selected={plan.id === content.plan.selectedId}
                key={plan.id}
              >
                <span className="lumen-forms-5-plan-title">{plan.label}</span>
                <input
                  type="radio"
                  name={`${instanceId}-plan`}
                  value={plan.id}
                  checked={plan.id === content.plan.selectedId}
                  onChange={() => onPlanChange(plan.id)}
                />
                <span className="lumen-forms-5-plan-copy">
                  <p>{plan.description}</p>
                  <p className="lumen-forms-5-plan-price">{plan.priceLabel}</p>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="lumen-forms-5-consent">
          <input
            id={ids.consent}
            type="checkbox"
            checked={content.consent.checked}
            onChange={(event) => onConsentChange(event.currentTarget.checked)}
          />
          <span>{content.copy.consentLabel}</span>
        </label>
      </div>

      <div className="lumen-forms-5-footer" data-hbar-app-ui-region="workspace-footer">
        <LumenButton
          type="button"
          size="s"
          indicator="none"
          disabled={!content.createWorkspaceEnabled}
          className="lumen-forms-5-create-button"
          onClick={onCreateWorkspace}
        >
          {content.copy.createWorkspaceLabel}
        </LumenButton>
        <p aria-live="polite">{content.statusText}</p>
      </div>
    </LumenSurface>
  )
}

export type LumenForms5ViewModel = Omit<LumenForms5ReferenceProps, 'instanceId'>
