import type { HbarAppUiSupportContent } from '../../packages/hbar-app-ui/src/index'

export function createSupportAssistantReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<HbarAppUiSupportContent['assistant']> {
  const localized = locale === 'de-long'
  return {
    labels: {
      trigger: localized ? 'Den Northwind-Support-Assistenten öffnen' : 'Open support assistant',
      title: 'Northwind Assistant',
      detail: localized
        ? 'Antworten aus deinem Workspace und der Dokumentation'
        : 'Answers from your workspace and the docs',
      close: localized ? 'Support-Unterhaltung schließen' : 'Close chat',
      handoff: localized ? 'Mit einer Person sprechen' : 'Talk to a person',
      handoffStatus: localized
        ? 'Eine Support-Mitarbeiterin würde dieser Unterhaltung beitreten.'
        : 'A support specialist would join this conversation.',
      placeholder: localized ? 'Frage den Northwind-Assistenten zu deinem Workspace' : 'Ask about your workspace',
      send: localized ? 'Nachricht senden' : 'Send message',
      disclaimer: localized ? 'KI-Antworten, anhand deiner Daten geprüft' : 'AI answers, checked against your data',
      related: localized ? 'Verwandte Artikel' : 'Related articles',
      empty: localized ? 'Noch keine Unterhaltung' : 'No conversation',
    },
    messages: localized
      ? [
          {
            id: 'assistant-greeting',
            body: 'Hallo Priya. Ich kann in deinem Workspace und in der Dokumentation nachsehen. Wobei brauchst du Hilfe?',
            own: false,
          },
          {
            id: 'assistant-export-question',
            body: 'Unser Export vom Montag wurde ohne Zeilen ausgeführt.',
            own: true,
          },
          {
            id: 'assistant-export-explanation',
            body: 'Lauf 1104 wurde um 06:00 Uhr beendet und lieferte 0 Zeilen. Die gespeicherte Ansicht wurde am Sonntag um 17:41 Uhr geändert; ihr Datumsbereich umfasst jetzt nur noch einen einzelnen Tag. Das ist meist die Ursache.',
            own: false,
          },
        ]
      : [
          {
            id: 'assistant-greeting',
            body: 'Hi Priya. I can look things up in your workspace and in the docs. What are you running into?',
            own: false,
          },
          {
            id: 'assistant-export-question',
            body: 'Our Monday export came through with no rows in it.',
            own: true,
          },
          {
            id: 'assistant-export-explanation',
            body: 'Run 1104 finished at 06:00 and returned 0 rows. The saved view it uses was edited on Sunday at 17:41 and its date range is now a single day, which is the usual cause.',
            own: false,
          },
        ],
    articles: localized
      ? [
          {
            id: 'export-zero-rows',
            title: 'Warum ein Export trotz erfolgreichem Abschluss keine Zeilen enthalten kann',
          },
          {
            id: 'scheduled-view',
            title: 'Eine gespeicherte Ansicht bearbeiten, die von einem Zeitplan verwendet wird',
          },
        ]
      : [
          { id: 'export-zero-rows', title: 'Why an export can succeed with zero rows' },
          { id: 'scheduled-view', title: 'Editing a saved view used by a schedule' },
        ],
    actions: localized
      ? [
          { id: 'restore-date-range', label: 'Den vorherigen Datumsbereich wiederherstellen' },
          { id: 'rerun-export', label: 'Den Export jetzt erneut ausführen' },
          { id: 'talk-to-person', label: 'Mit einer Support-Person sprechen' },
        ]
      : [
          { id: 'restore-date-range', label: 'Restore the previous date range' },
          { id: 'rerun-export', label: 'Re-run the export now' },
          { id: 'talk-to-person', label: 'Talk to a person' },
        ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 24 },
    referenceLayout: {
      conversationId: 'northwind-export-assistant',
      initialOpen: true,
      labels: {
        inputLabel: localized ? 'Nachricht an den Northwind Assistant schreiben' : 'Message',
      },
    },
  }
}
