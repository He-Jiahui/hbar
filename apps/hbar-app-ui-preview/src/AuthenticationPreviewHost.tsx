import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  HbarAppUiAuthenticationProvider,
  type HbarAppUiAuthContent,
  type HbarAppUiVariantProps,
} from 'hbar-app-ui/catalog'
import {
  createAuthenticationPreviewSeed,
  createAuthenticationPreviewStore,
  type AuthenticationPreviewDraftKey,
  type AuthenticationPreviewDrafts,
} from './authenticationPreviewStore'

interface AuthenticationPreviewHostProps extends HbarAppUiVariantProps {
  readonly content: HbarAppUiAuthContent
  readonly children: ReactNode
}

/** Local preview outcomes are demonstrations, not authentication/service confirmations. */
export function AuthenticationPreviewHost(props: AuthenticationPreviewHostProps) {
  if (props.spec.category !== 'authentication') return props.children
  const key = JSON.stringify([props.spec.id, createAuthenticationPreviewSeed(props.content)])
  return <AuthenticationPreviewOwner key={key} {...props} />
}

function AuthenticationPreviewOwner({ content, spec, onAction, children }: AuthenticationPreviewHostProps) {
  const [store] = useState(() => createAuthenticationPreviewStore(content))
  // This store belongs only to this preview instance, not the application-wide state.
  const state = useStore(store)
  const {
    code,
    recoveryCode,
    phase,
    busy,
    seconds,
    signUpName,
    signUpEmail,
    signUpPassword,
    signUpVisible,
    signUpAgreed,
    enterpriseEmail,
    enterpriseBusy,
    passkeySelectedId,
    passkeyPhase,
    accountSelectedId,
    workspaceSelectedId,
    workspaceQuery,
    invitationName,
    invitationPassword,
    invitationVisible,
    invitationPhase,
    resetPassword,
    resetConfirmation,
    resetVisible,
    resetSignOutOther,
    resetPhase,
    approvalPhase,
    pendingVerification,
    pendingEnterprise,
  } = state
  const activeOwner = useRef(false)
  const latestAction = useRef(onAction)
  latestAction.current = onAction

  useLayoutEffect(() => {
    activeOwner.current = true
    return () => {
      activeOwner.current = false
      store.getState().clearOwner()
    }
  }, [store])

  useEffect(() => {
    if (spec.variant !== 6 || seconds <= 0) return undefined
    const timer = setTimeout(() => {
      if (activeOwner.current) store.getState().tickSeconds()
    }, 1000)
    return () => clearTimeout(timer)
  }, [seconds, spec.variant, store])

  useEffect(() => {
    if (!pendingVerification) return undefined
    const timer = setTimeout(() => {
      if (activeOwner.current) store.getState().completeVerification(pendingVerification)
    }, 1000)
    return () => clearTimeout(timer)
  }, [pendingVerification, store])

  useEffect(() => {
    if (!pendingEnterprise) return undefined
    const timer = setTimeout(() => {
      if (activeOwner.current) store.getState().completeEnterprise(pendingEnterprise)
    }, 1800)
    return () => clearTimeout(timer)
  }, [pendingEnterprise, store])

  function update<K extends AuthenticationPreviewDraftKey>(key: K, value: AuthenticationPreviewDrafts[K]): void {
    if (activeOwner.current) store.getState().setDraft(key, value)
  }

  function notify(actionId: string, value?: string): void {
    if (activeOwner.current)
      latestAction.current?.({ variantId: spec.id, actionId, ...(value === undefined ? {} : { value }) })
  }

  const verify = content.code
  const requirementsMet = [
    signUpPassword.length >= 10,
    /[A-Z]/.test(signUpPassword),
    /\d/.test(signUpPassword),
    /[^A-Za-z0-9]/.test(signUpPassword),
  ]
  function submit(): void {
    if (!activeOwner.current || !verify) return
    const current = store.getState()
    const valid =
      current.phase === 'recovery'
        ? current.recoveryCode.length === 11
        : current.phase === 'text' && new RegExp(`^\\d{${verify.codeLength}}$`).test(current.code)
    if (!valid) return
    const requestId = current.startVerification()
    if (requestId) notify('verify', JSON.stringify({ requestId, method: current.phase, outcome: 'preview-only' }))
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
            update('code', value)
            if (verify.referenceFlow && phase === 'text' && new RegExp(`^\\d{${verify.codeLength}}$`).test(value))
              submit()
          },
          onVerify: () =>
            verify.referenceFlow ? submit() : notify('verify', JSON.stringify({ outcome: 'preview-only' })),
          resend: verify.resend && {
            seconds,
            enabled: seconds === 0,
            onResend: () => {
              if (!activeOwner.current || store.getState().seconds > 0) return
              store.setState({ seconds: verify.resend?.seconds ?? 0 })
              notify('resend')
            },
          },
          onRecovery: () => notify('recovery'),
          onBack: () => notify('back'),
          referenceFlow: verify.referenceFlow && {
            ...verify.referenceFlow,
            phase,
            recoveryCode,
            canVerifyRecovery: recoveryCode.length === 11,
            onRecoveryCodeChange: (value) => update('recoveryCode', value.toUpperCase().slice(0, 11)),
            onModeChange: (mode) => {
              if (activeOwner.current) store.getState().changeMode(mode)
            },
            onContinue: () => notify('continue'),
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
            canSubmit:
              signUpName.trim().length >= 2 &&
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signUpEmail) &&
              requirementsMet.every(Boolean) &&
              signUpAgreed,
            onNameChange: (value) => update('signUpName', value),
            onEmailChange: (value) => update('signUpEmail', value),
            onPasswordChange: (value) => update('signUpPassword', value),
            onVisibleChange: (value) => update('signUpVisible', value),
            onAgreedChange: (value) => update('signUpAgreed', value),
          },
        },
        enterprise: content.enterprise && {
          ...content.enterprise,
          referenceFlow: content.enterprise.referenceFlow && {
            ...content.enterprise.referenceFlow,
            email: enterpriseEmail,
            busy: enterpriseBusy,
            onEmailChange: (value) => update('enterpriseEmail', value),
            onContinue: () => {
              const enterprise = content.enterprise
              if (!activeOwner.current || !enterprise) return
              const requestId = store.getState().startEnterprise()
              if (!requestId) return
              const domain = store.getState().enterpriseEmail.split('@')[1]?.trim().toLowerCase()
              const provider =
                enterprise.referenceFlow?.alternateOrganizations.find(
                  (entry) => entry.organization.domain.toLowerCase() === domain,
                )?.organization.provider ??
                (enterprise.organization.domain.toLowerCase() === domain ? enterprise.organization.provider : '')
              notify(
                'continue-sso',
                JSON.stringify({ requestId, provider, outcome: 'authentication-and-navigation-unverified' }),
              )
            },
          },
        },
        passkey: content.passkey && {
          ...content.passkey,
          referenceFlow: content.passkey.referenceFlow && {
            ...content.passkey.referenceFlow,
            selectedId: passkeySelectedId,
            phase: passkeyPhase,
            onSelect: (value) => update('passkeySelectedId', value),
            onContinue: (id) => {
              update('passkeyPhase', 'request')
              notify('continue-passkey', id)
            },
            onCancel: () => update('passkeyPhase', 'choose'),
          },
        },
        account: content.account && {
          ...content.account,
          referenceFlow: content.account.referenceFlow && {
            ...content.account.referenceFlow,
            selectedId: accountSelectedId,
            onSelect: (value) => update('accountSelectedId', value),
          },
        },
        workspace: content.workspace && {
          ...content.workspace,
          referenceFlow: content.workspace.referenceFlow && {
            ...content.workspace.referenceFlow,
            selectedId: workspaceSelectedId,
            query: workspaceQuery,
            onSelect: (value) => update('workspaceSelectedId', value),
            onQueryChange: (value) => update('workspaceQuery', value),
          },
        },
        invitation: content.invitation && {
          ...content.invitation,
          referenceFlow: content.invitation.referenceFlow && {
            ...content.invitation.referenceFlow,
            fullName: invitationName,
            password: invitationPassword,
            passwordVisible: invitationVisible,
            phase: invitationPhase,
            onFullNameChange: (value) => update('invitationName', value),
            onPasswordChange: (value) => update('invitationPassword', value),
            onTogglePassword: () => update('invitationVisible', !store.getState().invitationVisible),
            onSubmit: () => {
              update('invitationPhase', 'success')
              notify('accept', JSON.stringify({ outcome: 'preview-only' }))
            },
            onReview: () => update('invitationPhase', 'form'),
          },
        },
        passwordReset: content.passwordReset && {
          ...content.passwordReset,
          referenceFlow: content.passwordReset.referenceFlow && {
            ...content.passwordReset.referenceFlow,
            password: resetPassword,
            confirmation: resetConfirmation,
            passwordVisible: resetVisible,
            signOutOther: resetSignOutOther,
            phase: resetPhase,
            onPasswordChange: (value) => update('resetPassword', value),
            onConfirmationChange: (value) => update('resetConfirmation', value),
            onTogglePassword: () => update('resetVisible', !store.getState().resetVisible),
            onSignOutOtherChange: (value) => update('resetSignOutOther', value),
            onSubmit: () => {
              update('resetPhase', 'success')
              notify(
                'update-password',
                JSON.stringify({
                  scope: store.getState().resetSignOutOther ? 'all-devices' : 'current-device',
                  outcome: 'preview-only',
                }),
              )
            },
            onSetDifferent: () => {
              if (!activeOwner.current) return
              store.setState({
                resetPassword: '',
                resetConfirmation: '',
                resetVisible: false,
                resetSignOutOther: true,
                resetPhase: 'form',
              })
            },
          },
        },
        approval: content.approval && {
          ...content.approval,
          referenceFlow: content.approval.referenceFlow && {
            ...content.approval.referenceFlow,
            phase: approvalPhase,
            onApprove: () => {
              update('approvalPhase', 'approved')
              notify('approve-sign-in', JSON.stringify({ outcome: 'preview-only' }))
            },
            onDeny: () => {
              update('approvalPhase', 'blocked')
              notify('deny-sign-in', JSON.stringify({ outcome: 'preview-only' }))
            },
            onBack: () => update('approvalPhase', 'pending'),
            onChangePassword: () => notify('change-password', JSON.stringify({ outcome: 'navigation-unverified' })),
          },
        },
      }}
    >
      {children}
    </HbarAppUiAuthenticationProvider>
  )
}
