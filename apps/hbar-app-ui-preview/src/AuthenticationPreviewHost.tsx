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
    [seconds, setSeconds] = useState(content.code?.resend?.seconds ?? 0)
  const verificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  if (source !== content) {
    setSource(content)
    setCode(content.code?.code ?? '')
    setRecoveryCode(content.code?.referenceFlow?.recoveryCode ?? '')
    setPhase(content.code?.referenceFlow?.phase ?? 'text')
    setBusy(false)
    setSeconds(content.code?.resend?.seconds ?? 0)
  }
  useEffect(() => {
    if (!seconds) return
    const timer = setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => clearTimeout(timer)
  }, [seconds])
  useEffect(() => () => {
    if (verificationTimer.current) clearTimeout(verificationTimer.current)
  }, [])
  useEffect(() => {
    if (verificationTimer.current) clearTimeout(verificationTimer.current)
    verificationTimer.current = null
  }, [content])
  const verify = content.code
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
      }}
    >
      {children}
    </HbarAppUiAuthenticationProvider>
  )
}
