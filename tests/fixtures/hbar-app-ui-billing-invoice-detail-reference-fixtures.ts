import type { HbarAppUiBillingInvoiceDetailContent } from '../../packages/hbar-app-ui/src/index'

export type BillingInvoiceDetailReferenceFixture = HbarAppUiBillingInvoiceDetailContent & {
  readonly referenceLayout: { readonly showHeader: boolean }
}

export function createBillingInvoiceDetailReferenceFixture(
  locale: 'en' | 'de-long',
): BillingInvoiceDetailReferenceFixture {
  const english = locale === 'en'

  return {
    referenceLayout: { showHeader: false },
    labels: {
      print: english ? 'Print invoice' : 'Rechnung drucken',
      pdf: english ? 'Download PDF' : 'PDF-Rechnung herunterladen',
      sendReminder: english ? 'Send reminder' : 'Zahlungserinnerung versenden',
      billedTo: english ? 'Billed to' : 'Rechnungsempfänger',
      lineItemsTitle: english ? 'Invoice line items' : 'Einzelpositionen dieser Rechnung',
      descriptionColumn: english ? 'Description' : 'Beschreibung der Rechnungsposition',
      quantityColumn: english ? 'Qty' : 'Menge',
      rateColumn: english ? 'Rate' : 'Einzelpreis',
      amountColumn: english ? 'Amount' : 'Gesamtbetrag',
      activityTitle: english ? 'Activity' : 'Aktivitätsverlauf',
      collectionTitle: english ? 'Collection' : 'Zahlungseinzug',
      chargeNow: english ? 'Charge now' : 'Zahlung jetzt einziehen',
      helpNotice: english
        ? 'Questions about this invoice? Reply to the billing email and it opens a ticket with the account owner attached.'
        : 'Haben Sie Fragen zu dieser Rechnung? Antworten Sie auf die E-Mail zur Abrechnung, damit automatisch ein Supportticket mit der zuständigen Kontoverwaltung erstellt wird.',
      emptyLines: english
        ? 'No invoice line items are available.'
        : 'Für diese Rechnung sind keine Einzelpositionen verfügbar.',
    },
    invoice: 'INV-20437',
    status: english ? 'Payment due' : 'Zahlung fällig',
    statusTone: 'warning',
    description: english
      ? 'June 2026 subscription and usage charges'
      : 'Abonnement- und Nutzungsgebühren für Juni 2026',
    addressLines: ['Cedar Labs Inc.', '14 Warren Street, Suite 620', 'New York, NY 10007', 'US-88-2947135'],
    metadata: [
      { id: 'issued', label: english ? 'Issued' : 'Ausgestellt', value: english ? 'Jun 16, 2026' : '16. Juni 2026' },
      { id: 'due', label: english ? 'Due' : 'Fällig', value: english ? 'Jun 30, 2026' : '30. Juni 2026' },
      { id: 'terms', label: english ? 'Terms' : 'Zahlungsziel', value: 'Net 14' },
      { id: 'purchase-order', label: 'PO', value: 'PO-4471' },
    ],
    lines: [
      {
        id: 'growth-plan',
        description: english ? 'Growth plan' : 'Growth-Tarif',
        detail: english ? '20 seats · Jun 1 to Jun 30' : '20 Benutzerplätze · 1. bis 30. Juni',
        quantity: '20',
        rate: '$89.00',
        amount: '$1,780.00',
      },
      {
        id: 'additional-seats',
        description: english ? 'Additional seats' : 'Zusätzliche Benutzerplätze',
        detail: english
          ? '4 seats added Jun 12, prorated 18 days'
          : '4 Benutzerplätze ab 12. Juni, anteilig für 18 Tage',
        quantity: '4',
        rate: '$53.40',
        amount: '$213.60',
      },
      {
        id: 'api-overage',
        description: 'API overage',
        detail: english ? '48,000 calls beyond included 500k' : '48.000 Aufrufe oberhalb der enthaltenen 500.000',
        quantity: '48',
        rate: '$1.20',
        amount: '$57.60',
      },
      {
        id: 'usage-insights',
        description: 'Usage insights add-on',
        detail: english ? 'Monthly add-on · Jun 1 to Jun 30' : 'Monatliche Zusatzoption · 1. bis 30. Juni',
        quantity: '1',
        rate: '$19.00',
        amount: '$19.00',
      },
    ],
    totals: [
      { id: 'subtotal', label: english ? 'Subtotal' : 'Zwischensumme', value: '$2,070.20' },
      { id: 'volume-discount', label: english ? 'Volume discount (5%)' : 'Mengenrabatt (5 %)', value: '−$103.51' },
      { id: 'sales-tax', label: english ? 'Sales tax (8.88%)' : 'Umsatzsteuer (8,88 %)', value: '$174.64' },
      { id: 'amount-due', label: english ? 'Amount due' : 'Fälliger Betrag', value: '$2,141.33' },
    ],
    activities: [
      {
        id: 'invoice-issued',
        title: english ? 'Invoice issued' : 'Rechnung erstellt',
        description: 'Emailed to ap@cedarlabs.com',
        date: english ? 'Jun 16, 09:04' : '16. Juni, 09:04',
      },
      {
        id: 'viewed-by-customer',
        title: english ? 'Viewed by customer' : 'Vom Kunden angesehen',
        description: english ? 'Opened twice from New York' : 'Zweimal aus New York geöffnet',
        date: english ? 'Jun 16, 14:22' : '16. Juni, 14:22',
      },
      {
        id: 'reminder-sent',
        title: english ? 'Reminder sent' : 'Erinnerung versendet',
        description: english
          ? 'Automatic reminder, 3 days before due'
          : 'Automatische Erinnerung, 3 Tage vor Fälligkeit',
        date: english ? 'Jun 27, 08:00' : '27. Juni, 08:00',
        tone: 'warning',
      },
      {
        id: 'payment-due',
        title: english ? 'Payment due' : 'Zahlung fällig',
        description: english ? 'ACH transfer from Northwind Trust 1190' : 'ACH-Überweisung von Northwind Trust 1190',
        date: 'Jun 30',
      },
    ],
    collection: [
      { id: 'method', label: english ? 'Method' : 'Zahlungsart', value: english ? 'ACH transfer' : 'ACH-Überweisung' },
      { id: 'account', label: english ? 'Account' : 'Konto', value: 'Northwind 1190' },
      { id: 'attempt', label: english ? 'Attempt' : 'Einzugsversuch', value: english ? 'Jun 30' : '30. Juni' },
    ],
    listStrategy: { kind: 'content-grown', expectedMaximum: 8 },
  }
}
