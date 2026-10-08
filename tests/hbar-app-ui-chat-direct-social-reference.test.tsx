import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderedElements } from './ssr-elements'
import { getLumenVariantComponent } from '../hbar-ui/packages/lumen-app-ui/src/catalog'
import type {
  LumenChatComposerFlow,
  LumenChatContent,
  LumenChatDirectReferenceFlow,
  LumenChatSocialReferenceFlow,
} from '../hbar-ui/packages/lumen-app-ui/src/index'
import { createChatDirectReferenceFixture } from './fixtures/hbar-app-ui-chat-direct-reference-fixtures'
import { createChatSocialReferenceFixture } from './fixtures/hbar-app-ui-chat-social-reference-fixtures'

function renderChat(variantId: 'hbar-app-ui-chat-2' | 'hbar-app-ui-chat-3', content: LumenChatContent) {
  const Component = getLumenVariantComponent(variantId)
  if (!Component) throw new Error(`Expected the public catalog entry ${variantId}`)
  return renderToStaticMarkup(createElement(Component, { content }))
}

function composer(draft = ''): LumenChatComposerFlow {
  return {
    draft,
    pending: false,
    error: null,
    feedback: null,
    onDraftChange() {},
    onSubmit() {},
  }
}

function directFlow(overrides: Partial<LumenChatDirectReferenceFlow> = {}): LumenChatDirectReferenceFlow {
  return {
    contactId: 'sofia',
    onContactChange() {},
    composer: composer(),
    ...overrides,
  }
}

function socialFlow(overrides: Partial<LumenChatSocialReferenceFlow> = {}): LumenChatSocialReferenceFlow {
  return { composer: composer(), ...overrides }
}

describe('source Direct conversation reference', () => {
  test('keeps the five source contacts, Sofia thread, native search and source contact actions', () => {
    const content = createChatDirectReferenceFixture()
    const markup = renderChat('hbar-app-ui-chat-2', { direct: content })

    expect(markup).toContain('Search conversations')
    expect(markup).toContain('type="search"')
    expect(markup).toContain('Sofia Alvarez')
    expect(markup).toContain('Marcus Bell')
    expect(markup).toContain('Priya Nandakumar')
    expect(markup).toContain('Wei Chen')
    expect(markup).toContain('Tomás Guerrero')
    expect(markup.match(/data-hbar-app-ui-action="direct:select-contact"/g)).toHaveLength(5)
    expect(markup.match(/class="lumen-chat-direct-message /g)).toHaveLength(5)
    expect(markup).toContain('One ask: can the subhead drop the second clause?')
    expect(markup).toContain('data-hbar-app-ui-region="conversation-messages"')
    expect(markup.match(/aria-label="Read"/g)).toHaveLength(2)
  })

  test('handles empty, one-contact, duplicate and stale selection data without losing the selected thread', () => {
    const base = createChatDirectReferenceFixture()
    const empty = renderChat('hbar-app-ui-chat-2', {
      direct: { ...base, contacts: [], initialContactId: 'stale-contact', messages: [] },
    })
    expect(empty).toContain('No contacts')
    expect(empty).toContain('No messages yet')

    const one = renderChat('hbar-app-ui-chat-2', {
      direct: {
        ...base,
        contacts: base.contacts.slice(0, 1),
        initialContactId: 'no-longer-present',
      },
    })
    expect(one.match(/data-hbar-app-ui-action="direct:select-contact"/g)).toHaveLength(1)
    expect(one).toContain('Anything else before I lock the file?')
    expect(one).not.toContain('Marcus Bell')

    const duplicated = renderChat('hbar-app-ui-chat-2', {
      direct: {
        ...base,
        contacts: [...base.contacts, base.contacts[0]!],
        messages: [...base.messages, base.messages[0]!],
      },
    })
    expect(duplicated.match(/data-hbar-app-ui-action="direct:select-contact"/g)).toHaveLength(5)
    expect(duplicated.match(/Morning\. The revised copy deck/g)).toHaveLength(1)

    const staleControlled = renderChat('hbar-app-ui-chat-2', {
      direct: {
        ...base,
        referenceFlow: directFlow({ contactId: 'stale-contact', query: 'no matching contact' }),
      },
    })
    expect(staleControlled).toContain('No conversations match this search.')
    expect(staleControlled).toContain('value="no matching contact"')
    expect(staleControlled).toContain('Morning. The revised copy deck')
  })

  test('shows an unconfirmed Host message status without presenting it as a read receipt', () => {
    const base = createChatDirectReferenceFixture()
    const markup = renderChat('hbar-app-ui-chat-2', {
      direct: {
        ...base,
        messages: [
          {
            id: 'local-pending-message',
            contactId: 'sofia',
            author: 'You',
            initials: 'YO',
            body: 'Keep this message in the draft history.',
            meta: 'Now',
            outgoing: true,
            status: 'Not delivered',
          },
        ],
      },
    })

    expect(markup).toContain('Not delivered')
    expect(markup).not.toContain('aria-label="Read"')
  })

  test('projects Host-controlled query, draft and current German copy', () => {
    const base = createChatDirectReferenceFixture('de-long')
    const markup = renderChat('hbar-app-ui-chat-2', {
      direct: {
        ...base,
        referenceFlow: directFlow({
          composer: composer('Unveröffentlichter Entwurf'),
          query: 'Sofia',
          onQueryChange() {},
        }),
      },
    })

    expect(markup).toContain('value="Sofia"')
    expect(markup).toContain('Unveröffentlichter Entwurf')
    expect(markup).toContain('Nachrichten und Kontakte durchsuchen')
    expect(markup).toContain('Eine Nachricht an Sofia Alvarez in der privaten Unterhaltung schreiben')
    expect(markup).toContain('data-hbar-app-ui-action="direct:query-change"')
  })
})

describe('source social discussion reference', () => {
  test('renders the source post, reply composer, nested conversation and accessible short Reply actions', async () => {
    const content = createChatSocialReferenceFixture()
    const markup = renderChat('hbar-app-ui-chat-3', { social: content })

    expect(markup).toContain('data-hbar-app-ui-region="post"')
    expect(markup).toContain('We rebuilt our billing screens around one rule')
    expect(markup).toContain('Replies, 24')
    expect(markup).toContain('Reposts, 41')
    expect(markup).toContain('Post your reply')
    expect(markup).toContain('Replies are visible to everyone following this thread.')
    expect(markup).toContain('Marcus Bell')
    expect(markup).toContain('Sofia Alvarez')
    expect(markup).toContain('Exactly. We capped ourselves at two hues')
    expect(markup).toContain('aria-label="Reply to Marcus Bell"')
    expect(markup.match(/class="[^"]*lumen-chat-social-reply-action[^"]*"/g)).toHaveLength(2)
    expect((await renderedElements(markup, 'button')).filter((element) => element.text === 'Reply')).toHaveLength(3)
  })

  test('handles empty, one, duplicate and stale nested replies', () => {
    const base = createChatSocialReferenceFixture()
    const empty = renderChat('hbar-app-ui-chat-3', {
      social: {
        ...base,
        replies: [],
        referenceLayout: {
          ...base.referenceLayout!,
          replyCount: 0,
          nestedReplies: [
            {
              id: 'orphan-reply',
              parentId: 'removed-parent',
              author: 'Avery Chen',
              initials: 'AC',
              body: 'This orphan should not appear without its parent.',
              meta: 'Just now',
            },
          ],
        },
      },
    })
    expect(empty).toContain('No replies yet')
    expect(empty).not.toContain('orphan-reply')
    expect(empty).not.toContain('This orphan should not appear')

    const one = renderChat('hbar-app-ui-chat-3', {
      social: {
        ...base,
        replies: [base.replies[0]!],
        referenceLayout: {
          ...base.referenceLayout!,
          nestedReplies: base.referenceLayout!.nestedReplies,
        },
      },
    })
    expect(one.match(/class="[^"]*lumen-chat-social-reply-action[^"]*"/g)).toHaveLength(1)
    expect(one).toContain('Exactly. We capped ourselves at two hues')
    expect(one).not.toContain('Curious how you handle the')

    const duplicated = renderChat('hbar-app-ui-chat-3', {
      social: {
        ...base,
        replies: [...base.replies, base.replies[0]!],
        referenceLayout: {
          ...base.referenceLayout!,
          nestedReplies: [
            ...base.referenceLayout!.nestedReplies,
            base.referenceLayout!.nestedReplies[0]!,
            {
              id: 'orphan-reply',
              parentId: 'stale-parent-id',
              author: 'Avery Chen',
              initials: 'AC',
              body: 'A stale nested reply is excluded.',
              meta: 'Just now',
            },
          ],
        },
      },
    })
    expect(duplicated.match(/class="[^"]*lumen-chat-social-reply-action[^"]*"/g)).toHaveLength(2)
    expect(duplicated.match(/class="lumen-chat-social-nested-reply"/g)).toHaveLength(1)
    expect(duplicated).not.toContain('A stale nested reply is excluded.')
    expect(duplicated).toContain('data-hbar-app-ui-action="social:toggle-like"')
  })

  test('projects controlled sort order and like deltas for the post and nested replies', () => {
    const base = createChatSocialReferenceFixture()
    const relevant = renderChat('hbar-app-ui-chat-3', {
      social: { ...base, referenceFlow: socialFlow({ sortOrder: 'relevant' }) },
    })
    const recent = renderChat('hbar-app-ui-chat-3', {
      social: {
        ...base,
        referenceFlow: socialFlow({
          sortOrder: 'recent',
          likedIds: ['post-billing', 'sofia-reply', 'amelia-nested'],
        }),
      },
    })

    expect(relevant.indexOf('Marcus Bell')).toBeLessThan(relevant.indexOf('Sofia Alvarez'))
    expect(recent.indexOf('Sofia Alvarez')).toBeLessThan(recent.indexOf('Marcus Bell'))
    expect(recent).toContain('Likes, 319')
    expect(recent).toContain('Likes on reply from Sofia Alvarez, 10')
    expect(recent).toContain('Likes, 18')
    expect(recent).toContain('aria-pressed="true"')
    expect(recent).toContain('aria-pressed="false"')
    expect(recent).toContain('data-hbar-app-ui-action="social:sort"')
  })

  test('keeps locale-owned long copy and reply-to accessible names separate from the visible label', async () => {
    const content = createChatSocialReferenceFixture('de-long')
    const markup = renderChat('hbar-app-ui-chat-3', {
      social: { ...content, referenceFlow: socialFlow({ sortOrder: 'relevant' }) },
    })

    expect(markup).toContain('Gefällt mir')
    expect(markup).toContain('aria-label="Auf die Antwort von Marcus Bell antworten"')
    expect(
      (await renderedElements(markup, '.lumen-chat-social-reply-action')).map((element) => ({
        label: element.attributes['aria-label'],
        text: element.text,
      })),
    ).toEqual([
      { label: 'Auf die Antwort von Marcus Bell antworten', text: 'Antworten' },
      { label: 'Auf die Antwort von Sofia Alvarez antworten', text: 'Antworten' },
    ])
  })
})
