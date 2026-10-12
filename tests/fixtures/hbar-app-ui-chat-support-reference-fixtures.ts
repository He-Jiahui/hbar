import type { LumenChatContent, LumenChatSupportReferenceLayout } from '@lumen/app-ui/catalog'

export function createChatSupportReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<LumenChatContent['support']> {
  const localized = locale === 'de-long'
  const labels: LumenChatSupportReferenceLayout['labels'] = localized
    ? {
        minimize: 'Support-Unterhaltung minimieren',
        restore: 'Support-Unterhaltung wiederherstellen',
        started: 'Diese Support-Unterhaltung wurde heute um 10:02 Uhr eröffnet.',
        helpful: 'Diese Support-Antwort war hilfreich',
        notHelpful: 'Diese Support-Antwort war nicht hilfreich',
        ratingSummary: 'Bewertet mit 4,8 von 5 bei 2.140 Kundinnen und Kunden in diesem Monat',
        inputLabel: 'Antwort an das Halcyon-Support-Team schreiben',
      }
    : {
        minimize: 'Minimize support conversation',
        restore: 'Restore support conversation',
        started: 'Started today at 10:02',
        helpful: 'Helpful',
        notHelpful: 'Not helpful',
        ratingSummary: 'Rated 4.8 by 2,140 customers this month',
        inputLabel: 'Write a reply to Halcyon Support',
      }

  const messages = localized
    ? [
        {
          id: 'support-invoice-intro',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'Hallo Cedar Labs. Ich sehe, dass die Rechnung INV-20418 diese Woche zweimal fehlgeschlagen ist. Soll ich Sie durch die Ursache führen?',
          meta: '10:02',
        },
        {
          id: 'support-customer-card-note',
          author: 'You',
          initials: 'Y',
          body: 'Ja. Unsere Karte funktioniert, deshalb verstehe ich nicht, warum die Zahlung immer wieder abgelehnt wird.',
          meta: '10:03',
          outgoing: true,
        },
        {
          id: 'support-issuer-explanation',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'Der Kartenaussteller hat beim zweiten Versuch do_not_honor zurückgegeben. Bei wiederholten Abbuchungen innerhalb von 72 Stunden bedeutet das normalerweise eine Sperre und kein Finanzierungsproblem.',
          meta: '10:05',
        },
        {
          id: 'support-retry-queued',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'Ich habe eine Wiederholung für morgen früh vorgemerkt und das Ablehnungsprotokoll angehängt, damit Ihre Bank die Sperre aufheben kann.',
          meta: '10:05',
          attachment: 'decline-log-INV-20418.pdf',
        },
      ]
    : [
        {
          id: 'support-invoice-intro',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'Hi Cedar Labs. I can see invoice INV-20418 failed twice this week. Want me to walk through it?',
          meta: '10:02',
        },
        {
          id: 'support-customer-card-note',
          author: 'You',
          initials: 'Y',
          body: 'Yes. Our card is fine, so I do not understand why it keeps declining.',
          meta: '10:03',
          outgoing: true,
        },
        {
          id: 'support-issuer-explanation',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'The issuer returned do_not_honor on the second attempt, which usually means a block on repeat charges inside 72 hours rather than a funding problem.',
          meta: '10:05',
        },
        {
          id: 'support-retry-queued',
          author: 'Halcyon Support',
          initials: 'HS',
          body: 'I have queued a retry for tomorrow morning and attached the decline log so your bank can lift the block.',
          meta: '10:05',
          attachment: 'decline-log-INV-20418.pdf',
        },
      ]

  const layout: LumenChatSupportReferenceLayout = {
    labels,
    messages,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 12 },
  }
  const assistantBody = messages[1]?.body ?? ''
  return {
    labels: {
      title: localized ? 'Nachricht an den Support von Halcyon' : 'Message support',
      detail: localized ? 'Schnelle Antworten und Dateianhänge' : 'Quick replies and attachments',
      quickReplies: localized ? 'Schnelle Antworten' : 'Quick replies',
      attach: localized ? 'Datei anhängen' : 'Attach file',
      rating: localized ? 'War diese Antwort hilfreich?' : 'Was this helpful?',
      ratingValue: (value) =>
        localized ? (value === 1 ? 'Hilfreich' : 'Nicht hilfreich') : value === 1 ? 'Helpful' : 'Not helpful',
      send: localized ? 'Nachricht senden' : 'Send message',
      placeholder: localized ? 'Schreiben Sie Ihre Antwort an das Support-Team' : 'Type your reply',
    },
    assistant: {
      id: 'halcyon-support',
      author: 'Halcyon Support',
      initials: 'HS',
      body: messages[0]?.body ?? assistantBody,
      meta: localized ? 'Antwortet in etwa 2 Minuten' : 'Replies in about 2 minutes',
    },
    quickReplies: localized
      ? [
          { id: 'change-card', label: 'Die hinterlegte Karte ändern' },
          { id: 'send-bank-log', label: 'Das Protokoll an meine Bank senden' },
          { id: 'pause-retries', label: 'Erneute Versuche vorerst pausieren' },
        ]
      : [
          { id: 'change-card', label: 'Change the card on file' },
          { id: 'send-bank-log', label: 'Send the log to my bank' },
          { id: 'pause-retries', label: 'Pause retries for now' },
        ],
    maximumRating: 2,
    initialRating: 0,
    referenceLayout: layout,
  }
}
