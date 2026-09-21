import { LumenButton, LumenInput } from '@lumen/app-ui'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallReadsContent} from './PaywallContent'
import {PaywallButton, PaywallFrame} from './PaywallPrimitives'

export function MeteredReadsPaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallReadsContent}) {
    const {labels, assurances} = content
    const [email, setEmail] = useState('')
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-reads-surface">
        <section className="hbar-app-ui-paywall-reads-card">
            <div className="hbar-app-ui-paywall-reads-dots" aria-hidden="true"><i /><i /><i /></div>
            <p className="hbar-app-ui-paywall-eyebrow">{labels.eyebrow}</p>
            <h2>{labels.title}</h2>
            <p>{labels.description}</p>
            <form className="hbar-app-ui-paywall-reads-form" onSubmit={(event) => {
                event.preventDefault();
                if (email.trim()) onAction?.({variantId: spec.id, actionId: 'keep-reading', value: email.trim()})
            }}>
                <LumenInput aria-label={labels.emailLabel} type="email" value={email}
                       onChange={(event) => setEmail(event.target.value)} placeholder={labels.emailPlaceholder}/>
                <PaywallButton tone="accent" type="submit" disabled={!email.trim()}>{labels.keepReading}</PaywallButton>
            </form>
            <p className="hbar-app-ui-paywall-reads-subscribe"><span>{labels.alreadySubscribed}</span>
                <LumenButton type="button"
                        onClick={() => onAction?.({variantId: spec.id, actionId: 'sign-in'})}>{labels.signIn}</LumenButton>
            </p>
            <ul className="hbar-app-ui-paywall-reads-assurances"
                data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{assurances.map((assurance, index) => <li
                key={`${index}-${assurance}`}>{assurance}</li>)}</ul>
        </section>
    </PaywallFrame>
}
