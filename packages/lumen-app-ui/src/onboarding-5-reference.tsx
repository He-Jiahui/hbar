'use client'

import { Copy, Plus, X } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenText } from './primitives'
import './onboarding-5-reference.css'

export interface LumenOnboarding5ReferenceRole {
  readonly id: string
  readonly label: string
}

export interface LumenOnboarding5ReferenceInvitation {
  readonly id: string
  readonly email: string
  readonly roleId: string
}

export interface LumenOnboarding5ReferenceContent {
  readonly title: string
  readonly detail: string
  readonly invitationLinkLabel: string
  readonly copyLinkLabel: string
  readonly emailColumnLabel: string
  readonly emailPlaceholder: string
  readonly roleColumnLabel: string
  readonly removeInvitationLabel: string
  readonly addAnotherLabel: string
  readonly skipLabel: string
  readonly sendInvitationsLabel: string
  readonly emptyRowsLabel: string
  readonly shareLink: string
  readonly invitationRows: readonly LumenOnboarding5ReferenceInvitation[]
  readonly roleOptions: readonly LumenOnboarding5ReferenceRole[]
}

export interface LumenOnboarding5ReferenceViewModel {
  readonly content: LumenOnboarding5ReferenceContent
  readonly onEmailChange: (invitationId: string, email: string) => void
  readonly onRoleChange: (invitationId: string, roleId: string) => void
  readonly onCopyRequest: () => void
  readonly onAddRequest: () => void
  readonly onRemoveRequest: (invitationId: string) => void
  readonly onSkipRequest: () => void
  readonly onSendRequest: () => void
}

export interface LumenOnboarding5ReferenceProps {
  readonly variantId: string
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly className?: string | undefined
  readonly viewModel: LumenOnboarding5ReferenceViewModel
}

export function LumenOnboarding5Reference({
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  viewModel,
}: LumenOnboarding5ReferenceProps) {
  const { content } = viewModel
  const rootClassName = [
    'lumen-onboarding',
    'lumen-onboarding5-reference',
    'hbar-app-ui-onboarding-variant-5',
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
      className="lumen-onboarding5-surface"
      contentClassName={rootClassName}
      data-lumen-component="onboarding"
      data-lumen-variant={5}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      <header className="lumen-onboarding5-header">
        <LumenText as="h2" variant="heading">
          {content.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.detail}
        </LumenText>
      </header>

      <div className="lumen-onboarding5-panel">
        <section className="lumen-onboarding5-link-card" aria-label={content.invitationLinkLabel}>
          <div className="lumen-onboarding5-link-header">
            <LumenText as="p">{content.invitationLinkLabel}</LumenText>
            <LumenButton indicator="none" variant="text" data-onboarding5-copy onClick={viewModel.onCopyRequest}>
              <Copy className="lumen-onboarding5-icon" aria-hidden="true" />
              {content.copyLinkLabel}
            </LumenButton>
          </div>
          <LumenText as="p" className="lumen-onboarding5-share-link" tone="muted">
            {content.shareLink}
          </LumenText>
        </section>

        <section className="lumen-onboarding5-invitations" aria-label={content.title}>
          {content.invitationRows.length ? (
            <div className="lumen-onboarding5-rows" data-onboarding5-invitation-list>
              {content.invitationRows.map((row, index) => (
                <div className="lumen-onboarding5-row" key={row.id} data-onboarding5-invitation-id={row.id}>
                  <div className="lumen-onboarding5-email-field">
                    {index === 0 ? (
                      <label htmlFor={`${variantId}-${row.id}-email`}>{content.emailColumnLabel}</label>
                    ) : null}
                    <input
                      id={`${variantId}-${row.id}-email`}
                      type="email"
                      aria-label={index === 0 ? undefined : content.emailPlaceholder}
                      placeholder={content.emailPlaceholder}
                      value={row.email}
                      onChange={(event) => viewModel.onEmailChange(row.id, event.currentTarget.value)}
                    />
                  </div>
                  <div className="lumen-onboarding5-role-field">
                    {index === 0 ? (
                      <label htmlFor={`${variantId}-${row.id}-role`}>{content.roleColumnLabel}</label>
                    ) : null}
                    <select
                      id={`${variantId}-${row.id}-role`}
                      aria-label={index === 0 ? undefined : content.roleColumnLabel}
                      value={row.roleId}
                      onChange={(event) => viewModel.onRoleChange(row.id, event.currentTarget.value)}
                    >
                      {content.roleOptions.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <LumenButton
                    className="lumen-onboarding5-remove"
                    indicator="none"
                    variant="text"
                    aria-label={content.removeInvitationLabel}
                    data-onboarding5-remove={row.id}
                    onClick={() => viewModel.onRemoveRequest(row.id)}
                  >
                    <X className="lumen-onboarding5-icon" aria-hidden="true" />
                  </LumenButton>
                </div>
              ))}
            </div>
          ) : (
            <LumenText as="p" className="lumen-onboarding5-empty" tone="muted">
              {content.emptyRowsLabel}
            </LumenText>
          )}
          <LumenButton
            className="lumen-onboarding5-add"
            indicator="none"
            variant="text"
            data-onboarding5-add
            onClick={viewModel.onAddRequest}
          >
            <Plus className="lumen-onboarding5-icon" aria-hidden="true" />
            {content.addAnotherLabel}
          </LumenButton>
        </section>
      </div>

      <footer className="lumen-onboarding5-actions">
        <LumenButton
          className="lumen-onboarding5-skip"
          indicator="none"
          variant="outlined"
          data-onboarding5-skip
          onClick={viewModel.onSkipRequest}
        >
          {content.skipLabel}
        </LumenButton>
        <LumenButton
          className="lumen-onboarding5-send"
          indicator="none"
          tone="primary"
          data-onboarding5-send
          onClick={viewModel.onSendRequest}
        >
          {content.sendInvitationsLabel}
        </LumenButton>
      </footer>
    </LumenSurface>
  )
}
