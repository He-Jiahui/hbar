'use client'

import * as React from 'react'
import { ChevronDown, CircleHelp, Hash, Ship, X } from 'lucide-react'
import { LumenInput, LumenToggleControl } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-1-reference.css'

export type LumenFormsForm1TextFieldId = 'surveyTitle' | 'stationCode' | 'vessel'
export type LumenFormsForm1DateFieldId = 'deployment' | 'recovery'

export interface LumenFormsForm1Choice {
  readonly id: string
  readonly label: string
}

export interface LumenFormsForm1Field {
  readonly label: string
  readonly value: string
  readonly helper?: string | undefined
}

export interface LumenFormsForm1Copy {
  readonly pageTitle: string
  readonly description: string
  readonly progressLabel: string
  readonly surveyTitleLabel: string
  readonly stationCodeLabel: string
  readonly stationCodeHelp: string
  readonly vesselLabel: string
  readonly deploymentLabel: string
  readonly deploymentHelp: string
  readonly recoveryLabel: string
  readonly dailyStartLabel: string
  readonly methodsLabel: string
  readonly methodInputLabel: string
  readonly methodInputPlaceholder: string
  readonly suggestedLabel: string
  readonly leadCrewLabel: string
  readonly dataReleaseLabel: string
  readonly embargoLabel: string
  readonly photoLabel: string
  readonly photoRemoveLabel: string
  readonly cleanMessage: string
  readonly dirtyMessage: string
  readonly revertLabel: string
  readonly saveLabel: string
  readonly savedLabel: string
}

export interface LumenFormsForm1Content {
  readonly copy: LumenFormsForm1Copy
  readonly surveyTitle: LumenFormsForm1Field
  readonly stationCode: LumenFormsForm1Field
  readonly vessel: LumenFormsForm1Field
  readonly deployment: LumenFormsForm1Field
  readonly recovery: LumenFormsForm1Field
  readonly dailyStart: LumenFormsForm1Field
  readonly completion: {
    readonly percent: number
    readonly label: string
  }
  readonly methods: {
    readonly label: string
    readonly inputLabel: string
    readonly inputPlaceholder: string
    readonly query: string
    readonly selected: readonly {
      readonly id: string
      readonly label: string
      readonly removeLabel: string
    }[]
    readonly suggestionsLabel: string
    readonly suggestions: readonly LumenFormsForm1Choice[]
  }
  readonly leadCrew: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly LumenFormsForm1Choice[]
  }
  readonly dataRelease: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly LumenFormsForm1Choice[]
  }
  readonly embargo: {
    readonly rowLabel: string
    readonly label: string
    readonly checked: boolean
  }
  readonly stationPhoto: {
    readonly label: string
    readonly initials: string | undefined
    readonly removeLabel: string
  }
  readonly footer: {
    readonly message: string
    readonly dirty: boolean
    readonly revertLabel: string
    readonly saveButtonLabel: string
  }
}

export interface LumenFormsForm1Props {
  readonly instanceId: string
  readonly content: LumenFormsForm1Content
  readonly onTextChange: (fieldId: LumenFormsForm1TextFieldId, value: string) => void
  readonly onDateChange: (fieldId: LumenFormsForm1DateFieldId, value: string) => void
  readonly onDailyStartChange: (value: string) => void
  readonly onMethodQueryChange: (value: string) => void
  readonly onMethodAdd: (methodId: string) => void
  readonly onMethodRemove: (methodId: string) => void
  readonly onLeadCrewChange: (choiceId: string) => void
  readonly onDataReleaseChange: (choiceId: string) => void
  readonly onEmbargoChange: (checked: boolean) => void
  readonly onPhotoRemove: () => void
  readonly onRevert: () => void
  readonly onSavePlan: () => void
}

function FieldRow({
  id,
  label,
  helper,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly helper?: string | undefined
  readonly children: React.ReactNode
}) {
  return (
    <div className="lumen-forms-form-1-row">
      <label className="lumen-forms-form-1-row-label" htmlFor={id} id={`${id}-label`}>
        <span className="lumen-forms-form-1-row-label-main">
          {label}
          {helper ? (
            <span className="lumen-forms-form-1-help-hint" title={helper} aria-hidden="true">
              <CircleHelp className="lumen-forms-form-1-help-icon" strokeWidth={1.8} />
            </span>
          ) : null}
        </span>
        {helper ? <span className="lumen-forms-form-1-visually-hidden"> {helper}</span> : null}
      </label>
      <div className="lumen-forms-form-1-control">{children}</div>
    </div>
  )
}

function ChoiceCombobox({
  id,
  value,
  choices,
  onChange,
}: {
  readonly id: string
  readonly value: string
  readonly choices: readonly LumenFormsForm1Choice[]
  readonly onChange: (choiceId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const selected = choices.find((choice) => choice.id === value)
  return (
    <div
      className="lumen-forms-form-1-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
        }
      }}
    >
      <LumenButton
        id={id}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        variant="outlined"
        size="s"
        indicator="none"
        className="lumen-forms-form-1-combobox-trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? ''}</span>
        <ChevronDown className="lumen-forms-form-1-combobox-icon" aria-hidden="true" strokeWidth={1.8} />
      </LumenButton>
      {open ? (
        <div id={`${id}-options`} className="lumen-forms-form-1-combobox-options" role="listbox">
          {choices.map((choice) => (
            <LumenButton
              key={choice.id}
              type="button"
              role="option"
              aria-selected={choice.id === value}
              variant="text"
              size="s"
              indicator="none"
              className="lumen-forms-form-1-combobox-option"
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

export function LumenFormsForm1Reference({
  instanceId,
  content,
  onTextChange,
  onDateChange,
  onDailyStartChange,
  onMethodQueryChange,
  onMethodAdd,
  onMethodRemove,
  onLeadCrewChange,
  onDataReleaseChange,
  onEmbargoChange,
  onPhotoRemove,
  onRevert,
  onSavePlan,
}: LumenFormsForm1Props): React.ReactElement {
  const ids = {
    surveyTitle: `${instanceId}-survey-title`,
    stationCode: `${instanceId}-station-code`,
    vessel: `${instanceId}-vessel`,
    deployment: `${instanceId}-deployment`,
    recovery: `${instanceId}-recovery`,
    dailyStart: `${instanceId}-daily-start`,
    methodQuery: `${instanceId}-method-query`,
    leadCrew: `${instanceId}-lead-crew`,
    dataRelease: `${instanceId}-data-release`,
    embargo: `${instanceId}-embargo`,
  }

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-form-1-surface"
      contentClassName="lumen-forms-form-1-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-1"
      data-hbar-app-ui-list-strategy="content-grown"
    >
      <div className="lumen-forms-form-1-header" data-hbar-app-ui-region="form-heading">
        <div className="lumen-forms-form-1-heading-copy">
          <h2>{content.copy.pageTitle}</h2>
          <p>{content.copy.description}</p>
        </div>
        <div className="lumen-forms-form-1-progress-group">
          <div className="lumen-forms-form-1-progress">
            <span style={{ inlineSize: `${content.completion.percent}%` }} />
          </div>
          <span className="lumen-forms-form-1-progress-label">{content.completion.label}</span>
        </div>
      </div>

      <div className="lumen-forms-form-1-fields" data-hbar-app-ui-region="survey-fields">
        <FieldRow id={ids.surveyTitle} label={content.surveyTitle.label}>
          <LumenInput
            id={ids.surveyTitle}
            autoComplete="off"
            value={content.surveyTitle.value}
            variant="boxed"
            onChange={(event) => onTextChange('surveyTitle', event.currentTarget.value)}
          />
        </FieldRow>
        <FieldRow id={ids.stationCode} label={content.stationCode.label} helper={content.stationCode.helper}>
          <div className="lumen-forms-form-1-prefixed-control">
            <Hash className="lumen-forms-form-1-icon" aria-hidden="true" strokeWidth={1.8} />
            <LumenInput
              id={ids.stationCode}
              autoComplete="off"
              value={content.stationCode.value}
              variant="plain"
              onChange={(event) => onTextChange('stationCode', event.currentTarget.value)}
            />
          </div>
        </FieldRow>
        <FieldRow id={ids.vessel} label={content.vessel.label}>
          <div className="lumen-forms-form-1-prefixed-control">
            <Ship className="lumen-forms-form-1-icon" aria-hidden="true" strokeWidth={1.8} />
            <LumenInput
              id={ids.vessel}
              autoComplete="off"
              value={content.vessel.value}
              variant="plain"
              onChange={(event) => onTextChange('vessel', event.currentTarget.value)}
            />
          </div>
        </FieldRow>
        <FieldRow id={ids.deployment} label={content.deployment.label} helper={content.deployment.helper}>
          <LumenInput
            id={ids.deployment}
            type="date"
            value={content.deployment.value}
            variant="boxed"
            onChange={(event) => onDateChange('deployment', event.currentTarget.value)}
          />
        </FieldRow>
        <FieldRow id={ids.recovery} label={content.recovery.label}>
          <LumenInput
            id={ids.recovery}
            type="date"
            value={content.recovery.value}
            variant="boxed"
            onChange={(event) => onDateChange('recovery', event.currentTarget.value)}
          />
        </FieldRow>
        <FieldRow id={ids.dailyStart} label={content.dailyStart.label}>
          <LumenInput
            id={ids.dailyStart}
            type="time"
            value={content.dailyStart.value}
            variant="boxed"
            onChange={(event) => onDailyStartChange(event.currentTarget.value)}
          />
        </FieldRow>
        <FieldRow id={ids.methodQuery} label={content.methods.label}>
          <div className="lumen-forms-form-1-method-field">
            <div className="lumen-forms-form-1-method-list">
              {content.methods.selected.map((method) => (
                <div className="lumen-forms-form-1-method-chip" key={method.id}>
                  <span>{method.label}</span>
                  <button type="button" aria-label={method.removeLabel} onClick={() => onMethodRemove(method.id)}>
                    <X className="lumen-forms-form-1-remove-icon" aria-hidden="true" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
              <div className="lumen-forms-form-1-method-input">
                <LumenInput
                  id={ids.methodQuery}
                  type="text"
                  aria-label={content.methods.inputLabel}
                  value={content.methods.query}
                  placeholder=""
                  variant="plain"
                  onChange={(event) => onMethodQueryChange(event.currentTarget.value)}
                />
                {content.methods.query.length === 0 ? (
                  <span className="lumen-forms-form-1-method-input-hint" aria-hidden="true">
                    {content.methods.inputPlaceholder}
                  </span>
                ) : null}
              </div>
            </div>
            {content.methods.suggestions.length > 0 ? (
              <div className="lumen-forms-form-1-suggestions">
                <span>{content.methods.suggestionsLabel}</span>
                {content.methods.suggestions.map((method) => (
                  <LumenButton
                    key={method.id}
                    type="button"
                    variant="text"
                    size="s"
                    indicator="none"
                    onClick={() => onMethodAdd(method.id)}
                  >
                    {method.label}
                  </LumenButton>
                ))}
              </div>
            ) : null}
          </div>
        </FieldRow>
        <FieldRow id={ids.leadCrew} label={content.leadCrew.label}>
          <ChoiceCombobox
            id={ids.leadCrew}
            value={content.leadCrew.selectedId}
            choices={content.leadCrew.choices}
            onChange={onLeadCrewChange}
          />
        </FieldRow>
        <FieldRow id={ids.dataRelease} label={content.dataRelease.label}>
          <ChoiceCombobox
            id={ids.dataRelease}
            value={content.dataRelease.selectedId}
            choices={content.dataRelease.choices}
            onChange={onDataReleaseChange}
          />
        </FieldRow>
        <div className="lumen-forms-form-1-row" data-hbar-app-ui-region="embargo-setting">
          <span className="lumen-forms-form-1-row-label">{content.embargo.rowLabel}</span>
          <div className="lumen-forms-form-1-control">
            <label className="lumen-forms-form-1-embargo" htmlFor={ids.embargo}>
              <LumenToggleControl
                id={ids.embargo}
                checked={content.embargo.checked}
                onChange={(event) => onEmbargoChange(event.currentTarget.checked)}
              />
              <span>{content.embargo.label}</span>
            </label>
          </div>
        </div>
        <div className="lumen-forms-form-1-row" data-hbar-app-ui-region="station-photo">
          <span className="lumen-forms-form-1-row-label" id={`${instanceId}-photo-label`}>
            {content.stationPhoto.label}
          </span>
          {content.stationPhoto.initials ? (
            <div className="lumen-forms-form-1-control lumen-forms-form-1-photo-control">
              <span className="lumen-forms-form-1-photo">{content.stationPhoto.initials}</span>
              <LumenButton
                type="button"
                variant="outlined"
                size="s"
                indicator="none"
                aria-label={content.stationPhoto.removeLabel}
                onClick={onPhotoRemove}
              >
                <X className="lumen-forms-form-1-icon" aria-hidden="true" strokeWidth={1.8} />
                <span>{content.stationPhoto.removeLabel}</span>
              </LumenButton>
            </div>
          ) : null}
        </div>
      </div>

      <div className="lumen-forms-form-1-footer" data-hbar-app-ui-region="form-footer">
        <p>{content.footer.message}</p>
        <div className="lumen-forms-form-1-footer-actions">
          <LumenButton
            type="button"
            variant="outlined"
            size="s"
            indicator="none"
            disabled={!content.footer.dirty}
            onClick={onRevert}
          >
            {content.footer.revertLabel}
          </LumenButton>
          <LumenButton type="button" size="s" indicator="none" disabled={!content.footer.dirty} onClick={onSavePlan}>
            {content.footer.saveButtonLabel}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}

export type LumenFormsForm1ViewModel = Omit<LumenFormsForm1Props, 'instanceId'>
