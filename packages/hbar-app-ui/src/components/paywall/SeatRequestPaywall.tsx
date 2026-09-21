import { LumenTextarea } from '@lumen/app-ui'
import {Building2, LockKeyhole} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallSeatContent} from './PaywallContent'
import {PaywallButton, PaywallFrame, PaywallIcon} from './PaywallPrimitives'

export function SeatRequestPaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallSeatContent}) {
    const {labels, admins} = content
    const [reason, setReason] = useState('')
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-seat-surface">
        <section className="hbar-app-ui-paywall-seat">
            <header className="hbar-app-ui-paywall-seat-head">
                <PaywallIcon label={labels.title} tier="lg"><LockKeyhole /></PaywallIcon>
                <div><h2>{labels.title}</h2><p><Building2 className="hbar-app-ui-paywall-icon hbar-app-ui-icon-xs" aria-hidden="true" /><span>{labels.description}</span></p></div>
            </header>
            <section className="hbar-app-ui-paywall-seat-card">
                <h3>{labels.cardTitle}</h3><p>{labels.cardDescription}</p>
                <div className="hbar-app-ui-paywall-admin-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                    {admins.map((admin) => <div className="hbar-app-ui-paywall-admin" key={admin.id}><span aria-hidden="true">{admin.initials}</span><div><strong>{admin.name}</strong><small>{admin.role}</small></div></div>)}
                </div>
            </section>
            <section className="hbar-app-ui-paywall-seat-card">
                <label htmlFor={`${spec.id}-reason`}>{labels.reasonLabel}</label>
                <LumenTextarea id={`${spec.id}-reason`} value={reason} onChange={(event) => setReason(event.target.value)}
                          placeholder={labels.reasonPlaceholder}/>
            </section>
            <footer className="hbar-app-ui-paywall-seat-actions"><PaywallButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'compare'})}>{labels.compare}</PaywallButton><PaywallButton tone="accent" type="button" disabled={!reason.trim()} onClick={() => onAction?.({variantId: spec.id, actionId: 'send', value: reason.trim()})}>{labels.send}</PaywallButton></footer>
        </section>
    </PaywallFrame>
}
