'use client'

import * as React from 'react'
import { Upload } from 'lucide-react'
import { LumenInput, LumenTextarea } from './forms'
import { LumenButton } from './primitives'
import './settings-form-2-reference.css'

export type LumenSettingsForm2FieldId = 'fullName' | 'title' | 'username' | 'email' | 'bio'

export type LumenSettingsForm2PhotoMimeType = 'image/png' | 'image/jpeg' | 'image/gif'

export interface LumenSettingsForm2TextField {
  readonly label: string
  readonly description: string
  readonly value: string
  readonly changed?: boolean | undefined
  readonly error?: string | undefined
  readonly note?: string | undefined
}

export interface LumenSettingsForm2UsernameField extends LumenSettingsForm2TextField {
  readonly prefix: string
}

export interface LumenSettingsForm2BioField extends LumenSettingsForm2TextField {
  readonly maximumCharacters: number
}

export interface LumenSettingsForm2Content {
  readonly pageTitle: string
  readonly accountTitle: string
  readonly accountDescription: string
  readonly photoLabel: string
  readonly photoDescription: string
  readonly uploadPhotoAccessibleName: string
  readonly changePhotoLabel: string
  readonly photoInitials: string
  readonly changedLabel: string
  readonly countCharacters: (current: number, maximum: number) => string
  readonly unsavedMessage: string
  readonly cancelLabel: string
  readonly saveLabel: string
  readonly photoMimeTypes: readonly LumenSettingsForm2PhotoMimeType[]
  readonly fields: {
    readonly fullName: LumenSettingsForm2TextField
    readonly title: LumenSettingsForm2TextField
    readonly username: LumenSettingsForm2UsernameField
    readonly email: LumenSettingsForm2TextField
    readonly bio: LumenSettingsForm2BioField
  }
  readonly saveDisabled: boolean
}

export interface LumenSettingsForm2ReferenceProps {
  readonly instanceId: string
  readonly content: LumenSettingsForm2Content
  readonly onFieldChange: (fieldId: LumenSettingsForm2FieldId, value: string) => void
  readonly onPhotoSelected: (file: File) => void
  readonly onCancel: () => void
  readonly onSave: () => void
}

export type LumenSettingsForm2ViewModel = Omit<LumenSettingsForm2ReferenceProps, 'instanceId'>

function SettingsForm2Field({
  controlId,
  fieldId,
  field,
  changedLabel,
  onChange,
}: {
  readonly controlId: string
  readonly fieldId: Exclude<LumenSettingsForm2FieldId, 'bio'>
  readonly field: LumenSettingsForm2TextField | LumenSettingsForm2UsernameField
  readonly changedLabel: string
  readonly onChange: (fieldId: LumenSettingsForm2FieldId, value: string) => void
}) {
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const noteId = `${controlId}-note`
  const describedBy = [field.error ? errorId : undefined, hintId, field.note ? noteId : undefined]
    .filter(Boolean)
    .join(' ')
  const isUsername = 'prefix' in field

  return (
    <div className="lumen-settings-form-2-field" data-hbar-app-ui-region="profile-field">
      <div className="lumen-settings-form-2-field-copy">
        <div className="lumen-settings-form-2-field-heading">
          <label htmlFor={controlId}>{field.label}</label>
          {field.changed ? <span className="lumen-settings-form-2-changed">{changedLabel}</span> : null}
        </div>
        <p id={hintId}>{field.description}</p>
      </div>
      <div className="lumen-settings-form-2-field-control">
        {isUsername ? (
          <span className="lumen-settings-form-2-prefix-control">
            <span>{field.prefix}</span>
            <LumenInput
              id={controlId}
              value={field.value}
              aria-describedby={describedBy}
              aria-invalid={field.error ? true : undefined}
              variant="boxed"
              className="lumen-settings-form-2-control"
              onChange={(event) => onChange(fieldId, event.currentTarget.value)}
            />
          </span>
        ) : (
          <LumenInput
            id={controlId}
            value={field.value}
            type={fieldId === 'email' ? 'email' : undefined}
            aria-describedby={describedBy}
            aria-invalid={field.error ? true : undefined}
            variant="boxed"
            className="lumen-settings-form-2-control"
            onChange={(event) => onChange(fieldId, event.currentTarget.value)}
          />
        )}
        {field.error ? (
          <small className="lumen-settings-form-2-error" id={errorId} role="alert">
            {field.error}
          </small>
        ) : null}
        {field.note ? <p id={noteId}>{field.note}</p> : null}
      </div>
    </div>
  )
}

export function LumenSettingsForm2Reference({
  instanceId,
  content,
  onFieldChange,
  onPhotoSelected,
  onCancel,
  onSave,
}: LumenSettingsForm2ReferenceProps): React.ReactElement {
  const photoInput = React.useRef<HTMLInputElement>(null)
  const bioId = `${instanceId}-bio`
  const bioHintId = `${bioId}-hint`
  const bioErrorId = `${bioId}-error`
  const bioCountId = `${bioId}-count`
  const bioDescribedBy = [
    content.fields.bio.error ? bioErrorId : undefined,
    bioHintId,
    content.fields.bio.error ? undefined : bioCountId,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="lumen-settings-form-2-reference" data-hbar-app-ui-component="hbar-app-ui-settings-form-2">
      <div className="lumen-settings-form-2-page">
        <header className="lumen-settings-form-2-page-heading">
          <h2>{content.pageTitle}</h2>
        </header>
        <div className="lumen-settings-form-2-form">
          <div className="lumen-settings-form-2-card">
            <div className="lumen-settings-form-2-card-heading">
              <h3 id={`${instanceId}-account-title`}>{content.accountTitle}</h3>
              <p>{content.accountDescription}</p>
            </div>
            <div className="lumen-settings-form-2-fields" data-hbar-app-ui-list-strategy="content-grown">
              <div className="lumen-settings-form-2-photo-row" data-hbar-app-ui-region="profile-photo">
                <div className="lumen-settings-form-2-field-copy">
                  <p>{content.photoLabel}</p>
                  <p>{content.photoDescription}</p>
                </div>
                <div className="lumen-settings-form-2-photo-actions">
                  <span className="lumen-settings-form-2-avatar" aria-hidden="true">
                    {content.photoInitials}
                  </span>
                  <input
                    ref={photoInput}
                    className="lumen-settings-form-2-file-input"
                    type="file"
                    accept={content.photoMimeTypes.join(',')}
                    aria-label={content.uploadPhotoAccessibleName}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.item(0)
                      if (file) {
                        onPhotoSelected(file)
                      }
                    }}
                  />
                  <LumenButton
                    type="button"
                    variant="outlined"
                    size="s"
                    indicator="none"
                    className="lumen-settings-form-2-change-photo"
                    onClick={() => photoInput.current?.click()}
                  >
                    <Upload className="lumen-settings-form-2-upload-icon" aria-hidden="true" />
                    {content.changePhotoLabel}
                  </LumenButton>
                </div>
              </div>
              <SettingsForm2Field
                controlId={`${instanceId}-full-name`}
                fieldId="fullName"
                field={content.fields.fullName}
                changedLabel={content.changedLabel}
                onChange={onFieldChange}
              />
              <SettingsForm2Field
                controlId={`${instanceId}-title`}
                fieldId="title"
                field={content.fields.title}
                changedLabel={content.changedLabel}
                onChange={onFieldChange}
              />
              <SettingsForm2Field
                controlId={`${instanceId}-username`}
                fieldId="username"
                field={content.fields.username}
                changedLabel={content.changedLabel}
                onChange={onFieldChange}
              />
              <SettingsForm2Field
                controlId={`${instanceId}-email`}
                fieldId="email"
                field={content.fields.email}
                changedLabel={content.changedLabel}
                onChange={onFieldChange}
              />
              <div
                className="lumen-settings-form-2-field lumen-settings-form-2-bio-field"
                data-hbar-app-ui-region="profile-field"
              >
                <div className="lumen-settings-form-2-field-copy">
                  <div className="lumen-settings-form-2-field-heading">
                    <label htmlFor={bioId}>{content.fields.bio.label}</label>
                    {content.fields.bio.changed ? (
                      <span className="lumen-settings-form-2-changed">{content.changedLabel}</span>
                    ) : null}
                  </div>
                  <p id={bioHintId}>{content.fields.bio.description}</p>
                </div>
                <div className="lumen-settings-form-2-field-control">
                  <LumenTextarea
                    id={bioId}
                    value={content.fields.bio.value}
                    aria-describedby={bioDescribedBy}
                    aria-invalid={content.fields.bio.error ? true : undefined}
                    variant="boxed"
                    className="lumen-settings-form-2-control lumen-settings-form-2-bio-control"
                    onChange={(event) => onFieldChange('bio', event.currentTarget.value)}
                  />
                  {content.fields.bio.error ? (
                    <small className="lumen-settings-form-2-error" id={bioErrorId} role="alert">
                      {content.fields.bio.error}
                    </small>
                  ) : null}
                  {content.fields.bio.error ? null : (
                    <p className="lumen-settings-form-2-count" id={bioCountId}>
                      {content.countCharacters(content.fields.bio.value.length, content.fields.bio.maximumCharacters)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="lumen-settings-form-2-footer" data-hbar-app-ui-region="profile-actions">
              <p className="lumen-settings-form-2-status">
                <span aria-hidden="true" />
                {content.unsavedMessage}
              </p>
              <div className="lumen-settings-form-2-actions">
                <LumenButton
                  type="button"
                  variant="outlined"
                  size="s"
                  indicator="none"
                  className="lumen-settings-form-2-cancel"
                  onClick={onCancel}
                >
                  {content.cancelLabel}
                </LumenButton>
                <LumenButton
                  type="button"
                  tone="primary"
                  size="s"
                  indicator="none"
                  disabled={content.saveDisabled}
                  className="lumen-settings-form-2-save"
                  onClick={onSave}
                >
                  {content.saveLabel}
                </LumenButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
