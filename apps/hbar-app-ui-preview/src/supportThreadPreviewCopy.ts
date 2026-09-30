export interface SupportThreadPreviewCopy {
  readonly replyLabel: string
  readonly replyPending: string
  readonly replyConfirmed: string
  readonly replyErrorUnavailable: string
  readonly replyLimitReached: string
  readonly resolvePending: string
  readonly resolveConfirmed: string
  readonly resolveErrorUnavailable: string
  readonly ownMessage: {
    readonly sender: string
    readonly avatar: string
    readonly time: string
    readonly role?: string | undefined
  }
}

/** Preview acknowledgements never send a real reply or change a support ticket. */
export function createSupportThreadPreviewCopy(locale: 'en' | 'de'): SupportThreadPreviewCopy {
  if (locale === 'de') {
    return {
      replyLabel: 'Antwort schreiben',
      replyPending: 'Die Vorschau wartet auf die Bestätigung der Antwort.',
      replyConfirmed: 'Antwortvorschau bestätigt. Es wurde keine echte Antwort gesendet.',
      replyErrorUnavailable:
        'Die Antwortvorschau konnte nicht bestätigt werden. Ihr Entwurf bleibt erhalten; versuchen Sie es erneut.',
      replyLimitReached: 'Die Vorschaugrenze für lokale Antworten ist erreicht.',
      resolvePending: 'Die Vorschau wartet auf die Bestätigung des Status.',
      resolveConfirmed: 'Statusvorschau bestätigt. Die Support-Anfrage wurde nicht geändert.',
      resolveErrorUnavailable:
        'Die Statusvorschau konnte nicht bestätigt werden. Der bisherige Status bleibt erhalten; versuchen Sie es erneut.',
      ownMessage: {
        sender: 'Sie',
        avatar: 'Sie',
        time: 'Lokale Vorschau',
      },
    }
  }

  return {
    replyLabel: 'Write a reply',
    replyPending: 'Waiting for the preview acknowledgement.',
    replyConfirmed: 'Reply preview confirmed. No real reply was sent.',
    replyErrorUnavailable: 'The reply preview could not be confirmed. Your draft is kept; try again.',
    replyLimitReached: 'The local reply preview limit has been reached.',
    resolvePending: 'Waiting for the status preview acknowledgement.',
    resolveConfirmed: 'Status preview confirmed. The support ticket was not changed.',
    resolveErrorUnavailable: 'The status preview could not be confirmed. The existing status is kept; try again.',
    ownMessage: {
      sender: 'You',
      avatar: 'You',
      time: 'Local preview',
    },
  }
}
