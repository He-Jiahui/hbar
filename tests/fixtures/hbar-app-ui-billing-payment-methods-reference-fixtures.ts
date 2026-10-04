import type { HbarAppUiBillingPaymentMethodsContent } from '../../packages/hbar-app-ui/src/index'

export function createBillingPaymentMethodsReferenceFixture(
  locale: 'en' | 'de-long',
): HbarAppUiBillingPaymentMethodsContent {
  const isGerman = locale === 'de-long'
  return {
    referenceLayout: { ownerId: 'billing:payment-methods:cedar-labs' },
    labels: {
      pageTitle: isGerman ? 'Zahlungsmethoden' : 'Payment methods',
      pageDescription: isGerman
        ? 'So bezahlt Cedar Labs sein Abonnement und die verbrauchsabhängigen Dienste; Änderungen an der primären Methode werden hier nur für diese lokale Vorschau übernommen.'
        : 'How Cedar Labs pays for its subscription and usage.',
      addMethod: isGerman ? 'Zahlungsmethode hinzufügen' : 'Add method',
      primary: isGerman ? 'Primär' : 'Primary',
      makePrimary: isGerman ? 'Als primäre Methode festlegen' : 'Make primary',
      billingContactsTitle: isGerman ? 'Rechnungskontakte' : 'Billing contacts',
      billingContactsDescription: isGerman
        ? 'Alle hier aufgeführten Personen erhalten Rechnungen, Hinweise zu fehlgeschlagenen Zahlungen und wichtige Informationen zum Kontostand.'
        : 'Everyone here receives invoices and payment failures.',
      inviteContact: isGerman ? 'Rechnungskontakt einladen' : 'Invite a billing contact',
      billingAddressTitle: isGerman ? 'Rechnungsadresse' : 'Billing address',
      editAddress: isGerman ? 'Rechnungsadresse bearbeiten' : 'Edit address',
      taxTitle: isGerman ? 'Steuern und Compliance' : 'Tax and compliance',
      emptyMethods: isGerman ? 'Es sind keine Zahlungsmethoden hinterlegt.' : 'No payment methods added.',
      emptyContacts: isGerman ? 'Es sind keine Rechnungskontakte eingetragen.' : 'No billing contacts added.',
    },
    methods: [
      {
        id: 'visa-4242',
        kind: 'card',
        name: 'Visa ending 4242',
        detail: isGerman
          ? 'Gültig bis 04 / 2029 · Amelia Whitfield · wird für Abonnementzahlungen belastet'
          : 'Expires 04 / 2029 · Amelia Whitfield · Charged for subscriptions',
        primary: true,
        actionLabel: isGerman ? 'Aktionen für Visa mit Endziffern 4242' : 'Actions for Visa ending 4242',
      },
      {
        id: 'mastercard-8829',
        kind: 'card',
        name: 'Mastercard ending 8829',
        status: isGerman ? 'Läuft bald ab' : 'Expires soon',
        statusTone: 'warning',
        detail: isGerman
          ? 'Gültig bis 09 / 2026 · Marcus Bell · Ersatzmethode bei fehlgeschlagenen Belastungen'
          : 'Expires 09 / 2026 · Marcus Bell · Backup for failed charges',
        primary: false,
        actionLabel: isGerman ? 'Aktionen für Mastercard mit Endziffern 8829' : 'Actions for Mastercard ending 8829',
      },
      {
        id: 'ach-northwind-1190',
        kind: 'bank',
        name: 'ACH · Northwind Trust 1190',
        detail: isGerman
          ? 'Verifiziert am 12. März · zwei Werktage bis zur Abwicklung · für Rechnungen über $5.000 verwendet'
          : 'Verified 12 Mar · 2 business days to settle · Used for invoices over $5,000',
        primary: false,
        actionLabel: isGerman ? 'Aktionen für Northwind-Trust-Konto 1190' : 'Actions for ACH · Northwind Trust 1190',
      },
    ],
    contacts: [
      {
        id: 'amelia-whitfield',
        initials: 'AW',
        name: 'Amelia Whitfield',
        detail: isGerman
          ? 'amelia@cedarlabs.com · Kontoinhaberin · erhält jede Rechnung und jeden Zahlungshinweis'
          : 'amelia@cedarlabs.com · Owner · receives every invoice',
        actionLabel: isGerman ? 'Aktionen für Amelia Whitfield' : 'Actions for Amelia Whitfield',
      },
      {
        id: 'tomas-guerrero',
        initials: 'TG',
        name: 'Tomás Guerrero',
        detail: isGerman
          ? 'ap@cedarlabs.com · Kreditorenbuchhaltung · erhält ausschließlich Rechnungsbelege'
          : 'ap@cedarlabs.com · Accounts payable · receipts only',
        actionLabel: isGerman ? 'Aktionen für Tomás Guerrero' : 'Actions for Tomás Guerrero',
      },
    ],
    addressLines: ['Cedar Labs Inc.', '14 Warren Street, Suite 620', 'New York, NY 10007'],
    taxRows: [
      { id: 'tax-id', label: isGerman ? 'Steuer-ID' : 'Tax ID', value: 'US-88-2947135' },
      {
        id: 'status',
        label: isGerman ? 'Status' : 'Status',
        value: isGerman ? 'Verifiziert am 12. März' : 'Verified 12 Mar',
      },
      {
        id: 'invoices',
        label: isGerman ? 'Rechnungen' : 'Invoices',
        value: isGerman ? 'Beim Ausstellen per E-Mail' : 'Emailed on issue',
      },
    ],
    taxNotice: isGerman
      ? 'Kartendaten werden vom Zahlungsdienstleister verwahrt. Wir speichern ausschließlich die letzten vier Ziffern und keine vollständigen Kartennummern.'
      : 'Card details are held by the payment processor. We store only the last four digits.',
    methodListStrategy: { kind: 'content-grown', expectedMaximum: 8 },
    contactListStrategy: { kind: 'content-grown', expectedMaximum: 8 },
  }
}
