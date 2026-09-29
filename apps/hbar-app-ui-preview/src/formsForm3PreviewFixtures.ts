import { deriveForms3Totals, type Forms3PreviewStoreSeed, type Forms3PreviewStoreState } from './formsForm3PreviewStore'

export type Forms3PreviewLocale = 'en' | 'de'

export interface Forms3PreviewChoice {
  readonly id: string
  readonly label: string
}

export interface Forms3PreviewDutyChoice extends Forms3PreviewChoice {
  readonly basisPoints: number
}

export interface Forms3PreviewCurrencyChoice extends Forms3PreviewChoice {
  readonly code: string
}

export interface Forms3PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly draftBadge: string
  readonly consignorHeading: string
  readonly consignorDescription: string
  readonly consignorBadge: string
  readonly accountLabel: string
  readonly bookingReferenceLabel: string
  readonly taxIdentifierLabel: string
  readonly bookingContactLabel: string
  readonly routeHeading: string
  readonly routeDescription: string
  readonly routeBadge: string
  readonly pickupDateLabel: string
  readonly deliveryDateLabel: string
  readonly incotermLabel: string
  readonly serviceLevelLabel: string
  readonly currencyLabel: string
  readonly cargoHeading: string
  readonly cargoDescription: string
  readonly lineCountLabel: (count: number) => string
  readonly descriptionColumnLabel: string
  readonly quantityColumnLabel: string
  readonly unitRateColumnLabel: string
  readonly dutyColumnLabel: string
  readonly amountColumnLabel: string
  readonly actionsColumnLabel: string
  readonly descriptionChoiceLabel: string
  readonly quantityLabel: string
  readonly unitRateLabel: string
  readonly dutyRateLabel: string
  readonly addLineLabel: string
  readonly removeLineLabel: string
  readonly subtotalLabel: string
  readonly dutyTotalLabel: string
  readonly grandTotalLabel: string
  readonly footerNote: string
  readonly saveDraftLabel: string
  readonly bookShipmentLabel: string
  readonly formatNumber: (amountMinor: number) => string
  readonly formatMoney: (currencyCode: string, amountMinor: number) => string
}

export interface Forms3PreviewCatalogs {
  readonly accounts: readonly Forms3PreviewChoice[]
  readonly incoterms: readonly Forms3PreviewChoice[]
  readonly serviceLevels: readonly Forms3PreviewChoice[]
  readonly currencies: readonly Forms3PreviewCurrencyChoice[]
  readonly descriptions: readonly Forms3PreviewChoice[]
  readonly dutyRates: readonly Forms3PreviewDutyChoice[]
}

export interface Forms3PreviewLineContent {
  readonly id: string
  readonly descriptionId: string | null
  readonly descriptionLabel: string
  readonly descriptionChoices: readonly Forms3PreviewChoice[]
  readonly quantity: string
  readonly unitRate: string
  readonly dutyRateId: string | null
  readonly dutyRateLabel: string
  readonly dutyRateChoices: readonly Forms3PreviewDutyChoice[]
  readonly amountLabel: string
}

export interface Forms3PreviewContent {
  readonly copy: Forms3PreviewCopy
  readonly account: { readonly selectedId: string; readonly choices: readonly Forms3PreviewChoice[] }
  readonly bookingReference: { readonly label: string; readonly value: string }
  readonly taxIdentifier: { readonly label: string; readonly value: string }
  readonly bookingContact: { readonly label: string; readonly value: string }
  readonly pickupDate: { readonly label: string; readonly value: string }
  readonly deliveryDate: { readonly label: string; readonly value: string }
  readonly incoterm: { readonly selectedId: string; readonly choices: readonly Forms3PreviewChoice[] }
  readonly serviceLevel: { readonly selectedId: string; readonly choices: readonly Forms3PreviewChoice[] }
  readonly currency: {
    readonly selectedId: string
    readonly code: string
    readonly choices: readonly Forms3PreviewCurrencyChoice[]
  }
  readonly cargo: {
    readonly lineCountLabel: string
    readonly lines: readonly Forms3PreviewLineContent[]
    readonly subtotalLabel: string
    readonly dutyTotalLabel: string
    readonly grandTotalLabel: string
    readonly bookShipmentDisabled: true
  }
  readonly listStrategy: { readonly kind: 'content-grown'; readonly note: string }
}

export interface Forms3PreviewFixture {
  readonly locale: Forms3PreviewLocale
  readonly copy: Forms3PreviewCopy
  readonly catalogs: Forms3PreviewCatalogs
  readonly storeSeed: Forms3PreviewStoreSeed
  readonly contentFor: (state: Forms3PreviewStoreState) => Forms3PreviewContent
}

const sourceCatalogs: Forms3PreviewCatalogs = {
  accounts: [{ id: 'northwind-traders', label: 'Northwind Traders' }],
  incoterms: [{ id: 'dap', label: 'DAP, delivered at place' }],
  serviceLevels: [{ id: 'standard-groupage', label: 'Standard groupage' }],
  currencies: [{ id: 'eur', code: 'EUR', label: 'EUR, euro' }],
  descriptions: [
    { id: 'palletised-dry-goods', label: 'Palletised dry goods' },
    { id: 'temperature-controlled', label: 'Temperature-controlled' },
    { id: 'machinery-and-parts', label: 'Machinery and parts' },
  ],
  dutyRates: [
    { id: 'reduced-5', basisPoints: 500, label: '5% reduced' },
    { id: 'standard-12', basisPoints: 1200, label: '12% standard' },
    { id: 'elevated-18', basisPoints: 1800, label: '18% elevated' },
  ],
}

function copyFor(locale: Forms3PreviewLocale): Forms3PreviewCopy {
  const formatNumber = (amountMinor: number) =>
    new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100)

  if (locale === 'de') {
    return {
      pageTitle: 'Neue Frachtbuchung',
      pageDescription: 'Versender, Route und Fracht für eine einzelne Sendung.',
      draftBadge: 'Entwurf',
      consignorHeading: 'Versender',
      consignorDescription: 'Wer die Waren versendet und wie die Person erreichbar ist.',
      consignorBadge: 'Absender',
      accountLabel: 'Konto',
      bookingReferenceLabel: 'Buchungsreferenz',
      taxIdentifierLabel: 'Steueridentifikationsnummer',
      bookingContactLabel: 'Buchungskontakt',
      routeHeading: 'Route und Bedingungen',
      routeDescription: 'Abholzeitraum, Lieferbedingungen und Abrechnungswährung.',
      routeBadge: 'Transit',
      pickupDateLabel: 'Abholdatum',
      deliveryDateLabel: 'Lieferdatum',
      incotermLabel: 'Incoterm',
      serviceLevelLabel: 'Servicestufe',
      currencyLabel: 'Währung',
      cargoHeading: 'Frachtpositionen',
      cargoDescription: 'Der Betrag pro Position entspricht Menge mal Einzelpreis plus Zoll.',
      lineCountLabel: (count) => `${count} ${count === 1 ? 'Position' : 'Positionen'}`,
      descriptionColumnLabel: 'Beschreibung der Warenposition',
      quantityColumnLabel: 'Menge',
      unitRateColumnLabel: 'Einzelpreis',
      dutyColumnLabel: 'Zoll',
      amountColumnLabel: 'Betrag',
      actionsColumnLabel: 'Aktionen',
      descriptionChoiceLabel: 'Warenbeschreibung',
      quantityLabel: 'Menge',
      unitRateLabel: 'Einzelpreis',
      dutyRateLabel: 'Zollsatz',
      addLineLabel: 'Position hinzufügen',
      removeLineLabel: 'Position entfernen',
      subtotalLabel: 'Zwischensumme',
      dutyTotalLabel: 'Zoll gesamt',
      grandTotalLabel: 'Gesamtsumme',
      footerNote: 'Die Preise sind Richtwerte, bis der Frachtführer die Kapazität bestätigt.',
      saveDraftLabel: 'Entwurf speichern',
      bookShipmentLabel: 'Sendung buchen',
      formatNumber,
      formatMoney: (currencyCode, amountMinor) => `${currencyCode} ${formatNumber(amountMinor)}`,
    }
  }

  return {
    pageTitle: 'New freight booking',
    pageDescription: 'Consignor, route and cargo for a single shipment.',
    draftBadge: 'Draft',
    consignorHeading: 'Consignor',
    consignorDescription: 'Who is sending the goods and how to reach them.',
    consignorBadge: 'Shipper',
    accountLabel: 'Account',
    bookingReferenceLabel: 'Booking reference',
    taxIdentifierLabel: 'Tax identifier',
    bookingContactLabel: 'Booking contact',
    routeHeading: 'Route and terms',
    routeDescription: 'Collection window, delivery terms and settlement currency.',
    routeBadge: 'Transit',
    pickupDateLabel: 'Pickup date',
    deliveryDateLabel: 'Delivery date',
    incotermLabel: 'Incoterm',
    serviceLevelLabel: 'Service level',
    currencyLabel: 'Currency',
    cargoHeading: 'Cargo lines',
    cargoDescription: 'Amount per line is quantity times unit rate plus duty.',
    lineCountLabel: (count) => `${count} ${count === 1 ? 'line' : 'lines'}`,
    descriptionColumnLabel: 'Description',
    quantityColumnLabel: 'Qty',
    unitRateColumnLabel: 'Unit rate',
    dutyColumnLabel: 'Duty',
    amountColumnLabel: 'Amount',
    actionsColumnLabel: 'Actions',
    descriptionChoiceLabel: 'Cargo description',
    quantityLabel: 'Quantity',
    unitRateLabel: 'Unit rate',
    dutyRateLabel: 'Duty rate',
    addLineLabel: 'Add line',
    removeLineLabel: 'Remove line',
    subtotalLabel: 'Subtotal',
    dutyTotalLabel: 'Duty total',
    grandTotalLabel: 'Grand total',
    footerNote: 'Rates are indicative until the carrier confirms capacity.',
    saveDraftLabel: 'Save draft',
    bookShipmentLabel: 'Book shipment',
    formatNumber,
    formatMoney: (currencyCode, amountMinor) => `${currencyCode} ${formatNumber(amountMinor)}`,
  }
}

function catalogsFor(locale: Forms3PreviewLocale): Forms3PreviewCatalogs {
  if (locale === 'en') {
    return {
      accounts: sourceCatalogs.accounts.map((choice) => ({ ...choice })),
      incoterms: sourceCatalogs.incoterms.map((choice) => ({ ...choice })),
      serviceLevels: sourceCatalogs.serviceLevels.map((choice) => ({ ...choice })),
      currencies: sourceCatalogs.currencies.map((choice) => ({ ...choice })),
      descriptions: sourceCatalogs.descriptions.map((choice) => ({ ...choice })),
      dutyRates: sourceCatalogs.dutyRates.map((choice) => ({ ...choice })),
    }
  }

  return {
    accounts: sourceCatalogs.accounts.map((choice) => ({ ...choice })),
    incoterms: sourceCatalogs.incoterms.map((choice) => ({ ...choice, label: 'DAP, geliefert benannter Ort' })),
    serviceLevels: sourceCatalogs.serviceLevels.map((choice) => ({ ...choice, label: 'Standard-Sammelgut' })),
    currencies: sourceCatalogs.currencies.map((choice) => ({ ...choice, label: 'EUR, Euro' })),
    descriptions: sourceCatalogs.descriptions.map((choice) => ({
      ...choice,
      label:
        choice.id === 'palletised-dry-goods'
          ? 'Palettierte Trockengüter'
          : choice.id === 'temperature-controlled'
            ? 'Temperaturgeführte Waren'
            : 'Maschinen und Ersatzteile',
    })),
    dutyRates: sourceCatalogs.dutyRates.map((choice) => ({
      ...choice,
      label: choice.id === 'reduced-5' ? '5 % ermäßigt' : choice.id === 'standard-12' ? '12 % Standard' : '18 % erhöht',
    })),
  }
}

export function createForms3PreviewFixture(locale: Forms3PreviewLocale = 'en'): Forms3PreviewFixture {
  const copy = copyFor(locale)
  const catalogs = catalogsFor(locale)
  const storeSeed: Forms3PreviewStoreSeed = {
    initialDraft: {
      accountId: 'northwind-traders',
      bookingReference: 'SHP-4471',
      taxIdentifier: 'GB 842 5591 07',
      bookingContact: 'Lena Ostrowski',
      pickupDate: '2026-08-14',
      deliveryDate: '2026-08-21',
      incotermId: 'dap',
      serviceLevelId: 'standard-groupage',
      currencyId: 'eur',
      lines: [
        {
          id: 'cargo-line-1',
          descriptionId: 'palletised-dry-goods',
          quantity: '18',
          unitRate: '42.50',
          dutyRateId: 'reduced-5',
        },
        {
          id: 'cargo-line-2',
          descriptionId: 'temperature-controlled',
          quantity: '6',
          unitRate: '128.00',
          dutyRateId: 'standard-12',
        },
        {
          id: 'cargo-line-3',
          descriptionId: 'machinery-and-parts',
          quantity: '2',
          unitRate: '540.00',
          dutyRateId: 'elevated-18',
        },
      ],
    },
    accountIds: catalogs.accounts.map((choice) => choice.id),
    incotermIds: catalogs.incoterms.map((choice) => choice.id),
    serviceLevelIds: catalogs.serviceLevels.map((choice) => choice.id),
    currencies: catalogs.currencies.map(({ id, code }) => ({ id, code })),
    descriptionIds: catalogs.descriptions.map((choice) => choice.id),
    dutyRates: catalogs.dutyRates.map(({ id, basisPoints }) => ({ id, basisPoints })),
  }

  return {
    locale,
    copy,
    catalogs,
    storeSeed,
    contentFor: (state) => {
      const totals = deriveForms3Totals(state.draft.lines, state.dutyRates)
      const amountsById = new Map(totals.lineAmounts.map((amount) => [amount.lineId, amount.amountMinor]))
      const currency = catalogs.currencies.find((choice) => choice.id === state.draft.currencyId)
      const currencyCode = currency?.code ?? ''
      return {
        copy,
        account: { selectedId: state.draft.accountId, choices: catalogs.accounts },
        bookingReference: { label: copy.bookingReferenceLabel, value: state.draft.bookingReference },
        taxIdentifier: { label: copy.taxIdentifierLabel, value: state.draft.taxIdentifier },
        bookingContact: { label: copy.bookingContactLabel, value: state.draft.bookingContact },
        pickupDate: { label: copy.pickupDateLabel, value: state.draft.pickupDate },
        deliveryDate: { label: copy.deliveryDateLabel, value: state.draft.deliveryDate },
        incoterm: { selectedId: state.draft.incotermId, choices: catalogs.incoterms },
        serviceLevel: { selectedId: state.draft.serviceLevelId, choices: catalogs.serviceLevels },
        currency: { selectedId: state.draft.currencyId, code: currencyCode, choices: catalogs.currencies },
        cargo: {
          lineCountLabel: copy.lineCountLabel(state.draft.lines.length),
          lines: state.draft.lines.map((line) => ({
            id: line.id,
            descriptionId: line.descriptionId,
            descriptionLabel: catalogs.descriptions.find((choice) => choice.id === line.descriptionId)?.label ?? '',
            descriptionChoices: catalogs.descriptions,
            quantity: line.quantity,
            unitRate: line.unitRate,
            dutyRateId: line.dutyRateId,
            dutyRateLabel: catalogs.dutyRates.find((choice) => choice.id === line.dutyRateId)?.label ?? '',
            dutyRateChoices: catalogs.dutyRates,
            amountLabel: copy.formatNumber(amountsById.get(line.id) ?? 0),
          })),
          subtotalLabel: copy.formatMoney(currencyCode, totals.subtotalMinor),
          dutyTotalLabel: copy.formatMoney(currencyCode, totals.dutyTotalMinor),
          grandTotalLabel: copy.formatMoney(currencyCode, totals.grandTotalMinor),
          bookShipmentDisabled: true,
        },
        listStrategy: {
          kind: 'content-grown',
          note: 'Cargo rows grow in document flow; the dense row group owns narrow horizontal scrolling.',
        },
      }
    },
  }
}
