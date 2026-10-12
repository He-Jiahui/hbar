'use client'

import * as React from 'react'
import {
  Barcode,
  CalendarDays,
  Check,
  Clock3,
  Gauge,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  UserRound,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { LumenInput, LumenSelect } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-4-reference.css'

export type LumenForms4TextPropertyId = 'assetTag' | 'model' | 'site' | 'bayLocation' | 'custodian'
export type LumenForms4DatePropertyId = 'warrantyEnds' | 'lastServiced'
export type LumenForms4ChoicePropertyId = 'condition' | 'serviceInterval'
export type LumenForms4PropertyId = LumenForms4TextPropertyId | LumenForms4DatePropertyId | LumenForms4ChoicePropertyId
export type LumenForms4PropertyIcon =
  | 'asset-tag'
  | 'model'
  | 'site'
  | 'bay-location'
  | 'condition'
  | 'custodian'
  | 'warranty'
  | 'last-serviced'
  | 'service-interval'

export interface LumenForms4Choice {
  readonly id: string
  readonly label: string
}

interface LumenForms4PropertyBase<Id extends LumenForms4PropertyId> {
  readonly id: Id
  readonly label: string
  readonly valueLabel: string
  readonly icon: LumenForms4PropertyIcon
}

export interface LumenForms4TextProperty extends LumenForms4PropertyBase<LumenForms4TextPropertyId> {
  readonly kind: 'text'
  readonly value: string
}

export interface LumenForms4DateProperty extends LumenForms4PropertyBase<LumenForms4DatePropertyId> {
  readonly kind: 'date'
  readonly value: string
}

export interface LumenForms4ChoiceProperty extends LumenForms4PropertyBase<LumenForms4ChoicePropertyId> {
  readonly kind: 'choice'
  readonly value: string
  readonly choices: readonly LumenForms4Choice[]
}

export type LumenForms4Property = LumenForms4TextProperty | LumenForms4DateProperty | LumenForms4ChoiceProperty

export interface LumenForms4Editing {
  readonly propertyId: LumenForms4PropertyId
  readonly value: string
}

export interface LumenForms4SaveRequest extends LumenForms4Editing {}

export interface LumenForms4Badge {
  readonly label: string
  readonly tone: 'neutral' | 'danger'
}

export interface LumenForms4Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly badges: readonly LumenForms4Badge[]
  readonly addNoteLabel: string
  readonly editPropertyLabel: (propertyLabel: string) => string
  readonly savePropertyLabel: (propertyLabel: string) => string
  readonly cancelLabel: string
  readonly conditionTrackingLabel: string
  readonly telemetryEnabledLabel: string
  readonly manualChecksLabel: string
  readonly nextServiceDueLabel: string
  readonly calculatedLabel: string
}

export interface LumenForms4Content {
  readonly copy: LumenForms4Copy
  readonly properties: readonly LumenForms4Property[]
  readonly editing: LumenForms4Editing | null
  readonly conditionTrackingEnabled: boolean
  readonly conditionTrackingValue: string
  readonly nextServiceDue: { readonly value: string; readonly calculatedLabel: string }
  readonly listStrategy: { readonly kind: 'content-grown'; readonly sourcePropertyCount: 9 }
}

export interface LumenForms4ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms4Content
  readonly onBeginEdit: (propertyId: LumenForms4PropertyId) => void
  readonly onEditValueChange: (value: string) => void
  readonly onCancelEdit: () => void
  readonly onSaveProperty: (request: LumenForms4SaveRequest) => void
  readonly onAddNote: () => void
  readonly onConditionTrackingChange: (enabled: boolean) => void
}

export type LumenForms4ViewModel = Omit<LumenForms4ReferenceProps, 'instanceId'>

const propertyIcons: Readonly<Record<LumenForms4PropertyIcon, LucideIcon>> = {
  'asset-tag': Barcode,
  model: Wrench,
  site: Warehouse,
  'bay-location': MapPin,
  condition: Gauge,
  custodian: UserRound,
  warranty: ShieldCheck,
  'last-serviced': Clock3,
  'service-interval': Gauge,
}

function isDateProperty(property: LumenForms4Property): property is Extract<LumenForms4Property, { kind: 'date' }> {
  return property.kind === 'date'
}

function isChoiceProperty(property: LumenForms4Property): property is Extract<LumenForms4Property, { kind: 'choice' }> {
  return property.kind === 'choice'
}

function renderEditor(
  instanceId: string,
  property: LumenForms4Property,
  value: string,
  copy: LumenForms4Copy,
  onChange: (value: string) => void,
  onCancel: () => void,
  onSave: (request: LumenForms4SaveRequest) => void,
) {
  const controlId = `${instanceId}-${property.id}-editor`
  const propertyLabel = property.label
  const actions = (
    <span className="lumen-forms-4-editor-actions">
      <LumenButton
        type="button"
        variant="outlined"
        size="s"
        indicator="none"
        className="lumen-forms-4-editor-action"
        aria-label={copy.savePropertyLabel(propertyLabel)}
        onClick={() => onSave({ propertyId: property.id, value })}
      >
        <Check className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
        <span>{copy.savePropertyLabel(propertyLabel)}</span>
      </LumenButton>
      <LumenButton
        type="button"
        variant="text"
        size="s"
        indicator="none"
        className="lumen-forms-4-editor-action"
        aria-label={copy.cancelLabel}
        onClick={onCancel}
      >
        <X className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
        <span>{copy.cancelLabel}</span>
      </LumenButton>
    </span>
  )

  let control: React.ReactNode
  if (isChoiceProperty(property)) {
    control = (
      <LumenSelect
        id={controlId}
        aria-label={propertyLabel}
        size="s"
        variant="plain"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {property.choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </LumenSelect>
    )
  } else {
    const inputType = isDateProperty(property) ? 'date' : 'text'
    control = (
      <LumenInput
        id={controlId}
        aria-label={propertyLabel}
        autoComplete="off"
        size="s"
        variant="plain"
        type={inputType}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    )
  }

  return (
    <div className="lumen-forms-4-editor">
      <span className="lumen-forms-4-editor-control">{control}</span>
      {actions}
    </div>
  )
}

export function LumenForms4Reference({
  instanceId,
  content,
  onBeginEdit,
  onEditValueChange,
  onCancelEdit,
  onSaveProperty,
  onAddNote,
  onConditionTrackingChange,
}: LumenForms4ReferenceProps) {
  const { copy } = content
  return (
    <LumenSurface className="lumen-forms-4-surface" material="solid" data-hbar-app-ui-component="hbar-app-ui-forms-4">
      <div className="lumen-forms-4-reference">
        <div className="lumen-forms-4-heading">
          <div className="lumen-forms-4-heading-copy">
            <div className="lumen-forms-4-title-line">
              <h2>{copy.pageTitle}</h2>
              <span className="lumen-forms-4-badges">
                {copy.badges.map((badge, index) => (
                  <span key={`${badge.tone}-${index}`} className="lumen-forms-4-badge" data-tone={badge.tone}>
                    {badge.label}
                  </span>
                ))}
              </span>
            </div>
            <p>{copy.pageDescription}</p>
          </div>
          <LumenButton
            type="button"
            variant="outlined"
            size="s"
            indicator="none"
            className="lumen-forms-4-add-note"
            onClick={onAddNote}
          >
            <Plus className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
            <span>{copy.addNoteLabel}</span>
          </LumenButton>
        </div>

        <div className="lumen-forms-4-property-list">
          {content.properties.map((property) => {
            const Icon = propertyIcons[property.icon]
            const editing = content.editing?.propertyId === property.id ? content.editing : null
            return (
              <div className="lumen-forms-4-property-row" key={property.id}>
                {editing ? (
                  <React.Fragment>
                    <div className="lumen-forms-4-property-identity">
                      <Icon className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
                      <span>{property.label}</span>
                    </div>
                    {renderEditor(
                      instanceId,
                      property,
                      editing.value,
                      copy,
                      onEditValueChange,
                      onCancelEdit,
                      onSaveProperty,
                    )}
                  </React.Fragment>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    className="lumen-forms-4-property-trigger"
                    aria-label={copy.editPropertyLabel(property.label)}
                    onClick={() => onBeginEdit(property.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onBeginEdit(property.id)
                      }
                    }}
                  >
                    <span className="lumen-forms-4-property-identity">
                      <Icon className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
                      <span>{property.label}</span>
                    </span>
                    <span className="lumen-forms-4-property-value">{property.valueLabel}</span>
                    <Pencil
                      className="lumen-forms-4-icon lumen-forms-4-icon-sm lumen-forms-4-edit-icon"
                      aria-hidden="true"
                    />
                  </div>
                )}
              </div>
            )
          })}

          <div className="lumen-forms-4-property-row lumen-forms-4-condition-row">
            <span className="lumen-forms-4-property-identity">
              <Gauge className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
              <span>{copy.conditionTrackingLabel}</span>
            </span>
            <span className="lumen-forms-4-property-value">{content.conditionTrackingValue}</span>
            <button
              type="button"
              role="switch"
              className="lumen-forms-4-switch"
              aria-label={copy.conditionTrackingLabel}
              aria-checked={content.conditionTrackingEnabled}
              onClick={() => onConditionTrackingChange(!content.conditionTrackingEnabled)}
            >
              <span className="lumen-forms-4-switch-track" aria-hidden="true">
                <span className="lumen-forms-4-switch-thumb" />
              </span>
            </button>
          </div>

          <div className="lumen-forms-4-property-row lumen-forms-4-calculated-row">
            <span className="lumen-forms-4-property-identity">
              <CalendarDays className="lumen-forms-4-icon lumen-forms-4-icon-sm" aria-hidden="true" />
              <span>{copy.nextServiceDueLabel}</span>
            </span>
            <span className="lumen-forms-4-property-value">{content.nextServiceDue.value}</span>
            <span className="lumen-forms-4-calculated">{content.nextServiceDue.calculatedLabel}</span>
          </div>
        </div>
      </div>
    </LumenSurface>
  )
}
