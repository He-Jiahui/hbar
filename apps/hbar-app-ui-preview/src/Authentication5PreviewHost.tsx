import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenAuthenticationProvider, type LumenAuthContent, type LumenAuthMagicLinkContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import {
  createAuthentication5PreviewStore,
  createAuthentication5Seed,
  type Authentication5Request,
} from './authentication5PreviewStore'

interface Authentication5PreviewHostProps extends HbarAppUiVariantProps {
  readonly content: LumenAuthContent
  readonly children: ReactNode
}

export function Authentication5PreviewHost(props: Authentication5PreviewHostProps) {
  const magicLink = props.content.magicLink
  if (props.spec.category !== 'authentication' || props.spec.variant !== 5 || !magicLink) return props.children
  return (
    <Authentication5Owner key={JSON.stringify(createAuthentication5Seed(magicLink))} {...props} magicLink={magicLink} />
  )
}

function Authentication5Owner({
  content,
  magicLink,
  spec,
  onAction,
  children,
}: Authentication5PreviewHostProps & { readonly magicLink: LumenAuthMagicLinkContent }) {
  const [store] = useState(() => createAuthentication5PreviewStore(createAuthentication5Seed(magicLink)))
  const email = useStore(store, (state) => state.email)
  const phase = useStore(store, (state) => state.phase)
  const seconds = useStore(store, (state) => state.seconds)
  const invalidEmail = useStore(store, (state) => state.invalidEmail)
  const active = useRef(false)
  const action = useRef(onAction)
  action.current = onAction

  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    if (phase !== 'sent' || seconds <= 0) return undefined
    const timer = setTimeout(() => {
      if (active.current) store.getState().tick()
    }, 1000)
    return () => clearTimeout(timer)
  }, [phase, seconds, store])

  function notify(request: Authentication5Request | null): void {
    if (active.current && request)
      action.current?.({ variantId: spec.id, actionId: request.kind, value: JSON.stringify(request) })
  }

  return (
    <LumenAuthenticationProvider
      content={{
        ...content,
        magicLink: {
          ...magicLink,
          referenceFlow: {
            email,
            phase,
            seconds,
            invalidEmail,
            onEmailChange: (value) => {
              if (active.current) store.getState().setEmail(value)
            },
            onDifferentEmail: () => {
              if (!active.current) return
              store.getState().differentEmail()
              action.current?.({ variantId: spec.id, actionId: 'different-email' })
            },
            onSend: () => {
              if (active.current) notify(store.getState().send())
            },
            onResend: () => {
              if (active.current) notify(store.getState().resend())
            },
            onNavigate: (intent) => {
              if (active.current) notify(store.getState().navigate(intent))
            },
          },
        },
      }}
    >
      {children}
    </LumenAuthenticationProvider>
  )
}
