import type { Paywall3BillingPeriod, Paywall3PreviewStoreSeed, Paywall3PreviewStoreState } from './paywall3PreviewStore'

export type Paywall3PreviewLocale = 'en' | 'de' | 'de-long'
export type Paywall3PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const PAYWALL3_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/paywall/paywall-3',
  liveObservation: {
    observedOn: '2026-09-29',
    previewAvailable: true,
    defaultPeriod: 'yearly',
    sampledPeriodSwitch: 'yearly-to-monthly',
    currentCaptureProtocolEvidence: false,
    checkoutAndComparisonResults: 'not-sampled-request-only',
  },
  staticCache: {
    cacheId: 'full-static-v10',
    sourceHash: 'a26e1489398f57fed8f77a7588a91d2123037ebb4e72a2ec4b41c69b49beb527',
    role: 'authorized-visual-reference-not-current-strict-proof',
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    sourceHash: 'a26e1489398f57fed8f77a7588a91d2123037ebb4e72a2ec4b41c69b49beb527',
    observed: 'disabled-current-plan-button-no-op-only',
    billingPeriodSwitchCovered: false,
  },
} as const

export interface Paywall3PreviewLabels {
  readonly title: string
  readonly description: string
  readonly billingPeriod: string
  readonly monthly: string
  readonly yearly: string
  readonly monthlyNote: string
  readonly yearlyNote: string
  readonly recommended: string
  readonly currentBadge: string
  readonly compare: string
  readonly priceNote: string
  readonly emptyPlans: string
}

export interface Paywall3PreviewPlan {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly prices: Readonly<Record<Paywall3BillingPeriod, { readonly amount: string; readonly suffix: string }>>
  readonly features: readonly string[]
  readonly isCurrent: boolean
  readonly badge: 'recommended' | 'current' | null
  readonly actionLabel: string
  readonly canRequestSelection: boolean
}

export interface Paywall3PreviewContent {
  readonly labels: Paywall3PreviewLabels
  readonly period: Paywall3BillingPeriod
  readonly periodNote: string
  readonly plans: readonly Paywall3PreviewPlan[]
  readonly listStrategy: { readonly kind: 'content-grown' | 'pane-scroll'; readonly expectedMaximum: number }
}

export interface Paywall3PreviewFixture {
  readonly seed: Paywall3PreviewStoreSeed
  readonly contentFor: (state: Paywall3PreviewStoreState) => Paywall3PreviewContent
}

const LABELS: Readonly<Record<Paywall3PreviewLocale, Paywall3PreviewLabels>> = {
  en: {
    title: 'Choose a plan to continue',
    description: 'Your trial ended on 3 March. Pick a plan to restore access to your workspaces.',
    billingPeriod: 'Billing period',
    monthly: 'Monthly',
    yearly: 'Yearly',
    monthlyNote: 'Monthly billing, cancel before the next renewal.',
    yearlyNote: 'Yearly billing saves 20 percent and is charged once per year.',
    recommended: 'Recommended',
    currentBadge: 'Current',
    compare: 'Compare every feature',
    priceNote: 'Prices in USD. Seats can be added or removed at any time.',
    emptyPlans: 'No plans are available.',
  },
  de: {
    title: 'Wähle einen Plan, um fortzufahren',
    description:
      'Dein Testzeitraum endete am 3. März. Wähle einen Plan, um den Zugriff auf deine Arbeitsbereiche wiederherzustellen.',
    billingPeriod: 'Abrechnungszeitraum',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
    monthlyNote: 'Monatliche Abrechnung. Kündige vor der nächsten Verlängerung.',
    yearlyNote: 'Die jährliche Abrechnung spart 20 Prozent und wird einmal pro Jahr berechnet.',
    recommended: 'Empfohlen',
    currentBadge: 'Aktuell',
    compare: 'Alle Funktionen vergleichen',
    priceNote: 'Preise in EUR. Plätze können jederzeit hinzugefügt oder entfernt werden.',
    emptyPlans: 'Keine Pläne verfügbar.',
  },
  'de-long': {
    title: 'Wähle den passenden Abonnementplan, um den Zugriff auf sämtliche Arbeitsbereiche deines Teams fortzusetzen',
    description:
      'Dein Testzeitraum endete am 3. März. Wähle einen Abonnementplan, um den Zugriff auf deine Arbeitsbereiche einschließlich gespeicherter Projekte wiederherzustellen.',
    billingPeriod: 'Gewünschter Abrechnungszeitraum',
    monthly: 'Monatliche Abrechnung',
    yearly: 'Jährliche Abrechnung',
    monthlyNote:
      'Die monatliche Abrechnung wird jeden Monat erneuert; du kannst vor der nächsten Verlängerung kündigen.',
    yearlyNote: 'Die jährliche Abrechnung spart 20 Prozent und wird einmal pro Jahr im Voraus berechnet.',
    recommended: 'Für die meisten Teams empfohlen',
    currentBadge: 'Derzeit ausgewählt',
    compare: 'Alle enthaltenen Funktionen miteinander vergleichen',
    priceNote: 'Preise in EUR. Sitzplätze für Teammitglieder können jederzeit hinzugefügt oder entfernt werden.',
    emptyPlans: 'Für diesen Arbeitsbereich sind derzeit keine Abonnementpläne verfügbar.',
  },
}

interface PlanSeed extends Omit<Paywall3PreviewPlan, 'prices'> {
  readonly prices: Paywall3PreviewPlan['prices']
}

function sourcePlans(locale: Paywall3PreviewLocale): readonly PlanSeed[] {
  const translated = locale !== 'en'
  return [
    {
      id: 'starter',
      name: 'Starter',
      description: translated
        ? 'Für ein einzelnes Projekt und einen kurzen Verlauf.'
        : 'For a single project and a short history window.',
      prices: {
        monthly: { amount: translated ? '0 €' : '$0', suffix: translated ? 'dauerhaft' : 'forever' },
        yearly: { amount: translated ? '0 €' : '$0', suffix: translated ? 'dauerhaft' : 'forever' },
      },
      features: translated
        ? ['1 Arbeitsbereich', '30 Tage Verlauf', 'Community-Support']
        : ['1 workspace', '30 days of history', 'Community support'],
      isCurrent: true,
      badge: 'current',
      actionLabel: translated ? 'Dein aktueller Plan' : 'Your current plan',
      canRequestSelection: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      description: translated
        ? 'Für Teams mit Exporten, Rollen und vollständigem Verlauf.'
        : 'For teams that need exports, roles and full history.',
      prices: {
        monthly: {
          amount: translated ? '24 €' : '$24',
          suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo',
        },
        yearly: { amount: translated ? '19 €' : '$19', suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo' },
      },
      features: translated
        ? [
            'Unbegrenzte Arbeitsbereiche',
            'Vollständiger Verlauf ohne Stichproben',
            'Geplante Exporte',
            'Rollenbasierter Zugriff',
          ]
        : ['Unlimited workspaces', 'Full history, no sampling', 'Scheduled exports', 'Role-based access'],
      isCurrent: false,
      badge: 'recommended',
      actionLabel: translated ? 'Pro auswählen' : 'Choose Pro',
      canRequestSelection: true,
    },
    {
      id: 'scale',
      name: 'Scale',
      description: translated
        ? 'Für Organisationen mit Prüf- und Datenresidenzanforderungen.'
        : 'For organisations with review and residency requirements.',
      prices: {
        monthly: {
          amount: translated ? '68 €' : '$68',
          suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo',
        },
        yearly: { amount: translated ? '54 €' : '$54', suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo' },
      },
      features: translated
        ? ['Alles aus Pro', 'Audit-Protokoll und SSO', 'Regionale Datenhaltung', 'Persönliche Ansprechperson']
        : ['Everything in Pro', 'Audit log and SSO', 'Region pinning', 'Named support contact'],
      isCurrent: false,
      badge: null,
      actionLabel: translated ? 'Scale auswählen' : 'Choose Scale',
      canRequestSelection: true,
    },
  ]
}

function createAdditionalPlans(locale: Paywall3PreviewLocale, count: number): readonly PlanSeed[] {
  const translated = locale !== 'en'
  return Array.from({ length: count }, (_, index) => ({
    id: `additional-${index + 1}`,
    name: translated ? `Zusätzlicher Plan ${index + 1}` : `Additional plan ${index + 1}`,
    description: translated ? 'Ein vom Host bereitgestellter Tarif.' : 'A host-provided plan option.',
    prices: {
      monthly: { amount: translated ? '28 €' : '$28', suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo' },
      yearly: { amount: translated ? '22 €' : '$22', suffix: translated ? 'pro Sitzplatz / Monat' : 'per seat / mo' },
    },
    features: [translated ? 'Arbeitsbereichszugriff' : 'Workspace access'],
    isCurrent: false,
    badge: null,
    actionLabel: translated ? `Plan ${index + 1} auswählen` : `Choose additional plan ${index + 1}`,
    canRequestSelection: false,
  }))
}

export function createPaywall3PreviewFixture(
  locale: Paywall3PreviewLocale = 'en',
  capacity: Paywall3PreviewCapacity = 'source',
): Paywall3PreviewFixture {
  const source = sourcePlans(locale)
  const additional = capacity === 'boundary' ? 3 : capacity === 'overflow' ? 12 : 0
  const plans =
    capacity === 'empty'
      ? []
      : capacity === 'one'
        ? source.slice(0, 1)
        : [...source, ...createAdditionalPlans(locale, additional)]
  const contentMaximum = 6
  return {
    seed: {
      initialPeriod: 'yearly',
      currentPlanId: 'starter',
      selectablePlanIds: plans.filter((plan) => plan.canRequestSelection).map((plan) => plan.id),
    },
    contentFor: (state) => ({
      labels: LABELS[locale],
      period: state.billingPeriod,
      periodNote: state.billingPeriod === 'yearly' ? LABELS[locale].yearlyNote : LABELS[locale].monthlyNote,
      plans,
      listStrategy: {
        kind: capacity === 'overflow' ? 'pane-scroll' : 'content-grown',
        expectedMaximum: contentMaximum,
      },
    }),
  }
}
