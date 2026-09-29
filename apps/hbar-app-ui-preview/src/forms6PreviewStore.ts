import { createStore } from 'zustand/vanilla'

export type Forms6AddressId = 'delivery' | 'billing'
export type Forms6AddressFieldId = 'fullName' | 'street' | 'apartment' | 'city' | 'postalCode'
export type Forms6PaymentFieldId = 'cardNumber' | 'expiry' | 'cvc'

export interface Forms6RegionOption {
  readonly id: string
  readonly label: string
}

export type Forms6RegionControl =
  | {
      readonly kind: 'select'
      readonly label: string
      readonly placeholder: string
      readonly options: readonly Forms6RegionOption[]
    }
  | {
      readonly kind: 'text'
      readonly label: string
      readonly placeholder: string
    }

export interface Forms6CountryOption {
  readonly id: string
  readonly label: string
  readonly region: Forms6RegionControl
}

export interface Forms6AddressDraft {
  readonly fullName: string
  readonly street: string
  readonly apartment: string
  readonly countryId: string
  readonly city: string
  /** Select option ID for region selects; free text for countries with a text region field. */
  readonly regionValue: string
  readonly postalCode: string
}

export interface Forms6PaymentDraft {
  readonly cardNumber: string
  readonly expiry: string
  readonly cvc: string
}

export interface Forms6Draft {
  readonly email: string
  readonly delivery: Forms6AddressDraft
  readonly billing: Forms6AddressDraft
  readonly billingMatchesDelivery: boolean
  readonly payment: Forms6PaymentDraft
  readonly shippingId: string
}

export interface Forms6CartItem {
  readonly id: string
  readonly name: string
  readonly quantity: number
  readonly unitPriceCents: number
}

export interface Forms6ShippingOption {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly priceCents: number
}

export interface Forms6PreviewStoreSeed {
  readonly initialDraft: Forms6Draft
  readonly countries: readonly Forms6CountryOption[]
  readonly items: readonly Forms6CartItem[]
  readonly shippingOptions: readonly Forms6ShippingOption[]
  readonly taxRateBasisPoints: number
}

export interface Forms6OrderLine extends Forms6CartItem {
  readonly lineTotalCents: number
}

export interface Forms6OrderSummary {
  readonly lines: readonly Forms6OrderLine[]
  readonly subtotalCents: number
  readonly shippingCents: number
  readonly taxCents: number
  readonly totalCents: number
  readonly selectedShipping: Forms6ShippingOption
}

export interface Forms6BackToCartRequest {
  readonly kind: 'back-to-cart'
}

export interface Forms6PreviewStoreState extends Forms6PreviewStoreSeed {
  readonly draft: Forms6Draft
  readonly setEmail: (value: string) => boolean
  readonly setAddressField: (addressId: Forms6AddressId, fieldId: Forms6AddressFieldId, value: string) => boolean
  readonly setAddressCountry: (addressId: Forms6AddressId, countryId: string) => boolean
  readonly setAddressRegion: (addressId: Forms6AddressId, regionValue: string) => boolean
  readonly setBillingMatchesDelivery: (checked: boolean) => boolean
  readonly setPaymentField: (fieldId: Forms6PaymentFieldId, value: string) => boolean
  readonly selectShipping: (shippingId: string) => boolean
  /** Local preview boundary: no payment service or confirmed remote result is available. */
  readonly requestPay: () => null
  /** Navigation is delegated to the host; this action does not navigate or mutate the draft. */
  readonly requestBackToCart: () => Forms6BackToCartRequest
}

function cloneRegion(region: Forms6RegionControl): Forms6RegionControl {
  return region.kind === 'select'
    ? { ...region, options: region.options.map((option) => ({ ...option })) }
    : { ...region }
}

function cloneCountry(country: Forms6CountryOption): Forms6CountryOption {
  return { ...country, region: cloneRegion(country.region) }
}

function cloneAddress(address: Forms6AddressDraft): Forms6AddressDraft {
  return { ...address }
}

function cloneDraft(draft: Forms6Draft): Forms6Draft {
  return {
    ...draft,
    delivery: cloneAddress(draft.delivery),
    billing: cloneAddress(draft.billing),
    payment: { ...draft.payment },
  }
}

function assertUniqueIds(options: readonly { readonly id: string }[], label: string): void {
  const ids = options.map((option) => option.id)
  if (ids.some((id) => !id.trim())) throw new RangeError(`${label} IDs must not be empty.`)
  if (new Set(ids).size !== ids.length) throw new RangeError(`${label} IDs must be unique.`)
}

function countryById(countries: readonly Forms6CountryOption[], id: string): Forms6CountryOption {
  const country = countries.find((option) => option.id === id)
  if (!country) throw new RangeError(`Unknown country ID: ${id}`)
  return country
}

function assertRegionValue(country: Forms6CountryOption, value: string, label: string): void {
  if (
    country.region.kind === 'select' &&
    value !== '' &&
    !country.region.options.some((option) => option.id === value)
  ) {
    throw new RangeError(`The initial ${label} region must reference an available option.`)
  }
}

function assertValidSeed(seed: Forms6PreviewStoreSeed): void {
  assertUniqueIds(seed.countries, 'Country')
  assertUniqueIds(seed.items, 'Cart item')
  assertUniqueIds(seed.shippingOptions, 'Shipping option')

  if (seed.countries.length === 0) throw new RangeError('At least one country is required.')
  for (const country of seed.countries) {
    if (country.region.kind === 'select') {
      assertUniqueIds(country.region.options, `Region for ${country.id}`)
    }
  }

  for (const [label, address] of [
    ['delivery', seed.initialDraft.delivery],
    ['billing', seed.initialDraft.billing],
  ] as const) {
    const country = countryById(seed.countries, address.countryId)
    assertRegionValue(country, address.regionValue, label)
  }

  for (const item of seed.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new RangeError('Cart item quantities must be positive whole numbers.')
    }
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
      throw new RangeError('Cart item prices must be non-negative whole cents.')
    }
  }
  for (const option of seed.shippingOptions) {
    if (!Number.isInteger(option.priceCents) || option.priceCents < 0) {
      throw new RangeError('Shipping prices must be non-negative whole cents.')
    }
  }
  if (!seed.shippingOptions.some((option) => option.id === seed.initialDraft.shippingId)) {
    throw new RangeError('The initial shipping choice must reference an available option.')
  }
  if (!Number.isInteger(seed.taxRateBasisPoints) || seed.taxRateBasisPoints < 0 || seed.taxRateBasisPoints > 10000) {
    throw new RangeError('The tax rate must be a whole basis-point value from 0 to 10000.')
  }
}

export function formatForms6CardNumber(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

export function deriveForms6OrderSummary(
  items: readonly Forms6CartItem[],
  shippingOptions: readonly Forms6ShippingOption[],
  shippingId: string,
  taxRateBasisPoints: number,
): Forms6OrderSummary {
  const selectedShipping = shippingOptions.find((option) => option.id === shippingId)
  if (!selectedShipping) throw new RangeError('The selected shipping option is unavailable.')

  const lines = items.map((item) => ({
    ...item,
    lineTotalCents: item.quantity * item.unitPriceCents,
  }))
  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0)
  const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10000)
  const shippingCents = selectedShipping.priceCents

  return {
    lines,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
    selectedShipping: { ...selectedShipping },
  }
}

export function createForms6PreviewStore(seed: Forms6PreviewStoreSeed) {
  assertValidSeed(seed)

  const immutableSeed: Forms6PreviewStoreSeed = {
    initialDraft: cloneDraft(seed.initialDraft),
    countries: seed.countries.map(cloneCountry),
    items: seed.items.map((item) => ({ ...item })),
    shippingOptions: seed.shippingOptions.map((option) => ({ ...option })),
    taxRateBasisPoints: seed.taxRateBasisPoints,
  }

  return createStore<Forms6PreviewStoreState>((set, get) => ({
    ...immutableSeed,
    draft: cloneDraft(immutableSeed.initialDraft),
    setEmail: (value) => {
      if (get().draft.email === value) return false
      set((state) => ({ draft: { ...state.draft, email: value } }))
      return true
    },
    setAddressField: (addressId, fieldId, value) => {
      if (get().draft[addressId][fieldId] === value) return false
      set((state) => ({
        draft: {
          ...state.draft,
          [addressId]: { ...state.draft[addressId], [fieldId]: value },
        },
      }))
      return true
    },
    setAddressCountry: (addressId, countryId) => {
      const state = get()
      const nextCountry = state.countries.find((country) => country.id === countryId)
      if (!nextCountry || state.draft[addressId].countryId === countryId) return false
      const country = countryById(state.countries, countryId)
      const nextAddress = { ...state.draft[addressId], countryId, regionValue: '' }
      assertRegionValue(country, nextAddress.regionValue, addressId)
      set((current) => ({ draft: { ...current.draft, [addressId]: nextAddress } }))
      return true
    },
    setAddressRegion: (addressId, regionValue) => {
      const state = get()
      const address = state.draft[addressId]
      const country = countryById(state.countries, address.countryId)
      if (address.regionValue === regionValue) return false
      if (
        country.region.kind === 'select' &&
        regionValue !== '' &&
        !country.region.options.some((option) => option.id === regionValue)
      ) {
        return false
      }
      set((current) => ({
        draft: {
          ...current.draft,
          [addressId]: { ...current.draft[addressId], regionValue },
        },
      }))
      return true
    },
    setBillingMatchesDelivery: (checked) => {
      if (get().draft.billingMatchesDelivery === checked) return false
      set((state) => ({ draft: { ...state.draft, billingMatchesDelivery: checked } }))
      return true
    },
    setPaymentField: (fieldId, value) => {
      const state = get()
      const nextValue = fieldId === 'cardNumber' ? formatForms6CardNumber(value) : value
      if (state.draft.payment[fieldId] === nextValue) return false
      set((current) => ({
        draft: {
          ...current.draft,
          payment: { ...current.draft.payment, [fieldId]: nextValue },
        },
      }))
      return true
    },
    selectShipping: (shippingId) => {
      const state = get()
      if (!state.shippingOptions.some((option) => option.id === shippingId) || state.draft.shippingId === shippingId) {
        return false
      }
      set((current) => ({ draft: { ...current.draft, shippingId } }))
      return true
    },
    requestPay: () => null,
    requestBackToCart: () => ({ kind: 'back-to-cart' }),
  }))
}
