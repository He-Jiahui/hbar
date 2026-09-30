import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHbarAppUiVariantSpec, getHbarAppUiVariant } from '../packages/hbar-app-ui/src/catalog'
import { ChatPreviewHost } from '../apps/hbar-app-ui-preview/src/ChatPreviewHost'
import { createChatPreviewCopy } from '../apps/hbar-app-ui-preview/src/chatPreviewCopy'
import { createChatReferencePreviewFixtures } from './fixtures/hbar-app-ui-chat-reference-fixtures'

function renderChat(
  variant: number,
  locale: 'en' | 'de-long' = 'en',
  content = createChatReferencePreviewFixtures(locale),
): string {
  const { spec, component: Component } = getHbarAppUiVariant('chat', variant)
  return renderToStaticMarkup(
    <ChatPreviewHost content={content} spec={spec} locale={locale}>
      <Component spec={spec} />
    </ChatPreviewHost>,
  )
}

describe('Chat preview Host', () => {
  test('renders controlled composer flows for all six existing public variants', () => {
    const markup = Array.from({ length: 6 }, (_, index) => renderChat(index + 1))

    markup.forEach((html, index) => {
      expect(html).toContain(`data-lumen-variant="${index + 1}"`)
      expect(html).toContain('data-hbar-app-ui-action="send"')
      if (index !== 3) expect(html).toContain('lumen-chat-composer-stack')
    })
  })

  test('preserves the source Team flow and German long labels without an invented channel sidebar', () => {
    const html = renderChat(1, 'de-long')

    expect(html).toContain('launch-room')
    expect(html).toContain('Abstimmung der Veröffentlichung für die aktualisierte Abrechnung im Juni')
    expect(html).toContain('Angeheftete Nachrichten öffnen')
    expect(html).toContain('Mitglieder dieses Veröffentlichungskanals anzeigen')
    expect(html).toContain('Heute')
    expect(html).toContain('Sofia Alvarez schreibt gerade eine Nachricht')
    expect(html).toContain('Eine Datei an die Nachricht anhängen')
    expect(html).toContain('Eine Nachricht an den Veröffentlichungskanal launch-room schreiben')
    expect(html).toContain('checkout revision to staging')
    expect(html).not.toContain('Channels')
  })

  test('renders the five real Direct targets and the source conversation without fake delivery feedback', () => {
    const html = renderChat(2)

    expect(html).toContain('Sofia Alvarez')
    expect(html).toContain('Marcus Bell')
    expect(html).toContain('Priya Nandakumar')
    expect(html).toContain('Tomás Guerrero')
    expect(html).toContain('Morning. The revised copy deck is in the shared folder')
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html).not.toContain('Added to this preview only')
    expect(html).not.toContain('Support assistant')
  })

  test('localizes pending, confirmed, and failure feedback without delivery claims', () => {
    const english = createChatPreviewCopy('en')
    const german = createChatPreviewCopy('de-long')

    expect(english.pending).toContain('local preview')
    expect(english.confirmed).toContain('no one else received it')
    expect(english.error).toContain('local preview')
    expect(english.failed).toContain('draft')
    expect(german.pending).toContain('ausschließlich in der lokalen Vorschau')
    expect(german.confirmed).toContain('niemand sonst')
    expect(german.error).toContain('lokale Vorschau')
    expect(german.messageMeta).toContain('nicht zugestellt')
  })

  test('passes unrelated categories through unchanged', () => {
    const spec = createHbarAppUiVariantSpec('billing', 1)
    const html = renderToStaticMarkup(
      <ChatPreviewHost content={createChatReferencePreviewFixtures()} spec={spec}>
        <span data-testid="unrelated-child">Unchanged</span>
      </ChatPreviewHost>,
    )

    expect(html).toContain('data-testid="unrelated-child"')
    expect(html).not.toContain('lumen-chat')
  })
})
