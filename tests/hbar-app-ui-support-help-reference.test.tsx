import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getLumenVariantComponent } from '../packages/hbar-app-ui/src/catalog'
import type { LumenSupportContent, LumenSupportHelpReferenceFlow } from '../hbar-ui/packages/lumen-app-ui/src/index'
import { createSupportHelpReferenceFixture } from './fixtures/hbar-app-ui-support-help-reference-fixtures'

function renderHelp(help: NonNullable<LumenSupportContent['help']>): string {
  const Component = getLumenVariantComponent('hbar-app-ui-support-1')
  if (!Component) throw new Error('Expected the public Support 1 catalog entry')
  const content: LumenSupportContent = { help }
  return renderToStaticMarkup(createElement(Component, { content }))
}

function controlledFlow(query: string): LumenSupportHelpReferenceFlow {
  return { query, onQueryChange() {} }
}

describe('source support help reference', () => {
  test('renders the full source flow with four topics and four popular articles', () => {
    const help = createSupportHelpReferenceFixture()
    const markup = renderHelp(help)

    expect(markup).toContain('data-hbar-app-ui-component="hbar-app-ui-support-1"')
    expect(markup).toContain('How can we help?')
    expect(markup).toContain('Median first response today is 11 minutes.')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('aria-label="Search help articles"')
    expect(markup).toContain('placeholder="Search articles, guides and answers"')
    expect(markup.match(/data-hbar-app-ui-action="support-help:open-topic"/g)).toHaveLength(4)
    expect(markup.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(4)
    expect(markup).toContain('Accounts and access')
    expect(markup).toContain('Billing and plans')
    expect(markup).toContain('Integrations')
    expect(markup).toContain('Reports and exports')
    expect(markup).toContain('Read most this week')
    expect(markup).toContain('Why did my scheduled export arrive empty?')
    expect(markup).toContain('Understand seat counts on the Pro plan')
    expect(markup).toContain('2.4k')
    expect(markup).toContain('Still stuck?')
    expect(markup).toContain('Support is online now, 09:00 to 21:00 UTC on weekdays.')
    expect(markup).toContain('data-hbar-app-ui-action="support-help:contact-support"')
    expect(markup).toContain('lucide-key-round')
    expect(markup).toContain('lucide-credit-card')
    expect(markup).toContain('lucide-plug')
    expect(markup).toContain('lucide-book-open')
  })

  test('filters provided topics and articles from Host-controlled query without local draft state', () => {
    const base = createSupportHelpReferenceFixture()
    const billing = renderHelp({ ...base, referenceFlow: controlledFlow('billing') })
    expect(billing).toContain('value="billing"')
    expect(billing).toContain('Billing and plans')
    expect(billing).not.toContain('Accounts and access')
    expect(billing).toContain('No guides match this search.')
    expect(billing).toContain('data-hbar-app-ui-action="support-help:search"')

    const exportArticle = renderHelp({ ...base, referenceFlow: controlledFlow('scheduled export') })
    expect(exportArticle).toContain('value="scheduled export"')
    expect(exportArticle).toContain('Why did my scheduled export arrive empty?')
    expect(exportArticle).not.toContain('Move a workspace to a different owner')
    expect(exportArticle).toContain('No help topics')
  })

  test('handles empty, one, duplicate and stale icon data while retaining source content', () => {
    const base = createSupportHelpReferenceFixture()
    const empty = renderHelp({
      ...base,
      topics: [],
      articles: [],
      referenceLayout: {
        ...base.referenceLayout!,
        topicIcons: [{ topicId: 'removed-topic', kind: 'accounts' }],
      },
    })
    expect(empty).toContain('No help topics')
    expect(empty).toContain('No guides match this search.')
    expect(empty).not.toContain('data-hbar-app-ui-action="support-help:open-topic"')

    const one = renderHelp({
      ...base,
      topics: [base.topics[0]!],
      articles: [base.articles[0]!],
      referenceLayout: { ...base.referenceLayout!, topicIcons: [] },
    })
    expect(one.match(/data-hbar-app-ui-action="support-help:open-topic"/g)).toHaveLength(1)
    expect(one.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(1)
    expect(one).toContain('Accounts and access')
    expect(one).not.toContain('lucide-key-round')

    const duplicated = renderHelp({
      ...base,
      topics: [...base.topics, base.topics[0]!],
      articles: [...base.articles, base.articles[0]!],
      referenceLayout: {
        ...base.referenceLayout!,
        topicIcons: [...base.referenceLayout!.topicIcons, { topicId: 'stale-topic', kind: 'reports' }],
      },
    })
    expect(duplicated.match(/data-hbar-app-ui-action="support-help:open-topic"/g)).toHaveLength(4)
    expect(duplicated.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(4)
    expect(duplicated.match(/Accounts and access/g)).toHaveLength(2)
  })

  test('grows through the declared content limit and one item over it', () => {
    const base = createSupportHelpReferenceFixture()
    const makeHelp = (count: number) => ({
      ...base,
      articles: Array.from({ length: count }, (_, index) => ({
        id: `capacity-${index}`,
        title: `Help article ${index + 1}`,
        detail: `${index + 1} views`,
      })),
    })

    const atBoundary = renderHelp(makeHelp(base.listStrategy.expectedMaximum))
    expect(atBoundary.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(
      base.listStrategy.expectedMaximum,
    )
    expect(atBoundary).toContain('Help article 16')

    const overBoundary = renderHelp(makeHelp(base.listStrategy.expectedMaximum + 1))
    expect(overBoundary.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(
      base.listStrategy.expectedMaximum + 1,
    )
    expect(overBoundary).toContain('Help article 17')
  })

  test('keeps deliberately long German copy and labels available in the same semantic flow', () => {
    const help = createSupportHelpReferenceFixture('de-long')
    const markup = renderHelp({ ...help, referenceFlow: controlledFlow('') })

    expect(markup).toContain('Wie können wir Ihnen bei Ihrem Arbeitsbereich helfen?')
    expect(markup).toContain('Durchsuchen Sie die Anleitungen oder eröffnen Sie eine Anfrage')
    expect(markup).toContain('Anleitungen, Hilfethemen und Antworten zu Ihrem Arbeitsbereich durchsuchen')
    expect(markup).toContain('Einen Arbeitsbereich einer anderen verantwortlichen Person zuweisen')
    expect(markup).toContain('Support kontaktieren')
    expect(markup.match(/data-hbar-app-ui-action="support-help:open-article"/g)).toHaveLength(4)
  })
})
