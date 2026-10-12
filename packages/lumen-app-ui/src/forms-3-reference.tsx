'use client'

import * as React from 'react'
import { Building2, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { LumenInput } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-3-reference.css'

export type LumenForms3TextFieldId = 'bookingReference' | 'taxIdentifier' | 'bookingContact'
export type LumenForms3DateFieldId = 'pickupDate' | 'deliveryDate'
export type LumenForms3ChoiceFieldId = 'accountId' | 'incotermId' | 'serviceLevelId' | 'currencyId'
export type LumenForms3LineTextFieldId = 'quantity' | 'unitRate'
export type LumenForms3LineChoiceFieldId = 'descriptionId' | 'dutyRateId'

export interface LumenForms3Choice {
  readonly id: string
  readonly label: string
}

export interface LumenForms3DutyChoice extends LumenForms3Choice {
  readonly basisPoints: number
}

export interface LumenForms3CurrencyChoice extends LumenForms3Choice {
  readonly code: string
}

export interface LumenForms3Copy {
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
}

export interface LumenForms3LineContent {
  readonly id: string
  readonly descriptionId: string | null
  readonly descriptionLabel: string
  readonly descriptionChoices: readonly LumenForms3Choice[]
  readonly quantity: string
  readonly unitRate: string
  readonly dutyRateId: string | null
  readonly dutyRateLabel: string
  readonly dutyRateChoices: readonly LumenForms3DutyChoice[]
  readonly amountLabel: string
}

export interface LumenForms3Content {
  readonly copy: LumenForms3Copy
  readonly account: { readonly selectedId: string; readonly choices: readonly LumenForms3Choice[] }
  readonly bookingReference: { readonly label: string; readonly value: string }
  readonly taxIdentifier: { readonly label: string; readonly value: string }
  readonly bookingContact: { readonly label: string; readonly value: string }
  readonly pickupDate: { readonly label: string; readonly value: string }
  readonly deliveryDate: { readonly label: string; readonly value: string }
  readonly incoterm: {
    readonly selectedId: string
    readonly choices: readonly LumenForms3Choice[]
  }
  readonly serviceLevel: {
    readonly selectedId: string
    readonly choices: readonly LumenForms3Choice[]
  }
  readonly currency: {
    readonly selectedId: string
    readonly code: string
    readonly choices: readonly LumenForms3CurrencyChoice[]
  }
  readonly cargo: {
    readonly lineCountLabel: string
    readonly lines: readonly LumenForms3LineContent[]
    readonly subtotalLabel: string
    readonly dutyTotalLabel: string
    readonly grandTotalLabel: string
    readonly bookShipmentDisabled: true
  }
}

export interface LumenForms3ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms3Content
  readonly onTextChange: (fieldId: LumenForms3TextFieldId, value: string) => void
  readonly onDateChange: (fieldId: LumenForms3DateFieldId, value: string) => void
  readonly onChoiceChange: (fieldId: LumenForms3ChoiceFieldId, choiceId: string) => void
  readonly onLineTextChange: (lineId: string, fieldId: LumenForms3LineTextFieldId, value: string) => void
  readonly onLineChoiceChange: (lineId: string, fieldId: LumenForms3LineChoiceFieldId, choiceId: string) => void
  readonly onAddLine: () => void
  readonly onRemoveLine: (lineId: string) => void
  readonly onSaveDraft: () => void
  readonly onBookShipment: () => void
}

function ChoiceCombobox({
  id,
  label,
  selectedId,
  choices,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly selectedId: string | null
  readonly choices: readonly LumenForms3Choice[]
  readonly onChange: (choiceId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = choices.find((choice) => choice.id === selectedId)

  return (
    <div
      className="lumen-forms-3-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <LumenButton
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        variant="outlined"
        size="s"
        indicator="none"
        className="lumen-forms-3-combobox-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          if (event.key === 'ArrowDown' && !open) setOpen(true)
        }}
      >
        <span>{selected?.label ?? ''}</span>
        <ChevronDown className="lumen-forms-3-icon lumen-forms-3-icon-xs" aria-hidden="true" strokeWidth={1.8} />
      </LumenButton>
      {open ? (
        <div className="lumen-forms-3-combobox-options" id={`${id}-options`} role="listbox" aria-label={label}>
          {choices.map((choice) => (
            <LumenButton
              key={choice.id}
              type="button"
              role="option"
              aria-selected={choice.id === selectedId}
              variant="text"
              size="s"
              indicator="none"
              onClick={() => {
                onChange(choice.id)
                setOpen(false)
              }}
            >
              {choice.label}
            </LumenButton>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  prefixIcon,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly prefixIcon?: boolean
}) {
  return (
    <div className="lumen-forms-3-field">
      <label htmlFor={id}>{label}</label>
      {prefixIcon ? (
        <div className="lumen-forms-3-prefixed-field">
          <Building2 className="lumen-forms-3-icon lumen-forms-3-icon-sm" aria-hidden="true" strokeWidth={1.8} />
          <LumenInput
            id={id}
            autoComplete="off"
            value={value}
            variant="plain"
            onChange={(event) => onChange(event.currentTarget.value)}
          />
        </div>
      ) : (
        <LumenInput
          id={id}
          autoComplete="off"
          value={value}
          variant="boxed"
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </div>
  )
}

function DateField({
  id,
  label,
  value,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="lumen-forms-3-field">
      <label htmlFor={id}>{label}</label>
      <LumenInput
        id={id}
        type="date"
        value={value}
        variant="boxed"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}

export function LumenForms3Reference({
  instanceId,
  content,
  onTextChange,
  onDateChange,
  onChoiceChange,
  onLineTextChange,
  onLineChoiceChange,
  onAddLine,
  onRemoveLine,
  onSaveDraft,
  onBookShipment,
}: LumenForms3ReferenceProps): React.ReactElement {
  const ids = {
    account: `${instanceId}-account`,
    bookingReference: `${instanceId}-booking-reference`,
    taxIdentifier: `${instanceId}-tax-identifier`,
    bookingContact: `${instanceId}-booking-contact`,
    pickupDate: `${instanceId}-pickup-date`,
    deliveryDate: `${instanceId}-delivery-date`,
    incoterm: `${instanceId}-incoterm`,
    serviceLevel: `${instanceId}-service-level`,
    currency: `${instanceId}-currency`,
  }

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-3-surface"
      contentClassName="lumen-forms-3-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-3"
      data-hbar-app-ui-list-strategy="content-grown"
    >
      <div className="lumen-forms-3-page-heading" data-hbar-app-ui-region="booking-heading">
        <div className="lumen-forms-3-page-heading-copy">
          <h2>{content.copy.pageTitle}</h2>
          <p>{content.copy.pageDescription}</p>
        </div>
        <span className="lumen-forms-3-badge">{content.copy.draftBadge}</span>
      </div>

      <section className="lumen-forms-3-panel" data-hbar-app-ui-region="consignor">
        <div className="lumen-forms-3-panel-heading">
          <div>
            <h3>{content.copy.consignorHeading}</h3>
            <p>{content.copy.consignorDescription}</p>
          </div>
          <span className="lumen-forms-3-badge">{content.copy.consignorBadge}</span>
        </div>
        <div className="lumen-forms-3-fields">
          <div className="lumen-forms-3-field">
            <label htmlFor={ids.account}>{content.copy.accountLabel}</label>
            <ChoiceCombobox
              id={ids.account}
              label={content.copy.accountLabel}
              selectedId={content.account.selectedId}
              choices={content.account.choices}
              onChange={(choiceId) => onChoiceChange('accountId', choiceId)}
            />
          </div>
          <TextField
            id={ids.bookingReference}
            label={content.bookingReference.label}
            value={content.bookingReference.value}
            onChange={(value) => onTextChange('bookingReference', value)}
          />
          <TextField
            id={ids.taxIdentifier}
            label={content.taxIdentifier.label}
            value={content.taxIdentifier.value}
            prefixIcon
            onChange={(value) => onTextChange('taxIdentifier', value)}
          />
          <TextField
            id={ids.bookingContact}
            label={content.bookingContact.label}
            value={content.bookingContact.value}
            onChange={(value) => onTextChange('bookingContact', value)}
          />
        </div>
      </section>

      <section className="lumen-forms-3-panel" data-hbar-app-ui-region="route-and-terms">
        <div className="lumen-forms-3-panel-heading">
          <div>
            <h3>{content.copy.routeHeading}</h3>
            <p>{content.copy.routeDescription}</p>
          </div>
          <span className="lumen-forms-3-badge">{content.copy.routeBadge}</span>
        </div>
        <div className="lumen-forms-3-fields">
          <DateField
            id={ids.pickupDate}
            label={content.pickupDate.label}
            value={content.pickupDate.value}
            onChange={(value) => onDateChange('pickupDate', value)}
          />
          <DateField
            id={ids.deliveryDate}
            label={content.deliveryDate.label}
            value={content.deliveryDate.value}
            onChange={(value) => onDateChange('deliveryDate', value)}
          />
          <div className="lumen-forms-3-field">
            <label htmlFor={ids.incoterm}>{content.copy.incotermLabel}</label>
            <ChoiceCombobox
              id={ids.incoterm}
              label={content.copy.incotermLabel}
              selectedId={content.incoterm.selectedId}
              choices={content.incoterm.choices}
              onChange={(choiceId) => onChoiceChange('incotermId', choiceId)}
            />
          </div>
          <div className="lumen-forms-3-field">
            <label htmlFor={ids.serviceLevel}>{content.copy.serviceLevelLabel}</label>
            <ChoiceCombobox
              id={ids.serviceLevel}
              label={content.copy.serviceLevelLabel}
              selectedId={content.serviceLevel.selectedId}
              choices={content.serviceLevel.choices}
              onChange={(choiceId) => onChoiceChange('serviceLevelId', choiceId)}
            />
          </div>
          <div className="lumen-forms-3-field">
            <label htmlFor={ids.currency}>{content.copy.currencyLabel}</label>
            <ChoiceCombobox
              id={ids.currency}
              label={content.copy.currencyLabel}
              selectedId={content.currency.selectedId}
              choices={content.currency.choices}
              onChange={(choiceId) => onChoiceChange('currencyId', choiceId)}
            />
          </div>
        </div>
      </section>

      <section className="lumen-forms-3-panel lumen-forms-3-cargo-panel" data-hbar-app-ui-region="cargo-lines">
        <div className="lumen-forms-3-panel-heading">
          <div>
            <h3>{content.copy.cargoHeading}</h3>
            <p>{content.copy.cargoDescription}</p>
          </div>
          <span className="lumen-forms-3-badge">{content.cargo.lineCountLabel}</span>
        </div>
        <div className="lumen-forms-3-cargo-scroll" data-hbar-app-ui-scroll-owner="cargo-lines-horizontal">
          <div className="lumen-forms-3-line-grid lumen-forms-3-line-heading">
            <span className="lumen-forms-3-line-description">{content.copy.descriptionColumnLabel}</span>
            <span className="lumen-forms-3-line-quantity">{content.copy.quantityColumnLabel}</span>
            <span className="lumen-forms-3-line-unit-rate">{content.copy.unitRateColumnLabel}</span>
            <span className="lumen-forms-3-line-duty">{content.copy.dutyColumnLabel}</span>
            <span className="lumen-forms-3-line-amount">{content.copy.amountColumnLabel}</span>
            <span className="lumen-forms-3-line-actions">{content.copy.actionsColumnLabel}</span>
          </div>
          <div className="lumen-forms-3-line-list" data-hbar-app-ui-region="cargo-line-items">
            {content.cargo.lines.map((line) => {
              const lineIds = {
                description: `${instanceId}-${line.id}-description`,
                quantity: `${instanceId}-${line.id}-quantity`,
                unitRate: `${instanceId}-${line.id}-unit-rate`,
                duty: `${instanceId}-${line.id}-duty`,
              }
              return (
                <div className="lumen-forms-3-line-grid lumen-forms-3-line-row" key={line.id}>
                  <div className="lumen-forms-3-line-description">
                    <ChoiceCombobox
                      id={lineIds.description}
                      label={content.copy.descriptionChoiceLabel}
                      selectedId={line.descriptionId}
                      choices={line.descriptionChoices}
                      onChange={(choiceId) => onLineChoiceChange(line.id, 'descriptionId', choiceId)}
                    />
                  </div>
                  <div className="lumen-forms-3-line-quantity">
                    <LumenInput
                      id={lineIds.quantity}
                      aria-label={content.copy.quantityLabel}
                      autoComplete="off"
                      inputMode="decimal"
                      value={line.quantity}
                      variant="boxed"
                      onChange={(event) => onLineTextChange(line.id, 'quantity', event.currentTarget.value)}
                    />
                  </div>
                  <div className="lumen-forms-3-line-unit-rate">
                    <LumenInput
                      id={lineIds.unitRate}
                      aria-label={content.copy.unitRateLabel}
                      autoComplete="off"
                      inputMode="decimal"
                      value={line.unitRate}
                      variant="boxed"
                      onChange={(event) => onLineTextChange(line.id, 'unitRate', event.currentTarget.value)}
                    />
                  </div>
                  <div className="lumen-forms-3-line-duty">
                    <ChoiceCombobox
                      id={lineIds.duty}
                      label={content.copy.dutyRateLabel}
                      selectedId={line.dutyRateId}
                      choices={line.dutyRateChoices}
                      onChange={(choiceId) => onLineChoiceChange(line.id, 'dutyRateId', choiceId)}
                    />
                  </div>
                  <span className="lumen-forms-3-line-amount">{line.amountLabel}</span>
                  <div className="lumen-forms-3-line-actions">
                    <LumenButton
                      type="button"
                      variant="text"
                      size="s"
                      indicator="none"
                      aria-label={content.copy.removeLineLabel}
                      className="lumen-forms-3-remove-line"
                      onClick={() => onRemoveLine(line.id)}
                    >
                      <Trash2
                        className="lumen-forms-3-icon lumen-forms-3-icon-xs"
                        aria-hidden="true"
                        strokeWidth={1.8}
                      />
                    </LumenButton>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="lumen-forms-3-cargo-bottom">
          <LumenButton type="button" variant="outlined" size="s" indicator="none" onClick={onAddLine}>
            <Plus className="lumen-forms-3-icon lumen-forms-3-icon-sm" aria-hidden="true" strokeWidth={1.8} />
            <span>{content.copy.addLineLabel}</span>
          </LumenButton>
          <div className="lumen-forms-3-totals" aria-label={content.copy.grandTotalLabel}>
            <div className="lumen-forms-3-total-row">
              <span>{content.copy.subtotalLabel}</span>
              <span>{content.cargo.subtotalLabel}</span>
            </div>
            <div className="lumen-forms-3-total-row">
              <span>{content.copy.dutyTotalLabel}</span>
              <span>{content.cargo.dutyTotalLabel}</span>
            </div>
            <div className="lumen-forms-3-total-row lumen-forms-3-grand-total">
              <span>{content.copy.grandTotalLabel}</span>
              <span>{content.cargo.grandTotalLabel}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="lumen-forms-3-footer" data-hbar-app-ui-region="booking-footer">
        <p>{content.copy.footerNote}</p>
        <div className="lumen-forms-3-footer-actions">
          <LumenButton type="button" variant="outlined" size="s" indicator="none" onClick={onSaveDraft}>
            {content.copy.saveDraftLabel}
          </LumenButton>
          <LumenButton
            type="button"
            size="s"
            indicator="none"
            disabled={content.cargo.bookShipmentDisabled}
            onClick={onBookShipment}
          >
            {content.copy.bookShipmentLabel}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}

export type LumenForms3ViewModel = Omit<LumenForms3ReferenceProps, 'instanceId'>
