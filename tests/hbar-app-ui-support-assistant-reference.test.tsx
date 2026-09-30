import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiSupportProvider,
  type HbarAppUiSupportContent,
} from '../packages/hbar-app-ui/src/index'
import { createSupportAssistantReferenceFixture } from './fixtures/hbar-app-ui-support-assistant-reference-fixtures'

type AssistantContent = NonNullable<HbarAppUiSupportContent['assistant']>

function renderAssistant(assistant: AssistantContent): string {
  const { spec, component: Component } = getHbarAppUiVariant('support', 4)
  return renderToStaticMarkup(
    createElement(HbarAppUiSupportProvider, {
      content: { assistant },
      children: createElement(Component, { spec }),
    }),
  )
}

describe('Support assistant reference widget', () => {
  test('renders the source transcript, article list, actions, and native composer without a dialog', () => {
    const html = renderAssistant(createSupportAssistantReferenceFixture())

    expect(html).toContain('Northwind Assistant')
    expect(html).toContain('Answers from your workspace and the docs')
    expect(html.match(/class="lumen-support-assistant-reference-message(?: is-own)?"/g) ?? []).toHaveLength(3)
    expect(html).toContain('Hi Priya. I can look things up in your workspace and in the docs.')
    expect(html).toContain('Run 1104 finished at 06:00 and returned 0 rows.')
    expect(html).toContain('data-hbar-app-ui-region="assistant-transcript"')
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html.match(/data-hbar-app-ui-action="assistant:open-article"/g) ?? []).toHaveLength(2)
    expect(html.match(/data-hbar-app-ui-action="assistant:request-action"/g) ?? []).toHaveLength(3)
    expect(html).toContain('Restore the previous date range')
    expect(html).toContain('Re-run the export now')
    expect(html).toContain('Talk to a person')
    expect(html).toContain('aria-label="Message"')
    expect(html).toContain('rows="3"')
    expect(html).toContain('AI answers, checked against your data')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-modal=')
    expect(html).not.toContain('A support specialist would join this conversation.')
    expect(html).not.toContain('>Related articles</')
  })

  test('uses localized content, keeps limit errors near the composer, and leaves the draft editable', () => {
    const assistant = createSupportAssistantReferenceFixture('de-long')
    const flow: NonNullable<AssistantContent['referenceFlow']> = {
      open: true,
      draft: 'Bitte prüfe den einzeiligen Datumsbereich des gespeicherten Exportfilters.',
      pending: false,
      limitReached: true,
      error: 'Die lokale Vorschau hat die Nachrichtenbegrenzung erreicht; der Entwurf bleibt bearbeitbar.',
      feedback: null,
      onOpenChange() {},
      onDraftChange() {},
      onSubmit() {},
    }
    const html = renderAssistant({ ...assistant, referenceFlow: flow })

    expect(html).toContain('Antworten aus deinem Workspace und der Dokumentation')
    expect(html).toContain('Den vorherigen Datumsbereich wiederherstellen')
    expect(html).toContain('Nachricht an den Northwind Assistant schreiben')
    expect(html).toContain('Bitte prüfe den einzeiligen Datumsbereich')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Die lokale Vorschau hat die Nachrichtenbegrenzung erreicht')
    expect(html).not.toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toMatch(/<button[^>]*data-hbar-app-ui-action="assistant:send"[^>]*disabled=""/)
  })

  test('uses controlled pending and closed states without inventing a sent reply', () => {
    const assistant = createSupportAssistantReferenceFixture()
    const pending: NonNullable<AssistantContent['referenceFlow']> = {
      open: true,
      draft: 'Keep this question editable after a failed preview acknowledgement.',
      pending: true,
      error: null,
      feedback: 'Adding this message to the local preview…',
      onOpenChange() {},
      onDraftChange() {},
      onSubmit() {},
    }
    const pendingHtml = renderAssistant({ ...assistant, referenceFlow: pending })
    expect(pendingHtml).toContain('aria-busy="true"')
    expect(pendingHtml).toContain('Keep this question editable')
    expect(pendingHtml).toContain('Adding this message to the local preview')
    expect(pendingHtml).toMatch(/<textarea[^>]*disabled=""/)
    expect(pendingHtml).not.toContain('Keep this question editable after a failed preview acknowledgement.</p>')

    const closedHtml = renderAssistant({
      ...assistant,
      referenceFlow: { ...pending, open: false, pending: false, feedback: null },
    })
    expect(closedHtml).toContain('Open support assistant')
    expect(closedHtml).not.toContain('data-hbar-app-ui-region="assistant-transcript"')
  })

  test('deduplicates stable IDs while retaining content beyond the estimated pane size and an explicit empty state', () => {
    const assistant = createSupportAssistantReferenceFixture()
    const duplicateArticle = assistant.articles[0]
    if (!duplicateArticle) throw new Error('Expected a source article fixture')
    const extraArticle = { id: 'additional-article', title: 'Review a saved export filter before its next run' }
    const overflow = renderAssistant({
      ...assistant,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 1 },
      articles: [duplicateArticle, duplicateArticle, extraArticle],
    })
    expect(overflow.match(/data-hbar-app-ui-action="assistant:open-article"/g) ?? []).toHaveLength(2)
    expect(overflow).toContain(extraArticle.title)
    expect(overflow).toContain('Run 1104 finished at 06:00')

    const empty = renderAssistant({ ...assistant, messages: [], articles: [], actions: [] })
    expect(empty).toContain('No conversation')
    expect(empty).toContain('data-hbar-app-ui-region="assistant-transcript"')
    expect(empty).toContain('data-hbar-app-ui-field="assistant-message"')
  })
})
