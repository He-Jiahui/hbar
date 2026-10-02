import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenAuthenticationProvider,
  useLumenAuthenticationContent,
  type LumenAuthContent,
  type LumenAuthTwoStepContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Authentication4PreviewFixture } from './authentication4PreviewFixtures'
import { startAuthentication4PendingTimer } from './authentication4PreviewResources'
import { createAuthentication4PreviewStore, type Authentication4HostRequest } from './authentication4PreviewStore'
import './authentication4-preview.css'

type Authentication4ReferenceFlow = NonNullable<LumenAuthTwoStepContent['referenceFlow']>

interface Authentication4PreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAuthContent
  readonly referenceFixture: Authentication4PreviewFixture
  readonly children: ReactNode
}

/** Scenario/draft changes replace the owner. Copy-only changes keep its independent drafts. */
export function Authentication4PreviewHost(props: Authentication4PreviewHostProps) {
  if (props.spec.category !== 'authentication' || props.spec.variant !== 4) return props.children
  return <Authentication4DraftOwner key={JSON.stringify(props.referenceFixture.seed)} {...props} />
}

function Authentication4DraftOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Authentication4PreviewHostProps) {
  const parentContent = useLumenAuthenticationContent()
  const [store] = useState(() => createAuthentication4PreviewStore(referenceFixture.seed))
  const activeOwnerRef = useRef(false)
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const phase = useStore(store, (state) => state.phase)
  const email = useStore(store, (state) => state.email)
  const password = useStore(store, (state) => state.password)
  const passwordVisible = useStore(store, (state) => state.passwordVisible)
  const invalidEmail = useStore(store, (state) => state.invalidEmail)
  const pendingRequest = useStore(store, (state) => state.pendingRequest)
  const pendingDelayMs =
    pendingRequest?.kind === 'sign-in-request' ? referenceFixture.signInDelayMs : referenceFixture.continueDelayMs

  useLayoutEffect(() => {
    activeOwnerRef.current = true
    return () => {
      activeOwnerRef.current = false
      store.getState().clearOwner()
    }
  }, [store])

  useEffect(() => {
    if (!pendingRequest) return undefined
    return startAuthentication4PendingTimer(() => {
      if (activeOwnerRef.current) store.getState().completePending(pendingRequest.requestId)
    }, pendingDelayMs)
  }, [pendingRequest, pendingDelayMs, store])

  function notify(request: Authentication4HostRequest | null): void {
    if (!activeOwnerRef.current || !request) return
    const actionId =
      request.kind === 'continue-request'
        ? 'request-authentication-continue'
        : request.kind === 'sign-in-request'
          ? 'request-authentication-sign-in'
          : 'request-authentication-navigation'
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }

  const referenceFlow: Authentication4ReferenceFlow = {
    phase,
    email,
    password,
    passwordVisible,
    invalidEmail,
    onEmailChange: (value) => {
      if (activeOwnerRef.current) store.getState().setEmail(value)
    },
    onPasswordChange: (value) => {
      if (activeOwnerRef.current) store.getState().setPassword(value)
    },
    onPasswordVisibleChange: (visible) => {
      if (activeOwnerRef.current) store.getState().setPasswordVisible(visible)
    },
    onContinueRequest: () => {
      if (activeOwnerRef.current) notify(store.getState().startContinue())
    },
    onSignInRequest: () => {
      if (activeOwnerRef.current) notify(store.getState().startSignIn())
    },
    onBack: () => {
      if (activeOwnerRef.current) store.getState().back()
    },
    onNavigationRequest: (intent) => {
      if (activeOwnerRef.current) notify(store.getState().requestNavigation(intent))
    },
  }

  return (
    <LumenFrame className="hbar-app-ui-authentication4-preview-host" data-hbar-app-ui-auth4-controlled="true">
      <LumenAuthenticationProvider
        content={{
          ...(parentContent ?? content),
          twoStep: {
            ...referenceFixture.content,
            account: referenceFixture.accountFor(email),
            referenceFlow,
          },
        }}
      >
        {children}
      </LumenAuthenticationProvider>
    </LumenFrame>
  )
}
