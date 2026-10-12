import type { LumenAuthListStrategy, LumenAuthProviderChoice, LumenAuthQuote, LumenAuthQuoteContent } from '@lumen/app-ui/catalog'
import type { Authentication3PreviewStoreSeed } from './authentication3PreviewStore'

export type Authentication3PreviewLocale = 'en' | 'de' | 'de-long'
export type Authentication3PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'
export type Authentication3PreviewMetricCapacity = 'source' | 'overflow'

export const AUTHENTICATION3_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/authentication/authentication-3',
  historicalCache: {
    artifacts: ['full-static-v10', 'full-interactions-v4'],
    generatedOn: '2026-09-23',
    selectedVariants: 300,
    authentication3InteractionRecords: 32,
    role: 'historical cached reference; not current source or behavior proof',
  },
} as const

export const AUTHENTICATION3_HOST_CAPACITY_POLICY = {
  sourceProviderCount: 3,
  sourceQuoteCount: 3,
  sourceMaximum: 'not-tested',
  hostExpectedMaximum: 6,
  overflowFixtureCount: 17,
  metricOverflowFixtureCount: 17,
} as const

/** Preview cadence from the legacy host fixture; it is not a current source timing measurement. */
export const AUTHENTICATION3_AUTO_ADVANCE_MS = 8_000

export interface Authentication3PreviewFixture {
  readonly seed: Authentication3PreviewStoreSeed
  readonly autoAdvanceMs: number
  readonly content: LumenAuthQuoteContent
}

type Authentication3Labels = LumenAuthQuoteContent['labels']

const LABELS: Readonly<Record<Authentication3PreviewLocale, Authentication3Labels>> = {
  en: {
    brand: 'Northwind',
    title: 'Sign in',
    description: 'Use your Northwind account to continue.',
    emailLabel: 'Work email',
    emailPlaceholder: 'name@company.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    forgotPassword: 'Forgot password?',
    signIn: 'Sign in',
    divider: 'Or continue with',
    newAccount: 'New to Northwind?',
    inlineSeparator: ' ',
    createAccount: 'Create an account',
    quoteEyebrow: 'Why teams switch',
    emptyQuotes: 'No customer stories yet.',
    previousQuote: 'Previous quote',
    nextQuote: 'Next quote',
    showQuote: (name) => `Show quote from ${name}`,
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  de: {
    brand: 'Northwind',
    title: 'Anmelden',
    description: 'Melde dich mit deinem Northwind-Konto an.',
    emailLabel: 'Geschäftliche E-Mail-Adresse',
    emailPlaceholder: 'name@unternehmen.de',
    passwordLabel: 'Passwort',
    passwordPlaceholder: 'Gib dein Passwort ein',
    forgotPassword: 'Passwort vergessen?',
    signIn: 'Anmelden',
    divider: 'Oder fahre fort mit',
    newAccount: 'Neu bei Northwind?',
    inlineSeparator: ' ',
    createAccount: 'Konto erstellen',
    quoteEyebrow: 'Warum Teams wechseln',
    emptyQuotes: 'Es gibt noch keine Kundenberichte.',
    previousQuote: 'Vorheriges Zitat',
    nextQuote: 'Nächstes Zitat',
    showQuote: (name) => `Zitat von ${name} anzeigen`,
    showPassword: 'Passwort anzeigen',
    hidePassword: 'Passwort verbergen',
  },
  'de-long': {
    brand: 'Northwind',
    title: 'Anmelden und zum gemeinsamen Arbeitsbereich zurückkehren',
    description:
      'Verwende die geschäftliche E-Mail-Adresse deines Unternehmens, um sicher zu deinem gemeinsamen Northwind-Arbeitsbereich fortzufahren.',
    emailLabel: 'Vollständige geschäftliche E-Mail-Adresse für deinen Northwind-Arbeitsbereich',
    emailPlaceholder: 'dein-name@dein-unternehmen.example',
    passwordLabel: 'Passwort für das Northwind-Unternehmenskonto',
    passwordPlaceholder: 'Gib das Passwort für dein Unternehmenskonto ein',
    forgotPassword: 'Passwort für dein Unternehmenskonto vergessen?',
    signIn: 'Mit deinem Northwind-Unternehmenskonto anmelden',
    divider: 'Oder mit einem dieser verbundenen Anbieter fortfahren',
    newAccount: 'Du verwendest Northwind zum ersten Mal?',
    inlineSeparator: ' ',
    createAccount: 'Ein neues Konto für deinen gemeinsamen Arbeitsbereich erstellen',
    quoteEyebrow: 'Warum Teams zum gemeinsamen Arbeitsbereich wechseln',
    emptyQuotes: 'Für diesen Arbeitsbereich wurden noch keine Kundengeschichten bereitgestellt.',
    previousQuote: 'Zum vorherigen Kundenzitat zurückkehren',
    nextQuote: 'Das nächste Kundenzitat anzeigen',
    showQuote: (name) => `Das ausführliche Kundenzitat von ${name} anzeigen`,
    showPassword: 'Das eingegebene Passwort sichtbar machen',
    hidePassword: 'Das eingegebene Passwort wieder verbergen',
  },
}

const BASE_PROVIDERS = [
  { id: 'google', label: 'Google', icon: 'google' },
  { id: 'apple', label: 'Apple', icon: 'apple' },
  { id: 'github', label: 'GitHub', icon: 'github' },
] as const satisfies readonly LumenAuthProviderChoice[]

const PROVIDER_LABELS: Readonly<Record<Authentication3PreviewLocale, (id: string, index: number) => string>> = {
  en: (id, index) =>
    BASE_PROVIDERS.find((provider) => provider.id === id)?.label ?? `Continue with provider ${index + 1}`,
  de: (id, index) => {
    const labels: Readonly<Record<string, string>> = { google: 'Google', apple: 'Apple', github: 'GitHub' }
    return labels[id] ?? `Mit Anbieter ${index + 1} fortfahren`
  },
  'de-long': (id, index) => {
    const labels: Readonly<Record<string, string>> = {
      google: 'Mit dem verbundenen Google-Konto des gemeinsamen Arbeitsbereichs fortfahren',
      apple: 'Mit dem für den Unternehmensarbeitsbereich hinterlegten Apple-Konto fortfahren',
      github: 'Mit dem verbundenen GitHub-Konto des gemeinsamen Arbeitsbereichs fortfahren',
    }
    return labels[id] ?? `Mit dem zusätzlichen Anmeldeanbieter ${index + 1} des gemeinsamen Arbeitsbereichs fortfahren`
  },
}

const SOURCE_QUOTES: readonly LumenAuthQuote[] = [
  {
    id: 'mina',
    text: 'We replaced four spreadsheets and a weekly status call with one board. Reviews now start with everyone already agreeing on the numbers.',
    initials: 'MP',
    name: 'Mina Park',
    role: 'Head of product design, Aurelia',
    metrics: [
      { label: 'Setup', value: '1 day' },
      { label: 'Weekly hours saved', value: '9.5' },
      { label: 'Teams onboarded', value: '24' },
    ],
  },
  {
    id: 'daniel',
    text: 'The audit trail is the part nobody expected to love. Every approval has a name and a timestamp, so compliance stopped chasing us.',
    initials: 'DO',
    name: 'Daniel Osei',
    role: 'Director of operations, Ardent Freight',
    metrics: [
      { label: 'Approval time', value: '-62%' },
      { label: 'Audit findings', value: '0' },
      { label: 'Sites live', value: '31' },
    ],
  },
  {
    id: 'rachel',
    text: 'Our on-call handover used to take half an hour. It takes four minutes now, and the incoming engineer already knows what changed.',
    initials: 'RL',
    name: 'Rachel Lindqvist',
    role: 'Staff engineer, Kestrel Data',
    metrics: [
      { label: 'Handover', value: '4 min' },
      { label: 'Escalations', value: '-38%' },
      { label: 'Services tracked', value: '112' },
    ],
  },
]

function providerCount(capacity: Authentication3PreviewCapacity): number {
  switch (capacity) {
    case 'source':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.sourceProviderCount
    case 'empty':
      return 0
    case 'one':
      return 1
    case 'boundary':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.hostExpectedMaximum
    case 'overflow':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.overflowFixtureCount
  }
}

function quoteCount(capacity: Authentication3PreviewCapacity): number {
  switch (capacity) {
    case 'source':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.sourceQuoteCount
    case 'empty':
      return 0
    case 'one':
      return 1
    case 'boundary':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.hostExpectedMaximum
    case 'overflow':
      return AUTHENTICATION3_HOST_CAPACITY_POLICY.overflowFixtureCount
  }
}

function createProviders(locale: Authentication3PreviewLocale, count: number): readonly LumenAuthProviderChoice[] {
  return Array.from({ length: count }, (_, index) => {
    const knownProvider = BASE_PROVIDERS[index]
    const id = knownProvider?.id ?? `host-provider-${index + 1}`
    return {
      id,
      icon: knownProvider?.icon ?? 'key',
      label: PROVIDER_LABELS[locale](id, index),
    }
  })
}

function createQuotes(count: number, metricOverflow: boolean): readonly LumenAuthQuote[] {
  return Array.from({ length: count }, (_, index) => {
    const sourceQuote = SOURCE_QUOTES[index]
    if (sourceQuote && !(metricOverflow && index === 0)) return sourceQuote
    if (metricOverflow && index === 0) {
      const firstQuote = SOURCE_QUOTES[0]
      if (!firstQuote) return undefined
      return {
        ...firstQuote,
        metrics: [
          ...firstQuote.metrics,
          ...Array.from(
            { length: AUTHENTICATION3_HOST_CAPACITY_POLICY.metricOverflowFixtureCount - firstQuote.metrics.length },
            (_, metricIndex) => ({
              label: `Additional metric ${metricIndex + 1}`,
              value: `${metricIndex + 1} units`,
            }),
          ),
        ],
      }
    }
    const ordinal = index + 1
    return {
      id: `host-story-${ordinal}`,
      text: `Preview customer story ${ordinal} demonstrates that host-provided quote content remains available beyond the expected boundary.`,
      initials: `H${ordinal}`,
      name: `Host story ${ordinal}`,
      role: `Workspace customer ${ordinal}`,
      metrics: [
        { label: 'Preview metric', value: `${ordinal} days` },
        { label: 'Items tracked', value: String(ordinal * 3) },
        { label: 'Teams onboarded', value: String(ordinal + 2) },
      ],
    }
  }).filter((quote): quote is LumenAuthQuote => quote !== undefined)
}

function providerListStrategy(): LumenAuthListStrategy {
  return {
    // Quote authentication uses three columns for the observed providers, then wraps all host items in normal flow.
    kind: 'content-grown',
    expectedMaximum: AUTHENTICATION3_HOST_CAPACITY_POLICY.hostExpectedMaximum,
  }
}

function quoteListStrategy(): LumenAuthListStrategy {
  // The quote is a single selected story; its navigation dots wrap in normal flow, including stress fixtures.
  return { kind: 'content-grown', expectedMaximum: AUTHENTICATION3_HOST_CAPACITY_POLICY.hostExpectedMaximum }
}

export function createAuthentication3PreviewFixture(
  locale: Authentication3PreviewLocale = 'en',
  capacity: Authentication3PreviewCapacity = 'source',
  metricCapacity: Authentication3PreviewMetricCapacity = 'source',
): Authentication3PreviewFixture {
  const providers = createProviders(locale, providerCount(capacity))
  const quotes = createQuotes(quoteCount(capacity), metricCapacity === 'overflow')
  return {
    seed: {
      scenarioKey: `${capacity}:${metricCapacity}`,
      email: 'dana.whitfield@northwind.com',
      initialQuoteId: 'mina',
      quoteIds: quotes.map((quote) => quote.id),
      providerIds: providers.map((provider) => provider.id),
    },
    autoAdvanceMs: AUTHENTICATION3_AUTO_ADVANCE_MS,
    content: {
      labels: LABELS[locale],
      providers,
      providerListStrategy: providerListStrategy(),
      quotes,
      quoteListStrategy: quoteListStrategy(),
      initialEmail: 'dana.whitfield@northwind.com',
      initialQuoteId: 'mina',
      // The controlled host owns the interval; zero prevents the legacy view timer from running in parallel.
      autoAdvanceMs: 0,
    },
  }
}
