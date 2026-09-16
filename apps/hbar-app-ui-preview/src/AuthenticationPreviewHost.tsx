import { useEffect, useState, type ReactNode } from 'react'
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
    [seconds, setSeconds] = useState(content.code?.resend?.seconds ?? 0)
  if (source !== content) {
    setSource(content)
    setCode(content.code?.code ?? '')
    setSeconds(content.code?.resend?.seconds ?? 0)
  }
  useEffect(() => {
    if (!seconds) return
    const timer = setTimeout(() => setSeconds((current) => Math.max(0, current - 1)), 1000)
    return () => clearTimeout(timer)
  }, [seconds])
  const verify = content.code
  return (
    <HbarAppUiAuthenticationProvider
      content={{
        ...content,
        code: verify && {
          ...verify,
          code,
          canVerify: new RegExp(`^\\d{${verify.codeLength}}$`).test(code),
          onCodeChange: setCode,
          onVerify: () => onAction?.({ variantId: spec.id, actionId: 'verify', value: code }),
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
        },
      }}
    >
      {children}
    </HbarAppUiAuthenticationProvider>
  )
}
