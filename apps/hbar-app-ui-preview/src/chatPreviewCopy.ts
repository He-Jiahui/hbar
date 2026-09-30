export type ChatPreviewLocale = 'en' | 'de-long'

export interface ChatPreviewCopy {
  readonly pending: string
  readonly confirmed: string
  readonly failed: string
  readonly error: string
  readonly localAuthor: string
  readonly localInitials: string
  readonly messageMeta: string
  readonly notDelivered: string
  readonly ratingSelected: (rating: number, maximum: number) => string
  readonly quickReplySelected: (label: string) => string
}

const ENGLISH_COPY: ChatPreviewCopy = {
  pending: 'Adding this message to the local preview…',
  confirmed: 'Added to this preview only; no one else received it.',
  failed: 'Your draft is still here.',
  error: 'The local preview could not add this message.',
  localAuthor: 'You',
  localInitials: 'YO',
  messageMeta: 'Local preview · not delivered',
  notDelivered: 'Not sent',
  ratingSelected: (rating, maximum) => `Rating selected in this preview only: ${rating} of ${maximum}.`,
  quickReplySelected: (label) => `“${label}” selected here; no support request was sent.`,
}

const GERMAN_LONG_COPY: ChatPreviewCopy = {
  pending: 'Diese Nachricht wird ausschließlich in der lokalen Vorschau ergänzt …',
  confirmed: 'Nur in dieser Vorschau ergänzt; niemand sonst hat die Nachricht erhalten.',
  failed: 'Ihr Entwurf ist weiterhin vorhanden und kann bearbeitet werden.',
  error: 'Die lokale Vorschau konnte diese Nachricht nicht ergänzen.',
  localAuthor: 'Sie',
  localInitials: 'SI',
  messageMeta: 'Nur lokale Vorschau · nicht zugestellt',
  notDelivered: 'Nicht gesendet',
  ratingSelected: (rating, maximum) => `Bewertung nur in dieser Vorschau ausgewählt: ${rating} von ${maximum} Sternen.`,
  quickReplySelected: (label) => `„${label}“ nur hier ausgewählt; es wurde keine Supportanfrage gesendet.`,
}

/** Preview-generated labels stay with the Host and are never stored with domain drafts. */
export function createChatPreviewCopy(locale: ChatPreviewLocale = 'en'): ChatPreviewCopy {
  return locale === 'de-long' ? GERMAN_LONG_COPY : ENGLISH_COPY
}
