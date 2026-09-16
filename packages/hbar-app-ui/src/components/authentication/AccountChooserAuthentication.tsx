import {Check, Plus} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthAccountContent} from './AuthContent'
import {selectHbarAppUiAuthItem, uniqueHbarAppUiAuthItems} from './AuthContent'
import {AuthBrand, AuthButton, AuthCard, AuthFrame, AuthIcon, AuthStatus} from './AuthPrimitives'

export function AccountChooserAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthAccountContent
}) {
    const accounts = useMemo(() => uniqueHbarAppUiAuthItems(content.accounts), [content.accounts])
    const [selectedId, setSelectedId] = useState(selectHbarAppUiAuthItem(accounts, content.initialAccountId)?.id)
    const selected = selectHbarAppUiAuthItem(accounts, selectedId)
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-account-surface">
        <div className="hbar-app-ui-auth-centered"><AuthCard className="hbar-app-ui-auth-account-card"><AuthBrand
            label={content.labels.brand} compact/><h1>{content.labels.title}</h1><p>{content.labels.description}</p>
            <div
                className={`hbar-app-ui-auth-account-list ${content.listStrategy.kind === 'pane-scroll' ? 'hbar-app-ui-auth-list-scroll' : ''}`}
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{accounts.map((account) => <button
                type="button"
                className={`hbar-app-ui-auth-account-row ${account.id === selected?.id ? 'is-selected' : ''}`}
                key={account.id} onClick={() => setSelectedId(account.id)}><span
                className="hbar-app-ui-auth-avatar">{account.initials}</span><span
                className="hbar-app-ui-auth-account-copy"><strong>{account.name}</strong><small>{account.email}</small><AuthStatus
                label={account.status} tone={account.statusTone}/></span>{account.id === selected?.id &&
                <AuthIcon><Check/></AuthIcon>}</button>)}
                <button type="button" className="hbar-app-ui-auth-account-row"
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'use-another'})}><span
                    className="hbar-app-ui-auth-avatar"><AuthIcon><Plus/></AuthIcon></span><span
                    className="hbar-app-ui-auth-account-copy"><strong>{content.labels.useAnother}</strong><small>{content.labels.useAnotherDescription}</small></span>
                </button>
                {!accounts.length && <p className="hbar-app-ui-auth-empty">{content.labels.emptyAccounts}</p>}</div>
            <AuthButton type="button" tone="accent" disabled={!selected} onClick={() => selected && onAction?.({
                variantId: spec.id,
                actionId: 'continue',
                value: selected.id
            })}>{content.labels.continueWith(content.workspaceName)}<AuthIcon><Check/></AuthIcon></AuthButton><p
                className="hbar-app-ui-auth-footer-note">{selected ? content.labels.signingInAs(selected.email) : content.labels.useAnotherDescription}</p>
        </AuthCard>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.finished}
                <button type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'sign-out-all'
                })}>{content.labels.signOutAll}</button>
            </p>
        </div>
    </AuthFrame>
}
