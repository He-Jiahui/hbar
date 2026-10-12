'use client'

import * as React from 'react'
import { LockKeyhole } from 'lucide-react'
import { LumenCheckBox, LumenFormField, LumenInput, LumenSelect } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-6-reference.css'

export type LumenForms6AddressId = 'delivery' | 'billing'
export type LumenForms6AddressFieldId = 'fullName' | 'street' | 'apartment' | 'city' | 'postalCode'
export type LumenForms6PaymentFieldId = 'cardNumber' | 'expiry' | 'cvc'

export interface LumenForms6Choice {
  readonly id: string
  readonly label: string
}

export type LumenForms6RegionContent =
  | {
      readonly kind: 'select'
      readonly label: string
      readonly placeholder: string
      readonly value: string
      readonly options: readonly LumenForms6Choice[]
    }
  | {
      readonly kind: 'text'
      readonly label: string
      readonly placeholder: string
      readonly value: string
    }

export interface LumenForms6AddressContent {
  readonly fields: {
    readonly fullName: string
    readonly street: string
    readonly apartment: string
    readonly countryId: string
    readonly city: string
    readonly regionValue: string
    readonly postalCode: string
  }
  readonly selectedCountryId: string
  readonly countries: readonly LumenForms6Choice[]
  readonly region: LumenForms6RegionContent
}

export interface LumenForms6CartLine {
  readonly id: string
  readonly name: string
  readonly quantity: number
  readonly unitPriceCents: number
  readonly lineTotalCents: number
  readonly quantityDetail: string
  readonly formattedUnitPrice: string
  readonly formattedLineTotal: string
}

export interface LumenForms6ShippingOption {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly priceCents: number
  readonly formattedPrice: string
}

export interface LumenForms6Copy {
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
}

export interface LumenForms6Content {
  readonly copy: LumenForms6Copy
  readonly email: string
  readonly delivery: LumenForms6AddressContent
  readonly billing: LumenForms6AddressContent
  readonly billingMatchesDelivery: boolean
  readonly payment: {
    readonly cardNumber: string
    readonly expiry: string
    readonly cvc: string
  }
  readonly cartLines: readonly LumenForms6CartLine[]
  readonly shipping: {
    readonly selectedId: string
    readonly options: readonly LumenForms6ShippingOption[]
  }
  readonly summary: {
    readonly subtotalLabel: string
    readonly shippingValue: string
    readonly taxValue: string
    readonly totalValue: string
  }
  readonly backToCartLabel: string
  readonly completeRequiredFields: string
  readonly payButtonLabel: string
  readonly payDisabled: boolean
  readonly listStrategy: { readonly kind: 'content-grown' }
}

export interface LumenForms6ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms6Content
  readonly onEmailChange: (value: string) => void
  readonly onAddressFieldChange: (
    addressId: LumenForms6AddressId,
    fieldId: LumenForms6AddressFieldId,
    value: string,
  ) => void
  readonly onCountryChange: (addressId: LumenForms6AddressId, countryId: string) => void
  readonly onRegionChange: (addressId: LumenForms6AddressId, regionValue: string) => void
  readonly onBillingMatchesDeliveryChange: (checked: boolean) => void
  readonly onPaymentFieldChange: (fieldId: LumenForms6PaymentFieldId, value: string) => void
  readonly onShippingChange: (shippingId: string) => void
  readonly onBackToCart: () => void
  readonly onPay: () => void
}

function fieldId(instanceId: string, addressId: LumenForms6AddressId, name: string): string {
  return `${instanceId}-${addressId}-${name}`
}

function TextField({
  id,
  label,
  value,
  placeholder,
  type = 'text',
  inputMode,
  hint,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly type?: React.HTMLInputTypeAttribute
  readonly inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  readonly hint?: string
  readonly onChange: (value: string) => void
}) {
  return (
    <LumenFormField className="lumen-forms-6-field" controlId={id} label={label} hint={hint}>
      <LumenInput
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        variant="boxed"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </LumenFormField>
  )
}

function SelectField({
  id,
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly options: readonly LumenForms6Choice[]
  readonly onChange: (value: string) => void
}) {
  return (
    <LumenFormField className="lumen-forms-6-field" controlId={id} label={label}>
      <LumenSelect id={id} value={value} variant="boxed" onChange={(event) => onChange(event.currentTarget.value)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </LumenSelect>
    </LumenFormField>
  )
}

function AddressFields({
  instanceId,
  addressId,
  address,
  copy,
  onAddressFieldChange,
  onCountryChange,
  onRegionChange,
}: {
  readonly instanceId: string
  readonly addressId: LumenForms6AddressId
  readonly address: LumenForms6AddressContent
  readonly copy: LumenForms6Copy
  readonly onAddressFieldChange: LumenForms6ReferenceProps['onAddressFieldChange']
  readonly onCountryChange: LumenForms6ReferenceProps['onCountryChange']
  readonly onRegionChange: LumenForms6ReferenceProps['onRegionChange']
}) {
  const regionId = fieldId(instanceId, addressId, 'region')
  const postalCodeId = fieldId(instanceId, addressId, 'postal-code')

  return (
    <div className="lumen-forms-6-address-fields">
      <TextField
        id={fieldId(instanceId, addressId, 'full-name')}
        label={copy.fullNameLabel}
        value={address.fields.fullName}
        placeholder={copy.fullNamePlaceholder}
        onChange={(value) => onAddressFieldChange(addressId, 'fullName', value)}
      />
      <TextField
        id={fieldId(instanceId, addressId, 'street')}
        label={copy.streetLabel}
        value={address.fields.street}
        placeholder={copy.streetPlaceholder}
        onChange={(value) => onAddressFieldChange(addressId, 'street', value)}
      />
      <TextField
        id={fieldId(instanceId, addressId, 'apartment')}
        label={copy.apartmentLabel}
        value={address.fields.apartment}
        placeholder={copy.apartmentPlaceholder}
        onChange={(value) => onAddressFieldChange(addressId, 'apartment', value)}
      />

      <div className="lumen-forms-6-field-row">
        <SelectField
          id={fieldId(instanceId, addressId, 'country')}
          label={copy.countryLabel}
          value={address.selectedCountryId}
          options={address.countries}
          onChange={(value) => onCountryChange(addressId, value)}
        />
        <TextField
          id={fieldId(instanceId, addressId, 'city')}
          label={copy.cityLabel}
          value={address.fields.city}
          placeholder={copy.cityPlaceholder}
          onChange={(value) => onAddressFieldChange(addressId, 'city', value)}
        />
      </div>

      <div className="lumen-forms-6-field-row">
        {address.region.kind === 'select' ? (
          <SelectField
            id={regionId}
            label={address.region.label}
            value={address.region.value}
            placeholder={address.region.placeholder}
            options={address.region.options}
            onChange={(value) => onRegionChange(addressId, value)}
          />
        ) : (
          <TextField
            id={regionId}
            label={address.region.label}
            value={address.region.value}
            placeholder={address.region.placeholder}
            onChange={(value) => onRegionChange(addressId, value)}
          />
        )}
        <TextField
          id={postalCodeId}
          label={copy.postalCodeLabel}
          value={address.fields.postalCode}
          placeholder={copy.postalCodePlaceholder}
          hint={copy.postalCodeHelper}
          onChange={(value) => onAddressFieldChange(addressId, 'postalCode', value)}
        />
      </div>
    </div>
  )
}

function AddressSection({
  instanceId,
  addressId,
  address,
  heading,
  description,
  copy,
  onAddressFieldChange,
  onCountryChange,
  onRegionChange,
}: {
  readonly instanceId: string
  readonly addressId: LumenForms6AddressId
  readonly address: LumenForms6AddressContent
  readonly heading: string
  readonly description: string
  readonly copy: LumenForms6Copy
  readonly onAddressFieldChange: LumenForms6ReferenceProps['onAddressFieldChange']
  readonly onCountryChange: LumenForms6ReferenceProps['onCountryChange']
  readonly onRegionChange: LumenForms6ReferenceProps['onRegionChange']
}) {
  const headingId = fieldId(instanceId, addressId, 'heading')

  return (
    <section className="lumen-forms-6-address-section">
      <div className="lumen-forms-6-section-heading">
        <h3 id={headingId}>{heading}</h3>
        <p>{description}</p>
      </div>
      <AddressFields
        instanceId={instanceId}
        addressId={addressId}
        address={address}
        copy={copy}
        onAddressFieldChange={onAddressFieldChange}
        onCountryChange={onCountryChange}
        onRegionChange={onRegionChange}
      />
    </section>
  )
}

function OrderSummary({
  instanceId,
  content,
  onShippingChange,
}: {
  readonly instanceId: string
  readonly content: LumenForms6Content
  readonly onShippingChange: LumenForms6ReferenceProps['onShippingChange']
}) {
  return (
    <aside className="lumen-forms-6-summary" data-hbar-app-ui-region="order-summary">
      <h3>{content.copy.orderSummaryHeading}</h3>
      {content.cartLines.length > 0 ? (
        <ul className="lumen-forms-6-cart-lines" data-hbar-app-ui-list-strategy="content-grown">
          {content.cartLines.map((line) => (
            <li className="lumen-forms-6-cart-line" key={line.id}>
              <div className="lumen-forms-6-cart-copy">
                <span className="lumen-forms-6-cart-name">{line.name}</span>
                <span className="lumen-forms-6-cart-quantity">{line.quantityDetail}</span>
              </div>
              <span className="lumen-forms-6-money">{line.formattedLineTotal}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lumen-forms-6-empty-cart">{content.copy.emptyCartLabel}</p>
      )}

      <div className="lumen-forms-6-shipping">
        <p className="lumen-forms-6-shipping-label">{content.copy.shippingLegend}</p>
        <div className="lumen-forms-6-shipping-options">
          {content.shipping.options.map((option) => (
            <label
              className="lumen-forms-6-shipping-option"
              data-selected={option.id === content.shipping.selectedId}
              key={option.id}
            >
              <input
                type="radio"
                name={`${instanceId}-shipping`}
                value={option.id}
                checked={option.id === content.shipping.selectedId}
                onChange={() => onShippingChange(option.id)}
              />
              <span className="lumen-forms-6-shipping-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </span>
              <span className="lumen-forms-6-money">{option.formattedPrice}</span>
            </label>
          ))}
        </div>
      </div>

      <dl className="lumen-forms-6-totals">
        <div>
          <dt>{content.copy.subtotalLabel}</dt>
          <dd>{content.summary.subtotalLabel}</dd>
        </div>
        <div>
          <dt>{content.copy.shippingLabel}</dt>
          <dd>{content.summary.shippingValue}</dd>
        </div>
        <div>
          <dt>{content.copy.taxLabel}</dt>
          <dd>{content.summary.taxValue}</dd>
        </div>
        <div className="lumen-forms-6-total">
          <dt>{content.copy.totalLabel}</dt>
          <dd>{content.summary.totalValue}</dd>
        </div>
      </dl>
    </aside>
  )
}

export function LumenForms6Reference({
  instanceId,
  content,
  onEmailChange,
  onAddressFieldChange,
  onCountryChange,
  onRegionChange,
  onBillingMatchesDeliveryChange,
  onPaymentFieldChange,
  onShippingChange,
  onBackToCart,
  onPay,
}: LumenForms6ReferenceProps): React.ReactElement {
  const copy = content.copy
  const checkboxId = `${instanceId}-billing-matches-delivery`

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-6-surface"
      contentClassName="lumen-forms-6-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-6"
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
    >
      <div className="lumen-forms-6-heading" data-hbar-app-ui-region="checkout-heading">
        <div className="lumen-forms-6-heading-copy">
          <h2>{copy.pageTitle}</h2>
          <p>{copy.pageDescription}</p>
        </div>
        <span className="lumen-forms-6-secure">
          <LockKeyhole className="lumen-forms-6-icon lumen-forms-6-icon-sm" aria-hidden="true" />
          <span>{copy.secureLabel}</span>
        </span>
      </div>

      <div className="lumen-forms-6-main" data-hbar-app-ui-region="checkout-main">
        <div className="lumen-forms-6-form-column">
          <section className="lumen-forms-6-address-section">
            <div className="lumen-forms-6-section-heading">
              <h3>{copy.deliveryHeading}</h3>
              <p>{copy.deliveryDescription}</p>
            </div>
            <div className="lumen-forms-6-address-fields">
              <TextField
                id={`${instanceId}-email`}
                type="email"
                label={copy.emailLabel}
                value={content.email}
                placeholder={copy.emailPlaceholder}
                onChange={onEmailChange}
              />
              <AddressFields
                instanceId={instanceId}
                addressId="delivery"
                address={content.delivery}
                copy={copy}
                onAddressFieldChange={onAddressFieldChange}
                onCountryChange={onCountryChange}
                onRegionChange={onRegionChange}
              />
            </div>
          </section>

          <LumenCheckBox
            id={checkboxId}
            className="lumen-forms-6-billing-match"
            size="m"
            label={copy.billingMatchesDeliveryLabel}
            checked={content.billingMatchesDelivery}
            onChange={(event) => onBillingMatchesDeliveryChange(event.currentTarget.checked)}
          />

          {content.billingMatchesDelivery ? null : (
            <AddressSection
              instanceId={instanceId}
              addressId="billing"
              address={content.billing}
              heading={copy.billingHeading}
              description={copy.billingDescription}
              copy={copy}
              onAddressFieldChange={onAddressFieldChange}
              onCountryChange={onCountryChange}
              onRegionChange={onRegionChange}
            />
          )}

          <section className="lumen-forms-6-payment-section" data-hbar-app-ui-region="payment">
            <div className="lumen-forms-6-section-heading">
              <h3>{copy.paymentHeading}</h3>
              <p>{copy.paymentDescription}</p>
            </div>
            <div className="lumen-forms-6-payment-fields">
              <TextField
                id={`${instanceId}-payment-card-number`}
                label={copy.cardNumberLabel}
                value={content.payment.cardNumber}
                placeholder={copy.cardNumberPlaceholder}
                inputMode="numeric"
                onChange={(value) => onPaymentFieldChange('cardNumber', value)}
              />
              <div className="lumen-forms-6-field-row">
                <TextField
                  id={`${instanceId}-payment-expiry`}
                  label={copy.expiryLabel}
                  value={content.payment.expiry}
                  placeholder={copy.expiryPlaceholder}
                  inputMode="numeric"
                  onChange={(value) => onPaymentFieldChange('expiry', value)}
                />
                <TextField
                  id={`${instanceId}-payment-cvc`}
                  label={copy.cvcLabel}
                  value={content.payment.cvc}
                  placeholder={copy.cvcPlaceholder}
                  inputMode="numeric"
                  onChange={(value) => onPaymentFieldChange('cvc', value)}
                />
              </div>
            </div>
          </section>
        </div>

        <OrderSummary instanceId={instanceId} content={content} onShippingChange={onShippingChange} />
      </div>

      <div className="lumen-forms-6-footer" data-hbar-app-ui-region="checkout-footer">
        <LumenButton
          type="button"
          variant="outlined"
          size="m"
          indicator="none"
          className="lumen-forms-6-back-button"
          onClick={onBackToCart}
        >
          {content.backToCartLabel}
        </LumenButton>
        <div className="lumen-forms-6-footer-actions">
          <p>{content.completeRequiredFields}</p>
          <LumenButton
            type="button"
            variant="solid"
            size="m"
            indicator="none"
            disabled={content.payDisabled}
            onClick={onPay}
          >
            {content.payButtonLabel}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}

export type LumenForms6ViewModel = Omit<LumenForms6ReferenceProps, 'instanceId'>
