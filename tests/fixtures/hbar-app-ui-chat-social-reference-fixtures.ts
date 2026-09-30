import type { HbarAppUiChatContent } from '../../packages/hbar-app-ui/src/index'

export function createChatSocialReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<HbarAppUiChatContent['social']> {
  const localized = locale === 'de-long'
  const post = {
    id: 'post-billing',
    author: 'Amelia Whitfield',
    initials: 'AW',
    body: localized
      ? 'Wir haben unsere Abrechnungsseiten nach einer einfachen Regel neu aufgebaut: Farbe markiert nur Ausnahmen, nicht die gesamte Oberfläche. Überfällige Beträge sind der einzige Fall, der rot hervorgehoben wird.'
      : 'We rebuilt our billing screens around one rule: colour marks the exception, never the layout. Overdue is the only thing that gets to be red.',
    meta: '@amelia · 2h',
    reactionCount: 318,
  }
  const replies = [
    {
      id: 'marcus-reply',
      author: 'Marcus Bell',
      initials: 'MB',
      body: localized
        ? 'Genau das machen die meisten Dashboards falsch. Sechs Statusfarben und plötzlich wirkt alles gleich dringend.'
        : 'This is the part most dashboards get wrong. Six status colours and everything looks equally urgent.',
      meta: '@marcusb · 1h',
      reactionCount: 42,
    },
    {
      id: 'sofia-reply',
      author: 'Sofia Alvarez',
      initials: 'SA',
      body: localized
        ? 'Wie behandelt ihr den Fall „bald am Limit“? Dieser Status möchte immer eine eigene Farbe bekommen.'
        : 'Curious how you handle the “nearing limit” case. That one always wants to be its own colour.',
      meta: '@sofia.a · 44m',
      reactionCount: 9,
    },
  ]

  return {
    labels: {
      title: localized ? 'Diskussion zu den Abrechnungsseiten' : 'Billing design discussion',
      detail: localized
        ? 'Öffentlicher Diskussionsfaden zu Statusfarben und visueller Hierarchie'
        : 'A public discussion about status colour and hierarchy',
      reaction: (author) =>
        localized ? `Beitrag von ${author} mit „Gefällt mir“ markieren` : `Like ${author}'s message`,
      replies: localized ? 'Antworten' : 'Replies',
      send: localized ? 'Antworten' : 'Reply',
      placeholder: localized ? 'Eine Antwort zum Abrechnungsbeitrag schreiben' : 'Post your reply',
      empty: localized ? 'Noch keine Antworten zu diesem Abrechnungsbeitrag.' : 'No replies yet',
    },
    post,
    replies,
    listStrategy: { kind: 'content-grown', expectedMaximum: 50 },
    referenceLayout: {
      labels: {
        inputLabel: localized ? 'Eine öffentliche Antwort im Diskussionsfaden verfassen' : 'Post a reply',
        visibility: localized
          ? 'Antworten sind für alle Personen sichtbar, die diesem Diskussionsfaden folgen.'
          : 'Replies are visible to everyone following this thread.',
        relevant: localized ? 'Relevanteste Antworten zuerst' : 'Most relevant replies first',
        recent: localized ? 'Neueste Antworten zuerst' : 'Most recent',
        sortToggle: localized
          ? 'Reihenfolge der Antworten zwischen Relevanz und Aktualität wechseln'
          : 'Change reply order',
        showMore: localized ? 'Weitere Antworten zu dieser Diskussion anzeigen' : 'Show 21 more replies',
        share: localized ? 'Abrechnungsbeitrag teilen' : 'Share post',
        replyTo: (author) => (localized ? `Auf die Antwort von ${author} antworten` : `Reply to ${author}`),
        replies: (count) => (localized ? `Antworten, ${count}` : `Replies, ${count}`),
        reposts: (count) => (localized ? `Geteilt, ${count}` : `Reposts, ${count}`),
        likes: (author, count) =>
          author === post.author
            ? localized
              ? `Gefällt mir, ${count}`
              : `Likes, ${count}`
            : localized
              ? `Gefällt mir für die Antwort von ${author}, ${count}`
              : `Likes on reply from ${author}, ${count}`,
      },
      composerInitials: 'YO',
      replyCount: 24,
      repostCount: 41,
      nestedReplies: [
        {
          id: 'amelia-nested',
          parentId: 'marcus-reply',
          author: 'Amelia Whitfield',
          initials: 'AW',
          body: localized
            ? 'Ganz genau. Wir haben die ganze Oberfläche auf zwei Farbtöne begrenzt und dadurch die visuelle Hierarchie an anderer Stelle verbessert.'
            : 'Exactly. We capped ourselves at two hues for the whole surface and it forced better hierarchy everywhere else.',
          meta: '@amelia · 58m',
          reactionCount: 17,
        },
      ],
      initialLikedIds: ['marcus-reply'],
    },
  }
}
