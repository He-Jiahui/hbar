import {Folder, Users} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {type HbarAppUiAuthInvitationContent, uniqueHbarAppUiAuthItems} from './AuthContent'
import {AuthBrand, AuthButton, AuthDivider, AuthField, AuthFrame, AuthIcon, AuthPasswordButton} from './AuthPrimitives'

export function InvitationAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthInvitationContent
}) {
    const [fullName, setFullName] = useState('')
    const [password, setPassword] = useState('')
    const [visible, setVisible] = useState(false)
    const canAccept = fullName.trim().length > 1 && password.length >= 10
    const members = useMemo(() => uniqueHbarAppUiAuthItems(content.members), [content.members])
    const projects = useMemo(() => uniqueHbarAppUiAuthItems(content.projects), [content.projects])
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-invitation-surface">
        <div className="hbar-app-ui-auth-invitation-layout">
            <main><AuthBrand label={content.labels.brand}/>
                <div className="hbar-app-ui-auth-invite-head"><span
                    className="hbar-app-ui-auth-avatar">{content.inviter.initials}</span>
                    <div><strong>{content.labels.invitationNotice(content.inviter.name, content.inviter.role)}</strong>
                    </div>
                </div>
                <h1>{content.labels.title}</h1><p>{content.labels.description(content.inviteeEmail, content.expiry)}</p>
                <AuthButton type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'google'
                })}>{content.labels.google}</AuthButton><AuthDivider label={content.labels.divider}/><AuthField
                    label={content.labels.fullNameLabel} placeholder={content.labels.fullNamePlaceholder}
                    value={fullName} onChange={setFullName}/>
                <div className="hbar-app-ui-auth-field"><span>{content.labels.passwordLabel}</span>
                    <div className="hbar-app-ui-auth-input-wrap"><input type={visible ? 'text' : 'password'}
                                                                        placeholder={content.labels.passwordPlaceholder}
                                                                        value={password}
                                                                        onChange={(event) => setPassword(event.currentTarget.value)}/><AuthPasswordButton
                        visible={visible} showLabel={content.labels.showPassword}
                        hideLabel={content.labels.hidePassword} onToggle={() => setVisible((current) => !current)}/>
                    </div>
                </div>
                <AuthButton type="button" tone="accent" disabled={!canAccept} onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'accept'
                })}>{content.labels.accept}</AuthButton>
                <button type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'decline'
                })}>{content.labels.decline}</button>
            </main>
            <aside><span className="hbar-app-ui-auth-eyebrow">{content.labels.whatJoining}</span>
                <div className="hbar-app-ui-auth-org-header"><span
                    className="hbar-app-ui-auth-org-mark">{content.organization.initials}</span>
                    <div><strong>{content.organization.name}</strong><small>{content.organization.domain}</small></div>
                </div>
                <div className="hbar-app-ui-auth-avatar-line">
                    <div className="hbar-app-ui-auth-avatar-stack">{members.map((member) => <span
                        className="hbar-app-ui-auth-avatar"
                        key={member.id}>{member.initials}</span>)}<small>{content.labels.memberCount(content.memberCount)}</small>
                    </div>
                    <AuthIcon><Users/></AuthIcon></div>
                <div className="hbar-app-ui-auth-invite-projects"><h2>{content.labels.projectsShared}</h2>
                    <div
                        className={`hbar-app-ui-auth-project-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
                        data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{projects.map((project) => <div
                        className="hbar-app-ui-auth-project-row" key={project.id}><AuthIcon><Folder/></AuthIcon><span
                        className="hbar-app-ui-auth-project-copy"><strong>{project.name}</strong><small>{project.summary}</small></span>
                    </div>)}{!projects.length &&
                        <p className="hbar-app-ui-auth-empty">{content.labels.emptyProjects}</p>}</div>
                </div>
                <p className="hbar-app-ui-auth-footer-note">{content.labels.roleNote}</p></aside>
        </div>
    </AuthFrame>
}
