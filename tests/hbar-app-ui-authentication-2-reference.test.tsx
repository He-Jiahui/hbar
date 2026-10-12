import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { canContinueLumenProviderFirst, type LumenAuthContent } from '@lumen/app-ui/catalog'
import { getHbarAppUiVariant } from '../packages/hbar-app-ui/src/catalog'
import { HbarAppUiAuthenticationProvider } from '../packages/hbar-app-ui/src/catalog'
import {
  createHbarAppUiAuthenticationLocalizedFixtures,
  HBAR_APP_UI_AUTHENTICATION_FIXTURES,
} from './fixtures/hbar-app-ui-authentication-fixtures'

type ProviderFirstContent = NonNullable<LumenAuthContent['providerFirst']>
type ProviderFirstFlow = NonNullable<ProviderFirstContent['referenceFlow']>

function createReferenceFlow(overrides: Partial<ProviderFirstFlow> = {}): ProviderFirstFlow {
  return {
    mode: 'email',
    email: '',
    domain: '',
    onEmailChange: () => undefined,
    onDomainChange: () => undefined,
    onModeChange: () => undefined,
    onContinueRequest: () => undefined,
    onProviderRequest: () => undefined,
    onNavigationRequest: () => undefined,
    ...overrides,
  }
}

function withReferenceFlow(
  overrides: Partial<ProviderFirstFlow> = {},
  base: LumenAuthContent = HBAR_APP_UI_AUTHENTICATION_FIXTURES,
): LumenAuthContent {
  const providerFirst = base.providerFirst
  if (!providerFirst) throw new Error('Expected provider-first authentication fixture')
  return {
    ...base,
    providerFirst: {
      ...providerFirst,
      referenceFlow: createReferenceFlow(overrides),
    },
  }
}

function renderAuthentication(content: LumenAuthContent, count = 1): string {
  const component = getHbarAppUiVariant('authentication', 2).component
  const children = createElement(
    Fragment,
    null,
    ...Array.from({ length: count }, (_, index) => createElement(component, { key: index })),
  )
  return renderToStaticMarkup(createElement(HbarAppUiAuthenticationProvider, { content, children }))
}

function inputIds(markup: string): string[] {
  return Array.from(markup.matchAll(/<input\b[^>]*\bid="([^"]+)"/g), (match) => match[1] ?? '')
}

function labelForIds(markup: string): string[] {
  return Array.from(markup.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g), (match) => match[1] ?? '')
}

describe('Authentication 2 provider-first controlled reference', () => {
  test('projects Host email and SSO modes, drafts, and native submit availability', () => {
    const emptyEmail = renderAuthentication(withReferenceFlow())
    expect(emptyEmail).toContain('data-auth2-mode="email"')
    expect(emptyEmail).toContain('data-auth2-draft="email"')
    expect(emptyEmail).toContain('type="email"')
    expect(emptyEmail).toContain('value=""')
    expect(emptyEmail).toContain('data-auth2-action="continue"')
    expect(emptyEmail).toContain('disabled=""')
    expect(emptyEmail).not.toContain(' required=""')

    const validEmail = renderAuthentication(withReferenceFlow({ email: 'audit@example.invalid' }))
    expect(validEmail).toContain('value="audit@example.invalid"')
    expect(validEmail).not.toContain('disabled=""')

    const emptyDomain = renderAuthentication(withReferenceFlow({ mode: 'sso' }))
    expect(emptyDomain).toContain('data-auth2-mode="sso"')
    expect(emptyDomain).toContain('data-auth2-draft="domain"')
    expect(emptyDomain).toContain('type="text"')
    expect(emptyDomain).toContain('data-auth2-action="toggle-mode"')
    expect(emptyDomain).toContain('disabled=""')

    const validDomain = renderAuthentication(withReferenceFlow({ mode: 'sso', domain: 'audit-team' }))
    expect(validDomain).toContain('value="audit-team"')
    expect(validDomain).toContain('.northwind.app')
    expect(validDomain).not.toContain('disabled=""')

    expect(canContinueLumenProviderFirst('', false)).toBe(false)
    expect(canContinueLumenProviderFirst('not-an-email', false)).toBe(false)
    expect(canContinueLumenProviderFirst('audit@example.invalid', false)).toBe(true)
    expect(canContinueLumenProviderFirst(' ', true)).toBe(false)
    expect(canContinueLumenProviderFirst('audit-team', true)).toBe(true)
  })

  test('keeps native labels and independent field IDs when two instances render together', () => {
    const markup = renderAuthentication(withReferenceFlow({ email: 'first@example.invalid' }), 2)
    const ids = inputIds(markup)
    const labels = labelForIds(markup)

    expect(markup.match(/<form\b/g)).toHaveLength(2)
    expect(markup.match(/type="submit"/g)).toHaveLength(2)
    expect(markup.match(/type="email"/g)).toHaveLength(2)
    expect(ids).toHaveLength(2)
    expect(labels).toEqual(ids)
    expect(new Set(ids).size).toBe(2)
    expect(markup).toContain('type="button"')
  })

  test('uses long localized Host copy and does not render the reference English fallback', () => {
    const localized = createHbarAppUiAuthenticationLocalizedFixtures()
    const base = localized.providerFirst
    if (!base) throw new Error('Expected localized provider-first authentication fixture')
    const content = withReferenceFlow(
      {},
      {
        ...localized,
        providerFirst: {
          ...base,
          labels: {
            ...base.labels,
            brand: 'Nordwind',
            createAccount: 'Konto erstellen',
            title: 'Willkommen bei Ihrem gemeinsamen Nordwind-Arbeitsbereich',
            description: 'Eine bewusst lange lokalisierte Beschreibung, die sicher in der Host-Oberfläche umbricht.',
            divider: 'oder',
            emailLabel: 'Geschäftliche E-Mail-Adresse',
            emailPlaceholder: 'name@unternehmen.test',
            ssoLabel: 'Unternehmensdomäne',
            ssoPlaceholder: 'unternehmen',
            ssoSuffix: '.arbeitsbereich.test',
            ssoHelper: 'Diese Domäne wurde von Ihrer Administration für diesen Arbeitsbereich festgelegt.',
            singleSignOn: 'Mit einmaliger Anmeldung fortfahren',
            useEmailInstead: 'Stattdessen E-Mail verwenden',
            helper: 'Ihre E-Mail-Adresse ordnet Sie dem richtigen Arbeitsbereich zu.',
            continueLabel: 'Fortfahren',
            termsPrefix: 'Wenn Sie fortfahren, stimmen Sie den',
            terms: 'Nutzungsbedingungen',
            privacyPrefix: 'und der',
            privacy: 'Datenschutzerklärung',
            trouble: 'Bei Problemen wenden Sie sich an die Administration.',
            systemNormal: 'Alle Systeme funktionieren',
          },
          socialProviders: base.socialProviders.map((provider, index) => ({
            ...provider,
            label: `Anbieter ${index + 1}`,
          })),
        },
      },
    )
    const markup = renderAuthentication(content)

    expect(markup).toContain('Willkommen bei Ihrem gemeinsamen Nordwind-Arbeitsbereich')
    expect(markup).toContain('Eine bewusst lange lokalisierte Beschreibung')
    expect(markup).toContain('Geschäftliche E-Mail-Adresse')
    expect(markup).toContain('Anbieter 1')
    expect(markup).not.toContain('Welcome back')
    expect(markup).not.toContain('you@company.com')
    expect(markup).not.toContain('Continue with Google')
  })

  test('renders provider counts from Host content at empty, ordinary, boundary, and overflow sizes', () => {
    const providerFirst = HBAR_APP_UI_AUTHENTICATION_FIXTURES.providerFirst
    if (!providerFirst) throw new Error('Expected provider-first authentication fixture')
    const template = providerFirst.socialProviders[0]
    if (!template) throw new Error('Expected a provider template in the authentication fixture')

    for (const count of [
      0,
      1,
      providerFirst.providerListStrategy.expectedMaximum,
      providerFirst.providerListStrategy.expectedMaximum + 1,
    ]) {
      const socialProviders = Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `host-provider-${index}`,
        label: `Host provider ${index + 1}`,
      }))
      const content = withReferenceFlow(
        {},
        {
          ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
          providerFirst: { ...providerFirst, socialProviders },
        },
      )
      const markup = renderAuthentication(content)

      expect(markup.match(/Host provider \d+/g) ?? []).toHaveLength(count)
      expect(markup).toContain('data-auth2-action="provider-group"')
    }
  })

  test('keeps a pane-owned provider overflow region focusable and renders every Host item', () => {
    const providerFirst = HBAR_APP_UI_AUTHENTICATION_FIXTURES.providerFirst
    if (!providerFirst) throw new Error('Expected provider-first authentication fixture')
    const template = providerFirst.socialProviders[0]
    if (!template) throw new Error('Expected a provider template in the authentication fixture')
    const expectedMaximum = providerFirst.providerListStrategy.expectedMaximum
    const socialProviders = Array.from({ length: expectedMaximum + 1 }, (_, index) => ({
      ...template,
      id: `scroll-provider-${index}`,
      label: `Scrollable provider ${index + 1}`,
    }))
    const content = withReferenceFlow(
      {},
      {
        ...HBAR_APP_UI_AUTHENTICATION_FIXTURES,
        providerFirst: {
          ...providerFirst,
          socialProviders,
          providerListLabel: 'More sign-in options',
          providerListStrategy: { kind: 'pane-scroll', expectedMaximum },
        },
      },
    )
    const markup = renderAuthentication(content)
    const listStart = markup.indexOf('data-auth2-action="provider-group"')
    const listOpen = markup.slice(markup.lastIndexOf('<div', listStart), markup.indexOf('>', listStart) + 1)

    expect(listOpen).toContain('role="region"')
    expect(listOpen).toContain('tabindex="0"')
    expect(listOpen).toContain('aria-label="More sign-in options"')
    expect(listOpen).toMatch(new RegExp(`max-block-size:\\s*${expectedMaximum * 3}rem`))
    expect(markup.match(/Scrollable provider \d+/g) ?? []).toHaveLength(expectedMaximum + 1)
  })

  test('retains the legacy uncontrolled initial mode and markup without a reference flow', () => {
    const content = HBAR_APP_UI_AUTHENTICATION_FIXTURES
    const emailMarkup = renderAuthentication(content)
    const providerFirst = content.providerFirst
    if (!providerFirst) throw new Error('Expected provider-first authentication fixture')
    const ssoMarkup = renderAuthentication({
      ...content,
      providerFirst: { ...providerFirst, initialProviderId: providerFirst.ssoProviderId },
    })

    expect(emailMarkup).toContain('data-auth2-mode="email"')
    expect(emailMarkup).toContain('data-auth2-draft="email"')
    expect(emailMarkup).toContain('hbar-app-ui-auth-provider-first-surface')
    expect(ssoMarkup).toContain('data-auth2-mode="sso"')
    expect(ssoMarkup).toContain('data-auth2-draft="domain"')
    expect(ssoMarkup).toContain('type="text"')
  })
})
