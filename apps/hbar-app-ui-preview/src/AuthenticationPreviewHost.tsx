import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  HbarAppUiAuthenticationProvider,
  type HbarAppUiAuthContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'

/** Demonstration countdown and verification responses exist only in the preview host. */
export function AuthenticationPreviewHost({
  content,
  spec,
  onAction,
  children,
}: HbarAppUiVariantProps & { readonly content: HbarAppUiAuthContent; readonly children: ReactNode }) {
  const [source, setSource] = useState(content),
    [code, setCode] = useState(content.code?.code ?? ''),
    [recoveryCode, setRecoveryCode] = useState(content.code?.referenceFlow?.recoveryCode ?? ''),
    [phase, setPhase] = useState<'text' | 'recovery' | 'verified'>(content.code?.referenceFlow?.phase ?? 'text'),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(content.code?.resend?.seconds ?? 0),
    [signUpName, setSignUpName] = useState(content.signUp?.referenceFlow?.name ?? content.signUp?.initialName ?? ''),
    [signUpEmail, setSignUpEmail] = useState(content.signUp?.referenceFlow?.email ?? content.signUp?.initialEmail ?? ''),
    [signUpPassword, setSignUpPassword] = useState(content.signUp?.referenceFlow?.password ?? ''),
    [signUpVisible, setSignUpVisible] = useState(content.signUp?.referenceFlow?.visible ?? false),
    [signUpAgreed, setSignUpAgreed] = useState(content.signUp?.referenceFlow?.agreed ?? false),
    [enterpriseEmail, setEnterpriseEmail] = useState(content.enterprise?.referenceFlow?.email ?? content.enterprise?.email ?? ''),
    [enterpriseBusy, setEnterpriseBusy] = useState(false),
    [passkeySelectedId, setPasskeySelectedId] = useState(content.passkey?.referenceFlow?.selectedId ?? content.passkey?.initialPasskeyId ?? ''),
    [passkeyPhase, setPasskeyPhase] = useState<'choose' | 'request'>(content.passkey?.referenceFlow?.phase ?? 'choose'),
    [accountSelectedId, setAccountSelectedId] = useState(content.account?.referenceFlow?.selectedId ?? content.account?.initialAccountId ?? '')
  const verificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enterpriseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  if (source !== content) {
    setSource(content)
    setCode(content.code?.code ?? '')
    setRecoveryCode(content.code?.referenceFlow?.recoveryCode ?? '')
    setPhase(content.code?.referenceFlow?.phase ?? 'text')
    setBusy(false)
    setSeconds(content.code?.resend?.seconds ?? 0)
    setSignUpName(content.signUp?.referenceFlow?.name ?? content.signUp?.initialName ?? '')
    setSignUpEmail(content.signUp?.referenceFlow?.email ?? content.signUp?.initialEmail ?? '')
    setSignUpPassword(content.signUp?.referenceFlow?.password ?? '')
    setSignUpVisible(content.signUp?.referenceFlow?.visible ?? false)
    setSignUpAgreed(content.signUp?.referenceFlow?.agreed ?? false)
    setEnterpriseEmail(content.enterprise?.referenceFlow?.email ?? content.enterprise?.email ?? '')
    setEnterpriseBusy(false)
    setPasskeySelectedId(content.passkey?.referenceFlow?.selectedId ?? content.passkey?.initialPasskeyId ?? '')
    setPasskeyPhase(content.passkey?.referenceFlow?.phase ?? 'choose')
    setAccountSelectedId(content.account?.referenceFlow?.selectedId ?? content.account?.initialAccountId ?? '')
  }
  useEffect(() => {
    if (!seconds) return
    const timer = setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => clearTimeout(timer)
  }, [seconds])
  useEffect(() => () => {
    if (verificationTimer.current) clearTimeout(verificationTimer.current)
    if (enterpriseTimer.current) clearTimeout(enterpriseTimer.current)
  }, [])
  useEffect(() => {
    if (verificationTimer.current) clearTimeout(verificationTimer.current)
    verificationTimer.current = null
    if (enterpriseTimer.current) clearTimeout(enterpriseTimer.current)
    enterpriseTimer.current = null
  }, [content])
  const verify = content.code
  const requirementsMet = [signUpPassword.length >= 10, /[A-Z]/.test(signUpPassword), /\d/.test(signUpPassword), /[^A-Za-z0-9]/.test(signUpPassword)]
  const submit = (value: string) => {
    if (busy || verificationTimer.current) return
    setBusy(true)
    onAction?.({ variantId: spec.id, actionId: 'verify', value })
    verificationTimer.current = setTimeout(() => {
      verificationTimer.current = null
      setBusy(false)
      setPhase('verified')
    }, 1000)
  }
  const changeMode = (mode: 'text' | 'recovery') => {
    if (verificationTimer.current) clearTimeout(verificationTimer.current)
    verificationTimer.current = null
    setBusy(false)
    setPhase(mode)
    setCode('')
    setRecoveryCode('')
  }
  return (
    <HbarAppUiAuthenticationProvider
      content={{
        ...content,
        code: verify && {
          ...verify,
          code,
          busy: verify.referenceFlow ? busy : verify.busy,
          canVerify: new RegExp(`^\\d{${verify.codeLength}}$`).test(code),
          onCodeChange: (value) => {
            setCode(value)
            if (verify.referenceFlow && phase === 'text' && new RegExp(`^\\d{${verify.codeLength}}$`).test(value)) submit(value)
          },
          onVerify: () => verify.referenceFlow ? submit(phase === 'recovery' ? recoveryCode : code) : onAction?.({ variantId: spec.id, actionId: 'verify', value: code }),
          resend: verify.resend && {
            seconds,
            enabled: seconds === 0,
            onResend() {
              setSeconds(verify.resend?.seconds ?? 0)
              onAction?.({ variantId: spec.id, actionId: 'resend' })
            },
          },
          onRecovery: () => onAction?.({ variantId: spec.id, actionId: 'recovery' }),
          onBack: () => onAction?.({ variantId: spec.id, actionId: 'back' }),
          referenceFlow: verify.referenceFlow && {
            ...verify.referenceFlow,
            phase,
            recoveryCode,
            canVerifyRecovery: recoveryCode.length === 11,
            onRecoveryCodeChange: (value) => setRecoveryCode(value.toUpperCase().slice(0, 11)),
            onModeChange: changeMode,
            onContinue: () => onAction?.({ variantId: spec.id, actionId: 'continue' }),
          },
        },
        signUp: content.signUp && {
          ...content.signUp,
          referenceFlow: content.signUp.referenceFlow && {
            ...content.signUp.referenceFlow,
            name: signUpName,
            email: signUpEmail,
            password: signUpPassword,
            visible: signUpVisible,
            agreed: signUpAgreed,
            requirementsMet,
            canSubmit: signUpName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signUpEmail) && requirementsMet.every(Boolean) && signUpAgreed,
            onNameChange: setSignUpName,
            onEmailChange: setSignUpEmail,
            onPasswordChange: setSignUpPassword,
            onVisibleChange: setSignUpVisible,
            onAgreedChange: setSignUpAgreed,
          },
        },
        enterprise: content.enterprise && {
          ...content.enterprise,
          referenceFlow: content.enterprise.referenceFlow && {
            ...content.enterprise.referenceFlow,
            email: enterpriseEmail,
            busy: enterpriseBusy,
            onEmailChange: setEnterpriseEmail,
            onContinue: () => {
              const enterprise = content.enterprise
              if (!enterprise) return
              if (enterpriseBusy || enterpriseTimer.current) return
              setEnterpriseBusy(true)
              const domain = enterpriseEmail.split('@')[1]?.trim().toLowerCase()
              const provider = enterprise.referenceFlow?.alternateOrganizations.find((entry) => entry.organization.domain.toLowerCase() === domain)?.organization.provider
                ?? (enterprise.organization.domain.toLowerCase() === domain ? enterprise.organization.provider : '')
              onAction?.({ variantId: spec.id, actionId: 'continue-sso', value: provider })
              enterpriseTimer.current = setTimeout(() => {
                enterpriseTimer.current = null
                setEnterpriseBusy(false)
              }, 1800)
            },
          },
        },
        passkey: content.passkey && {
          ...content.passkey,
          referenceFlow: content.passkey.referenceFlow && {
            ...content.passkey.referenceFlow,
            selectedId: passkeySelectedId,
            phase: passkeyPhase,
            onSelect: setPasskeySelectedId,
            onContinue: (id) => {
              setPasskeyPhase('request')
              onAction?.({ variantId: spec.id, actionId: 'continue-passkey', value: id })
            },
            onCancel: () => setPasskeyPhase('choose'),
          },
        },
        account: content.account && {
          ...content.account,
          referenceFlow: content.account.referenceFlow && {
            ...content.account.referenceFlow,
            selectedId: accountSelectedId,
            onSelect: setAccountSelectedId,
          },
        },
      }}
    >
      {children}
    </HbarAppUiAuthenticationProvider>
  )
}
