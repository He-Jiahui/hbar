import { useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenAuthenticationProvider,
  useLumenAuthenticationContent,
  type LumenAuthContent,
  type LumenAuthProviderFirstReferenceFlow,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import { AuthenticationPreviewHost } from './AuthenticationPreviewHost'
import type { Authentication2PreviewFixture } from './authentication2PreviewFixtures'
import { createAuthentication2PreviewStore, type Authentication2HostRequest } from './authentication2PreviewStore'

interface Authentication2PreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAuthContent
  readonly referenceFixture: Authentication2PreviewFixture
  readonly children: ReactNode
}

/** Authentication 2 owns its drafts, not the legacy multi-variant demonstration timers. */
export function AuthenticationReferencePreviewHost(props: Authentication2PreviewHostProps) {
  if (props.spec.category === 'authentication' && props.spec.variant === 2) {
    return <Authentication2PreviewHost {...props} />
  }
  return <AuthenticationPreviewHost {...props} />
}

export function Authentication2PreviewHost(props: Authentication2PreviewHostProps) {
  if (props.spec.category !== 'authentication' || props.spec.variant !== 2) return props.children
  // Translated labels are deliberately outside the key: copy-only changes retain both drafts.
  return <Authentication2DraftOwner key={JSON.stringify(props.referenceFixture.seed)} {...props} />
}

function Authentication2DraftOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Authentication2PreviewHostProps) {
  const parentContent = useLumenAuthenticationContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const [store] = useState(() => createAuthentication2PreviewStore(referenceFixture.seed))
  const state = useStore(store)
  const notifyRequest = (request: Authentication2HostRequest | null) => {
    if (!request) return
    const actionId =
      request.kind === 'continue-request'
        ? 'request-authentication-continue'
        : request.kind === 'provider-request'
          ? 'request-authentication-provider'
          : 'request-authentication-navigation'
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }
  const referenceFlow: LumenAuthProviderFirstReferenceFlow = {
    mode: state.mode,
    email: state.email,
    domain: state.domain,
    onEmailChange: (value) => store.getState().updateEmail(value),
    onDomainChange: (value) => store.getState().updateDomain(value),
    onModeChange: (mode) => {
      if (!store.getState().setMode(mode)) return
      const current = store.getState()
      onActionRef.current?.({
        variantId: spec.id,
        actionId: 'toggle-provider',
        value: mode === 'sso' ? current.ssoProviderId : current.emailProviderId,
      })
    },
    onContinueRequest: (request) => notifyRequest(store.getState().requestContinuation(request)),
    onProviderRequest: (providerId) => notifyRequest(store.getState().requestProvider(providerId)),
    onNavigationRequest: (action) => notifyRequest(store.getState().requestNavigation(action)),
  }
  return (
    <LumenAuthenticationProvider
      content={{
        ...(parentContent ?? content),
        providerFirst: { ...referenceFixture.contentFor(state), referenceFlow },
      }}
    >
      {children}
    </LumenAuthenticationProvider>
  )
}
