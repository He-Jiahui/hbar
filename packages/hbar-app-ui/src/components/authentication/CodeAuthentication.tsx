import {ShieldCheck} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthCodeContent} from './AuthContent'
import {AuthButton, AuthCard, AuthFrame, AuthIcon} from './AuthPrimitives'

export function CodeAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthCodeContent
}) {
    const [code, setCode] = useState(content.initialCode)
    const [seconds, setSeconds] = useState(content.resendAfterSeconds)
    const bounded = code.replace(/\D/g, '').slice(0, 6)
    const verified = bounded.length === 6
    useEffect(() => {
        if (seconds <= 0) return
        const timer = window.setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
        return () => window.clearTimeout(timer)
    }, [seconds])
    const updateDigit = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(-1)
        setCode((current) => `${current.slice(0, index)}${digit}${current.slice(index + 1)}`)
    }
    const pasteCode = (value: string) => setCode(value.replace(/\D/g, '').slice(0, 6))
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-code-surface">
        <div className="hbar-app-ui-auth-centered">
            <AuthCard className="hbar-app-ui-auth-code-card"><AuthIcon tier="lg"><ShieldCheck/></AuthIcon>
                <h1>{content.labels.title}</h1><p>{content.labels.description}</p><span
                    className="hbar-app-ui-auth-field"><span>{content.labels.codeLabel}</span><div
                    className="hbar-app-ui-auth-code-boxes">{Array.from({length: 6}, (_, index) => <input key={index}
                                                                                                          value={bounded[index] ?? ''}
                                                                                                          maxLength={1}
                                                                                                          inputMode="numeric"
                                                                                                          aria-label={content.labels.codeDigit(index + 1)}
                                                                                                          onPaste={(event) => {
                                                                                                              event.preventDefault();
                                                                                                              pasteCode(event.clipboardData.getData('text'))
                                                                                                          }}
                                                                                                          onChange={(event) => updateDigit(index, event.currentTarget.value)}/>)} </div></span><small>{content.labels.helper}</small><AuthButton
                    type="button" tone="accent" disabled={!verified} onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'verify',
                    value: bounded
                })}>{content.labels.verify}</AuthButton>
                <div className="hbar-app-ui-auth-help-row"><AuthButton type="button" disabled={seconds > 0}
                                                                       onClick={() => {
                                                                           setSeconds(content.resendAfterSeconds);
                                                                           onAction?.({
                                                                               variantId: spec.id,
                                                                               actionId: 'resend'
                                                                           })
                                                                       }}>{content.labels.resend(seconds)}</AuthButton>
                    <button type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'recovery'
                    })}>{content.labels.recovery}</button>
                </div>
            </AuthCard>
            <button type="button" className="hbar-app-ui-auth-inline-link hbar-app-ui-auth-compact-link"
                    onClick={() => onAction?.({variantId: spec.id, actionId: 'back'})}>{content.labels.back}</button>
        </div>
    </AuthFrame>
}
