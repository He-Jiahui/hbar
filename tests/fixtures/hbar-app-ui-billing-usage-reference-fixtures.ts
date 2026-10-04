import type { HbarAppUiBillingUsageContent } from '../../packages/hbar-app-ui/src/index'

export type BillingUsageReferenceFixture = HbarAppUiBillingUsageContent & {
  readonly referenceLayout: { readonly ownerId: string }
  readonly referenceFlow: {
    readonly periodId: string | null
    readonly onPeriodChange: (periodId: string) => void
  }
}

export function createBillingUsageReferenceFixture(locale: 'en' | 'de-long'): BillingUsageReferenceFixture {
  const copy =
    locale === 'en'
      ? {
          title: 'Usage and overages',
          description: 'Growth plan · Jun 1 to Jun 30 · 12 days remaining',
          periodGroup: 'Billing cycle',
          periods: ['This cycle', 'Last cycle', 'Cycle to date'] as const,
          meterTitle: 'Metered entitlements',
          meterDescription: 'Anything beyond the included allowance bills at the listed rate.',
          setAlert: 'Set an alert',
          cycleNotice: 'This cycle closes Jun 30. Overage is invoiced with the next subscription charge.',
          emptyMeters: 'No metered entitlements are available.',
          meterProgress: (label: string) => label + ' usage',
        }
      : {
          title: 'Nutzungsübersicht und verbrauchsabhängige Mehrkosten',
          description: 'Growth-Tarif · 1. Juni bis 30. Juni · noch 12 Tage im Abrechnungszeitraum',
          periodGroup: 'Abrechnungszeitraum auswählen',
          periods: ['Dieser Abrechnungszeitraum', 'Vorheriger Abrechnungszeitraum', 'Bisheriger Verbrauch'] as const,
          meterTitle: 'Verbrauchsabhängige Tarifkontingente',
          meterDescription:
            'Jede Nutzung oberhalb des enthaltenen Freikontingents wird zum jeweils angegebenen Satz abgerechnet.',
          setAlert: 'Nutzungswarnung konfigurieren',
          cycleNotice:
            'Der aktuelle Abrechnungszeitraum endet am 30. Juni. Mehrverbrauch wird mit der nächsten Abonnementzahlung abgerechnet.',
          emptyMeters: 'Für diesen Tarif sind derzeit keine verbrauchsabhängigen Kontingente verfügbar.',
          meterProgress: (label: string) => 'Nutzung des Kontingents für ' + label,
        }

  return {
    referenceLayout: { ownerId: 'usage:cedar-labs' },
    referenceFlow: {
      periodId: 'this-cycle',
      onPeriodChange: () => {},
    },
    labels: {
      pageTitle: copy.title,
      pageDescription: copy.description,
      periodGroup: copy.periodGroup,
      meterTitle: copy.meterTitle,
      meterDescription: copy.meterDescription,
      setAlert: copy.setAlert,
      cycleNotice: copy.cycleNotice,
      emptyMeters: copy.emptyMeters,
      meterProgress: copy.meterProgress,
    },
    periods: [
      { id: 'this-cycle', label: copy.periods[0] },
      { id: 'last-cycle', label: copy.periods[1] },
      { id: 'cycle-to-date', label: copy.periods[2] },
    ],
    initialPeriodId: 'this-cycle',
    metrics: [
      {
        id: 'estimated-total',
        label: locale === 'en' ? 'ESTIMATED TOTAL' : 'VORAUSSICHTLICHE GESAMTSUMME',
        value: '$1,828.00',
        detail: locale === 'en' ? 'Billed Jul 1' : 'Abrechnung am 1. Juli',
      },
      {
        id: 'plan-subscription',
        label: locale === 'en' ? 'PLAN SUBSCRIPTION' : 'ABONNEMENT DES TARIFS',
        value: '$1,780.00',
        detail: locale === 'en' ? '20 seats included' : '20 Benutzerplätze enthalten',
      },
      {
        id: 'metered-overage',
        label: locale === 'en' ? 'METERED OVERAGE' : 'NUTZUNGSABHÄNGIGER MEHRVERBRAUCH',
        value: '$48.00',
        detail: locale === 'en' ? '1 meter over' : '1 Kontingent überschritten',
        tone: 'warning',
      },
    ],
    meters: [
      {
        id: 'seats',
        icon: 'people',
        label: locale === 'en' ? 'Seats' : 'Benutzerplätze',
        status: locale === 'en' ? 'Over allowance' : 'Kontingent überschritten',
        statusTone: 'danger',
        currentValue: locale === 'en' ? '24 of 20 seats' : '24 von 20 Benutzerplätzen',
        percentage: 120,
        percentageLabel: '120%',
        detail: locale === 'en' ? '4 seats over at $12 each' : '4 zusätzliche Benutzerplätze zu je $12',
        amount: '$48.00',
      },
      {
        id: 'api-calls',
        icon: 'bolt',
        label: 'API calls',
        status: locale === 'en' ? 'Nearing limit' : 'Kontingent fast ausgeschöpft',
        statusTone: 'warning',
        currentValue: locale === 'en' ? '468,000 of 500,000 calls' : '468.000 von 500.000 Aufrufen',
        percentage: 94,
        percentageLabel: '94%',
        detail: locale === 'en' ? '32,000 calls left this cycle' : 'Noch 32.000 Aufrufe in diesem Zeitraum',
        amount: '$0.00',
      },
      {
        id: 'storage',
        icon: 'storage',
        label: locale === 'en' ? 'Storage' : 'Speicher',
        status: locale === 'en' ? 'Nearing limit' : 'Kontingent fast ausgeschöpft',
        statusTone: 'warning',
        currentValue: locale === 'en' ? '96 of 100 GB' : '96 von 100 GB',
        percentage: 96,
        percentageLabel: '96%',
        detail: locale === 'en' ? '4 GB left this cycle' : 'Noch 4 GB in diesem Zeitraum',
        amount: '$0.00',
      },
      {
        id: 'transactional-email',
        icon: 'mail',
        label: locale === 'en' ? 'Transactional email' : 'Transaktions-E-Mails',
        currentValue: locale === 'en' ? '118,400 of 250,000 sends' : '118.400 von 250.000 E-Mails',
        percentage: 47,
        percentageLabel: '47%',
        detail: locale === 'en' ? '131,600 sends left this cycle' : 'Noch 131.600 E-Mails in diesem Zeitraum',
        amount: '$0.00',
      },
    ],
    cycleAmount: '$48.00',
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 12 },
  }
}
