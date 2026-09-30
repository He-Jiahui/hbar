export function createUsagePreviewCopy(localized: boolean) {
  return localized
    ? {
        range: 'Zeitraum',
        notice: 'Nur lokale Nutzungsvorschau — keine Abrechnung, Kontingente oder Richtlinien geändert.',
        requestNotice: 'Vorschauanfrage erfasst — keine Navigation, Zahlung, Abrechnung oder Kontingentänderung.',
      }
    : {
        range: 'Range',
        notice: 'Local usage preview only — no billing, quota or policy changes.',
        requestNotice: 'Preview request recorded — no navigation, payment, billing or quota changes.',
      }
}
