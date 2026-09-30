import { describe, expect, test } from 'bun:test'
import { createChatReferencePreviewFixtures } from './fixtures/hbar-app-ui-chat-reference-fixtures'
import { createSupportThreadReferenceFixtures } from './fixtures/hbar-app-ui-support-thread-reference-fixtures'

describe('source-owned message preview records', () => {
  test('keeps Thread 3 six articles, attachments and four timeline pairs with localized labels', () => {
    const source = createSupportThreadReferenceFixtures().thread
    const localized = createSupportThreadReferenceFixtures('de').thread
    if (!source || !localized) throw new Error('Expected the thread fixtures')
    expect(source.messages).toHaveLength(6)
    expect(source.timeline).toHaveLength(4)
    expect(source.messages.filter((message) => message.attachment)).toHaveLength(2)
    expect(source.messages.map((message) => message.id)).toEqual(localized.messages.map((message) => message.id))
    expect(localized.labels.reply).toContain('Beobachtungen')
    expect(localized.messages[0]?.sender).toBe('Sie')
  })

  test('keeps the source channel structure data and stable direct target IDs across copy changes', () => {
    const source = createChatReferencePreviewFixtures()
    const localized = createChatReferencePreviewFixtures('de-long')
    expect(source.team?.messages).toHaveLength(4)
    expect(source.team?.channels).toEqual([{ id: 'launch-room', label: 'launch-room' }])
    expect(source.team?.referenceLayout?.memberCount).toBe('18')
    expect(source.team?.referenceLayout?.labels.typing).toBe('Sofia Alvarez is typing')
    expect(source.direct?.contacts).toHaveLength(5)
    expect(source.direct?.messages).toHaveLength(5)
    expect(source.direct?.contacts.map((contact) => contact.id)).toEqual(
      localized.direct?.contacts.map((contact) => contact.id),
    )
    expect(localized.team?.referenceLayout?.labels.attach).toContain('anhängen')
    expect(localized.direct?.labels.placeholder('Sofia')).toContain('Bestätigung')
  })
})
