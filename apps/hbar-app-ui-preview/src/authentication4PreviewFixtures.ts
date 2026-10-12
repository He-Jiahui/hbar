import type { LumenAuthTwoStepContent } from '@lumen/app-ui/catalog'
import type { Authentication4PreviewStoreSeed } from './authentication4PreviewStore'

export type Authentication4PreviewLocale = 'en' | 'de' | 'de-long'
export type Authentication4PreviewScenario = 'source' | 'password' | 'invalid'

export interface Authentication4PreviewFixture {
  readonly seed: Authentication4PreviewStoreSeed
  readonly content: LumenAuthTwoStepContent
  readonly accountFor: (email: string) => LumenAuthTwoStepContent['account']
  /** Local demonstration cadence, not a precision measurement of the reference. */
  readonly continueDelayMs: number
  readonly signInDelayMs: number
}

const ENGLISH_LABELS: LumenAuthTwoStepContent['labels'] = {
  brand: 'Northwind',
  step: (current, total) => `Step ${current} of ${total}`,
  title: 'Sign in to Northwind',
  description: 'Start with the email your workspace was created with.',
  emailLabel: 'Work email',
  emailPlaceholder: 'name@company.com',
  continueLabel: 'Continue',
  continuing: 'Continue',
  magicLink: 'Email me a sign-in link',
  needAccount: 'Need an account?',
  createAccount: 'Create one',
  matchedAccount: 'Matched account',
  back: 'Back',
  forgotPassword: 'Forgot password?',
  invalidEmail: 'Enter a valid email address.',
  securityNote: 'Signing in from a new device adds a one-time code step.',
  passwordLabel: 'Password',
  passwordPlaceholder: 'Enter your password',
  signIn: 'Sign in',
  signingIn: 'Signing in',
  useAnother: 'Use another email',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
}

const GERMAN_LABELS: LumenAuthTwoStepContent['labels'] = {
  brand: 'Northwind',
  step: (current, total) => `Schritt ${current} von ${total}`,
  title: 'Bei Northwind anmelden',
  description: 'Beginne mit der E-Mail-Adresse, mit der dein Arbeitsbereich eingerichtet wurde.',
  emailLabel: 'Geschäftliche E-Mail-Adresse',
  emailPlaceholder: 'name@unternehmen.de',
  continueLabel: 'Weiter',
  continuing: 'Wird vorbereitet',
  magicLink: 'Anmeldelink per E-Mail senden',
  needAccount: 'Noch kein Konto?',
  createAccount: 'Konto erstellen',
  matchedAccount: 'Zugeordnetes Konto',
  back: 'Zurück',
  forgotPassword: 'Passwort vergessen?',
  invalidEmail: 'Gib eine gültige E-Mail-Adresse ein.',
  securityNote: 'Bei der Anmeldung auf einem neuen Gerät ist ein zusätzlicher Einmalcode erforderlich.',
  passwordLabel: 'Passwort',
  passwordPlaceholder: 'Gib dein Passwort ein',
  signIn: 'Anmelden',
  signingIn: 'Anmeldung wird vorbereitet',
  useAnother: 'Andere E-Mail-Adresse verwenden',
  showPassword: 'Passwort anzeigen',
  hidePassword: 'Passwort verbergen',
}

const LABELS: Readonly<Record<Authentication4PreviewLocale, LumenAuthTwoStepContent['labels']>> = {
  en: ENGLISH_LABELS,
  de: GERMAN_LABELS,
  'de-long': {
    ...GERMAN_LABELS,
    title: 'Beim gemeinsam genutzten internationalen Northwind-Arbeitsbereich anmelden',
    description:
      'Beginne mit der geschäftlichen E-Mail-Adresse, die bei der Einrichtung dieses gemeinsam genutzten Arbeitsbereichs verwendet wurde.',
    emailLabel: 'Geschäftliche E-Mail-Adresse des gemeinsam genutzten Arbeitsbereichs',
    continueLabel: 'Mit dieser E-Mail-Adresse zum nächsten Anmeldeschritt wechseln',
    continuing: 'Der nächste Anmeldeschritt für diesen Arbeitsbereich wird vorbereitet',
    magicLink: 'Einen sicheren Anmeldelink an diese geschäftliche E-Mail-Adresse senden',
    needAccount: 'Du hast noch kein Konto für diesen gemeinsam genutzten Arbeitsbereich?',
    createAccount: 'Ein neues Konto für diesen Arbeitsbereich erstellen',
    back: 'Zur Eingabe der geschäftlichen E-Mail-Adresse zurückkehren',
    forgotPassword: 'Hast du das Passwort für diesen Arbeitsbereich vergessen?',
    invalidEmail: 'Gib eine vollständige gültige geschäftliche E-Mail-Adresse für diesen Arbeitsbereich ein.',
    signIn: 'Mit diesem Konto beim gemeinsam genutzten Arbeitsbereich anmelden',
    signingIn: 'Die Anmeldung beim gemeinsam genutzten Arbeitsbereich wird vorbereitet',
  },
}

/** Host fixtures are sample data, not an account lookup or an authentication service. */
export function createAuthentication4PreviewFixture(
  locale: Authentication4PreviewLocale = 'en',
  scenario: Authentication4PreviewScenario = 'source',
): Authentication4PreviewFixture {
  const knownEmail = 'dana.whitfield@northwind.com'
  const email = scenario === 'invalid' ? 'invalid' : knownEmail
  const account: LumenAuthTwoStepContent['account'] = {
    initials: 'DW',
    name: locale === 'de-long' ? 'Dana Whitfield mit einem besonders langen Anzeigenamen' : 'Dana Whitfield',
    organization:
      locale === 'de-long'
        ? 'Northwind Operations und gemeinsam genutzte internationale Arbeitsbereiche'
        : 'Northwind Operations',
  }
  return {
    seed: { scenarioKey: scenario, email, initialPhase: scenario === 'password' ? 'password' : 'email' },
    content: { labels: LABELS[locale], initialEmail: email, account },
    accountFor: (draft) => {
      const normalized = draft.trim()
      if (normalized.toLowerCase() === knownEmail) return account
      return {
        initials: (normalized.split('@')[0] ?? '').slice(0, 2).toUpperCase(),
        name: normalized,
        organization: locale === 'en' ? 'New to Northwind' : 'Neu bei Northwind',
      }
    },
    // Retain the existing local preview cadence; the live probe only establishes pending then Step 2.
    continueDelayMs: 1_050,
    signInDelayMs: 1_400,
  }
}
