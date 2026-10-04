import type { HbarAppUiSupportContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_SUPPORT_FIXTURES } from './hbar-app-ui-support-fixtures'

/** Cached full-static-v10 Thread 3 visible records; supplied only by the preview/test Host. */
export function createSupportThreadReferenceFixtures(locale: 'en' | 'de' = 'en'): HbarAppUiSupportContent {
  const thread = HBAR_APP_UI_SUPPORT_FIXTURES.thread
  if (!thread) throw new Error('Expected the support thread preview fixture')
  const own = locale === 'de' ? 'Sie' : 'You'
  return {
    ...HBAR_APP_UI_SUPPORT_FIXTURES,
    thread: {
      ...thread,
      labels:
        locale === 'en'
          ? thread.labels
          : {
              title: 'Der geplante Export enthält keine Zeilen',
              detail: 'Support-Anfrage zum geplanten Berichtsexport',
              awaiting: 'Wartet auf Ihre Antwort',
              resolve: 'Als erledigt markieren',
              reopen: 'Support-Anfrage wieder öffnen',
              reply: 'Antworten Sie Sofia mit den nächsten Schritten und Ihren Beobachtungen',
              attach: 'Eine Datei anhängen',
              send: 'Antwort senden',
              timeline: 'Zeitlicher Verlauf',
              related: 'Weiterführender Artikel',
              openArticle: 'Den weiterführenden Artikel öffnen',
              access:
                'Nur Administratoren dieses Arbeitsbereichs und die zuständige Support-Mitarbeiterin können diese Unterhaltung lesen.',
              empty: 'Noch keine Nachrichten',
              emptyTimeline: 'Noch keine Einträge im Verlauf',
            },
      messages: [
        {
          id: 'one',
          sender: own,
          avatar: own,
          time: 'Mon 09:12',
          body: 'The Monday revenue export landed with headers but no rows. It ran at 06:00 as usual and the run log says it succeeded.',
          attachment: 'export-log-1104.txt',
          own: true,
        },
        {
          id: 'two',
          sender: 'Sofia Alvarez',
          avatar: 'SA',
          role: 'Support',
          time: 'Mon 09:31',
          body: 'Thanks for the log. The job completed against a filter that excluded every row, which is why it reported success. Was the saved view edited on Sunday?',
          own: false,
        },
        {
          id: 'three',
          sender: own,
          avatar: own,
          time: 'Mon 10:04',
          body: 'Yes, someone narrowed the date range to a single day while testing and left it that way.',
          own: true,
        },
        {
          id: 'four',
          sender: 'Sofia Alvarez',
          avatar: 'SA',
          role: 'Support',
          time: 'Mon 10:22',
          body: 'That explains it. I have added a warning on scheduled runs that return zero rows, shipping this week. In the meantime the schedule will email you instead of writing an empty file.',
          own: false,
        },
        {
          id: 'five',
          sender: own,
          avatar: own,
          time: 'Mon 11:15',
          body: 'Restored the range and re-ran it, 14,208 rows this time. Is there a way to lock a saved view so a schedule cannot be changed underneath it?',
          own: true,
        },
        {
          id: 'six',
          sender: 'Sofia Alvarez',
          avatar: 'SA',
          role: 'Support',
          time: 'Mon 11:40',
          body: 'Yes. Open the view, choose Lock for schedules, and edits then require an admin. I have attached the steps for your workspace.',
          attachment: 'lock-a-saved-view.pdf',
          own: false,
        },
      ],
      timeline: [
        { id: 'opened', label: locale === 'de' ? 'Eröffnet' : 'Opened', value: 'Mon 09:12' },
        {
          id: 'reply',
          label: locale === 'de' ? 'Erste Antwort' : 'First reply',
          value: locale === 'de' ? '19 Minuten später' : '19m later',
        },
        { id: 'assigned', label: locale === 'de' ? 'Zuständig' : 'Assigned to', value: 'Sofia Alvarez' },
        { id: 'updated', label: locale === 'de' ? 'Letzte Aktualisierung' : 'Last update', value: 'Mon 10:22' },
      ],
    },
  }
}
