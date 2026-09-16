import {MoreHorizontal, Plus} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiSettingsMember, HbarAppUiSettingsMembersContent} from './SettingsContent'
import {uniqueHbarAppUiSettingsItems} from './SettingsContent'
import {SettingsButton, SettingsFrame, SettingsIcon, SettingsIconButton} from './SettingsPrimitives'

export function MembersSettings({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiSettingsMembersContent}) {
    const [members, setMembers] = useState<readonly HbarAppUiSettingsMember[]>(() => uniqueHbarAppUiSettingsItems(content.members))
    const [email, setEmail] = useState('')
    const [role, setRole] = useState(content.initialInviteRoleId)
    const seatProgress = content.seatsTotal > 0 ? Math.min(100, Math.max(0, content.seatsUsed / content.seatsTotal * 100)) : 0
    const visibleMembers = useMemo(() => uniqueHbarAppUiSettingsItems(members), [members])
    const sendInvite = () => {
        const nextEmail = email.trim()
        if (!nextEmail) return
        const nextMember: HbarAppUiSettingsMember = {
            id: `invite-${nextEmail}`,
            initials: nextEmail.slice(0, 2).toUpperCase(),
            name: nextEmail,
            email: nextEmail,
            status: 'invited',
            role: content.inviteRoles.find((choice) => choice.id === role)?.label ?? role,
            roleId: role,
            roleChoices: content.inviteRoles,
        }
        setMembers((current) => uniqueHbarAppUiSettingsItems([...current, nextMember]))
        setEmail('')
        onAction?.({variantId: spec.id, actionId: 'invite', value: nextEmail})
    }

    return <SettingsFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-members-surface">
        <div className="hbar-app-ui-settings-centered">
            <div className="hbar-app-ui-settings-page-heading"><h1 className="hbar-app-ui-settings-page-title">{content.labels.pageTitle}</h1></div>
            <section className="hbar-app-ui-settings-panel">
                <header className="hbar-app-ui-settings-panel-heading"><h2>{content.labels.panelTitle}</h2><p>{content.labels.panelDescription}</p></header>
                <section className="hbar-app-ui-settings-invite">
                    <div className="hbar-app-ui-settings-invite-copy"><strong>{content.labels.inviteTitle}</strong><small>{content.labels.inviteDescription}</small></div>
                    <div className="hbar-app-ui-settings-invite-fields">
                        <label><span className="hbar-app-ui-settings-visually-hidden">{content.labels.emailLabel}</span><input type="email" value={email} placeholder={content.labels.emailPlaceholder} aria-label={content.labels.emailLabel} onChange={(event) => setEmail(event.currentTarget.value)} /></label>
                        <label><span className="hbar-app-ui-settings-visually-hidden">{content.labels.roleLabel}</span><select value={role} aria-label={content.labels.roleLabel} onChange={(event) => setRole(event.currentTarget.value)}>{content.inviteRoles.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
                    </div>
                    <SettingsButton type="button" tone="accent" onClick={sendInvite}><SettingsIcon><Plus /></SettingsIcon>{content.labels.sendInvite}</SettingsButton>
                </section>
                <div className="hbar-app-ui-settings-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    {visibleMembers.map((member) => <article className="hbar-app-ui-settings-member-row" key={member.id}>
                        <div className="hbar-app-ui-settings-member-primary">
                            <span className="hbar-app-ui-settings-member-avatar" aria-hidden="true">{member.initials}</span>
                            <div className="hbar-app-ui-settings-member-copy"><strong>{member.name}</strong><small>{member.email}</small></div>
                            <SettingsIconButton type="button" label={content.labels.actions(member.name)} onClick={() => onAction?.({variantId: spec.id, actionId: 'member-actions', value: member.id})}><SettingsIcon><MoreHorizontal /></SettingsIcon></SettingsIconButton>
                        </div>
                        <div className="hbar-app-ui-settings-member-secondary">
                            <span className={`hbar-app-ui-settings-member-status ${member.status === 'invited' ? 'is-invited' : ''}`}>{member.status === 'invited' ? content.labels.invited : content.labels.active}</span>
                            <label className="hbar-app-ui-settings-member-role"><span className="hbar-app-ui-settings-visually-hidden">{content.labels.roleLabel}</span>{member.roleChoices.length > 1 ? <select defaultValue={member.roleId} aria-label={content.labels.roleLabel}>{member.roleChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select> : <span className="hbar-app-ui-settings-muted">{member.role}</span>}</label>
                        </div>
                    </article>)}
                    {!visibleMembers.length && <p className="hbar-app-ui-settings-empty">{content.labels.empty}</p>}
                </div>
                <footer className="hbar-app-ui-settings-seat-footer"><span>{content.labels.seats(content.seatsUsed, content.seatsTotal)}</span><span className="hbar-app-ui-settings-seat-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={seatProgress} aria-label={content.labels.seats(content.seatsUsed, content.seatsTotal)}><span style={{inlineSize: `${seatProgress}%`}} /></span></footer>
            </section>
        </div>
    </SettingsFrame>
}
