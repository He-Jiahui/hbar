/** Host-localized notice, never a persisted navigation or service result. */
export function createAppShellPreviewCopy(localized: boolean) {
  return localized
    ? {
        requestNotice:
          'Vorschauanfrage erfasst — keine Navigation, Speicherung, Nachricht, Dateiänderung oder Dienstaktion ausgeführt.',
      }
    : {
        requestNotice:
          'Preview request recorded — no navigation, save, message, file change or service action performed.',
      }
}
