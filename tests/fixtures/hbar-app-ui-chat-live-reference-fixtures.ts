import type { LumenChatContent, LumenChatLiveMessage, LumenChatLiveReferenceLayout } from '@lumen/app-ui'

export function createChatLiveReferenceFixture(locale: 'en' | 'de-long' = 'en'): NonNullable<LumenChatContent['live']> {
  const localized = locale === 'de-long'
  const labels: LumenChatLiveReferenceLayout['labels'] = localized
    ? {
        follow: 'Diesem Live-Stream folgen',
        following: 'Du folgst diesem Live-Stream jetzt',
        emoji: 'Ein Emoji zur Nachricht im Live-Stream hinzufügen',
        inputLabel: 'Eine Nachricht an alle Teilnehmenden des Live-Streams schreiben',
        pinnedSeparator: ': ',
        messageSeparator: '·',
      }
    : {
        follow: 'Follow',
        following: 'Following',
        emoji: 'Add emoji to live message',
        inputLabel: 'Send a message to the stream',
        pinnedSeparator: ': ',
        messageSeparator: '·',
      }
  const messages: readonly LumenChatLiveMessage[] = localized
    ? [
        {
          id: 'live-welcome',
          author: 'Rowan Diaz',
          initials: 'RD',
          role: 'Host',
          body: 'Willkommen. Wir beginnen mit der Layout-Runde und nehmen in den letzten zwanzig Minuten Fragen entgegen.',
          meta: '10:19',
        },
        {
          id: 'live-kestrel',
          author: 'kestrel',
          initials: 'K',
          body: 'Die Raster-Überlagerung übernimmt hier gerade ziemlich viel Arbeit.',
          meta: '10:20',
        },
        {
          id: 'live-reminder',
          author: 'Junie Park',
          initials: 'JP',
          role: 'Moderation',
          body: 'Zur Erinnerung: Beginnt Fragen bitte mit einem Q, damit wir sie später leichter finden.',
          meta: '10:22',
        },
        {
          id: 'live-matt-question',
          author: 'mattlives',
          initials: 'M',
          body: 'Q: Woran entscheidet ihr, ob ein Abschnitt eine eigene Oberfläche oder nur mehr Abstand braucht?',
          meta: '10:24',
        },
        {
          id: 'live-aurelia',
          author: 'aurelia',
          initials: 'A',
          body: 'Diese Frage kommt von mir auch – darüber diskutieren wir in jedem Sprint.',
          meta: '10:25',
        },
        {
          id: 'live-host-answer',
          author: 'Rowan Diaz',
          initials: 'RD',
          role: 'Host',
          body: 'Gute Frage. Kurz gesagt: Eine Oberfläche steht für eine andere Art von Inhalt, nicht für eine andere Menge davon.',
          meta: '10:26',
        },
        {
          id: 'live-tinyhaus',
          author: 'tinyhaus',
          initials: 'T',
          body: 'Dieser Satz kommt direkt in unser Team-Dokument.',
          meta: '10:27',
        },
        {
          id: 'live-devon',
          author: 'devon.b',
          initials: 'D',
          body: 'Wird die Aufzeichnung morgen für alle oder nur für Abonnenten verfügbar sein?',
          meta: '10:28',
        },
      ]
    : [
        {
          id: 'live-welcome',
          author: 'Rowan Diaz',
          initials: 'RD',
          role: 'Host',
          body: 'Welcome in. We are starting with the layout pass, then taking questions in the last twenty minutes.',
          meta: '10:19',
        },
        {
          id: 'live-kestrel',
          author: 'kestrel',
          initials: 'K',
          body: 'the grid overlay is doing a lot of work here',
          meta: '10:20',
        },
        {
          id: 'live-reminder',
          author: 'Junie Park',
          initials: 'JP',
          role: 'Mod',
          body: 'Reminder: drop questions with a leading Q so we can find them later.',
          meta: '10:22',
        },
        {
          id: 'live-matt-question',
          author: 'mattlives',
          initials: 'M',
          body: 'Q: how do you decide when a section deserves its own surface vs just spacing?',
          meta: '10:24',
        },
        {
          id: 'live-aurelia',
          author: 'aurelia',
          initials: 'A',
          body: 'second that question, we argue about it every sprint',
          meta: '10:25',
        },
        {
          id: 'live-host-answer',
          author: 'Rowan Diaz',
          initials: 'RD',
          role: 'Host',
          body: 'Good one. Short answer: a surface is for a different kind of content, not a different amount of it.',
          meta: '10:26',
        },
        {
          id: 'live-tinyhaus',
          author: 'tinyhaus',
          initials: 'T',
          body: 'that line is going straight into our team doc',
          meta: '10:27',
        },
        {
          id: 'live-devon',
          author: 'devon.b',
          initials: 'D',
          body: 'is the recording going out to everyone or subscribers only?',
          meta: '10:28',
        },
      ]

  const layout: LumenChatLiveReferenceLayout = { labels }
  return {
    labels: {
      title: localized ? 'Live: Gestaltung dichter Oberflächen' : 'Live: designing dense interfaces',
      detail: localized ? '1.284 Personen sehen zu · seit 41 Min.' : '1,284 watching · 41 min in',
      tabs: localized ? 'Bereiche des Live-Streams' : 'Live stream panels',
      pinned: localized ? 'Angeheftet von Junie Park' : 'Pinned by Junie Park',
      viewers: (count) => (localized ? `Zuschauerinnen und Zuschauer · ${count}` : `Viewers · ${count}`),
      send: localized ? 'Nachricht senden' : 'Send message',
      placeholder: localized ? 'Schreiben Sie etwas' : 'Say something',
      emptyChat: localized ? 'Noch keine Nachrichten im Live-Chat' : 'No messages in the live chat',
      emptyViewers: localized ? 'Es werden keine Zuschauenden aufgelistet' : 'No viewers are listed',
    },
    tabs: localized
      ? [
          { id: 'chat', label: 'Chat' },
          { id: 'viewers', label: 'Zuschauende' },
        ]
      : [
          { id: 'chat', label: 'Chat' },
          { id: 'viewers', label: 'Viewers' },
        ],
    chatTabId: 'chat',
    viewersTabId: 'viewers',
    initialTabId: 'chat',
    pinnedNotice: localized
      ? 'Die Folien und die Beispieldatei stehen in der Beschreibung. Die Aufzeichnung ist morgen für alle verfügbar.'
      : 'The slides and sample file are in the description. The recording goes out to everyone tomorrow.',
    messages,
    viewers: [],
    viewerCount: 1284,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 },
    referenceLayout: layout,
  }
}
