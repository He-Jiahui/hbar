import {Check, LockKeyhole} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiPaywallArticleContent} from './PaywallContent'
import {PaywallButton, PaywallFrame, PaywallIcon} from './PaywallPrimitives'

export function ArticlePaywall({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiPaywallArticleContent}) {
    const {labels, paragraphs, benefits} = content
    return <PaywallFrame spec={spec} onAction={onAction} className="hbar-app-ui-paywall-article-surface">
        <article className="hbar-app-ui-paywall-article">
            <header className="hbar-app-ui-paywall-article-head">
                <p className="hbar-app-ui-paywall-eyebrow">{labels.eyebrow}</p>
                <h1>{labels.title}</h1>
                <p className="hbar-app-ui-paywall-byline">{labels.byline}</p>
            </header>
            <div className="hbar-app-ui-paywall-article-copy">
                {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
            </div>
            <section className="hbar-app-ui-paywall-member" aria-label={labels.memberTitle}>
                <PaywallIcon label={labels.lockLabel} tier="md"><LockKeyhole /></PaywallIcon>
                <h2>{labels.memberTitle}</h2>
                <p>{labels.memberDescription}</p>
                <ul>
                    {benefits.map((benefit, index) => <li key={`${index}-${benefit}`}><Check className="hbar-app-ui-paywall-icon hbar-app-ui-icon-xs" aria-hidden="true" /><span>{benefit}</span></li>)}
                </ul>
                <div className="hbar-app-ui-paywall-member-actions">
                    <PaywallButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'upgrade'})}>{labels.memberAction}</PaywallButton>
                    <PaywallButton type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'sign-in'})}>{labels.alreadyAction}</PaywallButton>
                </div>
            </section>
        </article>
    </PaywallFrame>
}
