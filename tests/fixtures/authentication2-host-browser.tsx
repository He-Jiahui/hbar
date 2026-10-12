import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { LumenAuthenticationProvider, useLumenAuthenticationContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant, type HbarAppUiEvent } from '../../packages/hbar-app-ui/src/catalog'
import { Authentication2PreviewHost } from '../../apps/hbar-app-ui-preview/src/Authentication2PreviewHost'
import {
  createAuthentication2PreviewFixture,
  type Authentication2PreviewCapacity,
  type Authentication2PreviewLocale,
} from '../../apps/hbar-app-ui-preview/src/authentication2PreviewFixtures'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './hbar-app-ui-authentication-fixtures'
import '@lumen/app-ui/styles.css'

const Authentication2 = getHbarAppUiVariant('authentication', 2).component

interface Authentication2BrowserConfiguration {
  readonly locale: Authentication2PreviewLocale
  readonly capacity: Authentication2PreviewCapacity
  readonly legacy: boolean
  readonly bypass: boolean
}

export interface Authentication2BrowserHarness {
  readonly configure: (patch: Partial<Authentication2BrowserConfiguration>) => void
  readonly actions: () => readonly HbarAppUiEvent[]
  readonly clearActions: () => void
}

declare global {
  interface Window {
    __authentication2Test?: Authentication2BrowserHarness | undefined
  }
}

function InheritedContentProbe() {
  const content = useLumenAuthenticationContent()
  return (
    <output
      data-auth2-inherited-title={content?.signIn?.labels.title}
      data-auth2-controlled={Boolean(content?.providerFirst?.referenceFlow)}
    />
  )
}

function BrowserFixture() {
  const [configuration, setConfiguration] = useState<Authentication2BrowserConfiguration>({
    locale: 'en',
    capacity: 'source',
    legacy: false,
    bypass: false,
  })
  const actions = useRef<HbarAppUiEvent[]>([])
  const harness = useMemo<Authentication2BrowserHarness>(
    () => ({
      configure: (patch) => flushSync(() => setConfiguration((current) => ({ ...current, ...patch }))),
      actions: () => actions.current,
      clearActions: () => {
        actions.current = []
      },
    }),
    [],
  )
  useEffect(() => {
    window.__authentication2Test = harness
    return () => {
      delete window.__authentication2Test
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
  const children = (
    <>
      <Authentication2 onAction={onAction} />
      <InheritedContentProbe />
    </>
  )
  return (
    <LumenAuthenticationProvider content={parentContent}>
      {configuration.legacy ? (
        children
      ) : (
        <Authentication2PreviewHost
          spec={getHbarAppUiVariant('authentication', configuration.bypass ? 1 : 2).spec}
          content={{}}
          referenceFixture={createAuthentication2PreviewFixture(configuration.locale, configuration.capacity)}
          onAction={onAction}
        >
          {children}
        </Authentication2PreviewHost>
      )}
    </LumenAuthenticationProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing Authentication 2 host fixture root')
createRoot(root).render(<BrowserFixture />)
