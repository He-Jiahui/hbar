import type { LumenSupportContent } from '@lumen/app-ui'

export interface SupportTicketPreviewCopy {
  readonly pending: string
  readonly confirmed: string
  readonly errorUnavailable: string
}

/** Preview acknowledgements are deliberately distinct from real support-service delivery. */
export function createSupportTicketPreviewCopy(locale: 'en' | 'de'): SupportTicketPreviewCopy {
  if (locale === 'de') {
    return {
      pending: 'Die Vorschau wartet auf die Bestätigung.',
      confirmed: 'Vorschau bestätigt. Es wurde kein echtes Support-Ticket erstellt.',
      errorUnavailable:
        'Die Vorschau konnte nicht bestätigt werden. Ihr Entwurf bleibt erhalten; versuchen Sie es erneut.',
    }
  }
  return {
    pending: 'Waiting for the preview acknowledgement.',
    confirmed: 'Preview confirmed. No real support ticket was created.',
    errorUnavailable: 'The preview request could not be confirmed. Your draft is kept; try again.',
  }
}

export function localizeSupportTicketPreviewContent(
  content: LumenSupportContent,
  locale: 'en' | 'de',
): LumenSupportContent {
  const ticket = content.ticket
  if (locale === 'en' || !ticket) return content
  return {
    ...content,
    ticket: {
      ...ticket,
      labels: {
        title: 'Eine Support-Anfrage öffnen',
        detail:
          'Beschreiben Sie das Problem möglichst genau, damit unser Team Ihnen ohne unnötige Rückfragen helfen kann.',
        area: 'Bereich',
        workspace: 'Arbeitsbereich',
        subject: 'Betreff',
        suggestions: 'Diese Artikel könnten bereits helfen',
        priority: 'Priorität',
        happened: 'Was ist passiert?',
        happenedPlaceholder: 'Ihre Schritte, das erwartete Ergebnis und das tatsächlich beobachtete Verhalten.',
        attach: 'Dateien anhängen',
        remove: (name) => `${name} entfernen`,
        draft: 'Entwurf speichern',
        submit: 'Support-Anfrage senden',
        submitted: 'Anfrage bestätigt',
        response: 'Erste Antwort',
        responseFor: (priority) =>
          priority === 'Dringend' ? '1 Stunde' : priority === 'Niedrig' ? '1 Werktag' : '8 Stunden',
        responseDetail: 'Abhängig von Ihrem Tarif und der ausgewählten Priorität.',
        context: 'Mit Ihrer Anfrage übermittelt',
        before: 'Vor dem Senden',
        recent: 'Letzte Anfragen',
        emptySuggestions: 'Keine passenden Artikel',
      },
      priorities: ticket.priorities.map((priority) => ({
        ...priority,
        label: priority.id === 'urgent' ? 'Dringend' : priority.id === 'low' ? 'Niedrig' : 'Normal',
      })),
    },
  }
}
