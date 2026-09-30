/** Host-localized feedback for preview requests, never a persisted service result. */
export function createAppSidebarPreviewCopy(localized: boolean) {
  return localized
    ? {
        requestNotice:
          'Vorschauanfrage erfasst — keine externe Navigation, Arbeitsbereich-Erstellung, Dateiänderung oder Dienstaktion ausgeführt.',
      }
    : {
        requestNotice:
          'Preview request recorded — no external navigation, workspace creation, file change or service action performed.',
      }
}
