import type {
  HbarAppUiBillingContent,
  HbarAppUiBillingChangePlanSummary,
  HbarAppUiBillingInvoiceField,
} from '../../packages/hbar-app-ui/src/index'
import { HBAR_APP_UI_BILLING_FIXTURES } from './hbar-app-ui-billing-fixtures'

function localizedField(field: HbarAppUiBillingInvoiceField): HbarAppUiBillingInvoiceField {
  switch (field.id) {
    case 'customer':
      return { ...field, label: 'Kunde', clearLabel: 'Kundenwert löschen' }
    case 'tax-id':
      return { ...field, label: 'Steueridentifikationsnummer' }
    case 'invoice-number':
      return { ...field, label: 'Rechnungsnummer' }
    case 'po-reference':
      return { ...field, label: 'Bestellreferenz', description: 'Optional. Wird auf dem Rechnungskopf angegeben.' }
    case 'issue-date':
      return { ...field, label: 'Ausstellungsdatum' }
    case 'due-date':
      return { ...field, label: 'Fälligkeitsdatum' }
    case 'currency':
      return { ...field, label: 'Währung' }
    case 'payment-terms':
      return { ...field, label: 'Zahlungsbedingungen' }
    case 'collection':
      return {
        ...field,
        label: 'Zahlungseinzug',
        choices: [
          { id: 'ach', label: 'ACH-Überweisung' },
          { id: 'card', label: 'Karte' },
        ],
      }
    case 'billing-address':
      return { ...field, label: 'Rechnungsadresse' }
    default:
      return field
  }
}

/** Only observed Customer/Terms form content is supplied; later-step actions are explicit Host requests. */
export function createBillingWorkflowReferenceFixtures(
  locale: 'en' | 'de-long' = 'en',
): Pick<HbarAppUiBillingContent, 'invoiceComposer' | 'changePlan'> {
  const invoice = HBAR_APP_UI_BILLING_FIXTURES.invoiceComposer
  const change = HBAR_APP_UI_BILLING_FIXTURES.changePlan
  if (!invoice || !change) throw new Error('The billing workflow fixture requires the source seed data')
  const german = locale === 'de-long'
  const number = new Intl.NumberFormat(german ? 'de-DE' : 'en-US')
  const money = (value: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)}`
  const sourceSections = invoice.sections
    .filter(({ id }) => id === 'customer' || id === 'terms')
    .map((section) => ({
      ...section,
      title: german ? (section.id === 'customer' ? 'Kunde' : 'Konditionen') : section.title,
      description: german
        ? section.id === 'customer'
          ? 'Abrechenbares Konto und Referenz für diese Rechnung.'
          : 'Datum, Währung und Einzug des Rechnungsbetrags.'
        : section.description,
      fields: section.fields.map((original) => {
        const field =
          original.id === 'po-reference'
            ? { ...original, placeholder: undefined, description: 'Optional. Printed on the invoice header.' }
            : original.id === 'billing-address'
              ? { ...original, value: '14 Warren Street, Suite 620' }
              : original
        return german ? localizedField(field) : field
      }),
    }))
  const choices = change.choices.map((choice) => ({
    ...choice,
    description: german
      ? choice.id === 'starter'
        ? 'Grundlegende Abrechnung für kleine Teams, die gerade beginnen.'
        : choice.id === 'growth'
          ? 'Nutzungsanalysen und Verwaltung der Team-Sitzplätze.'
          : choice.id === 'scale'
            ? 'SSO, Audit-Exporte und priorisierter Support für größere Teams.'
            : 'Beschaffungsprüfung und verbindliche Kontoverwaltung.'
      : choice.description,
    marker: german && choice.marker ? (choice.id === 'growth' ? 'Aktuell' : 'Am häufigsten gewählt') : choice.marker,
    accessibleLabel: choice.name,
  }))
  const prices = new Map([
    ['starter', 29],
    ['growth', 89],
    ['scale', 249],
    ['enterprise', 399],
  ])
  const summaries = choices.map((choice) => {
    const price = prices.get(choice.id) ?? 89
    const charge = (price * 20 * 18) / 30
    const summary: HbarAppUiBillingChangePlanSummary = {
      title: german ? 'Anteilig berechneter Betrag' : 'Proration',
      description: german
        ? 'Wird bei jeder Änderung der Tarifstufe neu berechnet.'
        : 'Recalculated as you change the tier.',
      actionBadge:
        price > 89
          ? german
            ? 'Upgrade'
            : 'Upgrade'
          : price < 89
            ? german
              ? 'Downgrade'
              : 'Downgrade'
            : german
              ? 'Unverändert'
              : 'Unchanged',
      dueLabel: german ? 'Heute fälliger Betrag' : 'Due today',
      dueAmount: money(Math.max(0, charge - 1068)),
      dueDetail: german
        ? `${choice.name}, 20 Sitzplätze, anteilig für 18 Tage.`
        : `${choice.name}, 20 seats, prorated 18 days.`,
      rows: [
        {
          id: 'credit',
          label: german ? 'Gutschrift für den bisherigen Tarif' : 'Current plan credit',
          value: '−$1,068',
          detail: german ? 'Growth, ungenutzte 18 Tage' : 'Growth, unused 18 days',
        },
        {
          id: 'charge',
          label: german ? 'Kosten des neuen Tarifs' : 'New plan charge',
          value: money(charge),
          detail: german ? `${choice.name}, 18 Tage` : `${choice.name}, 18 days`,
        },
        {
          id: 'next',
          label: german ? 'Nächste vollständige Rechnung' : 'Next full invoice',
          value: money(price * 20),
          detail: german ? 'Verlängert sich am 1. Juli' : 'Renews Jul 1',
        },
      ],
      assurances: german
        ? [
            'Die Anzahl der Sitzplätze wird unverändert übernommen.',
            'Wird erst nach einer Bestätigung sofort wirksam.',
            'Bereits ausgestellte Rechnungen bleiben unverändert.',
          ]
        : change.summary.assurances,
    }
    return { choiceId: choice.id, summary }
  })
  return {
    invoiceComposer: {
      ...invoice,
      labels: german
        ? {
            pageTitle: 'Neue Rechnung',
            pageDescription: 'Wird automatisch als Entwurf gespeichert.',
            draft: 'Entwurf INV-20437',
            stepDetail: (position, total, label) => `Schritt ${position} von ${total} · ${label}`,
            saveDraft: 'Entwurf speichern',
            previousStep: 'Vorheriger Schritt',
            nextStep: 'Nächster Schritt',
            complete: 'Prüfen und senden',
            savedNotice: 'Entwurf gespeichert.',
          }
        : invoice.labels,
      steps: german
        ? [
            { id: 'customer', label: 'Kunde', description: 'Wer die Rechnung erhält' },
            { id: 'line-items', label: 'Rechnungspositionen', description: 'Was berechnet wird' },
            { id: 'tax', label: 'Steuer und Rabatt', description: 'Anpassungen' },
            { id: 'review', label: 'Prüfen und senden', description: 'Bestätigen' },
          ]
        : invoice.steps,
      sections: sourceSections,
      referenceLayout: { draftId: 'INV-20437', valueLimit: 5000, stepNumber: (position) => number.format(position) },
    },
    changePlan: {
      ...change,
      labels: german
        ? {
            pageTitle: 'Tarif ändern',
            pageDescription: 'Cedar Labs mit Growth · 20 Sitzplätze',
            draft: 'Entwurf',
            cancel: 'Abbrechen',
            continue: 'Fortfahren',
            footerNotice: 'Es erfolgt keine Belastung, bevor Sie in Schritt 3 bestätigen.',
            planSelection: 'Neuer Tarif',
          }
        : { ...change.labels, planSelection: 'New plan' },
      steps: german
        ? [
            { id: 'new-plan', label: 'Neuer Tarif', description: 'Eine Stufe wählen' },
            { id: 'timing', label: 'Zeitpunkt', description: 'Wann die Änderung gilt' },
            { id: 'confirm', label: 'Bestätigen', description: 'Änderung überprüfen' },
          ]
        : change.steps,
      choices,
      summary: summaries.find(({ choiceId }) => choiceId === change.initialChoiceId)?.summary ?? change.summary,
      referenceLayout: {
        ownerId: 'cedar-labs-plan',
        initialStepId: 'new-plan',
        stepNumber: (position) => number.format(position),
        summaries,
      },
    },
  }
}
