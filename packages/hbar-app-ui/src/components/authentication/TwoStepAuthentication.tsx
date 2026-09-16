import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthTwoStepContent} from './AuthContent'
import {AuthArrow, AuthBrand, AuthButton, AuthCard, AuthField, AuthFrame, AuthPasswordButton} from './AuthPrimitives'

export function TwoStepAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthTwoStepContent
}) {
    const [step, setStep] = useState<1 | 2>(1)
    const [email, setEmail] = useState(content.initialEmail)
    const [password, setPassword] = useState('')
    const [visible, setVisible] = useState(false)
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-two-step-surface">
        <div className="hbar-app-ui-auth-centered">
            <AuthCard>
                <div className="hbar-app-ui-auth-step-head"><AuthBrand label={content.labels.brand}
                                                                       compact/><small>{content.labels.step(step, 2)}</small>
                </div>
                <h1>{content.labels.title}</h1><p>{content.labels.description}</p>
                {step === 1 ? <><AuthField label={content.labels.emailLabel}
                                           placeholder={content.labels.emailPlaceholder} value={email}
                                           onChange={setEmail}/><AuthButton type="button" tone="accent"
                                                                            disabled={!email.includes('@')}
                                                                            onClick={() => {
                                                                                setStep(2);
                                                                                onAction?.({
                                                                                    variantId: spec.id,
                                                                                    actionId: 'continue',
                                                                                    value: email
                                                                                })
                                                                            }}>{content.labels.continueLabel}<AuthArrow/></AuthButton><AuthButton
                    type="button" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'magic-link'
                })}>{content.labels.magicLink}</AuthButton></> : <>
                    <div className="hbar-app-ui-auth-avatar-line"><span
                        className="hbar-app-ui-auth-avatar">{email.slice(0, 1).toUpperCase()}</span>
                        <div><strong>{email}</strong><small>{content.labels.matchedAccount}</small></div>
                    </div>
                    <div className="hbar-app-ui-auth-field"><span>{content.labels.passwordLabel}</span>
                        <div className="hbar-app-ui-auth-input-wrap"><input type={visible ? 'text' : 'password'}
                                                                            value={password}
                                                                            placeholder={content.labels.passwordPlaceholder}
                                                                            onChange={(event) => setPassword(event.currentTarget.value)}/><AuthPasswordButton
                            visible={visible} showLabel={content.labels.showPassword}
                            hideLabel={content.labels.hidePassword} onToggle={() => setVisible((current) => !current)}/>
                        </div>
                    </div>
                    <AuthButton type="button" tone="accent" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'sign-in',
                        value: email
                    })}>{content.labels.signIn}</AuthButton>
                    <button type="button" className="hbar-app-ui-auth-inline-link" onClick={() => setStep(1)}><AuthArrow
                        back/>{content.labels.useAnother}</button>
                </>}
            </AuthCard>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.needAccount}
                <button type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'create-account'
                })}>{content.labels.createAccount}</button>
            </p>
        </div>
    </AuthFrame>
}
