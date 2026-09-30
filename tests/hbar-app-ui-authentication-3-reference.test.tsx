import { describe, expect, test } from 'bun:test'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { LumenAuthContent } from '@lumen/app-ui'
import { getHbarAppUiVariant, HbarAppUiAuthenticationProvider } from '../packages/hbar-app-ui/src/catalog'
import {
  createHbarAppUiAuthenticationLocalizedFixtures,
  HBAR_APP_UI_AUTHENTICATION_FIXTURES,
} from './fixtures/hbar-app-ui-authentication-fixtures'

type QuoteContent = NonNullable<LumenAuthContent['quote']>
type QuoteFlow = NonNullable<QuoteContent['referenceFlow']>

function controlledFlow(overrides: Partial<QuoteFlow> = {}): QuoteFlow {
  return {
    email: 'audit@example.invalid',
    password: '',
    passwordVisible: false,
    quoteId: HBAR_APP_UI_AUTHENTICATION_FIXTURES.quote?.quotes[0]?.id ?? null,
    onEmailChange: () => undefined,
    onPasswordChange: () => undefined,
    onPasswordVisibleChange: () => undefined,
    onQuoteChange: () => undefined,
    onSignInRequest: () => undefined,
    onProviderRequest: () => undefined,
    onNavigationRequest: () => undefined,
    ...overrides,
  }
}

function withFlow(
  flow: Partial<QuoteFlow> = {},
  base: LumenAuthContent = HBAR_APP_UI_AUTHENTICATION_FIXTURES,
): LumenAuthContent {
  const quote = base.quote
  if (!quote) throw new Error('Expected Authentication 3 fixture')
  return { ...base, quote: { ...quote, referenceFlow: controlledFlow(flow) } }
}

function render(content: LumenAuthContent, count = 1) {
  const component = getHbarAppUiVariant('authentication', 3).component
  const children = createElement(
    Fragment,
    null,
    ...Array.from({ length: count }, (_, index) => createElement(component, { key: index })),
  )
  return renderToStaticMarkup(createElement(HbarAppUiAuthenticationProvider, { content, children }))
}

describe('Authentication 3 controlled quote reference', () => {
  test('projects both independent Host drafts without inventing a required or disabled gate', () => {
    const markup = render(withFlow({ email: 'draft@example.invalid', password: 'local-fixture-only' }))
    expect(markup).toContain('value="draft@example.invalid"')
    expect(markup).toContain('value="local-fixture-only"')
    expect(markup).toContain('type="email"')
    expect(markup).toContain('type="password"')
    expect(markup).toContain('type="submit"')
    expect(markup).not.toContain(' required=""')
    expect(markup).not.toContain(' disabled=""')
    expect(markup).not.toContain('remember')
    const replaced = render(withFlow({ email: 'replacement@example.invalid', password: '' }))
    expect(replaced).toContain('value="replacement@example.invalid"')
    expect(replaced).not.toContain('local-fixture-only')
  })

  test('changes native password type and accessible reveal label from Host state', () => {
    const hidden = render(withFlow())
    const visible = render(withFlow({ passwordVisible: true }))
    expect(hidden).toContain('aria-label="Show password"')
    expect(hidden).toContain('type="password"')
    expect(visible).toContain('aria-label="Hide password"')
    expect(visible).not.toContain('type="password"')
    expect(visible).toContain('type="text"')
    expect((visible.match(/<input\b/g) ?? []).length).toBe(2)
  })

  test('keeps label associations and field identities independent for two rendered instances', () => {
    const markup = render(withFlow(), 2)
    const ids = Array.from(markup.matchAll(/<input\b[^>]*\bid="([^"]+)"/g), (match) => match[1] ?? '')
    const labels = Array.from(markup.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g), (match) => match[1] ?? '')
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(labels).toHaveLength(4)
    expect(labels.every((id) => ids.includes(id))).toBe(true)
  })

  test('projects a selected story, author and metrics without mirroring a previous Host selection', () => {
    const quote = HBAR_APP_UI_AUTHENTICATION_FIXTURES.quote
    const second = quote?.quotes[1]
    if (!quote || !second) throw new Error('Expected source quote list')
    const markup = render(withFlow({ quoteId: second.id }))
    expect(markup).toContain('<aside')
    expect(markup).toContain('<blockquote')
    expect(markup).toContain(second.name)
    expect(markup).toContain(second.text)
    expect(markup).toContain('data-auth3-selected="true"')
    expect((markup.match(/data-auth3-selected="true"/g) ?? []).length).toBe(1)
    expect((markup.match(/aria-current="true"/g) ?? []).length).toBe(1)
    expect((markup.match(/aria-current="false"/g) ?? []).length).toBe(quote.quotes.length - 1)
    for (const metric of second.metrics) {
      expect(markup).toContain(metric.value)
      expect(markup).toContain(metric.label)
    }
    const first = render(withFlow({ quoteId: quote.quotes[0]?.id ?? null }))
    expect(first).not.toContain(second.text)
  })

  test('retains the typed empty state and every overflow story control', () => {
    const quote = HBAR_APP_UI_AUTHENTICATION_FIXTURES.quote
    const first = quote?.quotes[0]
    if (!quote || !first) throw new Error('Expected source quote list')
    const empty = render({
      ...withFlow(),
      quote: { ...quote, quotes: [], referenceFlow: controlledFlow({ quoteId: null }) },
    })
    expect(empty).toContain(quote.labels.emptyQuotes)
    expect(empty).not.toContain('<blockquote')
    expect(empty).not.toContain('aria-current=')
    const quotes = Array.from({ length: 17 }, (_, index) => ({
      ...first,
      id: `story-${index}`,
      name: `Host story ${index}`,
    }))
    const overflow = render({
      ...withFlow(),
      quote: { ...quote, quotes, referenceFlow: controlledFlow({ quoteId: 'story-16' }) },
    })
    expect((overflow.match(/aria-label="Show quote from Host story/g) ?? []).length).toBe(17)
    expect(overflow).toContain('Host story 16')
    expect((overflow.match(/data-auth3-selected="true"/g) ?? []).length).toBe(1)
    expect((overflow.match(/aria-current="true"/g) ?? []).length).toBe(1)
    expect((overflow.match(/aria-current="false"/g) ?? []).length).toBe(16)
  })

  test('uses translated Host copy and preserves the legacy rendering contract', () => {
    const localized = createHbarAppUiAuthenticationLocalizedFixtures()
    const quote = localized.quote
    if (!quote) throw new Error('Expected localized quote fixture')
    const markup = render(withFlow({}, localized))
    expect(markup).toContain(quote.labels.title)
    expect(markup).toContain(quote.labels.emailLabel)
    expect(markup).toContain(quote.labels.passwordLabel)
    expect(markup).toContain(quote.labels.signIn)
    const legacy = render(HBAR_APP_UI_AUTHENTICATION_FIXTURES)
    expect(legacy).toContain('Sign in')
    expect(legacy).toContain('type="password"')
    expect(legacy).toContain('dana.whitfield@northwind.com')
  })
})
