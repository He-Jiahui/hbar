'use client'

import * as React from 'react'
import { CheckCircle2, ChevronDown, Circle, Clock3, Mic, Presentation, Send, UsersRound } from 'lucide-react'
import LumenSurface from './LumenSurface'
import { LumenButton, type LumenButtonProps } from './primitives'
import { LumenInput, LumenTextarea } from './forms'
import './forms-2-reference.css'

export type LumenForms2TextFieldId = 'sessionTitle' | 'abstract' | 'speakerName' | 'contactAddress' | 'affiliation'

export type LumenForms2FormatId = 'conference-talk' | 'hands-on-workshop' | 'lightning-slot'
export type LumenForms2ReadinessItemId = 'sessionTitle' | 'abstract' | 'contactAddress' | 'recordingConsent'

export interface LumenForms2Choice<Id extends string = string> {
  readonly id: Id
  readonly label: string
}

export interface LumenForms2FormatChoice extends LumenForms2Choice<LumenForms2FormatId> {
  readonly description: string
  readonly durationMinutes: number
  readonly icon: 'presentation' | 'workshop' | 'microphone'
}

export interface LumenForms2Field {
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly error: string | null
}

export interface LumenForms2Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly sessionHeading: string
  readonly sessionDescription: string
  readonly sessionTitleLabel: string
  readonly sessionTitlePlaceholder: string
  readonly abstractLabel: string
  readonly abstractPlaceholder: string
  readonly abstractRemaining: (remaining: number) => string
  readonly formatLabel: string
  readonly formatGroupLabel: string
  readonly trackLabel: string
  readonly audienceLevelLabel: string
  readonly speakerHeading: string
  readonly speakerDescription: string
  readonly speakerNameLabel: string
  readonly speakerNamePlaceholder: string
  readonly contactAddressLabel: string
  readonly contactAddressPlaceholder: string
  readonly affiliationLabel: string
  readonly affiliationPlaceholder: string
  readonly optionalLabel: string
  readonly roomRequirementsHeading: string
  readonly roomRequirementsDescription: string
  readonly asideHeading: string
  readonly readinessLabel: (ready: number) => string
  readonly readinessSessionTitle: string
  readonly readinessAbstract: string
  readonly readinessContactAddress: string
  readonly readinessRecordingConsent: string
  readonly formatDuration: (formatLabel: string, durationMinutes: number) => string
  readonly recordingConsentLabel: string
  readonly submitLabel: string
  readonly attentionSummary: (count: number) => string
}

export interface LumenForms2Content {
  readonly copy: LumenForms2Copy
  readonly sessionTitle: LumenForms2Field
  readonly abstract: LumenForms2Field & { readonly remainingLabel: string }
  readonly format: {
    readonly selectedId: string
    readonly choices: readonly LumenForms2FormatChoice[]
  }
  readonly track: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly LumenForms2Choice[]
  }
  readonly audienceLevel: {
    readonly label: string
    readonly selectedId: string
    readonly choices: readonly LumenForms2Choice[]
  }
  readonly speakerName: LumenForms2Field
  readonly contactAddress: LumenForms2Field
  readonly affiliation: LumenForms2Field
  readonly roomRequirements: {
    readonly choices: readonly {
      readonly id: string
      readonly label: string
      readonly checked: boolean
    }[]
  }
  readonly readiness: {
    readonly ready: number
    readonly label: string
    readonly items: readonly {
      readonly id: LumenForms2ReadinessItemId
      readonly label: string
      readonly ready: boolean
    }[]
    readonly durationNote: string
  }
  readonly recordingConsent: { readonly checked: boolean; readonly error: string | null }
  readonly attentionSummary: string | null
  readonly requestStatus:
    | { readonly kind: 'idle' }
    | { readonly kind: 'pending'; readonly message: string }
    | { readonly kind: 'error'; readonly message: string }
  readonly listStrategy: { readonly kind: 'content-grown'; readonly note: string }
}

export interface LumenForms2ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms2Content
  readonly onTextChange: (fieldId: LumenForms2TextFieldId, value: string) => void
  readonly onFormatChange: (formatId: LumenForms2FormatId) => void
  readonly onTrackChange: (trackId: string) => void
  readonly onAudienceLevelChange: (levelId: string) => void
  readonly onRoomRequirementChange: (requirementId: string, checked: boolean) => void
  readonly onRecordingConsentChange: (checked: boolean) => void
  readonly onSubmitProposal: () => void
}

function FormatIcon({ kind }: { readonly kind: LumenForms2FormatChoice['icon'] }) {
  if (kind === 'presentation') {
    return <Presentation className="lumen-forms-2-icon lumen-forms-2-icon-md" aria-hidden="true" />
  }
  if (kind === 'workshop') {
    return <UsersRound className="lumen-forms-2-icon lumen-forms-2-icon-md" aria-hidden="true" />
  }
  return <Mic className="lumen-forms-2-icon lumen-forms-2-icon-md" aria-hidden="true" />
}

function FieldError({ error, id }: { readonly error: string | null; readonly id: string }) {
  return error ? (
    <p className="lumen-forms-2-error" id={id}>
      {error}
    </p>
  ) : null
}

function ChoiceCombobox({
  id,
  label,
  selectedId,
  choices,
  open,
  onToggle,
  onSelect,
}: {
  readonly id: string
  readonly label: string
  readonly selectedId: string
  readonly choices: readonly LumenForms2Choice[]
  readonly open: boolean
  readonly onToggle: () => void
  readonly onSelect: (choiceId: string) => void
}) {
  const selected = choices.find((choice) => choice.id === selectedId)
  return (
    <div className="lumen-forms-2-combobox-field">
      <label className="lumen-forms-2-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="lumen-forms-2-combobox-wrap">
        <button
          type="button"
          id={id}
          className="lumen-forms-2-combobox"
          role="combobox"
          aria-haspopup="listbox"
          aria-controls={`${id}-options`}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span>{selected?.label ?? ''}</span>
          <ChevronDown className="lumen-forms-2-icon lumen-forms-2-icon-sm" aria-hidden="true" />
        </button>
        {open ? (
          <div className="lumen-forms-2-options" id={`${id}-options`} role="listbox" aria-label={label}>
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="option"
                aria-selected={choice.id === selectedId}
                onClick={() => onSelect(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function fieldClass(error: string | null): string {
  return error ? 'lumen-forms-2-field lumen-forms-2-field-invalid' : 'lumen-forms-2-field'
}

function buttonProps(): Pick<LumenButtonProps, 'indicator' | 'size'> {
  return { indicator: 'none', size: 's' }
}

export function LumenForms2Reference({
  instanceId,
  content,
  onTextChange,
  onFormatChange,
  onTrackChange,
  onAudienceLevelChange,
  onRoomRequirementChange,
  onRecordingConsentChange,
  onSubmitProposal,
}: LumenForms2ReferenceProps): React.ReactElement {
  const [openChoice, setOpenChoice] = React.useState<'track' | 'audienceLevel' | null>(null)
  const formatButtons = React.useRef<Array<HTMLButtonElement | null>>([])
  const titleId = `${instanceId}-session-title`
  const abstractId = `${instanceId}-abstract`
  const speakerNameId = `${instanceId}-speaker-name`
  const contactAddressId = `${instanceId}-contact-address`
  const affiliationId = `${instanceId}-affiliation`
  const consentId = `${instanceId}-recording-consent`

  const handleFormatKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown'
    ) {
      return
    }
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const nextIndex = (currentIndex + direction + content.format.choices.length) % content.format.choices.length
    const next = content.format.choices[nextIndex]
    if (!next) {
      return
    }
    onFormatChange(next.id)
    formatButtons.current[nextIndex]?.focus()
  }

  const statusMessage = content.requestStatus.kind === 'idle' ? null : content.requestStatus.message

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-2-surface"
      contentClassName="lumen-forms-2-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-2"
      data-hbar-app-ui-list-strategy={content.listStrategy.kind}
    >
      <div className="lumen-forms-2-page-heading">
        <h2>{content.copy.pageTitle}</h2>
        <p>{content.copy.pageDescription}</p>
      </div>

      <div className="lumen-forms-2-layout">
        <div className="lumen-forms-2-main-column">
          <section className="lumen-forms-2-panel">
            <div className="lumen-forms-2-panel-heading">
              <h3 id={`${instanceId}-session-heading`}>{content.copy.sessionHeading}</h3>
              <p>{content.copy.sessionDescription}</p>
            </div>
            <div className="lumen-forms-2-panel-content">
              <div className={fieldClass(content.sessionTitle.error)}>
                <label htmlFor={titleId}>{content.sessionTitle.label}</label>
                <LumenInput
                  id={titleId}
                  variant="boxed"
                  value={content.sessionTitle.value}
                  placeholder={content.sessionTitle.placeholder}
                  aria-invalid={content.sessionTitle.error ? true : undefined}
                  onChange={(event) => onTextChange('sessionTitle', event.currentTarget.value)}
                />
                <FieldError id={`${titleId}-error`} error={content.sessionTitle.error} />
              </div>

              <div className={fieldClass(content.abstract.error)}>
                <label htmlFor={abstractId}>{content.abstract.label}</label>
                <LumenTextarea
                  id={abstractId}
                  variant="boxed"
                  value={content.abstract.value}
                  placeholder={content.abstract.placeholder}
                  aria-invalid={content.abstract.error ? true : undefined}
                  onChange={(event) => onTextChange('abstract', event.currentTarget.value)}
                />
                <div className="lumen-forms-2-counter-row">
                  <FieldError id={`${abstractId}-error`} error={content.abstract.error} />
                  <span>{content.abstract.remainingLabel}</span>
                </div>
              </div>

              <div className="lumen-forms-2-format-field">
                <span className="lumen-forms-2-field-label">{content.copy.formatLabel}</span>
                <div
                  className="lumen-forms-2-format-choices"
                  role="radiogroup"
                  aria-label={content.copy.formatGroupLabel}
                >
                  {content.format.choices.map((choice, index) => (
                    <button
                      key={choice.id}
                      ref={(element) => {
                        formatButtons.current[index] = element
                      }}
                      type="button"
                      className="lumen-forms-2-format-choice"
                      role="radio"
                      aria-checked={choice.id === content.format.selectedId}
                      tabIndex={choice.id === content.format.selectedId ? 0 : -1}
                      onClick={() => onFormatChange(choice.id)}
                      onKeyDown={(event) => handleFormatKeyDown(event, index)}
                    >
                      <FormatIcon kind={choice.icon} />
                      <span className="lumen-forms-2-format-choice-label">{choice.label}</span>
                      <small>{choice.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lumen-forms-2-select-row">
                <ChoiceCombobox
                  id={`${instanceId}-track`}
                  label={content.track.label}
                  selectedId={content.track.selectedId}
                  choices={content.track.choices}
                  open={openChoice === 'track'}
                  onToggle={() => setOpenChoice((current) => (current === 'track' ? null : 'track'))}
                  onSelect={(choiceId) => {
                    onTrackChange(choiceId)
                    setOpenChoice(null)
                  }}
                />
                <ChoiceCombobox
                  id={`${instanceId}-audience-level`}
                  label={content.audienceLevel.label}
                  selectedId={content.audienceLevel.selectedId}
                  choices={content.audienceLevel.choices}
                  open={openChoice === 'audienceLevel'}
                  onToggle={() => setOpenChoice((current) => (current === 'audienceLevel' ? null : 'audienceLevel'))}
                  onSelect={(choiceId) => {
                    onAudienceLevelChange(choiceId)
                    setOpenChoice(null)
                  }}
                />
              </div>
            </div>
          </section>

          <section className="lumen-forms-2-panel">
            <div className="lumen-forms-2-panel-heading">
              <h3 id={`${instanceId}-speaker-heading`}>{content.copy.speakerHeading}</h3>
              <p>{content.copy.speakerDescription}</p>
            </div>
            <div className="lumen-forms-2-panel-content lumen-forms-2-speaker-fields">
              <div className="lumen-forms-2-field">
                <label htmlFor={speakerNameId}>{content.speakerName.label}</label>
                <LumenInput
                  id={speakerNameId}
                  variant="boxed"
                  value={content.speakerName.value}
                  placeholder={content.speakerName.placeholder}
                  onChange={(event) => onTextChange('speakerName', event.currentTarget.value)}
                />
              </div>
              <div className={fieldClass(content.contactAddress.error)}>
                <label htmlFor={contactAddressId}>{content.contactAddress.label}</label>
                <LumenInput
                  id={contactAddressId}
                  type="email"
                  variant="boxed"
                  value={content.contactAddress.value}
                  placeholder={content.contactAddress.placeholder}
                  aria-invalid={content.contactAddress.error ? true : undefined}
                  onChange={(event) => onTextChange('contactAddress', event.currentTarget.value)}
                />
                <FieldError id={`${contactAddressId}-error`} error={content.contactAddress.error} />
              </div>
              <div className="lumen-forms-2-field lumen-forms-2-affiliation-field">
                <label className="lumen-forms-2-inline-label" htmlFor={affiliationId}>
                  <span>{content.affiliation.label}</span>
                  <small>{content.copy.optionalLabel}</small>
                </label>
                <LumenInput
                  id={affiliationId}
                  variant="boxed"
                  value={content.affiliation.value}
                  placeholder={content.affiliation.placeholder}
                  onChange={(event) => onTextChange('affiliation', event.currentTarget.value)}
                />
              </div>
            </div>
          </section>

          <section className="lumen-forms-2-panel">
            <div className="lumen-forms-2-panel-heading">
              <h3 id={`${instanceId}-requirements-heading`}>{content.copy.roomRequirementsHeading}</h3>
              <p>{content.copy.roomRequirementsDescription}</p>
            </div>
            <div className="lumen-forms-2-requirements">
              {content.roomRequirements.choices.map((choice) => (
                <label className="lumen-forms-2-requirement" key={choice.id}>
                  <input
                    type="checkbox"
                    checked={choice.checked}
                    onChange={(event) => onRoomRequirementChange(choice.id, event.currentTarget.checked)}
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="lumen-forms-2-aside">
          <section className="lumen-forms-2-panel lumen-forms-2-readiness-panel">
            <div className="lumen-forms-2-panel-heading">
              <h3 id={`${instanceId}-aside-heading`}>{content.copy.asideHeading}</h3>
              <p>{content.readiness.label}</p>
            </div>
            <div className="lumen-forms-2-readiness-items">
              {content.readiness.items.map((item) => {
                const Icon = item.ready ? CheckCircle2 : Circle
                return (
                  <div className="lumen-forms-2-readiness-item" key={item.id} data-ready={item.ready}>
                    <Icon className="lumen-forms-2-icon lumen-forms-2-icon-sm" aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                )
              })}
              <div className="lumen-forms-2-duration-note">
                <Clock3 className="lumen-forms-2-icon lumen-forms-2-icon-sm" aria-hidden="true" />
                <span>{content.readiness.durationNote}</span>
              </div>
            </div>
          </section>

          <section className="lumen-forms-2-panel lumen-forms-2-submit-panel">
            <div className="lumen-forms-2-consent">
              <input
                id={consentId}
                type="checkbox"
                aria-label={content.copy.recordingConsentLabel}
                checked={content.recordingConsent.checked}
                aria-invalid={content.recordingConsent.error ? true : undefined}
                onChange={(event) => onRecordingConsentChange(event.currentTarget.checked)}
              />
              <span>{content.copy.recordingConsentLabel}</span>
            </div>
            <FieldError id={`${consentId}-error`} error={content.recordingConsent.error} />
            <LumenButton {...buttonProps()} type="button" className="lumen-forms-2-submit" onClick={onSubmitProposal}>
              <Send className="lumen-forms-2-icon lumen-forms-2-icon-sm" aria-hidden="true" />
              <span>{content.copy.submitLabel}</span>
            </LumenButton>
            {content.attentionSummary ? (
              <p className="lumen-forms-2-error-summary">{content.attentionSummary}</p>
            ) : null}
            {statusMessage ? (
              <p
                className={
                  content.requestStatus.kind === 'error' ? 'lumen-forms-2-status-error' : 'lumen-forms-2-status'
                }
                role={content.requestStatus.kind === 'error' ? 'alert' : 'status'}
              >
                {statusMessage}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </LumenSurface>
  )
}

export type LumenForms2ReferenceViewModel = Omit<LumenForms2ReferenceProps, 'instanceId'>
