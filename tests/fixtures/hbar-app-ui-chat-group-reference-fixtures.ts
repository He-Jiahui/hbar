import type { LumenChatContent, LumenChatGroupReferenceLayout } from '@lumen/app-ui'

export function createChatGroupReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<LumenChatContent['group']> {
  const localized = locale === 'de-long'
  const messages = localized
    ? [
        {
          id: 'priya-update',
          author: 'Priya Raghavan',
          initials: 'PR',
          meta: '09:41',
          body: 'Ich lasse den zweiten Durchgang des Onboarding-Ablaufs fallen. Der Schrittzähler rückt nach oben, damit die primäre Aktion niemals ihre Position ändert.',
        },
        {
          id: 'priya-pass-2',
          author: 'Priya Raghavan',
          initials: 'PR',
          meta: '09:47',
          body: '',
          replyCount: 6,
          attachment: 'onboarding-pass-2.png',
        },
        {
          id: 'tomas-review',
          author: 'Tomas Lindqvist',
          initials: 'TL',
          meta: '09:58',
          body: 'Viel ruhiger. Ein Punkt: Der Link zum Überspringen wirkt bei 375 px wie eine primäre Aktion, weil er als Einziger in dieser Zeile steht.',
        },
        {
          id: 'naomi-final-copy',
          author: 'Naomi Okafor',
          initials: 'NO',
          meta: '10:12',
          body: 'Ich hänge das Textdokument an, damit diesmal niemand über den genauen Kurztext rätseln muss.',
          attachment: 'onboarding-copy-deck.pdf',
        },
      ]
    : [
        {
          id: 'priya-update',
          author: 'Priya Raghavan',
          initials: 'PR',
          meta: '09:41',
          body: 'Dropping the second pass on the onboarding flow. The step counter moves to the top so the primary action never shifts.',
        },
        {
          id: 'priya-pass-2',
          author: 'Priya Raghavan',
          initials: 'PR',
          meta: '09:47',
          body: '',
          replyCount: 6,
          attachment: 'onboarding-pass-2.png',
        },
        {
          id: 'tomas-review',
          author: 'Tomas Lindqvist',
          initials: 'TL',
          meta: '09:58',
          body: 'Much calmer. One thing: the skip link reads as a primary action at 375px because it is the only thing on that row.',
        },
        {
          id: 'naomi-final-copy',
          author: 'Naomi Okafor',
          initials: 'NO',
          meta: '10:12',
          body: 'Attaching the copy deck so nobody has to guess the microcopy this round.',
          attachment: 'onboarding-copy-deck.pdf',
        },
      ]

  const layout: LumenChatGroupReferenceLayout = {
    labels: {
      day: localized ? 'Heute' : 'Today',
      typing: localized ? 'Tomas Lindqvist schreibt gerade eine Nachricht' : 'Tomas Lindqvist is typing',
      addReaction: localized ? 'Eine Reaktion zu dieser Nachricht hinzufügen' : 'Add a reaction to this message',
      reaction: (symbol, count) =>
        localized
          ? `${count} ${symbol}-Reaktionen auf diese Nachricht`
          : `${count} ${symbol} reactions on this message`,
      download: (name) =>
        localized ? `${name} für die lokale Vorschau herunterladen` : `Download ${name} for local preview`,
    },
    attachments: [
      {
        id: 'workspace-switcher-image',
        messageId: 'priya-pass-2',
        name: 'onboarding-pass-2.png',
        detail: localized ? 'PNG · 1,8 MB · 2400×1350' : 'PNG · 1.8 MB · 2400×1350',
        kind: 'image',
      },
      {
        id: 'onboarding-copy-deck',
        messageId: 'naomi-final-copy',
        name: 'onboarding-copy-deck.pdf',
        detail: localized ? 'PDF · 640 KB · 12 Seiten' : 'PDF · 640 KB · 12 pages',
        kind: 'document',
      },
    ],
    reactions: [
      { id: 'priya-fire', messageId: 'priya-update', symbol: '🔥', count: 5, selected: false },
      { id: 'priya-heart', messageId: 'priya-update', symbol: '❤️', count: 2, selected: true },
      { id: 'tomas-hundred', messageId: 'tomas-review', symbol: '💯', count: 3, selected: false },
      { id: 'naomi-pray', messageId: 'naomi-final-copy', symbol: '🙏', count: 4, selected: true },
    ],
  }

  return {
    labels: {
      title: localized ? 'Einführungsgruppe' : 'Onboarding group',
      detail: localized ? 'Gemeinsame Prüfung der Onboarding-Dateien' : 'Reviewing the onboarding files together',
      participants: localized ? 'Mitglieder der Einführungsgruppe' : 'Onboarding group members',
      overflowParticipants: (count) =>
        localized ? `${count} weitere Mitglieder der Einführungsgruppe` : `${count} more onboarding group members`,
      invite: localized ? 'Ein Mitglied zur Gruppe einladen' : 'Invite a group member',
      reaction: (author) =>
        localized ? `Reaktionen auf die Nachricht von ${author}` : `Reactions to ${author}'s message`,
      replies: (count) => (localized ? `${count} Antworten` : `${count} replies`),
      send: localized ? 'Nachricht senden' : 'Send message',
      placeholder: localized ? 'Nachricht an die Einführungsgruppe schreiben' : 'Message the onboarding group',
      empty: localized ? 'Noch keine Nachrichten in der Einführungsgruppe' : 'No messages in the onboarding group yet',
    },
    participants: [
      { id: 'priya-raghavan', name: 'Priya Raghavan', initials: 'PR' },
      { id: 'tomas-lindqvist', name: 'Tomas Lindqvist', initials: 'TL' },
      { id: 'naomi-okafor', name: 'Naomi Okafor', initials: 'NO' },
    ],
    maximumVisibleParticipants: 3,
    messages,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 40 },
    referenceLayout: layout,
  }
}
