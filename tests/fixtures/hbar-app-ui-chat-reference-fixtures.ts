import type { HbarAppUiChatContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_CHAT_FIXTURES } from './hbar-app-ui-chat-fixtures'
import { createChatDirectReferenceFixture } from './hbar-app-ui-chat-direct-reference-fixtures'
import { createChatSocialReferenceFixture } from './hbar-app-ui-chat-social-reference-fixtures'
import { createChatSupportReferenceFixture } from './hbar-app-ui-chat-support-reference-fixtures'
import { createChatGroupReferenceFixture } from './hbar-app-ui-chat-group-reference-fixtures'
import { createChatLiveReferenceFixture } from './hbar-app-ui-chat-live-reference-fixtures'

/** Independent source layouts supplied by the preview/test Host, not embedded in the component. */
export function createChatReferencePreviewFixtures(locale: 'en' | 'de-long' = 'en'): HbarAppUiChatContent {
  const team = HBAR_APP_UI_CHAT_FIXTURES.team
  if (!team) throw new Error('Expected the team chat preview fixture')
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
    direct: createChatDirectReferenceFixture(locale),
    social: createChatSocialReferenceFixture(locale),
    support: createChatSupportReferenceFixture(locale),
    group: createChatGroupReferenceFixture(locale),
    live: createChatLiveReferenceFixture(locale),
  }
}
