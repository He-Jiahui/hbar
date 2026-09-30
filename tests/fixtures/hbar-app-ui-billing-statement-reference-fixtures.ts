import type { HbarAppUiBillingContent } from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_BILLING_FIXTURES } from './hbar-app-ui-billing-fixtures'

type StatementContent = NonNullable<HbarAppUiBillingContent['statement']>

export function createBillingStatementReferenceFixture(locale: 'en' | 'de-long' = 'en'): StatementContent {
  const statement = HBAR_APP_UI_BILLING_FIXTURES.statement
  if (!statement) throw new Error('The base billing statement fixture is unavailable.')

  if (locale === 'en') {
    return {
      ...statement,
      labels: {
        ...statement.labels,
        searchLabel: 'Search invoices',
        searchPlaceholder: 'Search customers',
      },
      referenceLayout: { labels: { tableCaption: 'Outstanding invoices' } },
    }
  }

  return {
    ...statement,
    labels: {
      ...statement.labels,
      pageTitle: 'Abrechnung und offene Rechnungen',
      pageDescription: 'Juni-Abrechnung · 7 noch ausstehende Rechnungen',
      export: 'Abrechnungsdaten exportieren',
      balanceLabel: 'AUSSTEHENDER GESAMTBETRAG',
      ledgerTitle: 'Übersicht der ausgestellten Rechnungen',
      ledgerSummary: '8 Rechnungen angezeigt · 2 überfällig',
      recoveryEmphasis: '1.530 $ überfällig',
      recoveryTrailing: ' für 2 Rechnungen. Der automatische Einzug ist aktiviert.',
      viewStatement: 'Abrechnung ansehen',
      startRecovery: 'Zahlung erneut einziehen',
      searchLabel: 'Rechnungen durchsuchen',
      searchPlaceholder: 'Nach Kundennamen oder Rechnungsnummer suchen',
      newInvoice: 'Neue Rechnung erstellen',
      customerColumn: 'Kunde oder Organisation',
      invoiceColumn: 'Rechnungsnummer und Zeitraum',
      planColumn: 'Tarif und Zahlungsmethode',
      amountColumn: 'Betrag',
      dueColumn: 'Fälligkeitsdatum',
      statusColumn: 'Zahlungsstatus',
      actionsForInvoice: (invoice) => `Aktionen für Rechnung ${invoice}`,
      emptyLedger: 'Für diese Suche wurden keine Rechnungen gefunden.',
    },
    balance: {
      ...statement.balance,
      detail: '16 Rechnungen in diesem Abrechnungszeitraum. Die älteste ist seit 18 Tagen überfällig.',
      metrics: statement.balance.metrics.map((metric) => ({
        ...metric,
        label:
          metric.id === 'current'
            ? 'AKTUELL'
            : metric.id === 'overdue'
              ? 'ÜBERFÄLLIG'
              : metric.id === 'collected'
                ? 'EINGEGANGEN'
                : 'NÄCHSTE AUSZAHLUNG',
      })),
    },
    invoices: statement.invoices.map((invoice) => ({
      ...invoice,
      invoiceMeta:
        invoice.invoiceMeta === 'May usage · seats'
          ? 'Nutzung und Lizenzen im Mai'
          : invoice.invoiceMeta === 'May usage overage'
            ? 'Zusätzliche Nutzung im Mai'
            : invoice.invoiceMeta === 'June seats'
              ? 'Lizenzen im Juni'
              : invoice.invoiceMeta === 'June usage'
                ? 'Nutzung im Juni'
                : 'Lizenzen im Mai',
      dueDetail: invoice.statusTone === 'danger' ? 'Seit mehreren Tagen überfällig' : invoice.dueDetail,
      status: invoice.status === 'Past due' ? 'Überfällig' : invoice.status === 'Paid' ? 'Bezahlt' : 'Offen',
    })),
    referenceLayout: {
      labels: { tableCaption: 'Ausstehende Kundenrechnungen' },
    },
  }
}
