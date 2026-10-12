import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenAuthenticationProvider, useLumenAuthenticationContent, type LumenAuthQuoteContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant, type HbarAppUiEvent } from '../../packages/hbar-app-ui/src/catalog'
import { Authentication3PreviewHost } from '../../apps/hbar-app-ui-preview/src/Authentication3PreviewHost'
import {
  createAuthentication3PreviewFixture,
  type Authentication3PreviewCapacity,
  type Authentication3PreviewLocale,
  type Authentication3PreviewMetricCapacity,
} from '../../apps/hbar-app-ui-preview/src/authentication3PreviewFixtures'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './hbar-app-ui-authentication-fixtures'
import '@lumen/app-ui/styles.css'

interface Authentication3BrowserConfiguration {
  readonly locale: Authentication3PreviewLocale
  readonly capacity: Authentication3PreviewCapacity
  readonly metricCapacity: Authentication3PreviewMetricCapacity
  readonly autoAdvanceMs: number
  readonly dropDaniel: boolean
  readonly messyIds: boolean
  readonly variant: 1 | 3
}

export interface Authentication3BrowserHarness {
  readonly configure: (patch: Partial<Authentication3BrowserConfiguration>) => void
  readonly actions: () => readonly HbarAppUiEvent[]
  readonly clearActions: () => void
  readonly activeIntervals: () => number
  readonly intervalTicks: () => number
  readonly captureCurrentSignInRequest: () => void
  readonly invokeCapturedSignInRequest: () => void
}

declare global {
  interface Window {
    __authentication3Test?: Authentication3BrowserHarness | undefined
  }
}

const trackedIntervalIds = new Set<number>()
let trackedIntervalTicks = 0
const nativeSetInterval = window.setInterval.bind(window)
const nativeClearInterval = window.clearInterval.bind(window)
window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
  const wrappedHandler =
    typeof handler === 'function'
      ? (...callbackArgs: unknown[]) => {
          trackedIntervalTicks += 1
          return (handler as (...values: unknown[]) => void)(...callbackArgs)
        }
      : handler
  const id = nativeSetInterval(wrappedHandler, timeout, ...args)
  trackedIntervalIds.add(id)
  return id
}) as typeof window.setInterval
window.clearInterval = ((id: number) => {
  trackedIntervalIds.delete(id)
  nativeClearInterval(id)
}) as typeof window.clearInterval

function InheritedContentProbe({
  onReferenceFlow,
}: {
  readonly onReferenceFlow: (flow: NonNullable<LumenAuthQuoteContent['referenceFlow']> | null) => void
}) {
  const content = useLumenAuthenticationContent()
  const flow = content?.quote?.referenceFlow
  onReferenceFlow(flow ?? null)
  return (
    <output
      data-auth3-inherited-title={content?.signIn?.labels.title}
      data-auth3-controlled={String(Boolean(flow))}
      data-auth3-quote-id={flow?.quoteId ?? 'empty'}
    />
  )
}

function BrowserFixture() {
  const [configuration, setConfiguration] = useState<Authentication3BrowserConfiguration>({
    locale: 'en',
    capacity: 'source',
    metricCapacity: 'source',
    autoAdvanceMs: 60_000,
    dropDaniel: false,
    messyIds: false,
    variant: 3,
  })
  const actions = useRef<HbarAppUiEvent[]>([])
  const referenceFlow = useRef<NonNullable<LumenAuthQuoteContent['referenceFlow']> | null>(null)
  const capturedSignInRequest = useRef<(() => void) | null>(null)
  const harness = useMemo<Authentication3BrowserHarness>(
    () => ({
      configure: (patch) => flushSync(() => setConfiguration((current) => ({ ...current, ...patch }))),
      actions: () => actions.current,
      clearActions: () => {
        actions.current = []
      },
      activeIntervals: () => trackedIntervalIds.size,
      intervalTicks: () => trackedIntervalTicks,
      captureCurrentSignInRequest: () => {
        const flow = referenceFlow.current
        capturedSignInRequest.current = flow
          ? () => flow.onSignInRequest({ email: flow.email, quoteId: flow.quoteId })
          : null
      },
      invokeCapturedSignInRequest: () => capturedSignInRequest.current?.(),
    }),
    [],
  )
  useEffect(() => {
    window.__authentication3Test = harness
    return () => {
      delete window.__authentication3Test
    }
  }, [harness])

  const parentContent = {
    ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
    signIn: HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn && {
      ...HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn,
      labels: { ...HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn.labels, title: 'Parent sign-in contract' },
    },
  }
  const onAction = (action: HbarAppUiEvent) => {
    actions.current.push(action)
  }
  const baseFixture = createAuthentication3PreviewFixture(
    configuration.locale,
    configuration.capacity,
    configuration.metricCapacity,
  )
  const quotes = configuration.dropDaniel
    ? baseFixture.content.quotes.filter((quote) => quote.id !== 'daniel')
    : baseFixture.content.quotes
  const content = configuration.messyIds
    ? {
        ...baseFixture.content,
        quotes: [
          ...(quotes[0] ? [{ ...quotes[0], id: ` ${quotes[0].id} ` }] : []),
          ...(quotes[1] ? [{ ...quotes[1], id: ` ${quotes[1].id} ` }] : []),
          ...(quotes[1] ? [{ ...quotes[1], id: quotes[1].id }] : []),
          { ...(quotes[2] ?? baseFixture.content.quotes[2]!), id: '   ' },
          ...quotes.slice(2),
        ],
        providers: [
          ...(baseFixture.content.providers[0]
            ? [{ ...baseFixture.content.providers[0], id: ` ${baseFixture.content.providers[0].id} ` }]
            : []),
          ...(baseFixture.content.providers[1] ? [baseFixture.content.providers[1]] : []),
          ...(baseFixture.content.providers[2] ? [{ ...baseFixture.content.providers[2], id: 'github' }] : []),
          { id: '   ', icon: 'key' as const, label: 'Blank provider must be omitted' },
          ...baseFixture.content.providers.slice(3),
        ],
      }
    : { ...baseFixture.content, quotes }
  const referenceFixture = {
    ...baseFixture,
    autoAdvanceMs: configuration.autoAdvanceMs,
    content,
  }
  const variant = getHbarAppUiVariant('authentication', configuration.variant)
  const AuthenticationVariant = variant.component
  const children = (
    <>
      <AuthenticationVariant onAction={onAction} />
      <InheritedContentProbe onReferenceFlow={(flow) => (referenceFlow.current = flow)} />
    </>
  )

  return (
    <LumenAuthenticationProvider content={parentContent}>
      <div className="hbar-app-ui-isolated-canvas">
        <Authentication3PreviewHost
          spec={variant.spec}
          content={parentContent}
          referenceFixture={referenceFixture}
          onAction={onAction}
        >
          {children}
        </Authentication3PreviewHost>
      </div>
    </LumenAuthenticationProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing Authentication 3 host fixture root')
createRoot(root).render(<BrowserFixture />)
