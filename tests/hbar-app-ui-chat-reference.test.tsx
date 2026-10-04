import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenChat, type LumenChatComposerFlow, type LumenChatContent } from '@lumen/app-ui'
import { createChatReferencePreviewFixtures } from './fixtures/hbar-app-ui-chat-reference-fixtures'

function renderReference(content: LumenChatContent, composer?: LumenChatComposerFlow): string {
  const team = content.team
  if (!team) throw new Error('Expected source channel content')
  return renderToStaticMarkup(
    createElement(LumenChat, {
      variant: 1,
      variantId: 'hbar-app-ui-chat-1',
      content: {
        ...content,
        team: composer
          ? { ...team, referenceFlow: { channelId: team.initialChannelId, onChannelChange() {}, composer } }
          : team,
      },
    }),
  )
}

describe('source channel reference surface', () => {
  test('keeps source header, four messages, typing and tools without inventing a channel sidebar', () => {
    const markup = renderReference(createChatReferencePreviewFixtures())
    expect(markup).toContain('launch-room')
    expect(markup).toContain('Pinned messages')
    expect(markup).toContain('Channel members')
    expect(markup).toContain('Sofia Alvarez is typing')
    expect(markup.match(/class="lumen-chat-reference-message"/g)).toHaveLength(4)
    expect(markup).not.toContain('lumen-chat-navigation')
    expect(markup).not.toContain('React to')
    expect(markup).toContain('Attach file')
    expect(markup).toContain('Add emoji')
  })

  test('projects native controlled input, local pending/failure and current localized copy', () => {
    const composer: LumenChatComposerFlow = {
      draft: 'Keep this channel draft',
      pending: true,
      error: null,
      feedback: 'Die Vorschau wartet auf Bestätigung.',
      onDraftChange() {},
      onSubmit() {},
    }
    const pending = renderReference(createChatReferencePreviewFixtures('de-long'), composer)
    expect(pending).toContain('type="text"')
    expect(pending).toContain('Keep this channel draft')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('Nachricht senden')
    expect(pending).toContain('Die Vorschau wartet auf Bestätigung.')
    expect(pending).toContain('disabled=""')
    const failed = renderReference(createChatReferencePreviewFixtures('de-long'), {
      ...composer,
      pending: false,
      feedback: null,
      error: 'Nicht bestätigt; der Entwurf bleibt erhalten.',
    })
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('Nicht bestätigt; der Entwurf bleibt erhalten.')
    expect(failed).toContain('Keep this channel draft')
  })
})
