import {Check, LogOut, Search} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthWorkspaceContent} from './AuthContent'
import {selectHbarAppUiAuthItem, uniqueHbarAppUiAuthItems} from './AuthContent'
import {AuthAvatar, AuthButton, AuthFrame, AuthIcon} from './AuthPrimitives'

export function WorkspacePickerAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthWorkspaceContent
}) {
    const [query, setQuery] = useState('')
    const [selectedId, setSelectedId] = useState(content.initialWorkspaceId)
    const workspaces = useMemo(() => uniqueHbarAppUiAuthItems(content.workspaces), [content.workspaces])
    const visible = workspaces.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
    const selected = selectHbarAppUiAuthItem(workspaces, selectedId)
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-workspace-surface">
        <div className="hbar-app-ui-auth-wide-shell">
            <header className="hbar-app-ui-auth-header-bar">
                <div className="hbar-app-ui-auth-avatar-line"><AuthAvatar initials={content.account.initials}
                                                                          label={content.account.name}/>
                    <div>
                        <strong>{content.account.name}</strong><small>{content.labels.signedInAs} {content.account.email}</small>
                    </div>
                </div>
                <AuthButton type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'sign-out'
                })}><AuthIcon><LogOut/></AuthIcon>{content.labels.signOut}</AuthButton></header>
            <main className="hbar-app-ui-auth-wide-main">
                <div className="hbar-app-ui-auth-wide-content hbar-app-ui-auth-workspace-content">
                    <h1>{content.labels.title}</h1><p>{content.labels.description}</p><label
                    className="hbar-app-ui-auth-search"><span
                    className="hbar-app-ui-auth-search-input"><AuthIcon><Search/></AuthIcon><input value={query}
                                                                                                   aria-label={content.labels.searchLabel}
                                                                                                   placeholder={content.labels.searchPlaceholder}
                                                                                                   onChange={(event) => setQuery(event.currentTarget.value)}/></span></label>
                    <div
                        className={`hbar-app-ui-auth-workspace-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
                        data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{visible.map((workspace) => <button
                        type="button"
                        className={`hbar-app-ui-auth-workspace-row ${workspace.id === selected?.id ? 'is-selected' : ''}`}
                        key={workspace.id} onClick={() => setSelectedId(workspace.id)}><span
                        className="hbar-app-ui-auth-org-mark">{workspace.initials}</span><span
                        className="hbar-app-ui-auth-workspace-copy"><strong>{workspace.name}</strong><small>{workspace.summary}</small>{workspace.invitation &&
                        <small>{workspace.invitation}</small>}</span>{workspace.id === selected?.id &&
                        <AuthIcon><Check/></AuthIcon>}</button>)}{!visible.length &&
                        <p className="hbar-app-ui-auth-empty">{content.labels.emptyWorkspaces}</p>}</div>
                    <AuthButton type="button" tone="accent" disabled={!selected} onClick={() => selected && onAction?.({
                        variantId: spec.id,
                        actionId: 'open-workspace',
                        value: selected.id
                    })}>{selected ? content.labels.open(selected.name) : content.labels.create}<AuthIcon><Check/></AuthIcon></AuthButton>
                    <p className="hbar-app-ui-auth-footer-note">{content.labels.footer}</p></div>
            </main>
        </div>
    </AuthFrame>
}
