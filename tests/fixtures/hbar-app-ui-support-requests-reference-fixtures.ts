import type { HbarAppUiSupportContent } from '../../packages/hbar-app-ui/src/index'

export function createSupportRequestsReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<HbarAppUiSupportContent['requests']> {
  const localized = locale === 'de-long'
  const statuses = localized
    ? [
        { id: 'all', label: 'Alle' },
        { id: 'open', label: 'Offen' },
        { id: 'resolved', label: 'Gelöst' },
      ]
    : [
        { id: 'all', label: 'All' },
        { id: 'open', label: 'Open' },
        { id: 'resolved', label: 'Resolved' },
      ]
  const requests = localized
    ? [
        {
          id: '#4192',
          title: 'Geplanter Export enthält keine Zeilen',
          detail: 'Berichte und Exporte · Sofia Alvarez · 4 Antworten',
          statusId: 'waiting',
          status: 'Wartet auf Ihre Antwort',
          tone: 'warning' as const,
          updated: 'Vor 22 Min.',
        },
        {
          id: '#4188',
          title: 'SAML-Metadaten werden nicht validiert',
          detail: 'Konten und Zugriff · Marcus Bell · 7 Antworten',
          statusId: 'open',
          status: 'Offen',
          tone: 'neutral' as const,
          updated: 'Vor 3 Std.',
        },
        {
          id: '#4171',
          title: 'Zwei Rechnungen für den März ausgestellt',
          detail: 'Abrechnung und Tarife · Wei Chen · 2 Antworten',
          statusId: 'open',
          status: 'Offen',
          tone: 'neutral' as const,
          updated: 'Gestern',
        },
        {
          id: '#4150',
          title: 'Webhook-Wiederholungen stoppen nach einem Fehler',
          detail: 'Integrationen · Sofia Alvarez · 11 Antworten',
          statusId: 'resolved',
          status: 'Gelöst',
          tone: 'success' as const,
          updated: '4. Aug.',
        },
        {
          id: '#4133',
          title: 'Sitzanzahl sank nach dem Entfernen eines Nutzers nicht',
          detail: 'Abrechnung und Tarife · Amelia Whitfield · 3 Antworten',
          statusId: 'resolved',
          status: 'Gelöst',
          tone: 'success' as const,
          updated: '1. Aug.',
        },
        {
          id: '#4110',
          title: 'Dashboard-Filter werden beim Tabwechsel zurückgesetzt',
          detail: 'Dashboards · Marcus Bell · 5 Antworten',
          statusId: 'resolved',
          status: 'Gelöst',
          tone: 'success' as const,
          updated: '28. Juli',
        },
      ]
    : [
        {
          id: '#4192',
          title: 'Scheduled export is empty',
          detail: 'Reports and exports · Sofia Alvarez · 4 replies',
          statusId: 'waiting',
          status: 'Waiting on you',
          tone: 'warning' as const,
          updated: '22m ago',
        },
        {
          id: '#4188',
          title: 'SAML metadata upload fails validation',
          detail: 'Accounts and access · Marcus Bell · 7 replies',
          statusId: 'open',
          status: 'Open',
          tone: 'neutral' as const,
          updated: '3h ago',
        },
        {
          id: '#4171',
          title: 'Two invoices issued for March',
          detail: 'Billing and plans · Wei Chen · 2 replies',
          statusId: 'open',
          status: 'Open',
          tone: 'neutral' as const,
          updated: 'Yesterday',
        },
        {
          id: '#4150',
          title: 'Webhook retries stop after one failure',
          detail: 'Integrations · Sofia Alvarez · 11 replies',
          statusId: 'resolved',
          status: 'Resolved',
          tone: 'success' as const,
          updated: '4 Aug',
        },
        {
          id: '#4133',
          title: 'Seat count did not drop after removing a user',
          detail: 'Billing and plans · Amelia Whitfield · 3 replies',
          statusId: 'resolved',
          status: 'Resolved',
          tone: 'success' as const,
          updated: '1 Aug',
        },
        {
          id: '#4110',
          title: 'Dashboard filter resets between tabs',
          detail: 'Dashboards · Marcus Bell · 5 replies',
          statusId: 'resolved',
          status: 'Resolved',
          tone: 'success' as const,
          updated: '28 Jul',
        },
      ]

  return {
    labels: {
      title: localized ? 'Ihre Support-Anfragen' : 'Your requests',
      detail: (open) =>
        localized ? `${open} offen · 1 wartet auf Ihre Antwort` : `${open} open · 1 waiting on your reply`,
      newRequest: localized ? 'Neue Anfrage' : 'New request',
      statuses: localized ? 'Support-Anfragen nach Status filtern' : 'Filter requests by status',
      search: localized ? 'Ihre Support-Anfragen durchsuchen' : 'Search your requests',
      table: localized ? 'Support-Anfragen' : 'Support requests',
      ticket: localized ? 'Ticket' : 'Ticket',
      subject: localized ? 'Betreff' : 'Subject',
      status: localized ? 'Status' : 'Status',
      updated: localized ? 'Aktualisiert' : 'Updated',
      note: localized
        ? 'Gelöste Anfragen bleiben zwölf Monate lang lesbar. Wenn Sie auf eine gelöste Anfrage antworten, wird sie erneut geöffnet.'
        : 'Resolved requests stay readable for 12 months. Replying to one reopens it.',
      empty: localized ? 'Keine Support-Anfragen entsprechen dieser Suche.' : 'No requests match',
    },
    statuses,
    allStatusId: 'all',
    openStatusIds: ['open', 'waiting'],
    initialStatusId: 'all',
    requests,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 40 },
    referenceLayout: {
      openFilterId: 'open',
      waitingStatusIds: ['waiting'],
      labels: {
        searchPlaceholder: localized
          ? 'Ihre Anfragen nach Betreff oder Ticketnummer durchsuchen'
          : 'Search by subject or number',
        summary: (openCount, waitingCount) =>
          localized
            ? `${openCount} offen · ${waitingCount} warten auf Ihre Antwort`
            : `${openCount} open · ${waitingCount} waiting on your reply`,
      },
    },
  }
}
