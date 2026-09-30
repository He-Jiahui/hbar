export interface SupportReferencePreviewCopy {
  readonly pending: string
  readonly confirmed: string
  readonly failed: string
  readonly limitReached: string
  readonly notDelivered: string
}

export function createSupportReferencePreviewCopy(locale: 'en' | 'de'): SupportReferencePreviewCopy {
  return locale === 'de'
    ? {
        pending: 'Die lokale Vorschau wartet auf Bestätigung.',
        confirmed: 'Lokal bestätigt. Keine Nachricht wurde versendet und keine KI-Antwort angefordert.',
        failed: 'Nicht bestätigt. Ihr Entwurf bleibt erhalten; versuchen Sie es erneut.',
        limitReached: 'Die lokale Nachrichtenvorschau ist voll. Es wurde nichts versendet.',
        notDelivered: 'Nur lokale Vorschau; nicht versendet.',
      }
    : {
        pending: 'Waiting for the local preview acknowledgement.',
        confirmed: 'Locally confirmed. No message was delivered and no AI answer was requested.',
        failed: 'Not confirmed. Your draft is kept; try again.',
        limitReached: 'The local message preview is full. Nothing was delivered.',
        notDelivered: 'Local preview only; not delivered.',
      }
}
