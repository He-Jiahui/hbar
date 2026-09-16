import {ExternalLink, Mail, RotateCcw} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthMagicLinkContent} from './AuthContent'
import {AuthButton, AuthCard, AuthFrame, AuthIcon} from './AuthPrimitives'

export function MagicLinkAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthMagicLinkContent
}) {
    const [seconds, setSeconds] = useState(content.resendAfterSeconds)
    useEffect(() => {
        if (seconds <= 0) return
        const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
        return () => window.clearTimeout(timer)
    }, [seconds])
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-magic-link-surface">
        <div className="hbar-app-ui-auth-centered">
            <AuthCard>
                <AuthIcon tier="lg"><Mail/></AuthIcon><h1>{content.labels.title}</h1>
                <p>{content.labels.description(content.email)}</p>
                <dl className="hbar-app-ui-auth-meta-rows">
                    <div>
                        <dt>{content.labels.sentTo}</dt>
                        <dd>{content.email}</dd>
                    </div>
                    <div>
                        <dt>{content.labels.expires}</dt>
                        <dd>{content.expiry}</dd>
                    </div>
                    <div>
                        <dt>{content.labels.requestedFrom}</dt>
                        <dd>{content.requestedFromValue}</dd>
                    </div>
                </dl>
                <AuthButton type="button" tone="accent" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'open-mail'
                })}>{content.labels.openMail}<AuthIcon><ExternalLink/></AuthIcon></AuthButton>
                <AuthButton type="button" disabled={seconds > 0} onClick={() => {
                    setSeconds(content.resendAfterSeconds);
                    onAction?.({variantId: spec.id, actionId: 'resend'})
                }}><AuthIcon><RotateCcw/></AuthIcon>{content.labels.resend(seconds)}</AuthButton>
                <p className="hbar-app-ui-auth-footer-note">{content.labels.noEmail}</p>
                <AuthButton type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'different-email'
                })}>{content.labels.differentEmail}</AuthButton>
            </AuthCard>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.rateLimit}</p>
        </div>
    </AuthFrame>
}
