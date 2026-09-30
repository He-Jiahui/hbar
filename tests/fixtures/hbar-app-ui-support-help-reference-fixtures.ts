import type { HbarAppUiSupportContent } from '../../packages/hbar-app-ui/src/index'

export function createSupportHelpReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): NonNullable<HbarAppUiSupportContent['help']> {
  const localized = locale === 'de-long'

  return {
    labels: {
      title: localized ? 'Wie können wir Ihnen bei Ihrem Arbeitsbereich helfen?' : 'How can we help?',
      detail: localized
        ? 'Durchsuchen Sie die Anleitungen oder eröffnen Sie eine Anfrage, damit sich eine Supportperson bei Ihnen meldet. Die mittlere erste Antwortzeit liegt heute bei elf Minuten.'
        : 'Search the guides, or open a ticket and a person will reply. Median first response today is 11 minutes.',
      search: localized ? 'Hilfeartikel und Anleitungen durchsuchen' : 'Search help articles',
      topics: localized ? 'Themen im Hilfebereich' : 'Help topics',
      articles: localized ? 'Diese Woche am häufigsten gelesen' : 'Read most this week',
      noArticles: localized
        ? 'Zu dieser Suche passen keine Anleitungen. Prüfen Sie den Suchbegriff oder wählen Sie ein Hilfethema aus.'
        : 'No guides match this search.',
      contactTitle: localized ? 'Benötigen Sie weiterhin Unterstützung?' : 'Still stuck?',
      contactDetail: localized
        ? 'Der Support ist werktags von 09:00 bis 21:00 Uhr UTC erreichbar und derzeit online.'
        : 'Support is online now, 09:00 to 21:00 UTC on weekdays.',
      contact: localized ? 'Support kontaktieren' : 'Contact support',
      open: (title) => (localized ? `Den Hilfeinhalt „${title}“ zur Unterstützung öffnen` : `Open ${title}`),
      empty: localized ? 'Derzeit sind keine Hilfethemen verfügbar.' : 'No help topics',
    },
    topics: [
      {
        id: 'accounts',
        title: localized ? 'Konten und Zugriff verwalten' : 'Accounts and access',
        detail: localized
          ? 'Anmelden, Einmalanmeldung, Rollen und Einladungen.'
          : 'Sign in, SSO, roles and invitations.',
        count: '24',
      },
      {
        id: 'billing',
        title: localized ? 'Abrechnung und Tarifoptionen' : 'Billing and plans',
        detail: localized
          ? 'Rechnungen, Teamplätze, Tarifwechsel und Rückerstattungen.'
          : 'Invoices, seats, upgrades and refunds.',
        count: '18',
      },
      {
        id: 'integrations',
        title: localized ? 'Datenintegrationen und Schnittstellen' : 'Integrations',
        detail: localized
          ? 'Datenlager, Webhooks und die Programmierschnittstelle.'
          : 'Warehouses, webhooks and the API.',
        count: '31',
      },
      {
        id: 'reports',
        title: localized ? 'Berichte und Dateiexporte' : 'Reports and exports',
        detail: localized
          ? 'Zeitpläne, Dateiformate und zuverlässige Zustellung.'
          : 'Scheduling, formats and delivery.',
        count: '27',
      },
    ],
    articles: [
      {
        id: 'empty-export',
        title: localized
          ? 'Warum ist mein geplanter Bericht ohne Daten angekommen?'
          : 'Why did my scheduled export arrive empty?',
        detail: '4.2k',
      },
      {
        id: 'owner',
        title: localized
          ? 'Einen Arbeitsbereich einer anderen verantwortlichen Person zuweisen'
          : 'Move a workspace to a different owner',
        detail: '3.1k',
      },
      {
        id: 'saml',
        title: localized
          ? 'SAML mit Ihrem Identitätsanbieter sicher einrichten'
          : 'Set up SAML with your identity provider',
        detail: '2.8k',
      },
      {
        id: 'seat-counts',
        title: localized
          ? 'Teamplatz-Kontingente in Ihrem Pro-Tarif nachvollziehen'
          : 'Understand seat counts on the Pro plan',
        detail: '2.4k',
      },
    ],
    listStrategy: { kind: 'content-grown', expectedMaximum: 16 },
    referenceLayout: {
      labels: {
        searchPlaceholder: localized
          ? 'Anleitungen, Hilfethemen und Antworten zu Ihrem Arbeitsbereich durchsuchen'
          : 'Search articles, guides and answers',
      },
      topicIcons: [
        { topicId: 'accounts', kind: 'accounts' },
        { topicId: 'billing', kind: 'billing' },
        { topicId: 'integrations', kind: 'integrations' },
        { topicId: 'reports', kind: 'reports' },
      ],
    },
  }
}
