import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { LumenPaywall03, LumenPaywallProvider, type LumenPaywallAction, type LumenPaywallContent } from '@lumen/app-ui/catalog'
import { createHbarAppUiPaywallLocalizedFixtures, HBAR_APP_UI_PAYWALL_FIXTURES } from './hbar-app-ui-paywall-fixtures'
import '@lumen/app-ui/styles.css'

export type PaywallPlansPeriod = 'monthly' | 'yearly'

export interface PaywallPlansContentPatch {
  readonly initialPeriod?: PaywallPlansPeriod | undefined
  readonly locale?: 'en' | 'de' | undefined
  readonly description?: string | undefined
}

export interface PaywallPlansRenderSnapshot {
  readonly initialPeriod: PaywallPlansPeriod
  readonly selectedPeriodLabel: string | null
}

export interface PaywallPlansBrowserHarness {
  readonly replaceContent: (patch: PaywallPlansContentPatch) => void
  readonly snapshot: () => PaywallPlansRenderSnapshot | null
  readonly lastAction: () => LumenPaywallAction | null
}

declare global {
  interface Window {
    __paywallPlansTest?: PaywallPlansBrowserHarness | undefined
  }
}

const LOCALIZED_FIXTURES = createHbarAppUiPaywallLocalizedFixtures()

function applyContentPatch(content: LumenPaywallContent, patch: PaywallPlansContentPatch) {
  if (!content.plans) return content

  const sourcePlans =
    patch.locale === 'de'
      ? (LOCALIZED_FIXTURES.plans ?? content.plans)
      : patch.locale === 'en'
        ? (HBAR_APP_UI_PAYWALL_FIXTURES.plans ?? content.plans)
        : content.plans
  const initialPeriod = patch.initialPeriod ?? content.plans.initialPeriod
  const labels =
    patch.description === undefined ? sourcePlans.labels : { ...sourcePlans.labels, description: patch.description }

  return {
    ...content,
    plans: { ...sourcePlans, initialPeriod, labels },
  }
}

function selectedPeriodLabel() {
  return (
    document
      .querySelector<HTMLButtonElement>('.hbar-app-ui-paywall-period button[aria-pressed="true"]')
      ?.textContent?.trim() ?? null
  )
}

function BrowserFixture() {
  const [content, setContent] = useState<LumenPaywallContent>(HBAR_APP_UI_PAYWALL_FIXTURES)
  const snapshotRef = useRef<PaywallPlansRenderSnapshot | null>(null)
  const lastActionRef = useRef<LumenPaywallAction | null>(null)

  const replaceContent = useCallback((patch: PaywallPlansContentPatch) => {
    flushSync(() => {
      setContent((current) => applyContentPatch(current, patch))
    })
  }, [])

  const harness = useMemo<PaywallPlansBrowserHarness>(
    () => ({
      replaceContent,
      snapshot: () => snapshotRef.current,
      lastAction: () => lastActionRef.current,
    }),
    [replaceContent],
  )

  useLayoutEffect(() => {
    const initialPeriod = content.plans?.initialPeriod
    if (initialPeriod) snapshotRef.current = { initialPeriod, selectedPeriodLabel: selectedPeriodLabel() }
  }, [content])

  useEffect(() => {
    window.__paywallPlansTest = harness
    return () => {
      delete window.__paywallPlansTest
    }
  }, [harness])

  return (
    <LumenPaywallProvider content={content}>
      <LumenPaywall03
        onAction={(action) => {
          lastActionRef.current = action
        }}
      />
    </LumenPaywallProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing Paywall generic-plans fixture root')
createRoot(root).render(<BrowserFixture />)
