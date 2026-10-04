import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenChat, type LumenChatComposerFlow, type LumenChatContent } from '@lumen/app-ui'
import { createChatLiveReferenceFixture } from './fixtures/hbar-app-ui-chat-live-reference-fixtures'

function renderLive(live: NonNullable<LumenChatContent['live']>): string {
  return renderToStaticMarkup(
    createElement(LumenChat, {
      variant: 6,
      variantId: 'hbar-app-ui-chat-6',
      content: { live },
    }),
  )
}

function idleComposer(): LumenChatComposerFlow {
  return {
    draft: '',
    pending: false,
    error: null,
    feedback: null,
    onDraftChange() {},
    onSubmit() {},
  }
}

describe('source live reference surface', () => {
  test('renders eight inline host/moderator chat rows, pinned copy, Follow, and no viewers tab', () => {
    const html = renderLive(createChatLiveReferenceFixture())

    expect(html).toContain('Live: designing dense interfaces')
    expect(html).toContain('1,284 watching · 41 min in')
    expect(html).toContain('Pinned by Junie Park')
    expect(html).toContain('data-hbar-app-ui-region="live-messages"')
    expect(html.match(/class="lumen-chat-live-reference-message"/g) ?? []).toHaveLength(8)
    expect(html).toContain('Welcome in. We are starting with the layout pass')
    expect(html).toContain('Host</span>')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('Follow')
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('lumen-chat-viewers')
    expect(html).not.toContain('10:19')
  })

  test('keeps a complete translated row and does not truncate Host-projected overflow', () => {
    const live = createChatLiveReferenceFixture('de-long')
    const html = renderLive({
      ...live,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 1 },
      messages: [
        ...live.messages,
        {
          id: 'host-projected-overflow',
          author: 'Sonderzeichen-Moderatorin',
          initials: 'SM',
          role: 'Moderation',
          body: 'Diese zusätzliche, absichtlich lange Host-Nachricht bleibt vollständig im Scrollbereich erhalten.',
          meta: '10:29',
        },
        {
          id: 'host-projected-overflow',
          author: 'Duplicate',
          initials: 'DU',
          body: 'Duplicate IDs are suppressed.',
          meta: '10:30',
        },
      ],
    })

    expect(html).toContain('Diesem Live-Stream folgen')
    expect(html).toContain('Angeheftet von Junie Park')
    expect(html).toContain('Diese zusätzliche, absichtlich lange Host-Nachricht bleibt vollständig')
    expect(html.match(/class="lumen-chat-live-reference-message"/g) ?? []).toHaveLength(9)
    expect(html).not.toContain('Duplicate IDs are suppressed.')
  })

  test('uses controlled follow state and renders the explicit empty state', () => {
    const live = createChatLiveReferenceFixture()
    const composer = idleComposer()
    const controlled = renderToStaticMarkup(
      createElement(LumenChat, {
        variant: 6,
        variantId: 'hbar-app-ui-chat-6',
        content: {
          live: {
            ...live,
            messages: [],
            referenceFlow: {
              tabId: live.chatTabId,
              onTabChange() {},
              composer,
              followed: true,
              onFollowChange() {},
            },
          },
        },
      }),
    )

    expect(controlled).toContain('No messages in the live chat')
    expect(controlled).toContain('aria-pressed="true"')
    expect(controlled).toContain('Following')
    expect(controlled).not.toContain('10:19')
  })
})
