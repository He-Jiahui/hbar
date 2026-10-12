import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenChat, type LumenChatComposerFlow, type LumenChatContent } from '@lumen/app-ui/catalog'
import { createChatGroupReferenceFixture } from './fixtures/hbar-app-ui-chat-group-reference-fixtures'
import { createChatSupportReferenceFixture } from './fixtures/hbar-app-ui-chat-support-reference-fixtures'

function renderVariant(variant: 4 | 5, content: LumenChatContent): string {
  return renderToStaticMarkup(
    createElement(LumenChat, {
      variant,
      variantId: `hbar-app-ui-chat-${variant}`,
      content,
    }),
  )
}

function idleComposer(draft = ''): LumenChatComposerFlow {
  return {
    draft,
    pending: false,
    error: null,
    feedback: null,
    onDraftChange() {},
    onSubmit() {},
  }
}

describe('Chat source support and group references', () => {
  test('renders the four-message support history, Host composer slot, quick replies, and binary rating', () => {
    const support = createChatSupportReferenceFixture()
    const html = renderVariant(4, { support })

    expect(html.match(/class="lumen-chat-support-reference-message(?: is-outgoing)?"/g)).toHaveLength(4)
    expect(html).toContain('Hi Cedar Labs.')
    expect(html).toContain('failed twice this week')
    expect(html).toContain('Yes. Our card is fine')
    expect(html).toContain('decline-log-INV-20418.pdf')
    expect(html).toContain('data-hbar-app-ui-region="support-messages"')
    expect(html).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(html.match(/data-hbar-app-ui-action="quick-reply"/g)).toHaveLength(3)
    expect(html).toContain('data-hbar-app-ui-action="minimize-support"')
    expect(html).toContain('data-hbar-app-ui-action="rate-helpful"')
    expect(html).toContain('data-hbar-app-ui-action="rate-not-helpful"')
    expect(html).not.toContain('data-hbar-app-ui-action="rate-star"')
    expect(html).toContain('type="text"')
    expect(html).toContain('disabled=""')
  })

  test('uses the supplied support flow and current localized source copy', () => {
    const support = createChatSupportReferenceFixture('de-long')
    const sourceMessages = support.referenceLayout?.messages
    if (!sourceMessages) throw new Error('Expected source support messages')
    const html = renderVariant(4, {
      support: {
        ...support,
        referenceFlow: {
          composer: idleComposer('Antwort an den Support'),
          messages: sourceMessages,
          rating: 2,
          onRatingChange() {},
          onQuickReply() {},
        },
      },
    })

    expect(html).toContain('Unsere Karte funktioniert')
    expect(html).toContain('Antwort an den Support')
    expect(html).toContain('Nachricht senden')
    expect(html).toContain('aria-label="Diese Support-Antwort war hilfreich"')
    expect(html).toContain('aria-label="Diese Support-Antwort war nicht hilfreich"')
    expect(html).toContain('aria-pressed="true"')
  })

  test('renders the group transcript only, with source-owned files, reactions, replies, and typing status', () => {
    const group = createChatGroupReferenceFixture()
    const html = renderVariant(5, { group })

    expect(html.match(/class="lumen-chat-group-reference-message"/g)).toHaveLength(4)
    expect(html).toContain('data-hbar-app-ui-region="group-messages"')
    expect(html).toContain('Priya Raghavan')
    expect(html).toContain('Tomas Lindqvist')
    expect(html).toContain('Naomi Okafor')
    expect(html).toContain('Dropping the second pass on the onboarding flow.')
    expect(html).toContain('the skip link reads as a primary action at 375px')
    expect(html).toContain('Attaching the copy deck so nobody has to guess the microcopy this round.')
    expect(html).toContain('onboarding-pass-2.png')
    expect(html).toContain('PNG · 1.8 MB · 2400×1350')
    expect(html).toContain('onboarding-copy-deck.pdf')
    expect(html).toContain('PDF · 640 KB · 12 pages')
    expect(html).toContain('6 replies')
    expect(html).toContain('data-hbar-app-ui-action="open-replies"')
    expect(html.match(/data-hbar-app-ui-action="toggle-reaction"/g)).toHaveLength(4)
    expect(html.match(/data-hbar-app-ui-action="add-reaction"/g)).toHaveLength(3)
    expect(html.match(/data-hbar-app-ui-action="download-attachment"/g)).toHaveLength(2)
    expect(html).toContain('Tomas Lindqvist is typing')
    expect(html).not.toContain('lumen-chat-participants')
    expect(html).not.toContain('lumen-chat-composer')
  })

  test('renders Host-selected reaction state and does not truncate supplied history at the expected maximum', () => {
    const group = createChatGroupReferenceFixture()
    const extraMessage = {
      id: 'host-projected-new-message',
      author: 'Priya Raghavan',
      initials: 'PR',
      meta: '10:20',
      body: 'This message is still included when the Host has projected more rows than the estimate.',
    }
    const html = renderVariant(5, {
      group: {
        ...group,
        listStrategy: { kind: 'pane-scroll', expectedMaximum: 1 },
        messages: [...group.messages, extraMessage],
        referenceFlow: {
          composer: idleComposer(),
          selectedReactionIds: ['priya-fire'],
          onToggleReaction() {},
        },
      },
    })

    expect(html.match(/class="lumen-chat-group-reference-message"/g)).toHaveLength(5)
    expect(html).toContain(extraMessage.body)
    expect(html).toContain('6 🔥 reactions on this message')
    expect(html).toContain('1 ❤️ reactions on this message')
    expect(html).toContain('aria-pressed="true"')
  })

  test('keeps extended German group attachment labels readable and localized', () => {
    const group = createChatGroupReferenceFixture('de-long')
    const html = renderVariant(5, { group })

    expect(html).toContain('Heute')
    expect(html).toContain('1,8 MB')
    expect(html).toContain('für die lokale Vorschau herunterladen')
    expect(html).toContain('Tomas Lindqvist schreibt gerade eine Nachricht')
  })
})
