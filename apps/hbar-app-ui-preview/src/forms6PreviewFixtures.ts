import {
  deriveForms6OrderSummary,
  type Forms6AddressDraft,
  type Forms6AddressId,
  type Forms6CartItem,
  type Forms6CountryOption,
  type Forms6PreviewStoreSeed,
  type Forms6PreviewStoreState,
  type Forms6RegionControl,
  type Forms6ShippingOption,
} from './forms6PreviewStore'

export type Forms6PreviewLocale = 'en' | 'de'

export interface Forms6PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly secureLabel: string
  readonly deliveryHeading: string
  readonly deliveryDescription: string
  readonly billingHeading: string
  readonly billingDescription: string
  readonly emailLabel: string
  readonly emailPlaceholder: string
  readonly fullNameLabel: string
  readonly fullNamePlaceholder: string
  readonly streetLabel: string
  readonly streetPlaceholder: string
  readonly apartmentLabel: string
  readonly apartmentPlaceholder: string
  readonly countryLabel: string
  readonly cityLabel: string
  readonly cityPlaceholder: string
  readonly postalCodeLabel: string
  readonly postalCodePlaceholder: string
  readonly postalCodeHelper: string
  readonly billingMatchesDeliveryLabel: string
  readonly paymentHeading: string
  readonly paymentDescription: string
  readonly cardNumberLabel: string
  readonly cardNumberPlaceholder: string
  readonly expiryLabel: string
  readonly expiryPlaceholder: string
  readonly cvcLabel: string
  readonly cvcPlaceholder: string
  readonly orderSummaryHeading: string
  readonly emptyCartLabel: string
  readonly shippingLegend: string
  readonly subtotalLabel: string
  readonly shippingLabel: string
  readonly taxLabel: string
  readonly totalLabel: string
  readonly freeShippingLabel: string
  readonly backToCartLabel: string
  readonly completeRequiredFields: string
  readonly payButtonLabel: (formattedTotal: string) => string
  readonly quantityDetail: (quantity: number, formattedUnitPrice: string) => string
  readonly formatMoney: (amountCents: number) => string
}

export interface Forms6PreviewAddressContent {
  readonly fields: Forms6AddressDraft
  readonly selectedCountryId: string
  readonly countries: readonly Pick<Forms6CountryOption, 'id' | 'label'>[]
  readonly region: Forms6RegionControl & { readonly value: string }
}

export interface Forms6PreviewCartLine extends Forms6CartItem {
  readonly lineTotalCents: number
  readonly quantityDetail: string
  readonly formattedUnitPrice: string
  readonly formattedLineTotal: string
}

export interface Forms6PreviewShippingOption extends Forms6ShippingOption {
  readonly formattedPrice: string
}

export interface Forms6PreviewContent {
  readonly copy: Forms6PreviewCopy
  readonly email: string
  readonly delivery: Forms6PreviewAddressContent
  readonly billing: Forms6PreviewAddressContent
  readonly billingMatchesDelivery: boolean
  readonly payment: Forms6PreviewStoreState['draft']['payment']
  readonly cartLines: readonly Forms6PreviewCartLine[]
  readonly shipping: {
    readonly selectedId: string
    readonly options: readonly Forms6PreviewShippingOption[]
  }
  readonly summary: {
    readonly subtotalCents: number
    readonly subtotalLabel: string
    readonly shippingCents: number
    readonly shippingValue: string
    readonly taxCents: number
    readonly taxValue: string
    readonly totalCents: number
    readonly totalValue: string
  }
  readonly backToCartLabel: string
  readonly completeRequiredFields: string
  readonly payButtonLabel: string
  readonly payDisabled: true
  readonly listStrategy: {
    readonly kind: 'content-grown'
    readonly sourceItemCount: 3
  }
}

export interface Forms6PreviewFixture {
  readonly locale: Forms6PreviewLocale
  readonly copy: Forms6PreviewCopy
  readonly storeSeed: Forms6PreviewStoreSeed
  readonly contentFor: (state: Forms6PreviewStoreState) => Forms6PreviewContent
}

const countryOptions: readonly Forms6CountryOption[] = [
  {
    id: 'us',
    label: 'United States',
    region: {
      kind: 'select',
      label: 'State',
      placeholder: 'Select state',
      options: [
        { id: 'california', label: 'California' },
        { id: 'new-york', label: 'New York' },
        { id: 'texas', label: 'Texas' },
        { id: 'washington', label: 'Washington' },
        { id: 'illinois', label: 'Illinois' },
        { id: 'massachusetts', label: 'Massachusetts' },
      ],
    },
  },
  {
    id: 'ca',
    label: 'Canada',
    region: {
      kind: 'select',
      label: 'Province',
      placeholder: 'Select province',
      options: [
        { id: 'ontario', label: 'Ontario' },
        { id: 'quebec', label: 'Quebec' },
        { id: 'british-columbia', label: 'British Columbia' },
        { id: 'alberta', label: 'Alberta' },
        { id: 'nova-scotia', label: 'Nova Scotia' },
      ],
    },
  },
  {
    id: 'ie',
    label: 'Ireland',
    region: {
      kind: 'select',
      label: 'County',
      placeholder: 'Select county',
      options: [
        { id: 'dublin', label: 'Dublin' },
        { id: 'cork', label: 'Cork' },
        { id: 'galway', label: 'Galway' },
        { id: 'limerick', label: 'Limerick' },
        { id: 'kerry', label: 'Kerry' },
        { id: 'mayo', label: 'Mayo' },
      ],
    },
  },
  {
    id: 'sg',
    label: 'Singapore',
    region: {
      kind: 'text',
      label: 'Region',
      placeholder: 'District or area',
    },
  },
]

const cartItems: readonly Forms6CartItem[] = [
  { id: 'merino-throw', name: 'Merino wool throw blanket', quantity: 1, unitPriceCents: 12800 },
  { id: 'pour-over-set', name: 'Ceramic pour-over set', quantity: 2, unitPriceCents: 4600 },
  {
    id: 'linen-tea-towels',
    name: 'Linen tea towels, set of 4',
    quantity: 1,
    unitPriceCents: 3400,
  },
]

const shippingOptions: readonly Forms6ShippingOption[] = [
  { id: 'standard', label: 'Standard', description: '5 to 7 business days', priceCents: 0 },
  { id: 'express', label: 'Express', description: '2 to 3 business days', priceCents: 1400 },
  { id: 'priority', label: 'Priority', description: 'Next business day', priceCents: 2800 },
]

function optionAt<Option>(options: readonly Option[], index: number): Option {
  const option = options[index]
  if (option === undefined) throw new RangeError(`Missing fixture option at index ${index}.`)
  return option
}

function localizedCountries(locale: Forms6PreviewLocale): readonly Forms6CountryOption[] {
  if (locale === 'en') return countryOptions.map((country) => ({ ...country }))

  const labels: Readonly<Record<string, string>> = {
    us: 'Vereinigte Staaten',
    ca: 'Kanada',
    ie: 'Irland',
    sg: 'Singapur',
  }
  const regionLabels: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    us: {
      california: 'Kalifornien',
      'new-york': 'New York',
      texas: 'Texas',
      washington: 'Washington',
      illinois: 'Illinois',
      massachusetts: 'Massachusetts',
    },
    ca: {
      ontario: 'Ontario',
      quebec: 'Québec',
      'british-columbia': 'Britisch-Kolumbien',
      alberta: 'Alberta',
      'nova-scotia': 'Neuschottland',
    },
    ie: { dublin: 'Dublin', cork: 'Cork', galway: 'Galway', limerick: 'Limerick', kerry: 'Kerry', mayo: 'Mayo' },
  }

  return countryOptions.map((country) => {
    const label = labels[country.id]
    if (!label) throw new RangeError(`Missing localized country label: ${country.id}`)
    if (country.region.kind === 'text') {
      return {
        ...country,
        label,
        region: { ...country.region, placeholder: 'Stadtteil oder Gebiet' },
      }
    }
    const regionLabelsForCountry = regionLabels[country.id]
    if (!regionLabelsForCountry) throw new RangeError(`Missing localized regions: ${country.id}`)
    return {
      ...country,
      label,
      region: {
        ...country.region,
        label: country.id === 'us' ? 'Bundesstaat' : country.id === 'ca' ? 'Provinz' : 'Grafschaft',
        placeholder:
          country.id === 'us'
            ? 'Bundesstaat auswählen'
            : country.id === 'ca'
              ? 'Provinz auswählen'
              : 'Grafschaft auswählen',
        options: country.region.options.map((option) => {
          const optionLabel = regionLabelsForCountry[option.id]
          if (!optionLabel) throw new RangeError(`Missing localized region label: ${option.id}`)
          return { ...option, label: optionLabel }
        }),
      },
    }
  })
}

function copyFor(locale: Forms6PreviewLocale): Forms6PreviewCopy {
  const formatter = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const formatMoney = (amountCents: number) => formatter.format(amountCents / 100)

  if (locale === 'de') {
    return {
      pageTitle: 'Kasse',
      pageDescription: 'Geben Sie Liefer- und Zahlungsdetails ein, um Ihre Bestellung abzuschließen.',
      secureLabel: 'Sicher',
      deliveryHeading: 'Lieferadresse',
      deliveryDescription: 'Wohin sollen wir diese Bestellung senden?',
      billingHeading: 'Rechnungsadresse',
      billingDescription: 'Die Adresse auf Ihrem Zahlungsmittel.',
      emailLabel: 'E-Mail für Updates',
      emailPlaceholder: 'name@example.de',
      fullNameLabel: 'Vollständiger Name',
      fullNamePlaceholder: 'Name der empfangenden Person',
      streetLabel: 'Straße und Hausnummer',
      streetPlaceholder: 'Straße und Hausnummer',
      apartmentLabel: 'Wohnung oder Einheit',
      apartmentPlaceholder: 'Optional',
      countryLabel: 'Land',
      cityLabel: 'Stadt',
      cityPlaceholder: 'Stadt oder Ort',
      postalCodeLabel: 'Postleitzahl',
      postalCodePlaceholder: 'Postleitzahl',
      postalCodeHelper: 'Fünf Ziffern, zum Beispiel 94103.',
      billingMatchesDeliveryLabel: 'Rechnungsadresse entspricht der Lieferadresse',
      paymentHeading: 'Zahlung',
      paymentDescription: 'Ihre Karte wird belastet, sobald die Bestellung versendet wird.',
      cardNumberLabel: 'Kartennummer',
      cardNumberPlaceholder: '1234 5678 9012 3456',
      expiryLabel: 'Gültig bis',
      expiryPlaceholder: 'MM / JJ',
      cvcLabel: 'Prüfnummer',
      cvcPlaceholder: '123',
      orderSummaryHeading: 'Bestellübersicht',
      emptyCartLabel: 'Keine Artikel in der Bestellübersicht.',
      shippingLegend: 'Versandart',
      subtotalLabel: 'Zwischensumme',
      shippingLabel: 'Versand',
      taxLabel: 'Steuer (8,5 %)',
      totalLabel: 'Gesamtbetrag',
      freeShippingLabel: 'Kostenlos',
      backToCartLabel: 'Zurück zum Warenkorb',
      completeRequiredFields: 'Füllen Sie zuerst alle erforderlichen Angaben aus.',
      payButtonLabel: (formattedTotal) => `Bezahlen ${formattedTotal}`,
      quantityDetail: (quantity, formattedUnitPrice) => `Menge ${quantity} · je ${formattedUnitPrice}`,
      formatMoney,
    }
  }

  return {
    pageTitle: 'Checkout',
    pageDescription: 'Enter delivery and payment details to complete your order.',
    secureLabel: 'Secure',
    deliveryHeading: 'Delivery address',
    deliveryDescription: 'Where should we send this order?',
    billingHeading: 'Billing address',
    billingDescription: 'The address on your payment method.',
    emailLabel: 'Email for updates',
    emailPlaceholder: 'you@example.com',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Recipient name',
    streetLabel: 'Street address',
    streetPlaceholder: 'Number and street',
    apartmentLabel: 'Apartment or unit',
    apartmentPlaceholder: 'Optional',
    countryLabel: 'Country',
    cityLabel: 'City',
    cityPlaceholder: 'City or town',
    postalCodeLabel: 'ZIP code',
    postalCodePlaceholder: 'ZIP code',
    postalCodeHelper: '5 digits, e.g. 94103',
    billingMatchesDeliveryLabel: 'Billing address matches delivery',
    paymentHeading: 'Payment',
    paymentDescription: 'Your card is charged when the order ships.',
    cardNumberLabel: 'Card number',
    cardNumberPlaceholder: '1234 5678 9012 3456',
    expiryLabel: 'Expiry',
    expiryPlaceholder: 'MM / YY',
    cvcLabel: 'CVC',
    cvcPlaceholder: '123',
    orderSummaryHeading: 'Order summary',
    emptyCartLabel: 'There are no items in this order summary.',
    shippingLegend: 'Shipping speed',
    subtotalLabel: 'Subtotal',
    shippingLabel: 'Shipping',
    taxLabel: 'Tax (8.5%)',
    totalLabel: 'Total',
    freeShippingLabel: 'Free',
    backToCartLabel: 'Back to cart',
    completeRequiredFields: 'Complete the required fields to pay',
    payButtonLabel: (formattedTotal) => `Pay ${formattedTotal}`,
    quantityDetail: (quantity, formattedUnitPrice) => `Qty ${quantity} · ${formattedUnitPrice} each`,
    formatMoney,
  }
}

function localizedCartItems(locale: Forms6PreviewLocale): readonly Forms6CartItem[] {
  if (locale === 'en') return cartItems.map((item) => ({ ...item }))
  return [
    { ...optionAt(cartItems, 0), name: 'Merino-Wolldecke für entspannte Abende' },
    { ...optionAt(cartItems, 1), name: 'Keramik-Handfilter-Set für den täglichen Kaffee' },
    {
      ...optionAt(cartItems, 2),
      name: 'Leinentücher für empfindliche Küchenoberflächen, 4er-Set',
    },
  ]
}

function localizedShippingOptions(locale: Forms6PreviewLocale): readonly Forms6ShippingOption[] {
  if (locale === 'en') return shippingOptions.map((option) => ({ ...option }))
  return [
    { ...optionAt(shippingOptions, 0), label: 'Standard', description: '5 bis 7 Werktage' },
    { ...optionAt(shippingOptions, 1), label: 'Express', description: '2 bis 3 Werktage' },
    { ...optionAt(shippingOptions, 2), label: 'Priorität', description: 'Nächster Werktag' },
  ]
}

function projectAddress(
  address: Forms6AddressDraft,
  addressId: Forms6AddressId,
  countries: readonly Forms6CountryOption[],
): Forms6PreviewAddressContent {
  const country = countries.find((option) => option.id === address.countryId)
  if (!country) throw new RangeError(`Missing ${addressId} country: ${address.countryId}`)
  const countryChoices = countries.map(({ id, label }) => ({ id, label }))

  return {
    fields: { ...address },
    selectedCountryId: country.id,
    countries: countryChoices,
    region: { ...country.region, value: address.regionValue },
  }
}

export function createForms6PreviewFixture(locale: Forms6PreviewLocale = 'en'): Forms6PreviewFixture {
  const copy = copyFor(locale)
  const countries = localizedCountries(locale)
  const items = localizedCartItems(locale)
  const localizedShipping = localizedShippingOptions(locale)
  const storeSeed: Forms6PreviewStoreSeed = {
    initialDraft: {
      email: '',
      delivery: {
        fullName: '',
        street: '',
        apartment: '',
        countryId: 'us',
        city: '',
        regionValue: '',
        postalCode: '',
      },
      billing: {
        fullName: '',
        street: '',
        apartment: '',
        countryId: 'us',
        city: '',
        regionValue: '',
        postalCode: '',
      },
      billingMatchesDelivery: true,
      payment: { cardNumber: '', expiry: '', cvc: '' },
      shippingId: 'standard',
    },
    countries,
    items,
    shippingOptions: localizedShipping,
    taxRateBasisPoints: 850,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const summary = deriveForms6OrderSummary(
        state.items,
        state.shippingOptions,
        state.draft.shippingId,
        state.taxRateBasisPoints,
      )
      const cartLines = summary.lines.map((line) => ({
        ...line,
        quantityDetail: copy.quantityDetail(line.quantity, copy.formatMoney(line.unitPriceCents)),
        formattedUnitPrice: copy.formatMoney(line.unitPriceCents),
        formattedLineTotal: copy.formatMoney(line.lineTotalCents),
      }))
      const shippingChoices = state.shippingOptions.map((option) => ({
        ...option,
        formattedPrice: option.priceCents === 0 ? copy.freeShippingLabel : copy.formatMoney(option.priceCents),
      }))
      const shippingValue =
        summary.selectedShipping.priceCents === 0
          ? copy.freeShippingLabel
          : copy.formatMoney(summary.selectedShipping.priceCents)
      const totalValue = copy.formatMoney(summary.totalCents)

      return {
        copy,
        email: state.draft.email,
        delivery: projectAddress(state.draft.delivery, 'delivery', state.countries),
        billing: projectAddress(state.draft.billing, 'billing', state.countries),
        billingMatchesDelivery: state.draft.billingMatchesDelivery,
        payment: { ...state.draft.payment },
        cartLines,
        shipping: { selectedId: state.draft.shippingId, options: shippingChoices },
        summary: {
          subtotalCents: summary.subtotalCents,
          subtotalLabel: copy.formatMoney(summary.subtotalCents),
          shippingCents: summary.shippingCents,
          shippingValue,
          taxCents: summary.taxCents,
          taxValue: copy.formatMoney(summary.taxCents),
          totalCents: summary.totalCents,
          totalValue,
        },
        backToCartLabel: copy.backToCartLabel,
        completeRequiredFields: copy.completeRequiredFields,
        payButtonLabel: copy.payButtonLabel(totalValue),
        payDisabled: true,
        listStrategy: { kind: 'content-grown', sourceItemCount: 3 },
      }
    },
  }
}
