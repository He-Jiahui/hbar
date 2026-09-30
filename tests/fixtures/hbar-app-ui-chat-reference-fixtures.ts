import type { HbarAppUiChatContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_CHAT_FIXTURES } from './hbar-app-ui-chat-fixtures'

/** Source-aligned Team/Direct records; the remaining flows retain their explicitly partial legacy layout. */
export function createChatReferencePreviewFixtures(locale: 'en' | 'de-long' = 'en'): HbarAppUiChatContent {
  const team = HBAR_APP_UI_CHAT_FIXTURES.team
  const direct = HBAR_APP_UI_CHAT_FIXTURES.direct
  if (!team || !direct) throw new Error('Expected the team and direct chat preview fixtures')
  const german = locale === 'de-long'
  return {
    ...HBAR_APP_UI_CHAT_FIXTURES,
    team: {
      ...team,
      labels: {
        ...team.labels,
        detail: german
          ? 'Abstimmung der Veröffentlichung für die aktualisierte Abrechnung im Juni'
          : 'Release coordination for the June billing update',
        send: german ? 'Nachricht senden' : 'Send message',
        placeholder: (channel) =>
          german ? `Eine Nachricht an den Veröffentlichungskanal ${channel} schreiben` : `Message #${channel}`,
        empty: german ? 'Noch keine Nachrichten in diesem Kanal' : 'No messages in this channel',
      },
      channels: [{ id: 'launch-room', label: 'launch-room' }],
      initialChannelId: 'launch-room',
      messages: [
        {
          id: 'checkout',
          channelId: 'launch-room',
          author: 'Amelia Whitfield',
          initials: 'AW',
          meta: '09:12',
          body: 'Pushed the checkout revision to staging. The prorated line item now renders before tax.',
        },
        {
          id: 'filtered-empty',
          channelId: 'launch-room',
          author: 'Marcus Bell',
          initials: 'MB',
          meta: '09:18',
          body: 'Confirmed on my side. One thing: the empty state still says “no invoices yet” after a filter clears everything.\nIt should read as a filter result, not an onboarding state.',
        },
        {
          id: 'copy-reset',
          channelId: 'launch-room',
          author: 'Sofia Alvarez',
          initials: 'SA',
          meta: '09:24',
          body: 'Taking that one. I will split the copy so the filtered case has its own message and a reset action.',
        },
        {
          id: 'changelog',
          channelId: 'launch-room',
          author: 'Amelia Whitfield',
          initials: 'AW',
          meta: '09:31',
          body: 'Perfect. I will hold the release note until that lands so we ship one changelog entry instead of two.',
        },
      ],
      referenceLayout: {
        labels: {
          pin: german ? 'Angeheftete Nachrichten öffnen' : 'Pinned messages',
          members: german ? 'Mitglieder dieses Veröffentlichungskanals anzeigen' : 'Channel members',
          day: german ? 'Heute' : 'Today',
          typing: german ? 'Sofia Alvarez schreibt gerade eine Nachricht' : 'Sofia Alvarez is typing',
          attach: german ? 'Eine Datei an die Nachricht anhängen' : 'Attach file',
          emoji: german ? 'Ein Emoji zur Nachricht hinzufügen' : 'Add emoji',
        },
        memberCount: '18',
      },
    },
    direct: {
      ...direct,
      labels: {
        ...direct.labels,
        title: german ? 'Direkte Unterhaltungen' : 'Messages',
        detail: german ? 'Unterhaltungen mit Ihrem Team' : 'Direct conversations',
        conversationDetail: german ? 'Gerade aktiv' : 'Active now',
        send: german ? 'Nachricht senden' : 'Send message',
        placeholder: (contact) =>
          german ? `Eine Nachricht an ${contact} schreiben und auf lokale Bestätigung warten` : `Message ${contact}`,
        emptyContacts: german ? 'Noch keine Kontakte' : 'No contacts',
        emptyMessages: german ? 'Noch keine Nachrichten in dieser Unterhaltung' : 'No messages yet',
      },
      contacts: [
        {
          id: 'sofia',
          name: 'Sofia Alvarez',
          initials: 'SA',
          meta: 'Sent the revised copy deck',
          status: 'Active now',
        },
        { id: 'marcus', name: 'Marcus Bell', initials: 'MB', meta: "Works for me, let's ship it" },
        { id: 'priya', name: 'Priya Nandakumar', initials: 'PN', meta: 'Photo' },
        { id: 'wei', name: 'Wei Chen', initials: 'WC', meta: "I'll pick this up Monday" },
        { id: 'tomas', name: 'Tomás Guerrero', initials: 'TG', meta: 'Thanks for the review' },
      ],
      initialContactId: 'sofia',
      messages: [
        {
          id: 'copy-deck',
          contactId: 'sofia',
          author: 'Sofia Alvarez',
          initials: 'SA',
          body: 'Morning. The revised copy deck is in the shared folder, second tab has the shorter variants.',
          meta: '09:28',
        },
        {
          id: 'headline',
          contactId: 'sofia',
          author: german ? 'Sie' : 'You',
          initials: 'YO',
          body: 'Got it. The shorter headline reads much better on mobile.',
          meta: '09:31',
          outgoing: true,
        },
        {
          id: 'subhead',
          contactId: 'sofia',
          author: german ? 'Sie' : 'You',
          initials: 'YO',
          body: 'One ask: can the subhead drop the second clause? It wraps to three lines at 375.',
          meta: '09:31',
          outgoing: true,
        },
        {
          id: 're-export',
          contactId: 'sofia',
          author: 'Sofia Alvarez',
          initials: 'SA',
          body: 'Easy. I will trim it and re-export both light and dark.',
          meta: '09:38',
        },
        {
          id: 'lock-file',
          contactId: 'sofia',
          author: 'Sofia Alvarez',
          initials: 'SA',
          body: 'Anything else before I lock the file?',
          meta: '09:41',
        },
      ],
    },
  }
}
