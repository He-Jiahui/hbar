'use client'

import * as React from 'react'
import { Copy, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { LumenInput, LumenSelect } from './forms'
import { LumenButton, LumenStatus } from './primitives'
import './settings-form-4-reference.css'

export type LumenSettingsForm4RoleId = 'owner' | 'admin' | 'member' | 'billing' | 'viewer'

export interface LumenSettingsForm4RoleOption {
  readonly id: Exclude<LumenSettingsForm4RoleId, 'owner'>
  readonly label: string
}

export interface LumenSettingsForm4Labels {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly inviteTitle: string
  readonly inviteDescription: string
  readonly emailLabel: string
  readonly emailPlaceholder: string
  readonly inviteRoleLabel: string
  readonly sendInvite: string
  readonly active: string
  readonly invited: string
  readonly owner: string
  readonly emptyMembers: string
  readonly copyEmailAddress: string
  readonly removeFromTeam: string
  readonly invitationSent: string
  readonly emailCopied: string
  readonly copyFailed: string
  readonly actionsFor: (name: string) => string
  readonly roleFor: (name: string) => string
}

export interface LumenSettingsForm4MemberView {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly email: string
  readonly emailDetail: string
  readonly status: 'active' | 'invited'
  readonly statusLabel: string
  readonly roleId: LumenSettingsForm4RoleId
  readonly roleLabel: string
  readonly roleAccessibleName: string
  readonly actionsAccessibleName: string
  readonly roleOptions: readonly LumenSettingsForm4RoleOption[]
  readonly owner: boolean
  readonly menuOpen: boolean
  readonly copyPending: boolean
  readonly canRequestRemoval: boolean
}

export interface LumenSettingsForm4PreviewContent {
  readonly labels: LumenSettingsForm4Labels
  readonly inviteEmail: string
  readonly inviteRoleId: Exclude<LumenSettingsForm4RoleId, 'owner'>
  readonly inviteRoleOptions: readonly LumenSettingsForm4RoleOption[]
  readonly members: readonly LumenSettingsForm4MemberView[]
  readonly seatSummary: string | undefined
  readonly seatProgress: number
  readonly footerMessage: string | undefined
}

function isAssignableRoleId(value: string): value is Exclude<LumenSettingsForm4RoleId, 'owner'> {
  return value === 'admin' || value === 'member' || value === 'billing' || value === 'viewer'
}

export interface LumenSettingsForm4ReferenceProps {
  readonly instanceId: string
  readonly content: LumenSettingsForm4PreviewContent
  readonly onInviteEmailChange: (value: string) => void
  readonly onInviteRoleChange: (roleId: Exclude<LumenSettingsForm4RoleId, 'owner'>) => void
  readonly onInviteSubmit: () => void
  readonly onMemberRoleChange: (memberId: string, roleId: Exclude<LumenSettingsForm4RoleId, 'owner'>) => void
  readonly onToggleMemberMenu: (memberId: string) => void
  readonly onCopyEmail: (memberId: string, email: string) => void | Promise<void>
  readonly onRemoveMember: (memberId: string) => void
  readonly onCloseMenu: () => void
}

export type LumenSettingsForm4ViewModel = Omit<LumenSettingsForm4ReferenceProps, 'instanceId'>

function SettingsForm4MemberRow({
  instanceId,
  member,
  labels,
  onRoleChange,
  onToggleMenu,
  onCopyEmail,
  onRemoveMember,
  onCloseMenu,
}: {
  readonly instanceId: string
  readonly member: LumenSettingsForm4ReferenceProps['content']['members'][number]
  readonly labels: LumenSettingsForm4ReferenceProps['content']['labels']
  readonly onRoleChange: LumenSettingsForm4ReferenceProps['onMemberRoleChange']
  readonly onToggleMenu: LumenSettingsForm4ReferenceProps['onToggleMemberMenu']
  readonly onCopyEmail: LumenSettingsForm4ReferenceProps['onCopyEmail']
  readonly onRemoveMember: LumenSettingsForm4ReferenceProps['onRemoveMember']
  readonly onCloseMenu: LumenSettingsForm4ReferenceProps['onCloseMenu']
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuId = `${instanceId}-${member.id}-actions`
  const roleId = `${instanceId}-${member.id}-role`

  React.useEffect(() => {
    if (member.menuOpen) {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    }
  }, [member.menuOpen])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    onCloseMenu()
    triggerRef.current?.focus()
  }

  const handleCopyEmail = () => {
    void onCopyEmail(member.id, member.email)
    triggerRef.current?.focus()
  }

  const handleRemove = () => {
    onRemoveMember(member.id)
    triggerRef.current?.focus()
  }

  return (
    <li className="lumen-settings-form-4-member-row" data-owner={member.owner || undefined}>
      <div className="lumen-settings-form-4-member-line">
        <div className="lumen-settings-form-4-member-primary">
          <span className="lumen-settings-form-4-avatar" aria-hidden="true">
            {member.initials}
          </span>
          <div className="lumen-settings-form-4-member-copy">
            <p>{member.name}</p>
            <p>{member.emailDetail}</p>
          </div>
        </div>
        <div className="lumen-settings-form-4-member-secondary">
          <LumenStatus value={member.statusLabel} tone={member.status === 'invited' ? 'warning' : 'neutral'} />
          {member.owner ? (
            <p className="lumen-settings-form-4-owner-role">{member.roleLabel}</p>
          ) : (
            <div className="lumen-settings-form-4-role-control">
              <label className="lumen-settings-form-4-visually-hidden" htmlFor={roleId}>
                {member.roleAccessibleName}
              </label>
              <LumenSelect
                id={roleId}
                className="lumen-settings-form-4-select"
                variant="boxed"
                value={member.roleId}
                onChange={(event) => {
                  const roleId = event.currentTarget.value
                  if (isAssignableRoleId(roleId)) {
                    onRoleChange(member.id, roleId)
                  }
                }}
              >
                {member.roleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </LumenSelect>
            </div>
          )}
        </div>
        <div className="lumen-settings-form-4-menu-anchor">
          <button
            ref={triggerRef}
            className="lumen-settings-form-4-menu-trigger"
            type="button"
            aria-label={member.actionsAccessibleName}
            aria-haspopup="menu"
            aria-expanded={member.menuOpen}
            aria-controls={member.menuOpen ? menuId : undefined}
            disabled={member.copyPending}
            onClick={() => onToggleMenu(member.id)}
          >
            <MoreHorizontal className="lumen-settings-form-4-icon lumen-settings-form-4-icon-sm" aria-hidden="true" />
          </button>
          {member.menuOpen ? (
            <div
              id={menuId}
              ref={menuRef}
              className="lumen-settings-form-4-menu"
              role="menu"
              tabIndex={-1}
              aria-label={member.actionsAccessibleName}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                className="lumen-settings-form-4-menu-item"
                type="button"
                role="menuitem"
                onClick={handleCopyEmail}
              >
                <Copy className="lumen-settings-form-4-icon lumen-settings-form-4-icon-sm" aria-hidden="true" />
                <span>{labels.copyEmailAddress}</span>
              </button>
              {member.canRequestRemoval ? (
                <button
                  className="lumen-settings-form-4-menu-item"
                  type="button"
                  role="menuitem"
                  onClick={handleRemove}
                >
                  <Trash2 className="lumen-settings-form-4-icon lumen-settings-form-4-icon-sm" aria-hidden="true" />
                  <span>{labels.removeFromTeam}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function LumenSettingsForm4Reference({
  instanceId,
  content,
  onInviteEmailChange,
  onInviteRoleChange,
  onInviteSubmit,
  onMemberRoleChange,
  onToggleMemberMenu,
  onCopyEmail,
  onRemoveMember,
  onCloseMenu,
}: LumenSettingsForm4ReferenceProps): React.ReactElement {
  const inviteEmailId = `${instanceId}-invite-email`
  const inviteRoleId = `${instanceId}-invite-role`
  const panelHeadingId = `${instanceId}-team-access-title`

  return (
    <div className="lumen-settings-form-4-reference" data-hbar-app-ui-component="hbar-app-ui-settings-form-4">
      <header className="lumen-settings-form-4-page-heading">
        <div className="lumen-settings-form-4-page-heading-inner">
          <h2>{content.labels.pageTitle}</h2>
        </div>
      </header>
      <div className="lumen-settings-form-4-content-scroll">
        <div className="lumen-settings-form-4-content-shell">
          <div className="lumen-settings-form-4-panel">
            <div className="lumen-settings-form-4-panel-heading">
              <h3 id={panelHeadingId}>{content.labels.panelTitle}</h3>
              <p>{content.labels.panelDescription}</p>
            </div>
            <div className="lumen-settings-form-4-invite">
              <div className="lumen-settings-form-4-invite-copy">
                <p>{content.labels.inviteTitle}</p>
                <p>{content.labels.inviteDescription}</p>
              </div>
              <form
                className="lumen-settings-form-4-invite-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  onInviteSubmit()
                }}
              >
                <label className="lumen-settings-form-4-visually-hidden" htmlFor={inviteEmailId}>
                  {content.labels.emailLabel}
                </label>
                <LumenInput
                  id={inviteEmailId}
                  className="lumen-settings-form-4-input"
                  type="email"
                  value={content.inviteEmail}
                  placeholder={content.labels.emailPlaceholder}
                  variant="boxed"
                  onChange={(event) => onInviteEmailChange(event.currentTarget.value)}
                />
                <label className="lumen-settings-form-4-visually-hidden" htmlFor={inviteRoleId}>
                  {content.labels.inviteRoleLabel}
                </label>
                <LumenSelect
                  id={inviteRoleId}
                  className="lumen-settings-form-4-invite-role"
                  value={content.inviteRoleId}
                  variant="boxed"
                  onChange={(event) => {
                    const roleId = event.currentTarget.value
                    if (isAssignableRoleId(roleId)) {
                      onInviteRoleChange(roleId)
                    }
                  }}
                >
                  {content.inviteRoleOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </LumenSelect>
                <LumenButton
                  className="lumen-settings-form-4-invite-button"
                  type="submit"
                  tone="primary"
                  indicator="none"
                >
                  <Plus className="lumen-settings-form-4-icon lumen-settings-form-4-icon-md" aria-hidden="true" />
                  <span>{content.labels.sendInvite}</span>
                </LumenButton>
              </form>
            </div>
            <ul className="lumen-settings-form-4-member-list">
              {content.members.map((member) => (
                <SettingsForm4MemberRow
                  key={member.id}
                  instanceId={instanceId}
                  member={member}
                  labels={content.labels}
                  onRoleChange={onMemberRoleChange}
                  onToggleMenu={onToggleMemberMenu}
                  onCopyEmail={onCopyEmail}
                  onRemoveMember={onRemoveMember}
                  onCloseMenu={onCloseMenu}
                />
              ))}
              {content.members.length === 0 ? (
                <li className="lumen-settings-form-4-empty-members">{content.labels.emptyMembers}</li>
              ) : null}
            </ul>
            <div className="lumen-settings-form-4-seat-footer">
              {content.footerMessage ? (
                <p aria-live="polite">{content.footerMessage}</p>
              ) : (
                <React.Fragment>
                  <p>{content.seatSummary}</p>
                  <div className="lumen-settings-form-4-seat-meter" aria-hidden="true">
                    <span style={{ inlineSize: `${content.seatProgress}%` }} />
                  </div>
                </React.Fragment>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
