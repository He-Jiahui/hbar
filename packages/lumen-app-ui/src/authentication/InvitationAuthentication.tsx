'use client'

import * as React from 'react'
import { Check, Eye, EyeOff, Folder, Users } from 'lucide-react'
import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import { Folder as LegacyFolder, Users as LegacyUsers } from './glyphs'
import {
  type LumenAuthCompositionProps,
  AuthBrand,
  AuthButton,
  AuthDivider,
  AuthField,
  AuthFrame,
  AuthIcon,
  AuthPasswordButton,
  AuthProviderIcon,
} from './primitives'
import { type LumenAuthInvitationContent, uniqueLumenAuthItems } from './content'

export type InvitationAuthenticationProps = LumenAuthCompositionProps & {
  readonly content: LumenAuthInvitationContent
}

export function InvitationAuthentication({ spec, onAction, content }: InvitationAuthenticationProps) {
  if (content.referenceFlow) {
    return <ReferenceInvitationAuthentication spec={spec} onAction={onAction} content={content} />
  }
  return <LegacyInvitationAuthentication spec={spec} onAction={onAction} content={content} />
}

function ReferenceInvitationAuthentication({ spec, onAction, content }: InvitationAuthenticationProps) {
  const flow = content.referenceFlow
  if (!flow) {
    return null
  }
  const members = uniqueLumenAuthItems(content.members)
  const projects = uniqueLumenAuthItems(content.projects)
  const canAccept = flow.fullName.trim().length > 1 && flow.password.length >= 10
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-invitation-reference">
      <div className="hbar-app-ui-auth-invitation-reference-layout hbar-app-ui-full-canvas-owner">
        <div className="hbar-app-ui-auth-invitation-reference-left">
          <div className="hbar-app-ui-auth-invitation-reference-brand">
            <span>{content.labels.brand.slice(0, 1)}</span>
            {content.labels.brand}
          </div>
          <div className={`hbar-app-ui-auth-invitation-reference-main ${flow.phase === 'success' ? 'is-success' : ''}`}>
            {flow.phase === 'success' ? (
              <React.Fragment>
                <span className="hbar-app-ui-auth-invitation-reference-success-icon">
                  <AuthIcon tier="xl">
                    <Check />
                  </AuthIcon>
                </span>
                <h1>{flow.labels.successTitle}</h1>
                <p className="hbar-app-ui-auth-invitation-reference-success-description">
                  {flow.labels.successDescription(content.organization.name)}
                </p>
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-invitation-reference-open"
                  onClick={() => onAction?.({ variantId: spec.id, actionId: 'open-workspace' })}
                >
                  {flow.labels.openWorkspace(content.organization.name)}
                </LumenButton>
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-invitation-reference-review"
                  onClick={flow.onReview}
                >
                  {flow.labels.review}
                </LumenButton>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="hbar-app-ui-auth-invitation-reference-inviter">
                  <span>{content.inviter.initials}</span>
                  <p>
                    <span className="is-emphasized">{content.inviter.name}</span>
                    {flow.labels.invitationAfterName(content.inviter.role)}
                  </p>
                </div>
                <h1>{content.labels.title}</h1>
                <p className="hbar-app-ui-auth-invitation-reference-description">
                  {flow.labels.descriptionBeforeEmail}
                  <span className="is-emphasized">{content.inviteeEmail}</span>
                  {flow.labels.descriptionAfterEmail(content.expiry)}
                </p>
                <LumenButton
                  type="button"
                  indicator="none"
                  className="hbar-app-ui-auth-invitation-reference-google"
                  onClick={() => onAction?.({ variantId: spec.id, actionId: 'google' })}
                >
                  <AuthProviderIcon kind="google" />
                  {content.labels.google}
                </LumenButton>
                <div className="hbar-app-ui-auth-invitation-reference-divider">
                  <span />
                  {content.labels.divider}
                  <span />
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (canAccept) {
                      flow.onSubmit()
                    }
                  }}
                >
                  <div className="hbar-app-ui-auth-invitation-reference-field">
                    <label htmlFor={`${spec.id}-full-name`}>{content.labels.fullNameLabel}</label>
                    <LumenInput
                      id={`${spec.id}-full-name`}
                      value={flow.fullName}
                      placeholder={content.labels.fullNamePlaceholder}
                      onChange={(event) => flow.onFullNameChange(event.currentTarget.value)}
                    />
                  </div>
                  <div className="hbar-app-ui-auth-invitation-reference-field">
                    <label htmlFor={`${spec.id}-password`}>{content.labels.passwordLabel}</label>
                    <span className="hbar-app-ui-auth-invitation-reference-password">
                      <LumenInput
                        id={`${spec.id}-password`}
                        type={flow.passwordVisible ? 'text' : 'password'}
                        value={flow.password}
                        placeholder={content.labels.passwordPlaceholder}
                        onChange={(event) => flow.onPasswordChange(event.currentTarget.value)}
                      />
                      <LumenButton
                        type="button"
                        indicator="none"
                        aria-label={flow.passwordVisible ? content.labels.hidePassword : content.labels.showPassword}
                        onClick={flow.onTogglePassword}
                      >
                        <AuthIcon tier="sm">{flow.passwordVisible ? <EyeOff /> : <Eye />}</AuthIcon>
                      </LumenButton>
                    </span>
                  </div>
                  <LumenButton
                    type="submit"
                    indicator="none"
                    className="hbar-app-ui-auth-invitation-reference-accept"
                    disabled={!canAccept}
                  >
                    {content.labels.accept}
                  </LumenButton>
                  <p className="hbar-app-ui-auth-invitation-reference-decline">
                    {flow.labels.declinePrompt}
                    <LumenButton
                      type="button"
                      indicator="none"
                      onClick={() => onAction?.({ variantId: spec.id, actionId: 'decline' })}
                    >
                      {flow.labels.declineAction}
                    </LumenButton>
                  </p>
                </form>
              </React.Fragment>
            )}
          </div>
        </div>
        <aside className="hbar-app-ui-auth-invitation-reference-aside">
          <p className="hbar-app-ui-auth-invitation-reference-eyebrow">{content.labels.whatJoining}</p>
          <div className="hbar-app-ui-auth-invitation-reference-org">
            <span>{content.organization.initials}</span>
            <div>
              <p>{content.organization.name}</p>
              <p>{content.organization.domain}</p>
            </div>
          </div>
          <div className="hbar-app-ui-auth-invitation-reference-members">
            <div>
              {members.map((member) => (
                <span className={member.kind === 'count' ? 'is-count' : ''} key={member.id}>
                  {member.initials}
                </span>
              ))}
            </div>
            <AuthIcon tier="sm">
              <Users />
            </AuthIcon>
            {content.labels.memberCount(content.memberCount)}
          </div>
          <p className="hbar-app-ui-auth-invitation-reference-projects-title">{content.labels.projectsShared}</p>
          <ul
            className="hbar-app-ui-auth-invitation-reference-projects"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {projects.map((project) => (
              <li className="hbar-app-ui-auth-invitation-reference-project-row" key={project.id}>
                <span>
                  <AuthIcon tier="sm">
                    <Folder />
                  </AuthIcon>
                </span>
                <div>
                  <span>{project.name}</span>
                  <small>{project.summary}</small>
                </div>
              </li>
            ))}
            {!projects.length && (
              <li className="hbar-app-ui-auth-invitation-reference-empty">{content.labels.emptyProjects}</li>
            )}
          </ul>
          <p className="hbar-app-ui-auth-invitation-reference-role-note">{content.labels.roleNote}</p>
        </aside>
      </div>
    </AuthFrame>
  )
}

function LegacyInvitationAuthentication({ spec, onAction, content }: InvitationAuthenticationProps) {
  const [fullName, setFullName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [visible, setVisible] = React.useState(false)
  const canAccept = fullName.trim().length > 1 && password.length >= 10
  const members = React.useMemo(() => uniqueLumenAuthItems(content.members), [content.members])
  const projects = React.useMemo(() => uniqueLumenAuthItems(content.projects), [content.projects])
  return (
    <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-invitation-surface">
      <div className="hbar-app-ui-auth-invitation-layout">
        <main>
          <AuthBrand label={content.labels.brand} />
          <div className="hbar-app-ui-auth-invite-head">
            <span className="hbar-app-ui-auth-avatar">{content.inviter.initials}</span>
            <div>
              <strong>{content.labels.invitationNotice(content.inviter.name, content.inviter.role)}</strong>
            </div>
          </div>
          <h1>{content.labels.title}</h1>
          <p>{content.labels.description(content.inviteeEmail, content.expiry)}</p>
          <AuthButton
            type="button"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'google',
              })
            }
          >
            {content.labels.google}
          </AuthButton>
          <AuthDivider label={content.labels.divider} />
          <AuthField
            label={content.labels.fullNameLabel}
            placeholder={content.labels.fullNamePlaceholder}
            value={fullName}
            onChange={setFullName}
          />
          <div className="hbar-app-ui-auth-field">
            <span>{content.labels.passwordLabel}</span>
            <div className="hbar-app-ui-auth-input-wrap">
              <LumenInput
                type={visible ? 'text' : 'password'}
                placeholder={content.labels.passwordPlaceholder}
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              <AuthPasswordButton
                visible={visible}
                showLabel={content.labels.showPassword}
                hideLabel={content.labels.hidePassword}
                onToggle={() => setVisible((current) => !current)}
              />
            </div>
          </div>
          <AuthButton
            type="button"
            tone="accent"
            disabled={!canAccept}
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'accept',
              })
            }
          >
            {content.labels.accept}
          </AuthButton>
          <LumenButton
            type="button"
            className="hbar-app-ui-auth-inline-link"
            onClick={() =>
              onAction?.({
                variantId: spec.id,
                actionId: 'decline',
              })
            }
          >
            {content.labels.decline}
          </LumenButton>
        </main>
        <aside>
          <span className="hbar-app-ui-auth-eyebrow">{content.labels.whatJoining}</span>
          <div className="hbar-app-ui-auth-org-header">
            <span className="hbar-app-ui-auth-org-mark">{content.organization.initials}</span>
            <div>
              <strong>{content.organization.name}</strong>
              <small>{content.organization.domain}</small>
            </div>
          </div>
          <div className="hbar-app-ui-auth-avatar-line">
            <div className="hbar-app-ui-auth-avatar-stack">
              {members.map((member) => (
                <span className="hbar-app-ui-auth-avatar" key={member.id}>
                  {member.initials}
                </span>
              ))}
              <small>{content.labels.memberCount(content.memberCount)}</small>
            </div>
            <AuthIcon>
              <LegacyUsers />
            </AuthIcon>
          </div>
          <div className="hbar-app-ui-auth-invite-projects">
            <h2>{content.labels.projectsShared}</h2>
            <div
              className={`hbar-app-ui-auth-project-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            >
              {projects.map((project) => (
                <div className="hbar-app-ui-auth-project-row" key={project.id}>
                  <AuthIcon>
                    <LegacyFolder />
                  </AuthIcon>
                  <span className="hbar-app-ui-auth-project-copy">
                    <strong>{project.name}</strong>
                    <small>{project.summary}</small>
                  </span>
                </div>
              ))}
              {!projects.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyProjects}</p>}
            </div>
          </div>
          <p className="hbar-app-ui-auth-footer-note">{content.labels.roleNote}</p>
        </aside>
      </div>
    </AuthFrame>
  )
}
