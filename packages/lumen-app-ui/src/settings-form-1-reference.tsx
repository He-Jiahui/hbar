'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput, LumenSelect, LumenTextarea, LumenToggleControl } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './settings-form-1-reference.css'

export interface LumenSettingsForm1Choice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

interface LumenSettingsForm1FieldBase {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly changed?: boolean | undefined
  readonly error?: string | undefined
  readonly note?: string | undefined
}

export type LumenSettingsForm1Field =
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'text'
      readonly value: string
      readonly inputMode?: 'text' | 'url' | undefined
    })
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'text-prefix'
      readonly value: string
      readonly prefix: string
      readonly inputMode?: 'text' | 'url' | undefined
    })
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'textarea'
      readonly value: string
      readonly maxLength?: number | undefined
    })
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'select'
      readonly value: string
      readonly options: readonly LumenSettingsForm1Choice[]
    })
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'switch'
      readonly value: boolean
    })
  | (LumenSettingsForm1FieldBase & {
      readonly kind: 'checkbox'
      readonly value: boolean
    })

export type LumenSettingsForm1Value = string | boolean

export interface LumenSettingsForm1FieldGroup {
  readonly id: string
  readonly label?: string | undefined
  readonly description?: string | undefined
  readonly fields: readonly LumenSettingsForm1Field[]
}

export interface LumenSettingsForm1Section {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly description: string
  readonly groups: readonly LumenSettingsForm1FieldGroup[]
}

export type LumenSettingsForm1SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'
export type LumenSettingsForm1Feedback = 'none' | 'saved' | 'cancelled' | 'save-failed'

export interface LumenSettingsForm1Content {
  readonly pageTitle: string
  readonly workspaceLabel: string
  readonly sectionNavigationLabel: string
  readonly changedLabel: string
  readonly unavailableChoiceLabel: string
  readonly emptySectionLabel: string
  readonly formatCharacterCount: (current: number, maximum: number) => string
  readonly statusLabels: Readonly<Record<LumenSettingsForm1SaveState, string>>
  readonly feedbackMessages: Readonly<Record<LumenSettingsForm1Feedback, string>>
  readonly cancelLabel: string
  readonly saveLabel: string
  readonly expectedMaximumFields: number
  readonly sections: readonly LumenSettingsForm1Section[]
  readonly selectedSectionId: string | undefined
}

export interface LumenSettingsForm1Props {
  readonly instanceId: string
  readonly content: LumenSettingsForm1Content
  readonly saveState: LumenSettingsForm1SaveState
  readonly statusMessage?: string | undefined
  readonly onSelectSection: (sectionId: string) => void
  readonly onFieldChange: (fieldId: string, value: LumenSettingsForm1Value) => void
  readonly onSave: () => void
  readonly onCancel: () => void
}

export type LumenSettingsForm1ViewModel = Omit<LumenSettingsForm1Props, 'instanceId'>

export function uniqueLumenSettingsForm1Sections(
  sections: readonly LumenSettingsForm1Section[],
): readonly LumenSettingsForm1Section[] {
  const seen = new Set<string>()
  return sections.filter((section) => {
    if (seen.has(section.id)) return false
    seen.add(section.id)
    return true
  })
}

function uniqueFields(fields: readonly LumenSettingsForm1Field[]) {
  const seen = new Set<string>()
  return fields.filter((field) => {
    if (seen.has(field.id)) return false
    seen.add(field.id)
    return true
  })
}

function SettingsForm1FieldRow({
  field,
  instanceId,
  content,
  onChange,
}: {
  readonly field: LumenSettingsForm1Field
  readonly instanceId: string
  readonly content: LumenSettingsForm1Content
  readonly onChange: (fieldId: string, value: LumenSettingsForm1Value) => void
}) {
  const controlId = `${instanceId}-${field.id}`
  const descriptionId = field.description ? `${controlId}-description` : undefined
  const messageId = field.error ? `${controlId}-error` : field.note ? `${controlId}-note` : undefined
  const describedBy = [descriptionId, messageId].filter((value): value is string => Boolean(value)).join(' ')
  const commonProps = {
    id: controlId,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': field.error ? true : undefined,
  }
  const onTextChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange(field.id, event.currentTarget.value)

  let control: React.ReactNode
  switch (field.kind) {
    case 'select': {
      const hasCurrentValue = field.options.some((option) => option.id === field.value)
      control = (
        <LumenSelect
          {...commonProps}
          onChange={onTextChange}
          value={field.value}
          variant="boxed"
          className="lumen-settings-form-1-control"
        >
          {!hasCurrentValue ? (
            <option value={field.value} disabled>
              {content.unavailableChoiceLabel}
            </option>
          ) : null}
          {field.options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </LumenSelect>
      )
      break
    }
    case 'textarea':
      control = (
        <LumenTextarea
          {...commonProps}
          onChange={onTextChange}
          variant="boxed"
          value={field.value}
          maxLength={field.maxLength}
          className="lumen-settings-form-1-control lumen-settings-form-1-textarea"
        />
      )
      break
    case 'text-prefix':
      control = (
        <span className="lumen-settings-form-1-prefix-control">
          <span>{field.prefix}</span>
          <LumenInput
            {...commonProps}
            onChange={onTextChange}
            variant="boxed"
            inputMode={field.inputMode}
            value={field.value}
            className="lumen-settings-form-1-control"
          />
        </span>
      )
      break
    case 'text':
      control = (
        <LumenInput
          {...commonProps}
          onChange={onTextChange}
          variant="boxed"
          inputMode={field.inputMode}
          value={field.value}
          className="lumen-settings-form-1-control"
        />
      )
      break
    case 'switch':
      control = (
        <LumenToggleControl
          {...commonProps}
          checked={field.value}
          value=""
          className="lumen-settings-form-1-boolean-control"
          onChange={(event) => onChange(field.id, event.currentTarget.checked)}
        />
      )
      break
    case 'checkbox':
      control = (
        <LumenCheckBoxControl
          {...commonProps}
          checked={field.value}
          value=""
          className="lumen-settings-form-1-boolean-control"
          onChange={(event) => onChange(field.id, event.currentTarget.checked)}
        />
      )
      break
  }

  return (
    <div className="lumen-settings-form-1-field-row" data-hbar-app-ui-region="setting-field">
      <div className="lumen-settings-form-1-field-copy">
        <div className="lumen-settings-form-1-field-heading">
          <label htmlFor={controlId}>{field.label}</label>
          {field.changed ? <span className="lumen-settings-form-1-changed">{content.changedLabel}</span> : null}
        </div>
        {field.description ? <p id={descriptionId}>{field.description}</p> : null}
      </div>
      <div className="lumen-settings-form-1-field-control">
        {control}
        {field.error ? (
          <small className="lumen-settings-form-1-error" id={`${controlId}-error`}>
            {field.error}
          </small>
        ) : field.note ? (
          <small id={`${controlId}-note`}>{field.note}</small>
        ) : null}
        {field.kind === 'textarea' && field.maxLength !== undefined ? (
          <output className="lumen-settings-form-1-count">
            {content.formatCharacterCount(field.value.length, field.maxLength)}
          </output>
        ) : null}
      </div>
    </div>
  )
}

export function LumenSettingsForm1Reference({
  instanceId,
  content,
  saveState,
  statusMessage,
  onSelectSection,
  onFieldChange,
  onSave,
  onCancel,
}: LumenSettingsForm1Props): React.ReactElement {
  const sections = uniqueLumenSettingsForm1Sections(content.sections)
  const selectedSection = sections.find((section) => section.id === content.selectedSectionId)
  const groups = selectedSection?.groups.map((group) => ({ ...group, fields: uniqueFields(group.fields) })) ?? []
  const fields = groups.flatMap((group) => group.fields)
  const busy = saveState === 'saving'
  const clean = saveState === 'clean' || saveState === 'saved'
  const error = saveState === 'error'

  return (
    <LumenSurface
      as="div"
      className="lumen-settings-form-1-reference-surface"
      contentClassName="lumen-settings-form-1-reference"
      data-hbar-app-ui-component="hbar-app-ui-settings-form-1"
    >
      <div className="lumen-settings-form-1-workspace-shell">
        <aside className="lumen-settings-form-1-sidebar">
          <header className="lumen-settings-form-1-page-heading" data-hbar-app-ui-region="page-heading">
            <h2>{content.pageTitle}</h2>
            <p>{content.workspaceLabel}</p>
          </header>
          <nav
            className="lumen-settings-form-1-section-nav"
            aria-label={content.sectionNavigationLabel}
            data-hbar-app-ui-region="section-navigation"
            data-hbar-app-ui-list-strategy="content-grown"
            data-hbar-app-ui-expected-maximum={sections.length}
          >
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={selectedSection?.id === section.id ? 'page' : undefined}
                onClick={() => onSelectSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>
        <nav
          className="lumen-settings-form-1-mobile-nav"
          aria-label={content.sectionNavigationLabel}
          data-hbar-app-ui-region="section-navigation"
          data-hbar-app-ui-list-strategy="content-grown"
          data-hbar-app-ui-expected-maximum={sections.length}
        >
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              aria-current={selectedSection?.id === section.id ? 'page' : undefined}
              onClick={() => onSelectSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </nav>
        <div className="lumen-settings-form-1-main">
          <div className="lumen-settings-form-1-workspace">
            {selectedSection ? (
              <div className="lumen-settings-form-1-panel">
                <div className="lumen-settings-form-1-panel-heading" data-hbar-app-ui-region="section-heading">
                  <h3 id={`${instanceId}-section-title`}>{selectedSection.title}</h3>
                  <p>{selectedSection.description}</p>
                </div>
                <div
                  className="lumen-settings-form-1-fields"
                  data-hbar-app-ui-list-strategy="content-grown"
                  data-hbar-app-ui-expected-maximum={content.expectedMaximumFields}
                >
                  {groups.map((group) => (
                    <div className="lumen-settings-form-1-field-group" key={group.id}>
                      {group.label ? <h3>{group.label}</h3> : null}
                      {group.description ? <p>{group.description}</p> : null}
                      {group.fields.map((field) => (
                        <SettingsForm1FieldRow
                          key={field.id}
                          field={field}
                          instanceId={instanceId}
                          content={content}
                          onChange={onFieldChange}
                        />
                      ))}
                    </div>
                  ))}
                  {fields.length === 0 ? (
                    <p className="lumen-settings-form-1-empty">{content.emptySectionLabel}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="lumen-settings-form-1-empty" role="status">
                {content.emptySectionLabel}
              </p>
            )}
            <div
              className="lumen-settings-form-1-save-bar"
              data-hbar-app-ui-region="save-bar"
              data-hbar-app-ui-state={saveState}
              aria-live="polite"
            >
              <div className="lumen-settings-form-1-status">
                <p>{content.statusLabels[saveState]}</p>
                {statusMessage ? (
                  <span className={error ? 'is-error' : ''} role={error ? 'alert' : 'status'}>
                    {statusMessage}
                  </span>
                ) : null}
              </div>
              <div className="lumen-settings-form-1-actions">
                <LumenButton
                  type="button"
                  variant="outlined"
                  indicator="none"
                  className="lumen-settings-form-1-cancel-button"
                  disabled={busy || clean}
                  onClick={onCancel}
                >
                  {content.cancelLabel}
                </LumenButton>
                <LumenButton
                  type="button"
                  tone="primary"
                  indicator="none"
                  className="lumen-settings-form-1-save-button"
                  loading={busy}
                  disabled={clean}
                  data-hbar-app-ui-action="save-settings"
                  onClick={() => {
                    if (!busy && !clean) onSave()
                  }}
                >
                  {content.saveLabel}
                </LumenButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LumenSurface>
  )
}
