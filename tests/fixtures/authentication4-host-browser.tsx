import { StrictMode, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LumenAuthenticationProvider, useLumenAuthenticationContent, type LumenAuthTwoStepContent } from '@lumen/app-ui'
import { getHbarAppUiVariant, type HbarAppUiVariantProps } from '../../packages/hbar-app-ui/src/catalog'
import { Authentication4PreviewHost } from '../../apps/hbar-app-ui-preview/src/Authentication4PreviewHost'
import {
  createAuthentication4PreviewFixture,
  type Authentication4PreviewLocale,
  type Authentication4PreviewScenario,
} from '../../apps/hbar-app-ui-preview/src/authentication4PreviewFixtures'
import { HBAR_APP_UI_AUTHENTICATION_FIXTURES } from './hbar-app-ui-authentication-fixtures'
import '@lumen/app-ui/styles.css'
import '../../packages/hbar-app-ui/src/theme.css'

type ReferenceFlow = NonNullable<LumenAuthTwoStepContent['referenceFlow']>
type PreviewEvent = Parameters<NonNullable<HbarAppUiVariantProps['onAction']>>[0]
type Owner = 'primary' | 'secondary'

interface Configuration {
  readonly locale: Authentication4PreviewLocale
  readonly scenario: Authentication4PreviewScenario
  readonly initialEmail: string | null
  readonly wrongVariant: boolean
  readonly callbackTag: string
}

interface LoggedAction {
  readonly owner: Owner
  readonly callbackTag: string
  readonly event: PreviewEvent
}

export interface Authentication4BrowserHarness {
  readonly configure: (patch: Partial<Configuration>) => void
  readonly actions: () => readonly LoggedAction[]
  readonly clearActions: () => void
  readonly capturePrimaryFlow: () => void
  readonly invokeCapturedFlow: () => void
  readonly repeatContinue: () => void
}

const actions: LoggedAction[] = []
const flows = new Map<Owner, ReferenceFlow | undefined>()
let capturedFlow: ReferenceFlow | undefined
const parentContent = {
  ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
  signIn: HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn && {
    ...HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn,
    labels: { ...HBAR_APP_UI_AUTHENTICATION_FIXTURES.signIn.labels, title: 'Inherited sign-in contract' },
  },
}

function Probe({ owner }: { readonly owner: Owner }) {
  const content = useLumenAuthenticationContent()
  const flow = content?.twoStep?.referenceFlow
  useLayoutEffect(() => {
    flows.set(owner, flow)
    return () => {
      flows.delete(owner)
    }
  }, [flow, owner])
  return (
    <span
      hidden
      data-auth4-probe={owner}
      data-auth4-controlled={Boolean(flow)}
      data-auth4-inherited-title={content?.signIn?.labels.title}
    />
  )
}

function App() {
  const [configuration, setConfiguration] = useState<Configuration>({
    locale: 'en',
    scenario: 'source',
    initialEmail: null,
    wrongVariant: false,
    callbackTag: 'initial',
  })
  useLayoutEffect(() => {
    window.__authentication4Test = {
      configure: (patch) => setConfiguration((current) => ({ ...current, ...patch })),
      actions: () => [...actions],
      clearActions: () => {
        actions.length = 0
      },
      capturePrimaryFlow: () => {
        capturedFlow = flows.get('primary')
      },
      invokeCapturedFlow: () => {
        capturedFlow?.onEmailChange('retired@example.invalid')
        capturedFlow?.onPasswordChange('retired-secret')
        capturedFlow?.onPasswordVisibleChange(true)
        capturedFlow?.onContinueRequest()
        capturedFlow?.onSignInRequest()
        capturedFlow?.onNavigationRequest('create-account')
        capturedFlow?.onBack()
      },
      repeatContinue: () => {
        flows.get('primary')?.onContinueRequest()
        flows.get('primary')?.onContinueRequest()
      },
    }
    return () => {
      delete window.__authentication4Test
    }
  }, [])
  return (
    <LumenAuthenticationProvider content={parentContent}>
      {(['primary', 'secondary'] as const).map((owner) => {
        const fixture = createAuthentication4PreviewFixture(
          configuration.locale,
          owner === 'primary' ? configuration.scenario : 'password',
        )
        const projected =
          owner === 'primary' && configuration.initialEmail !== null
            ? { ...fixture, seed: { ...fixture.seed, email: configuration.initialEmail } }
            : fixture
        const entry = getHbarAppUiVariant('authentication', configuration.wrongVariant ? 1 : 4)
        const Component = entry.component
        return (
          <div key={owner} data-auth4-owner={owner}>
            <Authentication4PreviewHost
              content={HBAR_APP_UI_AUTHENTICATION_FIXTURES}
              referenceFixture={projected}
              spec={entry.spec}
              onAction={(event) => actions.push({ owner, callbackTag: configuration.callbackTag, event })}
            >
              <Probe owner={owner} />
              <Component />
            </Authentication4PreviewHost>
          </div>
        )
      })}
    </LumenAuthenticationProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Authentication 4 browser fixture needs its root element')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
