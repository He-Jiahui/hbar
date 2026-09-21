import { LumenButton, LumenInput } from '@lumen/app-ui'
import {useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiAuthSignInContent} from './AuthContent'
import {
    AuthBrand,
    AuthButton,
    AuthCard,
    AuthDivider,
    AuthField,
    AuthFooterLinks,
    AuthFrame,
    AuthPasswordButton,
    AuthProviderButtons
} from './AuthPrimitives'

export function SignInAuthentication({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiAuthSignInContent
}) {
    const [email, setEmail] = useState(content.initialEmail)
    const [password, setPassword] = useState('')
    const [visible, setVisible] = useState(false)
    const [remember, setRemember] = useState(content.initialRemember)
    return <AuthFrame spec={spec} onAction={onAction} className="hbar-app-ui-auth-sign-in-surface">
        <div className="hbar-app-ui-auth-centered">
            <AuthCard>
                <AuthBrand label={content.labels.brand} compact/>
                <h1>{content.labels.title}</h1>
                <p>{content.labels.description}</p>
                <AuthField label={content.labels.emailLabel} placeholder={content.labels.emailPlaceholder} value={email}
                           onChange={setEmail}/>
                <div className="hbar-app-ui-auth-field">
                    <div className="hbar-app-ui-auth-help-row"><span>{content.labels.passwordLabel}</span>
                        <LumenButton type="button" onClick={() => onAction?.({
                            variantId: spec.id,
                            actionId: 'forgot-password'
                        })}>{content.labels.forgotPassword}</LumenButton>
                    </div>
                    <div className="hbar-app-ui-auth-input-wrap"><LumenInput type={visible ? 'text' : 'password'}
                                                                        placeholder={content.labels.passwordPlaceholder}
                                                                        value={password}
                                                                        onChange={(event) => setPassword(event.currentTarget.value)}/><AuthPasswordButton
                        visible={visible} showLabel={content.labels.showPassword}
                        hideLabel={content.labels.hidePassword} onToggle={() => setVisible((current) => !current)}/>
                    </div>
                </div>
                <label className="hbar-app-ui-auth-check"><LumenInput type="checkbox" checked={remember}
                                                                 onChange={() => setRemember((current) => !current)}/><span>{content.labels.rememberLabel}</span></label>
                <AuthButton type="button" tone="accent" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'sign-in',
                    value: email
                })}>{content.labels.signIn}</AuthButton>
                <AuthDivider label={content.labels.divider}/>
                <AuthProviderButtons providers={content.providers} listStrategy={content.providerListStrategy}
                                     onSelect={(provider) => onAction?.({
                                         variantId: spec.id,
                                         actionId: 'provider',
                                         value: provider.id
                                     })}/>
            </AuthCard>
            <p className="hbar-app-ui-auth-footer-note">{content.labels.noAccount}
                <LumenButton type="button" className="hbar-app-ui-auth-inline-link" onClick={() => onAction?.({
                    variantId: spec.id,
                    actionId: 'create-account'
                })}>{content.labels.createAccount}</LumenButton>
            </p>
            <AuthFooterLinks links={[content.labels.privacy, content.labels.terms, content.labels.status]}
                             onSelect={(value) => onAction?.({variantId: spec.id, actionId: 'footer-link', value})}/>
        </div>
    </AuthFrame>
}
