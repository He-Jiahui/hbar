import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiPaywallProvider,
  type HbarAppUiPaywallContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiPaywallLocalizedFixtures,
  createHbarAppUiPaywallOverflowFixtures,
  HBAR_APP_UI_PAYWALL_FIXTURES,
} from './fixtures/hbar-app-ui-paywall-fixtures'

function renderArticle(content: HbarAppUiPaywallContent): string {
  const Article = getHbarAppUiVariant('paywall', 1).component
  return renderToStaticMarkup(
    createElement(HbarAppUiPaywallProvider, { content, children: createElement(Article, {}) }),
  )
}

describe('Paywall 1 reference article', () => {
  test('keeps the inline article teaser, member card, benefits and independent host actions in reading order', () => {
    const html = renderArticle(HBAR_APP_UI_PAYWALL_FIXTURES)

    expect(html).toContain('data-hbar-app-ui-component="hbar-app-ui-paywall-1"')
    expect(html).toContain('<article class="hbar-app-ui-paywall-article">')
    expect(html).toContain('class="hbar-app-ui-paywall-article-copy" aria-hidden="true"')
    expect(html).toContain('<h2')
    expect(html).toContain('<h3')
    expect(html).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(html.match(/<li/g)).toHaveLength(3)
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html.indexOf('What a database migration actually costs')).toBeLessThan(html.indexOf('Northwind moved'))
    expect(html.indexOf('Northwind moved')).toBeLessThan(html.indexOf('Keep reading with a membership'))
    expect(html.indexOf('Become a member: $9/mo')).toBeLessThan(html.indexOf('I already have an account'))
  })

  test('keeps localized copy, empty lists and over-capacity benefits host-owned', () => {
    const localized = renderArticle(createHbarAppUiPaywallLocalizedFixtures())
    expect(localized).toContain('Was eine Datenbankmigration wirklich kostet')
    expect(localized).not.toContain('What a database migration actually costs')

    const overflow = createHbarAppUiPaywallOverflowFixtures()
    expect(overflow.article?.benefits).toHaveLength(21)
    expect(overflow.article?.listStrategy).toEqual({ kind: 'pane-scroll', expectedMaximum: 12 })
    const overflowHtml = renderArticle(overflow)
    expect(overflowHtml).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(overflowHtml).toContain('Additional membership benefit 18')
    expect(overflowHtml.match(/<li/g)).toHaveLength(21)

    const empty: HbarAppUiPaywallContent = {
      ...HBAR_APP_UI_PAYWALL_FIXTURES,
      article: HBAR_APP_UI_PAYWALL_FIXTURES.article && {
        ...HBAR_APP_UI_PAYWALL_FIXTURES.article,
        paragraphs: [],
        benefits: [],
      },
    }
    const emptyHtml = renderArticle(empty)
    expect(emptyHtml).not.toContain('Northwind moved')
    expect(emptyHtml).not.toContain('<li')
    expect(emptyHtml).toContain('Keep reading with a membership')
  })
})
