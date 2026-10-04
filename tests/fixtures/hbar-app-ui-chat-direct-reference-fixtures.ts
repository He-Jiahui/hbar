import type { HbarAppUiChatContent } from '../../packages/hbar-app-ui/src/index'

export function createChatDirectReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<HbarAppUiChatContent['direct']> {
  const localized = locale === 'de-long'
  const contacts = [
    {
      id: 'sofia',
      name: 'Sofia Alvarez',
      initials: 'SA',
      meta: localized ? 'Hat das überarbeitete Textdeck gesendet' : 'Sent the revised copy deck',
      status: localized ? 'Jetzt aktiv' : 'Active now',
      time: '09:41',
      unreadCount: '2',
    },
    {
      id: 'marcus',
      name: 'Marcus Bell',
      initials: 'MB',
      meta: localized ? 'Einverstanden, wir können veröffentlichen' : "Works for me, let's ship it",
      time: '09:12',
    },
    {
      id: 'priya',
      name: 'Priya Nandakumar',
      initials: 'PN',
      meta: localized ? 'Foto' : 'Photo',
      time: localized ? 'Gestern' : 'Yesterday',
    },
    {
      id: 'wei',
      name: 'Wei Chen',
      initials: 'WC',
      meta: localized ? 'Ich kümmere mich am Montag darum' : "I'll pick this up Monday",
      time: localized ? 'Gestern' : 'Yesterday',
    },
    {
      id: 'tomas',
      name: 'Tomás Guerrero',
      initials: 'TG',
      meta: localized ? 'Danke für die Prüfung' : 'Thanks for the review',
      time: localized ? 'Dienstag' : 'Tue',
    },
  ]

  const messages: NonNullable<HbarAppUiChatContent['direct']>['messages'] = [
    {
      id: 'sofia-morning-copy-deck',
      contactId: 'sofia',
      author: 'Sofia Alvarez',
      initials: 'SA',
      body: localized
        ? 'Guten Morgen. Das überarbeitete Textdeck liegt im gemeinsamen Ordner; im zweiten Tab findest du die kürzeren Varianten.'
        : 'Morning. The revised copy deck is in the shared folder, second tab has the shorter variants.',
      meta: '09:28',
    },
    {
      id: 'sofia-short-headline',
      contactId: 'sofia',
      author: 'You',
      initials: 'YO',
      body: localized
        ? 'Verstanden. Die kürzere Überschrift lässt sich auf dem Smartphone viel besser lesen.'
        : 'Got it. The shorter headline reads much better on mobile.',
      meta: '09:31',
      outgoing: true,
      read: true,
    },
    {
      id: 'sofia-subhead-request',
      contactId: 'sofia',
      author: 'You',
      initials: 'YO',
      body: localized
        ? 'Eine Bitte: Kann der Untertitel den zweiten Nebensatz verlieren? Bei 375 Pixeln wird er sonst dreizeilig.'
        : 'One ask: can the subhead drop the second clause? It wraps to three lines at 375.',
      meta: '09:31',
      outgoing: true,
      read: true,
    },
    {
      id: 'sofia-trim-response',
      contactId: 'sofia',
      author: 'Sofia Alvarez',
      initials: 'SA',
      body: localized
        ? 'Gern. Ich kürze ihn und exportiere anschließend die helle und die dunkle Variante neu.'
        : 'Easy. I will trim it and re-export both light and dark.',
      meta: '09:38',
    },
    {
      id: 'sofia-final-check',
      contactId: 'sofia',
      author: 'Sofia Alvarez',
      initials: 'SA',
      body: localized ? 'Gibt es noch etwas, bevor ich die Datei abschließe?' : 'Anything else before I lock the file?',
      meta: '09:41',
    },
    {
      id: 'marcus-release-confirmation',
      contactId: 'marcus',
      author: 'Marcus Bell',
      initials: 'MB',
      body: localized ? 'Passt für mich. Wir können die Änderung veröffentlichen.' : "Works for me, let's ship it.",
      meta: '09:12',
    },
    {
      id: 'priya-shared-photo',
      contactId: 'priya',
      author: 'Priya Nandakumar',
      initials: 'PN',
      body: localized ? 'Hat ein Foto mit dir geteilt.' : 'Shared a photo with you.',
      meta: localized ? 'Gestern' : 'Yesterday',
    },
    {
      id: 'wei-monday-follow-up',
      contactId: 'wei',
      author: 'Wei Chen',
      initials: 'WC',
      body: localized
        ? 'Ich kümmere mich am Montag darum und melde mich anschließend.'
        : "I'll pick this up Monday and follow up.",
      meta: localized ? 'Gestern' : 'Yesterday',
    },
    {
      id: 'tomas-review-thanks',
      contactId: 'tomas',
      author: 'Tomás Guerrero',
      initials: 'TG',
      body: localized ? 'Danke für die Prüfung, das hilft sehr.' : 'Thanks for the review, that helps a lot.',
      meta: localized ? 'Dienstag' : 'Tue',
    },
  ]

  return {
    labels: {
      title: localized ? 'Unterhaltungen und Nachrichten' : 'Messages',
      detail: localized ? 'Direkter Nachrichteneingang für die laufende Zusammenarbeit' : 'Direct inbox',
      conversationDetail: localized ? 'Nachrichtenstatus und Lesebestätigungen' : 'Read receipts',
      send: localized ? 'Nachricht senden' : 'Send message',
      placeholder: (contact) =>
        localized ? `Eine Nachricht an ${contact} für die gemeinsame Textprüfung schreiben` : `Message ${contact}`,
      emptyContacts: localized ? 'Keine Kontakte in diesem Nachrichteneingang' : 'No contacts',
      emptyMessages: localized
        ? 'Für diese Person gibt es noch keine Nachrichten in diesem Verlauf.'
        : 'No messages yet',
    },
    contacts,
    initialContactId: 'sofia',
    messages,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
    referenceLayout: {
      labels: {
        search: localized ? 'Nachrichten und Kontakte durchsuchen' : 'Search conversations',
        searchPlaceholder: localized
          ? 'Nachrichten, Namen oder aktuelle Unterhaltungen durchsuchen'
          : 'Search messages',
        emptySearch: localized
          ? 'Keine Unterhaltungen entsprechen dieser Suche.'
          : 'No conversations match this search.',
        day: localized ? 'Heute' : 'Today',
        voiceCall: localized ? 'Sprachanruf mit diesem Kontakt starten' : 'Start voice call',
        videoCall: localized ? 'Videoanruf mit diesem Kontakt starten' : 'Start video call',
        attachImage: localized ? 'Ein Bild an diese Nachricht anhängen' : 'Attach image',
        read: localized ? 'Nachricht gelesen' : 'Read',
        inputLabel: (contact) =>
          localized ? `Eine Nachricht an ${contact} in der privaten Unterhaltung schreiben` : `Message ${contact}`,
        inputPlaceholder: localized ? 'Eine Nachricht schreiben und mit der Eingabetaste senden' : 'Write a message',
      },
    },
  }
}
