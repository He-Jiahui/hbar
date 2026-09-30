export function createBillingReferencePreviewCopy(locale: 'en' | 'de') {
  return locale === 'de'
    ? {
        pending: 'Die lokale Abrechnungsvorschau wartet auf Bestätigung.',
        confirmed: 'Lokal bestätigt. Es wurde nichts veröffentlicht, gespeichert oder beim Zahlungsanbieter geändert.',
        failed: 'Nicht bestätigt. Ihre Änderungen bleiben erhalten; versuchen Sie es erneut.',
        cancelled: 'Die lokale Vorschau wurde abgebrochen. Ihre Eingaben bleiben erhalten.',
      }
    : {
        pending: 'Waiting for the local billing preview acknowledgement.',
        confirmed: 'Locally confirmed. Nothing was published, persisted or changed at the payment processor.',
        failed: 'Not confirmed. Your edits are kept; try again.',
        cancelled: 'The local preview was cancelled. Your edits are kept.',
      }
}
