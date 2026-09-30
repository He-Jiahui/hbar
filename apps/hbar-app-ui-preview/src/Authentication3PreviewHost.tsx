import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import {
  LumenAuthenticationProvider,
  useLumenAuthenticationContent,
  type LumenAuthContent,
  type LumenAuthQuoteContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Authentication3PreviewFixture } from './authentication3PreviewFixtures'
import {
  createAuthentication3PreviewStore,
  normalizeAuthentication3Id,
  startAuthentication3QuoteInterval,
  type Authentication3HostRequest,
} from './authentication3PreviewStore'
import './authentication3-preview.css'

type Authentication3ReferenceFlow = NonNullable<LumenAuthQuoteContent['referenceFlow']>

interface Authentication3PreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAuthContent
  readonly referenceFixture: Authentication3PreviewFixture
  readonly children: ReactNode
}

function ownerKey(seed: Authentication3PreviewFixture['seed']): string {
  return JSON.stringify({ scenarioKey: seed.scenarioKey, email: seed.email, initialQuoteId: seed.initialQuoteId })
}

function normalizeRows<T extends { readonly id: string }>(rows: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  const normalized: T[] = []
  for (const row of rows) {
    const id = normalizeAuthentication3Id(row.id)
    if (id === null || seen.has(id)) continue
    seen.add(id)
    normalized.push({ ...row, id })
  }
  return normalized
}

/** Authentication 3 keeps credential drafts out of the generic demonstration host. */
export function Authentication3PreviewHost(props: Authentication3PreviewHostProps) {
  if (props.spec.category !== 'authentication' || props.spec.variant !== 3) return props.children
  // Copy and current lists are excluded from the key; new scenarios and initial drafts reset this owner.
  return <Authentication3DraftOwner key={ownerKey(props.referenceFixture.seed)} {...props} />
}

export function Authentication3DraftOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: Authentication3PreviewHostProps) {
  const parentContent = useLumenAuthenticationContent()
  const onActionRef = useRef(onAction)
  const activeOwnerRef = useRef(false)
  onActionRef.current = onAction
  const [store] = useState(() => createAuthentication3PreviewStore(referenceFixture.seed))
  const email = useStore(store, (state) => state.email)
  const password = useStore(store, (state) => state.password)
  const passwordVisible = useStore(store, (state) => state.passwordVisible)
  const quoteId = useStore(store, (state) => state.quoteId)
  const quotes = useMemo(() => normalizeRows(referenceFixture.content.quotes), [referenceFixture.content.quotes])
  const providers = useMemo(
    () => normalizeRows(referenceFixture.content.providers),
    [referenceFixture.content.providers],
  )
  const contentQuoteIds = useMemo(() => quotes.map((quote) => quote.id), [quotes])
  const contentProviderIds = useMemo(() => providers.map((provider) => provider.id), [providers])
  const projectedQuoteContent = useMemo(
    () => ({ ...referenceFixture.content, quotes, providers }),
    [referenceFixture.content, quotes, providers],
  )

  useLayoutEffect(() => {
    activeOwnerRef.current = true
    return () => {
      activeOwnerRef.current = false
      store.getState().updatePassword('')
      store.getState().setPasswordVisible(false)
    }
  }, [store])

  useLayoutEffect(() => {
    store.getState().replaceQuoteIds(contentQuoteIds)
  }, [contentQuoteIds, store])

  useLayoutEffect(() => {
    store.getState().replaceProviderIds(contentProviderIds)
  }, [contentProviderIds, store])

  useEffect(() => {
    return startAuthentication3QuoteInterval(
      () => {
        store.getState().advanceQuote(1)
      },
      contentQuoteIds.length,
      referenceFixture.autoAdvanceMs,
    )
  }, [contentQuoteIds.length, referenceFixture.autoAdvanceMs, store])

  const notifyRequest = (request: Authentication3HostRequest | null) => {
    if (!activeOwnerRef.current || !request) return
    const actionId =
      request.kind === 'sign-in-request'
        ? 'request-authentication-sign-in'
        : request.kind === 'provider-request'
          ? 'request-authentication-provider'
          : 'request-authentication-navigation'
    onActionRef.current?.({ variantId: spec.id, actionId, value: JSON.stringify(request) })
  }

  const referenceFlow: Authentication3ReferenceFlow = {
    email,
    password,
    passwordVisible,
    quoteId,
    onEmailChange: (value) => store.getState().updateEmail(value),
    onPasswordChange: (value) => store.getState().updatePassword(value),
    onPasswordVisibleChange: (visible) => store.getState().setPasswordVisible(visible),
    onQuoteChange: (id) => {
      store.getState().selectQuote(id)
    },
    onSignInRequest: (input) => notifyRequest(store.getState().requestSignIn(input)),
    onProviderRequest: (id) => notifyRequest(store.getState().requestProvider(id)),
    onNavigationRequest: (action) => notifyRequest(store.getState().requestNavigation(action)),
  }

  return (
    <div className="hbar-app-ui-authentication3-preview-host" data-hbar-app-ui-auth3-controlled="true">
      <LumenAuthenticationProvider
        content={{
          ...(parentContent ?? content),
          quote: { ...projectedQuoteContent, referenceFlow },
        }}
      >
        {children}
      </LumenAuthenticationProvider>
    </div>
  )
}
