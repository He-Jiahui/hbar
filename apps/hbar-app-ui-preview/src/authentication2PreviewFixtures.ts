import type { LumenAuthProviderChoice, LumenAuthProviderFirstContent } from '@lumen/app-ui/catalog'
import type {
  Authentication2PreviewStoreSeed,
  Authentication2PreviewStoreState,
  Authentication2SocialProviderSeed,
} from './authentication2PreviewStore'

export type Authentication2PreviewLocale = 'en' | 'de' | 'de-long'

export type Authentication2PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const AUTHENTICATION2_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/authentication/authentication-2',
  liveObservation: {
    observedOn: '2026-09-29',
    method: 'real preview iframe visible DOM, computed styles, and accessibility observation',
    acceptance: 'sampled-visible-observation-only; no current strict source/local pair',
    observedSocialProviderCount: 3,
    initialMode: 'email',
    initialEmailDraft: '',
    initialContinueDisabled: true,
    ssoDomainRule: 'non-empty-after-trim',
    draftRetention: 'email draft remains when switching to SSO and back',
    unverifiedRequests: [
      'social-provider authentication',
      'continue submit',
      'create account',
      'terms navigation',
      'privacy navigation',
    ],
  },
  historicalCapture: {
    artifact: 'authentication-2-final-v4',
    protocol: 14,
    evidenceCount: 33,
    currentProtocol: 16,
    currentEvidenceCount: 37,
    role: 'historical only; not strict proof',
  },
} as const

export const AUTHENTICATION2_HOST_CAPACITY_POLICY = {
  observedSocialProviderCount: 3,
  sourceMaximum: 'not-tested',
  hostExpectedMaximum: 6,
  overflowFixtureCount: 17,
} as const

export interface Authentication2PreviewFixture {
  readonly seed: Authentication2PreviewStoreSeed
  readonly contentFor: (state: Authentication2PreviewStoreState) => LumenAuthProviderFirstContent
}

type Authentication2Labels = LumenAuthProviderFirstContent['labels']

const LABELS: Readonly<Record<Authentication2PreviewLocale, Authentication2Labels>> = {
  en: {
    brand: 'Northwind',
    createAccount: 'Create account',
    title: 'Welcome back',
    description: 'Sign in to pick up your tasks, timelines, and reviews exactly where you left them.',
    divider: 'or',
    emailLabel: 'Work email',
    emailPlaceholder: 'you@company.com',
    ssoLabel: 'Company domain',
    ssoPlaceholder: 'northwind',
    ssoSuffix: '.northwind.app',
    ssoHelper: 'Your admin set this when the workspace was created.',
    singleSignOn: 'Use single sign-on',
    useEmailInstead: 'Use email instead',
    helper: 'We match your email to an existing workspace.',
    continueLabel: 'Continue',
    termsPrefix: 'By continuing you agree to the',
    inlineSeparator: ' ',
    terms: 'terms of service',
    privacyPrefix: 'and',
    privacy: 'privacy policy',
    termsSuffix: '.',
    trouble: 'Trouble signing in? Reach the workspace admin.',
    systemNormal: 'All systems normal',
  },
  de: {
    brand: 'Northwind',
    createAccount: 'Konto erstellen',
    title: 'Willkommen zurück',
    description:
      'Melde dich an, um mit deinen Aufgaben, Zeitachsen und Prüfungen genau dort weiterzumachen, wo du aufgehört hast.',
    divider: 'oder',
    emailLabel: 'Geschäftliche E-Mail-Adresse',
    emailPlaceholder: 'du@unternehmen.de',
    ssoLabel: 'Unternehmensdomäne',
    ssoPlaceholder: 'northwind',
    ssoSuffix: '.northwind.app',
    ssoHelper: 'Deine Administration hat diese Domäne beim Erstellen des Arbeitsbereichs festgelegt.',
    singleSignOn: 'Mit Single Sign-on fortfahren',
    useEmailInstead: 'Stattdessen E-Mail verwenden',
    helper: 'Wir ordnen deine E-Mail-Adresse einem vorhandenen Arbeitsbereich zu.',
    continueLabel: 'Fortfahren',
    termsPrefix: 'Wenn du fortfährst, stimmst du den',
    inlineSeparator: ' ',
    terms: 'Nutzungsbedingungen',
    privacyPrefix: 'und der',
    privacy: 'Datenschutzerklärung',
    termsSuffix: 'zu.',
    trouble: 'Probleme bei der Anmeldung? Wende dich an die Administration deines Arbeitsbereichs.',
    systemNormal: 'Alle Systeme in Ordnung',
  },
  'de-long': {
    brand: 'Northwind',
    createAccount: 'Ein neues Konto für deinen gesamten Arbeitsbereich erstellen',
    title: 'Willkommen zurück in deinem gemeinsamen Arbeitsbereich',
    description:
      'Melde dich mit der E-Mail-Adresse deines Unternehmens an, um deine bisherigen Aufgaben, ausführlichen Zeitachsen und teamübergreifenden Prüfungen ohne Unterbrechung genau an der zuletzt gespeicherten Stelle fortzusetzen.',
    divider: 'oder verwende eine andere vom Arbeitsbereich unterstützte Anmeldemethode',
    emailLabel: 'Vollständige geschäftliche E-Mail-Adresse für deinen gemeinsamen Arbeitsbereich',
    emailPlaceholder: 'deine-adresse@dein-unternehmen.example',
    ssoLabel: 'Vollständige Domäne deines Unternehmensarbeitsbereichs',
    ssoPlaceholder: 'dein-unternehmen',
    ssoSuffix: '.northwind.app',
    ssoHelper:
      'Die Administration hat diese Unternehmensdomäne beim ursprünglichen Erstellen des gemeinsamen Arbeitsbereichs festgelegt und verwaltet sie zentral.',
    singleSignOn: 'Mit der zentral verwalteten Single-Sign-on-Anmeldung deines Unternehmens fortfahren',
    useEmailInstead: 'Stattdessen die geschäftliche E-Mail-Adresse verwenden',
    helper: 'Wir ordnen die vollständige E-Mail-Adresse einem bereits vorhandenen Unternehmensarbeitsbereich zu.',
    continueLabel: 'Mit dieser geschäftlichen Anmeldemethode fortfahren',
    termsPrefix: 'Wenn du mit dieser Anmeldung fortfährst, stimmst du den geltenden',
    inlineSeparator: ' ',
    terms: 'Nutzungsbedingungen für deinen Arbeitsbereich',
    privacyPrefix: 'und der dazugehörigen',
    privacy: 'Datenschutzerklärung für Unternehmensarbeitsbereiche',
    termsSuffix: ' ausdrücklich zu.',
    trouble:
      'Kannst du dich mit der geschäftlichen E-Mail-Adresse oder der zentral verwalteten Unternehmensdomäne nicht anmelden? Wende dich an die zuständige Administration deines Arbeitsbereichs.',
    systemNormal: 'Alle überwachten Anmeldedienste und Arbeitsbereichssysteme sind verfügbar',
  },
}

const PROVIDER_ICONS = [
  { id: 'google', icon: 'google' },
  { id: 'github', icon: 'github' },
  { id: 'apple', icon: 'apple' },
] as const satisfies readonly Authentication2SocialProviderSeed[]

const PROVIDER_LABELS: Readonly<Record<Authentication2PreviewLocale, Readonly<Record<string, string>>>> = {
  en: {
    google: 'Continue with Google',
    github: 'Continue with GitHub',
    apple: 'Continue with Apple',
  },
  de: {
    google: 'Mit Google fortfahren',
    github: 'Mit GitHub fortfahren',
    apple: 'Mit Apple fortfahren',
  },
  'de-long': {
    google: 'Mit deinem bestehenden Google-Konto für den gemeinsamen Arbeitsbereich fortfahren',
    github: 'Mit deinem bereits verknüpften GitHub-Konto für den Unternehmensarbeitsbereich fortfahren',
    apple: 'Mit der Apple-Anmeldung fortfahren, die für deinen Arbeitsbereich hinterlegt ist',
  },
}

const ADDITIONAL_PROVIDER_LABELS: Readonly<Record<Authentication2PreviewLocale, (number: number) => string>> = {
  en: (number) => `Continue with another provider ${number}`,
  de: (number) => `Mit einem weiteren Anbieter ${number} fortfahren`,
  'de-long': (number) =>
    `Mit einer weiteren vom Unternehmensarbeitsbereich bereitgestellten Anmeldemethode ${number} fortfahren`,
}

const PROVIDER_LIST_LABELS: Readonly<Record<Authentication2PreviewLocale, string>> = {
  en: 'Workspace sign-in providers',
  de: 'Anmeldeanbieter des Arbeitsbereichs',
  'de-long': 'Alle vom gemeinsamen Unternehmensarbeitsbereich bereitgestellten Anmeldeanbieter',
}

function providerCount(capacity: Authentication2PreviewCapacity): number {
  switch (capacity) {
    case 'source':
      return AUTHENTICATION2_HOST_CAPACITY_POLICY.observedSocialProviderCount
    case 'empty':
      return 0
    case 'one':
      return 1
    case 'boundary':
      return AUTHENTICATION2_HOST_CAPACITY_POLICY.hostExpectedMaximum
    case 'overflow':
      return AUTHENTICATION2_HOST_CAPACITY_POLICY.overflowFixtureCount
  }
}

function socialProviderSeeds(count: number): Authentication2SocialProviderSeed[] {
  return Array.from({ length: count }, (_, index) => {
    const knownProvider = PROVIDER_ICONS[index]
    return knownProvider ?? { id: `host-provider-${index + 1}`, icon: 'key' }
  })
}

function socialProviderLabel(locale: Authentication2PreviewLocale, providerId: string): string {
  const knownLabel = PROVIDER_LABELS[locale][providerId]
  if (knownLabel) return knownLabel
  const additionalProviderNumber = /^host-provider-(\d+)$/.exec(providerId)?.[1]
  return ADDITIONAL_PROVIDER_LABELS[locale](additionalProviderNumber ? Number(additionalProviderNumber) : 1)
}

export function createAuthentication2PreviewFixture(
  locale: Authentication2PreviewLocale = 'en',
  capacity: Authentication2PreviewCapacity = 'source',
): Authentication2PreviewFixture {
  const count = providerCount(capacity)
  return {
    seed: {
      email: '',
      domain: '',
      emailProviderId: 'email',
      ssoProviderId: 'sso',
      initialProviderId: 'email',
      socialProviders: socialProviderSeeds(count),
    },
    contentFor: (state) => ({
      labels: LABELS[locale],
      socialProviders: state.socialProviders.map<LumenAuthProviderChoice>((provider) => ({
        id: provider.id,
        icon: provider.icon,
        label: socialProviderLabel(locale, provider.id),
      })),
      providerListStrategy: {
        kind:
          state.socialProviders.length > AUTHENTICATION2_HOST_CAPACITY_POLICY.hostExpectedMaximum
            ? 'pane-scroll'
            : 'content-grown',
        expectedMaximum: AUTHENTICATION2_HOST_CAPACITY_POLICY.hostExpectedMaximum,
      },
      providerListLabel: PROVIDER_LIST_LABELS[locale],
      emailProviderId: state.emailProviderId,
      ssoProviderId: state.ssoProviderId,
      initialProviderId: state.mode === 'sso' ? state.ssoProviderId : state.emailProviderId,
    }),
  }
}
