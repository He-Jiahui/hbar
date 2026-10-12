'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenSelect } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './settings-form-3-reference.css'

export type LumenSettingsForm3Theme = 'system' | 'light' | 'dark'
export type LumenSettingsForm3Density = 'comfortable' | 'cozy' | 'compact'
export type LumenSettingsForm3Language = 'en' | 'de' | 'fr' | 'ja'

export interface LumenSettingsForm3Option<Id extends string> {
  readonly id: Id
  readonly label: string
  readonly disabled?: boolean | undefined
}

interface LumenSettingsForm3FieldBase {
  readonly label: string
  readonly description: string
  readonly changed: boolean
}

export interface LumenSettingsForm3ChoiceField<Id extends string> extends LumenSettingsForm3FieldBase {
  readonly value: Id
  readonly options: readonly LumenSettingsForm3Option<Id>[]
}

export interface LumenSettingsForm3SwitchField extends LumenSettingsForm3FieldBase {
  readonly value: boolean
  readonly recommendedLabel?: string | undefined
}

export interface LumenSettingsForm3CheckboxField extends LumenSettingsForm3FieldBase {
  readonly value: boolean
}

export interface LumenSettingsForm3Content {
  readonly pageTitle: string
  readonly panelTitle: string
  readonly panelDescription: string
  readonly changedLabel: string
  readonly recommendedLabel: string
  readonly fields: {
    readonly theme: LumenSettingsForm3ChoiceField<LumenSettingsForm3Theme> & {
      readonly deviceLabel: string
    }
    readonly density: LumenSettingsForm3ChoiceField<LumenSettingsForm3Density> & {
      readonly recommendedLabel?: string | undefined
    }
    readonly language: LumenSettingsForm3ChoiceField<LumenSettingsForm3Language>
    readonly weeklySummary: LumenSettingsForm3SwitchField
    readonly mentions: LumenSettingsForm3SwitchField
    readonly commentReplies: LumenSettingsForm3SwitchField
    readonly notificationSounds: LumenSettingsForm3CheckboxField
  }
  readonly footer: {
    readonly statusText: string
    readonly cancelLabel: string
    readonly saveLabel: string
    readonly savingLabel: string
  }
}

export type LumenSettingsForm3PreferenceChange =
  | { readonly fieldId: 'theme'; readonly value: LumenSettingsForm3Theme }
  | { readonly fieldId: 'density'; readonly value: LumenSettingsForm3Density }
  | { readonly fieldId: 'language'; readonly value: LumenSettingsForm3Language }
  | { readonly fieldId: 'weeklySummary'; readonly value: boolean }
  | { readonly fieldId: 'mentions'; readonly value: boolean }
  | { readonly fieldId: 'commentReplies'; readonly value: boolean }
  | { readonly fieldId: 'notificationSounds'; readonly value: boolean }

export type LumenSettingsForm3SaveState = 'clean' | 'dirty' | 'saving' | 'saved'

export interface LumenSettingsForm3Props {
  readonly instanceId: string
  readonly content: LumenSettingsForm3Content
  readonly saveState: LumenSettingsForm3SaveState
  readonly onPreferenceChange: (change: LumenSettingsForm3PreferenceChange) => void
  readonly onSave: () => void
  readonly onCancel: () => void
}

export type LumenSettingsForm3ViewModel = Omit<LumenSettingsForm3Props, 'instanceId'>

function SettingsForm3SwitchRow({
  field,
  fieldId,
  controlId,
  changedLabel,
  onChange,
}: {
  readonly field: LumenSettingsForm3SwitchField
  readonly fieldId: 'weeklySummary' | 'mentions' | 'commentReplies'
  readonly controlId: string
  readonly changedLabel: string
  readonly onChange: (fieldId: 'weeklySummary' | 'mentions' | 'commentReplies', value: boolean) => void
}) {
  const labelId = `${controlId}-label`
  const descriptionId = `${controlId}-description`

  return (
    <div
      className="lumen-settings-form-3-row lumen-settings-form-3-switch-row"
      data-hbar-app-ui-region="preference-field"
    >
      <div className="lumen-settings-form-3-copy">
        <div className="lumen-settings-form-3-heading">
          <span id={labelId}>{field.label}</span>
          {field.recommendedLabel ? (
            <span className="lumen-settings-form-3-badge">{field.recommendedLabel}</span>
          ) : null}
          {field.changed ? <span className="lumen-settings-form-3-changed">{changedLabel}</span> : null}
        </div>
        <p id={descriptionId}>{field.description}</p>
      </div>
      <button
        id={controlId}
        type="button"
        role="switch"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-checked={field.value}
        value=""
        className="lumen-settings-form-3-switch"
        onClick={() => onChange(fieldId, !field.value)}
      >
        <span className="lumen-settings-form-3-switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}

export function LumenSettingsForm3Reference({
  instanceId,
  content,
  saveState,
  onPreferenceChange,
  onSave,
  onCancel,
}: LumenSettingsForm3Props): React.ReactElement {
  const busy = saveState === 'saving'
  const clean = saveState === 'clean' || saveState === 'saved'
  const themeGroupId = `${instanceId}-theme-options`
  const themeLabelId = `${instanceId}-theme-label`
  const themeDescriptionId = `${instanceId}-theme-description`
  const densityId = `${instanceId}-density`
  const densityDescriptionId = `${densityId}-description`
  const languageId = `${instanceId}-language`
  const languageDescriptionId = `${languageId}-description`
  const soundsId = `${instanceId}-notification-sounds`
  const soundsLabelId = `${soundsId}-label`
  const soundsDescriptionId = `${soundsId}-description`

  return (
    <LumenSurface
      as="div"
      className="lumen-settings-form-3-surface"
      contentClassName="lumen-settings-form-3-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-settings-form-3"
    >
      <div className="lumen-settings-form-3-page">
        <header className="lumen-settings-form-3-page-heading" data-hbar-app-ui-region="page-heading">
          <h2>{content.pageTitle}</h2>
        </header>
        <div className="lumen-settings-form-3-panel">
          <div className="lumen-settings-form-3-panel-heading" data-hbar-app-ui-region="panel-heading">
            <h3>{content.panelTitle}</h3>
            <p>{content.panelDescription}</p>
          </div>
          <div
            className="lumen-settings-form-3-fields"
            data-hbar-app-ui-list-strategy="content-grown"
            data-hbar-app-ui-region="preference-fields"
          >
            <div
              className="lumen-settings-form-3-row lumen-settings-form-3-theme-row"
              data-hbar-app-ui-region="preference-field"
            >
              <div className="lumen-settings-form-3-copy">
                <div className="lumen-settings-form-3-heading">
                  <span id={themeLabelId}>{content.fields.theme.label}</span>
                  <span className="lumen-settings-form-3-badge">{content.fields.theme.deviceLabel}</span>
                  {content.fields.theme.changed ? (
                    <span className="lumen-settings-form-3-changed">{content.changedLabel}</span>
                  ) : null}
                </div>
                <p id={themeDescriptionId}>{content.fields.theme.description}</p>
              </div>
              <div
                id={themeGroupId}
                className="lumen-settings-form-3-theme-options"
                role="radiogroup"
                aria-labelledby={themeLabelId}
                aria-describedby={themeDescriptionId}
              >
                {content.fields.theme.options.map((option) => {
                  return (
                    <label className="lumen-settings-form-3-theme-option" key={option.id}>
                      <input
                        type="radio"
                        name={themeGroupId}
                        value={option.id}
                        checked={content.fields.theme.value === option.id}
                        disabled={option.disabled}
                        onChange={(event) => {
                          if (event.currentTarget.checked) {
                            onPreferenceChange({ fieldId: 'theme', value: option.id })
                          }
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div
              className="lumen-settings-form-3-row lumen-settings-form-3-select-row"
              data-hbar-app-ui-region="preference-field"
            >
              <div className="lumen-settings-form-3-copy">
                <div className="lumen-settings-form-3-heading">
                  <label htmlFor={densityId}>{content.fields.density.label}</label>
                  {content.fields.density.recommendedLabel ? (
                    <span className="lumen-settings-form-3-badge">{content.fields.density.recommendedLabel}</span>
                  ) : null}
                  {content.fields.density.changed ? (
                    <span className="lumen-settings-form-3-changed">{content.changedLabel}</span>
                  ) : null}
                </div>
                <p id={densityDescriptionId}>{content.fields.density.description}</p>
              </div>
              <LumenSelect
                id={densityId}
                value={content.fields.density.value}
                aria-describedby={densityDescriptionId}
                variant="boxed"
                className="lumen-settings-form-3-select"
                onChange={(event) => {
                  const option = content.fields.density.options.find(
                    (candidate) => candidate.id === event.currentTarget.value,
                  )
                  if (option) {
                    onPreferenceChange({ fieldId: 'density', value: option.id })
                  }
                }}
              >
                {content.fields.density.options.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </LumenSelect>
            </div>

            <div
              className="lumen-settings-form-3-row lumen-settings-form-3-select-row"
              data-hbar-app-ui-region="preference-field"
            >
              <div className="lumen-settings-form-3-copy">
                <div className="lumen-settings-form-3-heading">
                  <label htmlFor={languageId}>{content.fields.language.label}</label>
                  {content.fields.language.changed ? (
                    <span className="lumen-settings-form-3-changed">{content.changedLabel}</span>
                  ) : null}
                </div>
                <p id={languageDescriptionId}>{content.fields.language.description}</p>
              </div>
              <LumenSelect
                id={languageId}
                value={content.fields.language.value}
                aria-describedby={languageDescriptionId}
                variant="boxed"
                className="lumen-settings-form-3-select"
                onChange={(event) => {
                  const option = content.fields.language.options.find(
                    (candidate) => candidate.id === event.currentTarget.value,
                  )
                  if (option) {
                    onPreferenceChange({ fieldId: 'language', value: option.id })
                  }
                }}
              >
                {content.fields.language.options.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </LumenSelect>
            </div>

            <SettingsForm3SwitchRow
              field={content.fields.weeklySummary}
              fieldId="weeklySummary"
              controlId={`${instanceId}-weekly-summary`}
              changedLabel={content.changedLabel}
              onChange={(fieldId, value) => onPreferenceChange({ fieldId, value })}
            />
            <SettingsForm3SwitchRow
              field={content.fields.mentions}
              fieldId="mentions"
              controlId={`${instanceId}-mentions`}
              changedLabel={content.changedLabel}
              onChange={(fieldId, value) => onPreferenceChange({ fieldId, value })}
            />
            <SettingsForm3SwitchRow
              field={content.fields.commentReplies}
              fieldId="commentReplies"
              controlId={`${instanceId}-comment-replies`}
              changedLabel={content.changedLabel}
              onChange={(fieldId, value) => onPreferenceChange({ fieldId, value })}
            />

            <div className="lumen-settings-form-3-checkbox-row" data-hbar-app-ui-region="preference-field">
              <LumenCheckBoxControl
                id={soundsId}
                checked={content.fields.notificationSounds.value}
                aria-labelledby={`${soundsLabelId} ${soundsDescriptionId}`}
                aria-describedby={soundsDescriptionId}
                onChange={(event) =>
                  onPreferenceChange({
                    fieldId: 'notificationSounds',
                    value: event.currentTarget.checked,
                  })
                }
              />
              <span className="lumen-settings-form-3-copy">
                <span className="lumen-settings-form-3-heading">
                  <span id={soundsLabelId}>{content.fields.notificationSounds.label}</span>
                  {content.fields.notificationSounds.changed ? (
                    <span className="lumen-settings-form-3-changed">{content.changedLabel}</span>
                  ) : null}
                </span>
                <span id={soundsDescriptionId}>{content.fields.notificationSounds.description}</span>
              </span>
            </div>
          </div>
          <div
            className="lumen-settings-form-3-footer"
            data-hbar-app-ui-region="save-bar"
            data-hbar-app-ui-state={saveState}
            aria-live="polite"
          >
            <p className="lumen-settings-form-3-status">{content.footer.statusText}</p>
            <div className="lumen-settings-form-3-actions">
              <LumenButton
                type="button"
                variant="outlined"
                indicator="none"
                className="lumen-settings-form-3-cancel"
                disabled={busy || clean}
                onClick={onCancel}
              >
                {content.footer.cancelLabel}
              </LumenButton>
              <LumenButton
                type="button"
                tone="primary"
                indicator="none"
                loading={busy}
                disabled={busy || clean}
                className="lumen-settings-form-3-save"
                data-hbar-app-ui-action="save-preferences"
                onClick={() => {
                  if (!busy && !clean) {
                    onSave()
                  }
                }}
              >
                {busy ? content.footer.savingLabel : content.footer.saveLabel}
              </LumenButton>
            </div>
          </div>
        </div>
      </div>
    </LumenSurface>
  )
}
