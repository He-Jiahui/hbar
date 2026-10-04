import type { HbarAppUiBillingContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_BILLING_FIXTURES } from './hbar-app-ui-billing-fixtures'

type RecoveryContent = NonNullable<HbarAppUiBillingContent['recovery']>

export function createBillingRecoveryReferenceFixture(locale: 'en' | 'de-long' = 'en'): RecoveryContent {
  const recovery = HBAR_APP_UI_BILLING_FIXTURES.recovery
  if (!recovery) throw new Error('The base billing recovery fixture is unavailable.')

  if (locale === 'en') {
    return {
      ...recovery,
      subscriptions: recovery.subscriptions.map((subscription) => ({
        ...subscription,
        actionLabel: `Actions for ${subscription.customer}`,
      })),
      referenceLayout: {
        metricRows: [
          {
            metricId: 'risk',
            rows: [
              { id: 'failed', label: 'Failed', value: '2', tone: 'danger' },
              { id: 'retrying', label: 'Retrying', value: '3', tone: 'warning' },
              { id: 'exhausted', label: 'Exhausted', value: '1', tone: 'neutral' },
            ],
          },
          {
            metricId: 'recovered',
            rows: [
              { id: 'invoices', label: 'Invoices', value: '9' },
              { id: 'largest', label: 'Largest', value: '$8,900' },
              { id: 'playbooks', label: 'Playbooks', value: '2' },
            ],
          },
          {
            metricId: 'rate',
            rows: [
              { id: 'attempts', label: 'Attempts', value: '19' },
              { id: 'capacity', label: 'Capacity', value: '32' },
              { id: 'max-tries', label: 'Max tries', value: '4' },
            ],
          },
        ],
        labels: {
          tableCaption: 'Past due subscriptions',
          expand: (customer) => `Retry attempts for ${customer}`,
        },
      },
    }
  }

  return {
    ...recovery,
    labels: {
      ...recovery.labels,
      pageTitle: 'Zahlungswiederherstellung',
      pageDescriptionLeading: '6 Abonnements mit aktiven Einzugsversuchen · ',
      pageDescriptionEmphasis: '23.950 $ gefährdet',
      rules: 'Wiederherstellungsregeln',
      export: 'Warteschlange exportieren',
      retryDue: 'Fällige Zahlungen erneut versuchen',
      retryAll: 'Alle erneut versuchen',
      retryNow: 'Zahlung erneut versuchen',
      listTitle: 'Überfällige Abonnements',
      listDescription: 'Zeitplan für erneute Einzüge, Zahlungsmethode und Kontoverantwortliche.',
      managePlaybooks: 'Wiederherstellungsabläufe verwalten',
      customerColumn: 'Kunde oder Organisation',
      statusColumn: 'Zahlungsstatus',
      billingColumn: 'Tarif und Abrechnung',
      ownerColumn: 'Verantwortlich',
      amountColumn: 'Offener Betrag',
      retryColumn: 'Nächster Einzug',
      emptySubscriptions: 'Derzeit sind keine Abonnements zur Wiederherstellung offen.',
      retryAttemptLabel: (position, title) => `Versuch ${position} · ${title}`,
    },
    metrics: recovery.metrics.map((metric) => ({
      ...metric,
      label:
        metric.id === 'risk'
          ? 'Betrag mit Ausfallrisiko'
          : metric.id === 'recovered'
            ? 'Erfolgreich eingezogen'
            : 'Wiederherstellungsquote',
      detail:
        metric.id === 'risk'
          ? 'Offene fehlgeschlagene Abbuchungen'
          : metric.id === 'recovered'
            ? 'Diesen Monat bezahlte Rechnungen'
            : 'Intelligente Einzugsversuche für Konten',
    })),
    subscriptions: recovery.subscriptions.map((subscription) => ({
      ...subscription,
      status:
        subscription.status === 'Failed'
          ? 'Fehlgeschlagen'
          : subscription.status === 'Exhausted'
            ? 'Versuche aufgebraucht'
            : 'Wird erneut versucht',
      planMeta:
        subscription.planMeta === 'Platform fee'
          ? 'Plattformgebühr'
          : subscription.planMeta === 'Usage based'
            ? 'Nutzungsbasiert'
            : subscription.planMeta === 'Seat based'
              ? 'Lizenzbasiert'
              : 'Nutzung und Lizenzen',
      nextRetry:
        subscription.nextRetry === 'Today'
          ? 'Heute'
          : subscription.nextRetry === 'Retries exhausted'
            ? 'Keine Versuche mehr'
            : subscription.nextRetry,
      attemptSummary: subscription.attemptSummary.replace('Attempt', 'Versuch').replace('of', 'von'),
      retryTitle: 'Wiederholungsversuche',
      retryDescription:
        subscription.id === 'sub-4712'
          ? 'Für Visa mit der Endziffer 4242 wurde eine Kartenaktualisierung angefragt.'
          : subscription.id === 'sub-4806'
            ? 'Ein weiterer Einzugsversuch ist für heute vorgemerkt.'
            : subscription.statusTone === 'warning'
              ? `Ein weiterer Einzugsversuch ist für den ${subscription.nextRetry} vorgemerkt.`
              : 'Es sind keine weiteren automatischen Einzugsversuche vorgemerkt.',
      actionLabel: `Aktionen für ${subscription.customer}`,
      attempts: subscription.attempts.map((attempt) => ({
        ...attempt,
        title:
          attempt.title === 'Insufficient funds'
            ? 'Nicht ausreichende Deckung'
            : attempt.title === 'Issuer declined'
              ? 'Von der Bank abgelehnt'
              : 'Karte abgelehnt',
        description:
          attempt.id === 'attempt-1'
            ? 'Der Einzug wurde zur üblichen Zeit für die Kontogutschrift wiederholt.'
            : attempt.id === 'attempt-2'
              ? 'Die Bank hat einen erneuten Versuch innerhalb von 72 Stunden abgelehnt.'
              : 'Die Kartenaktualisierung wurde per E-Mail angefragt.',
      })),
    })),
    referenceLayout: {
      metricRows: [
        {
          metricId: 'risk',
          rows: [
            { id: 'failed', label: 'Fehlgeschlagen', value: '2', tone: 'danger' },
            { id: 'retrying', label: 'Erneute Versuche', value: '3', tone: 'warning' },
            { id: 'exhausted', label: 'Aufgebraucht', value: '1', tone: 'neutral' },
          ],
        },
        {
          metricId: 'recovered',
          rows: [
            { id: 'invoices', label: 'Rechnungen', value: '9' },
            { id: 'largest', label: 'Höchster Betrag', value: '8.900 $' },
            { id: 'playbooks', label: 'Abläufe', value: '2' },
          ],
        },
        {
          metricId: 'rate',
          rows: [
            { id: 'attempts', label: 'Versuche', value: '19' },
            { id: 'capacity', label: 'Kapazität', value: '32' },
            { id: 'max-tries', label: 'Maximale Versuche', value: '4' },
          ],
        },
      ],
      labels: {
        tableCaption: 'Überfällige Abonnements',
        expand: (customer) => `Wiederholungsversuche für ${customer}`,
      },
    },
  }
}
