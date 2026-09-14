import {useState} from 'react'
import {Copy, Eye, EyeOff, KeyRound, RotateCcw, Save, ShieldAlert, Trash2, UserPlus} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type SettingsProps = HbarAppUiVariantProps

function SettingsPage({spec, onAction}: SettingsProps) {
    const [saved, setSaved] = useState(false);
    const [section, setSection] = useState('General');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-settings-variant-1">
        <div className="hbar-app-ui-settings-layout">
            <aside>{['General', 'Members', 'Notifications', 'Advanced'].map((item) => <button type="button"
                                                                                              className={section === item ? 'is-selected' : ''}
                                                                                              key={item}
                                                                                              onClick={() => setSection(item)}>{item}</button>)}</aside>
            <main><HbarAppUiToolbar title={`${section} settings`} detail="Sticky save bar"/><label>Workspace name<input
                defaultValue="October workspace" onChange={() => setSaved(false)}/></label><label>Default region<select
                defaultValue="us-east">
                <option>us-east</option>
                <option>eu-west</option>
            </select></label><HbarAppUiSpotlight><strong>Preference preview</strong><p>Changes apply to new sessions in
                this workspace.</p></HbarAppUiSpotlight></main>
        </div>
        <div className="hbar-app-ui-sticky-save"><span>{saved ? 'All changes saved' : 'You have unsaved changes'}</span><HbarAppUiButton
            onClick={() => setSaved(false)}><RotateCcw size={13}/>Reset</HbarAppUiButton><HbarAppUiButton tone="accent"
                                                                                                          onClick={() => {
                                                                                                              setSaved(true);
                                                                                                              onAction?.({
                                                                                                                  variantId: spec.id,
                                                                                                                  actionId: 'save'
                                                                                                              })
                                                                                                          }}><Save
            size={13}/>Save changes</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function ProfileForm({spec, onAction}: SettingsProps) {
    const [valid, setValid] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-settings-variant-2"><HbarAppUiToolbar title="Profile"
                                                                                            detail="Avatar upload and field validation"/>
        <div className="hbar-app-ui-profile-form-head"><span
            className="hbar-app-ui-avatar hbar-app-ui-avatar-large">A</span><HbarAppUiButton
            onClick={() => onAction?.({variantId: spec.id, actionId: 'upload'})}>Change avatar</HbarAppUiButton></div>
        <label>Display name<input defaultValue="Avery Chen"
                                  onChange={(event) => setValid(event.target.value.trim().length > 2)}/><small>Use the
            name teammates recognize.</small></label><label>Role<input defaultValue="Workspace operator"
                                                                       onChange={(event) => setValid(event.target.value.trim().length > 2)}/></label><HbarAppUiStatus
            value={valid ? 'Looks good' : 'Check the fields'} tone={valid ? 'positive' : 'warning'}/><HbarAppUiButton
            tone="accent" disabled={!valid} onClick={() => onAction?.({variantId: spec.id, actionId: 'save'})}>Save
            profile</HbarAppUiButton></ActionSurfaceFrame>
}

function Preferences({spec, onAction}: SettingsProps) {
    const [tab, setTab] = useState('General');
    const [compact, setCompact] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-settings-variant-3"><HbarAppUiToolbar title="Preferences"
                                                                                            detail="Switches, radio cards and segmented controls"/><HbarAppUiTabs
        label="Preference group" value={tab}
        options={[{id: 'General', label: 'General'}, {id: 'Editor', label: 'Editor'}, {id: 'Alerts', label: 'Alerts'}]}
        onChange={setTab}/>
        <div className="hbar-app-ui-preference-list"><label
            className="hbar-app-ui-toggle-row"><span>Compact density</span>
            <button type="button" role="switch" aria-checked={compact}
                    className={`hbar-app-ui-switch ${compact ? 'is-on' : ''}`}
                    onClick={() => setCompact((value) => !value)}><i/></button>
        </label><label><input type="radio" name="theme" defaultChecked/>Use system theme</label><label><input
            type="radio" name="theme"/>Always dark</label><label><input type="radio" name="theme"/>Always light</label>
        </div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'save', value: tab})}>Save
            preferences</HbarAppUiButton></ActionSurfaceFrame>
}

function TeamMembers({spec, onAction}: SettingsProps) {
    const [invited, setInvited] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-settings-variant-4"><HbarAppUiToolbar title="Team members"
                                                                                            detail="Roles and pending invites"/><HbarAppUiButton
        tone="accent" onClick={() => {
        setInvited(true);
        onAction?.({variantId: spec.id, actionId: 'invite'})
    }}><UserPlus size={13}/>Invite</HbarAppUiButton>
        <div className="hbar-app-ui-member-list">{['Avery Chen', 'Mina Patel', 'Jon Bell'].map((member, index) =>
            <HbarAppUiSpotlight key={member}><span className="hbar-app-ui-avatar">{member[0]}</span>
                <div><strong>{member}</strong><small>{index === 0 ? 'Owner' : 'Member'}</small></div>
                <select aria-label={`${member} role`} defaultValue={index === 0 ? 'Owner' : 'Member'}>
                    <option>Owner</option>
                    <option>Admin</option>
                    <option>Member</option>
                </select></HbarAppUiSpotlight>)}{invited &&
            <HbarAppUiSpotlight><span className="hbar-app-ui-avatar">?</span>
                <div><strong>pending@workspace.test</strong><small>Invite sent just now</small></div>
                <HbarAppUiStatus value="Pending" tone="warning"/></HbarAppUiSpotlight>}</div>
    </ActionSurfaceFrame>
}

function ApiKeys({spec, onAction}: SettingsProps) {
    const [revealed, setRevealed] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-settings-variant-5"><HbarAppUiToolbar title="API keys"
                                                                                            detail="Reveal, copy, rotate and revoke"/><HbarAppUiButton
        tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'create'})}>Create key</HbarAppUiButton>
        <div className="hbar-app-ui-key-list"><HbarAppUiSpotlight><KeyRound size={15}/>
            <div><strong>Local development</strong><code>{revealed ? 'hb_live_91a2b3c4d5' : 'hb_live_••••••••••'}</code><small>Created
                today · last used 2m ago</small></div>
            <HbarAppUiIconButton label={revealed ? 'Hide key' : 'Reveal key'}
                                 onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff size={13}/> :
                <Eye size={13}/>}</HbarAppUiIconButton><HbarAppUiIconButton label="Copy key" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'copy'
            })}><Copy size={13}/></HbarAppUiIconButton><HbarAppUiButton onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'rotate'
            })}>Rotate</HbarAppUiButton><HbarAppUiButton tone="danger" onClick={() => onAction?.({
                variantId: spec.id,
                actionId: 'revoke'
            })}>Revoke</HbarAppUiButton></HbarAppUiSpotlight></div>
    </ActionSurfaceFrame>
}

function DangerZone({spec, onAction}: SettingsProps) {
    const [stage, setStage] = useState(0);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-settings-variant-6"><HbarAppUiToolbar title="Danger zone"
                                                                                            detail="Staged destructive confirmations"/><HbarAppUiSpotlight
        className="hbar-app-ui-danger-card"><ShieldAlert size={19}/>
        <div><strong>Delete this workspace</strong><p>All sessions, files and settings will be permanently removed.</p>
            <ul>
                <li>Export any records you need first.</li>
                <li>Type the workspace name to continue.</li>
            </ul>
        </div>
        {stage === 0 && <HbarAppUiButton tone="danger" onClick={() => setStage(1)}><Trash2 size={13}/>Delete
            workspace</HbarAppUiButton>}{stage === 1 &&
            <div className="hbar-app-ui-danger-confirm"><input placeholder="Type October workspace"
                                                               aria-label="Workspace name confirmation"/><HbarAppUiButton
                onClick={() => setStage(2)}>Continue</HbarAppUiButton></div>}{stage === 2 &&
            <HbarAppUiStatus value="Final confirmation required" tone="danger"/>}</HbarAppUiSpotlight><HbarAppUiButton
        onClick={() => onAction?.({variantId: spec.id, actionId: 'confirm', value: String(stage)})}>Confirm
        stage</HbarAppUiButton></ActionSurfaceFrame>
}

export function SettingsForm({spec, onAction}: SettingsProps) {
    switch (spec.variant) {
        case 1:
            return <SettingsPage spec={spec} onAction={onAction}/>;
        case 2:
            return <ProfileForm spec={spec} onAction={onAction}/>;
        case 3:
            return <Preferences spec={spec} onAction={onAction}/>;
        case 4:
            return <TeamMembers spec={spec} onAction={onAction}/>;
        case 5:
            return <ApiKeys spec={spec} onAction={onAction}/>;
        case 6:
            return <DangerZone spec={spec} onAction={onAction}/>;
        default:
            return <SettingsPage spec={spec} onAction={onAction}/>
    }
}
