'use client'

import * as React from 'react'
import { Check, ChevronDown, FileText, Upload, X } from 'lucide-react'
import { LumenInput, LumenTextarea } from './forms'
import { LumenButton } from './primitives'
import LumenSurface from './LumenSurface'
import './forms-7-reference.css'

export interface LumenForms7Choice {
  readonly id: string
  readonly label: string
}

export interface LumenForms7FundingTier extends LumenForms7Choice {
  readonly description: string
  readonly amountLabel: string
}

export interface LumenForms7Attachment {
  readonly id: string
  readonly fileName: string
  readonly sizeLabel: string
}

export interface LumenForms7Draft {
  readonly projectTitle: string
  readonly organization: string
  readonly contactEmail: string
  readonly focusAreaId: string
  readonly tagInput: string
  readonly tags: readonly LumenForms7Choice[]
  readonly fundingTierId: string
  readonly summary: string
  readonly consentChecked: boolean
}

export interface LumenForms7Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly requiredMarker: string
  readonly projectTitleLabel: string
  readonly projectTitlePlaceholder: string
  readonly organizationLabel: string
  readonly organizationPlaceholder: string
  readonly contactEmailLabel: string
  readonly contactEmailPlaceholder: string
  readonly focusAreaLabel: string
  readonly focusAreaPlaceholder: string
  readonly disciplineTagsLabel: string
  readonly disciplineTagsPlaceholder: string
  readonly disciplineTagsHelper: string
  readonly fundingTierLabel: string
  readonly projectSummaryLabel: string
  readonly projectSummaryPlaceholder: string
  readonly projectSummaryHelper: string
  readonly supportingDocumentsLabel: string
  readonly dropzoneLabel: string
  readonly attachmentsHelper: string
  readonly chooseFilesLabel: string
  readonly removeAttachmentLabel: (fileName: string) => string
  readonly removeTagLabel: (tagName: string) => string
  readonly consentLabel: string
  readonly saveDraftLabel: string
  readonly submitApplicationLabel: string
}

export interface LumenForms7Content {
  readonly copy: LumenForms7Copy
  readonly draft: LumenForms7Draft
  readonly focusAreas: readonly LumenForms7Choice[]
  readonly fundingTiers: readonly LumenForms7FundingTier[]
  readonly attachments: readonly LumenForms7Attachment[]
  readonly progress: {
    readonly percent: number
    readonly percentLabel: string
    readonly completionLabel: string
    readonly summaryCharactersRemainingLabel: string
  }
  readonly submitDisabled: boolean
  readonly attachmentList: {
    readonly kind: 'content-grown'
    readonly maximumCount: number
  }
}

export interface LumenForms7ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms7Content
  readonly onTextFieldChange: (fieldId: 'projectTitle' | 'organization' | 'contactEmail', value: string) => void
  readonly onFocusAreaChange: (focusAreaId: string) => void
  readonly onTagInputChange: (value: string) => void
  readonly onTagCommitRequest: (value: string) => void
  readonly onTagRemovalRequest: (tagId: string) => void
  readonly onFundingTierChange: (fundingTierId: string) => void
  readonly onSummaryChange: (value: string) => void
  readonly onFilesSelected: (files: readonly File[]) => void
  readonly onAttachmentRemovalRequest: (attachmentId: string) => void
  readonly onConsentChange: (checked: boolean) => void
  readonly onSaveDraft: () => void
  readonly onSubmitApplication: () => void
}

export type LumenForms7ViewModel = Omit<LumenForms7ReferenceProps, 'instanceId'>

function controlId(instanceId: string, name: string): string {
  return `${instanceId}-forms-7-${name}`
}

function RequiredLabel({ children, marker }: { readonly children: string; readonly marker: string }) {
  return (
    <React.Fragment>
      <span>{children}</span>
      <span className="lumen-forms-7-required" aria-hidden="true">
        {marker}
      </span>
    </React.Fragment>
  )
}

function TextField({
  id,
  label,
  placeholder,
  value,
  requiredMarker,
  type,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly value: string
  readonly requiredMarker: string
  readonly type?: React.HTMLInputTypeAttribute | undefined
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="lumen-forms-7-field">
      <label htmlFor={id}>
        <RequiredLabel marker={requiredMarker}>{label}</RequiredLabel>
      </label>
      <LumenInput
        id={id}
        className="lumen-forms-7-control"
        type={type}
        value={value}
        placeholder={placeholder}
        required
        variant="boxed"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function FocusAreaField({
  instanceId,
  content,
  onChange,
}: {
  readonly instanceId: string
  readonly content: LumenForms7Content
  readonly onChange: (focusAreaId: string) => void
}) {
  const fieldId = controlId(instanceId, 'focus-area')
  const listboxId = controlId(instanceId, 'focus-area-options')
  const selected = content.focusAreas.find((area) => area.id === content.draft.focusAreaId)
  const selectedIndex = content.focusAreas.findIndex((area) => area.id === content.draft.focusAreaId)
  const [expanded, setExpanded] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(Math.max(selectedIndex, 0))
  const activeArea = content.focusAreas[activeIndex]

  const choose = (id: string) => {
    onChange(id)
    setExpanded(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (content.focusAreas.length === 0) {
      return
    }
    if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault()
        setExpanded(false)
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!expanded) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
        setExpanded(true)
        return
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + delta + content.focusAreas.length) % content.focusAreas.length)
      return
    }
    if (expanded && event.key === 'Enter') {
      event.preventDefault()
      if (activeArea) {
        choose(activeArea.id)
      }
    }
  }

  return (
    <div className="lumen-forms-7-field lumen-forms-7-focus-field">
      <label htmlFor={fieldId}>
        <RequiredLabel marker={content.copy.requiredMarker}>{content.copy.focusAreaLabel}</RequiredLabel>
      </label>
      <LumenButton
        id={fieldId}
        className="lumen-forms-7-focus-trigger"
        variant="outlined"
        tone="neutral"
        size="m"
        indicator="none"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-activedescendant={expanded && activeArea ? `${listboxId}-${activeArea.id}` : undefined}
        onClick={() => setExpanded((open) => !open)}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label ?? content.copy.focusAreaPlaceholder}</span>
        <ChevronDown className="lumen-forms-7-icon lumen-forms-7-icon-sm" aria-hidden="true" />
      </LumenButton>
      {expanded ? (
        <ul className="lumen-forms-7-focus-options" id={listboxId} role="listbox">
          {content.focusAreas.map((area, index) => {
            const isSelected = area.id === content.draft.focusAreaId
            const isActive = index === activeIndex
            return (
              <li
                className="lumen-forms-7-focus-option"
                data-active={isActive || undefined}
                id={`${listboxId}-${area.id}`}
                key={area.id}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(area.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    choose(area.id)
                  }
                }}
              >
                <span>{area.label}</span>
                {isSelected ? <Check className="lumen-forms-7-icon lumen-forms-7-icon-sm" aria-hidden="true" /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export function LumenForms7Reference({
  instanceId,
  content,
  onTextFieldChange,
  onFocusAreaChange,
  onTagInputChange,
  onTagCommitRequest,
  onTagRemovalRequest,
  onFundingTierChange,
  onSummaryChange,
  onFilesSelected,
  onAttachmentRemovalRequest,
  onConsentChange,
  onSaveDraft,
  onSubmitApplication,
}: LumenForms7ReferenceProps): React.ReactElement {
  const fileInputId = controlId(instanceId, 'supporting-files')
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const projectTitleId = controlId(instanceId, 'project-title')
  const organizationId = controlId(instanceId, 'organization')
  const contactEmailId = controlId(instanceId, 'contact-email')
  const disciplineTagsId = controlId(instanceId, 'discipline-tags')
  const fundingTierName = controlId(instanceId, 'funding-tier')
  const projectSummaryId = controlId(instanceId, 'project-summary')
  const consentId = controlId(instanceId, 'consent')

  const dispatchFiles = (files: readonly File[]) => {
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const value = content.draft.tagInput.trim()
      if (value) {
        onTagCommitRequest(value)
      }
      return
    }
    if (event.key === 'Backspace' && content.draft.tagInput.length === 0) {
      const lastTag = content.draft.tags.at(-1)
      if (lastTag) {
        event.preventDefault()
        onTagRemovalRequest(lastTag.id)
      }
    }
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatchFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dispatchFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-7-surface"
      contentClassName="lumen-forms-7-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-7"
      data-hbar-app-ui-list-strategy={content.attachmentList.kind}
    >
      <div className="lumen-forms-7-heading">
        <h2>{content.copy.pageTitle}</h2>
        <p>{content.copy.pageDescription}</p>
        <span className="lumen-forms-7-heading-progress">{content.progress.percentLabel}</span>
        <div className="lumen-forms-7-progress-track" aria-hidden="true">
          <div className="lumen-forms-7-progress-value" style={{ inlineSize: `${content.progress.percent}%` }} />
        </div>
      </div>

      <div className="lumen-forms-7-content">
        <section className="lumen-forms-7-project-fields">
          <TextField
            id={projectTitleId}
            label={content.copy.projectTitleLabel}
            placeholder={content.copy.projectTitlePlaceholder}
            value={content.draft.projectTitle}
            requiredMarker={content.copy.requiredMarker}
            onChange={(value) => onTextFieldChange('projectTitle', value)}
          />
          <div className="lumen-forms-7-field-row">
            <TextField
              id={organizationId}
              label={content.copy.organizationLabel}
              placeholder={content.copy.organizationPlaceholder}
              value={content.draft.organization}
              requiredMarker={content.copy.requiredMarker}
              onChange={(value) => onTextFieldChange('organization', value)}
            />
            <TextField
              id={contactEmailId}
              type="email"
              label={content.copy.contactEmailLabel}
              placeholder={content.copy.contactEmailPlaceholder}
              value={content.draft.contactEmail}
              requiredMarker={content.copy.requiredMarker}
              onChange={(value) => onTextFieldChange('contactEmail', value)}
            />
          </div>
          <FocusAreaField instanceId={instanceId} content={content} onChange={onFocusAreaChange} />
          <div className="lumen-forms-7-field">
            <label htmlFor={disciplineTagsId}>
              <RequiredLabel marker={content.copy.requiredMarker}>{content.copy.disciplineTagsLabel}</RequiredLabel>
            </label>
            <LumenInput
              id={disciplineTagsId}
              className="lumen-forms-7-control"
              value={content.draft.tagInput}
              placeholder={content.copy.disciplineTagsPlaceholder}
              required
              variant="boxed"
              onChange={(event) => onTagInputChange(event.currentTarget.value)}
              onKeyDown={handleTagKeyDown}
            />
            {content.draft.tags.length > 0 ? (
              <div className="lumen-forms-7-tags">
                {content.draft.tags.map((tag) => (
                  <span className="lumen-forms-7-tag" key={tag.id}>
                    <span>{tag.label}</span>
                    <button
                      className="lumen-forms-7-tag-remove"
                      type="button"
                      aria-label={content.copy.removeTagLabel(tag.label)}
                      onClick={() => onTagRemovalRequest(tag.id)}
                    >
                      <X className="lumen-forms-7-icon lumen-forms-7-icon-xs" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <p className="lumen-forms-7-helper">{content.copy.disciplineTagsHelper}</p>
          </div>
        </section>

        <section className="lumen-forms-7-funding-section">
          <p className="lumen-forms-7-section-label">
            <RequiredLabel marker={content.copy.requiredMarker}>{content.copy.fundingTierLabel}</RequiredLabel>
          </p>
          <div className="lumen-forms-7-funding-options">
            {content.fundingTiers.map((tier) => {
              const selected = content.draft.fundingTierId === tier.id
              const radioId = `${fundingTierName}-${tier.id}`
              return (
                <div className="lumen-forms-7-funding-choice" data-selected={selected} key={tier.id}>
                  <input
                    id={radioId}
                    type="radio"
                    name={fundingTierName}
                    value={tier.id}
                    checked={selected}
                    onChange={() => onFundingTierChange(tier.id)}
                  />
                  <label
                    className="lumen-forms-7-funding-card"
                    htmlFor={radioId}
                    aria-label={`${tier.label} ${tier.description} ${tier.amountLabel}`}
                  >
                    <span className="lumen-forms-7-funding-copy">
                      <span className="lumen-forms-7-funding-title">{tier.label}</span>
                      <span className="lumen-forms-7-funding-description">{tier.description}</span>
                      <span className="lumen-forms-7-funding-amount">{tier.amountLabel}</span>
                    </span>
                  </label>
                </div>
              )
            })}
          </div>
        </section>

        <section className="lumen-forms-7-summary-section">
          <label className="lumen-forms-7-section-label" htmlFor={projectSummaryId}>
            <RequiredLabel marker={content.copy.requiredMarker}>{content.copy.projectSummaryLabel}</RequiredLabel>
          </label>
          <LumenTextarea
            id={projectSummaryId}
            className="lumen-forms-7-control lumen-forms-7-summary-control"
            value={content.draft.summary}
            placeholder={content.copy.projectSummaryPlaceholder}
            rows={4}
            required
            variant="boxed"
            onChange={(event) => onSummaryChange(event.currentTarget.value)}
          />
          <div className="lumen-forms-7-summary-meta">
            <p className="lumen-forms-7-helper">{content.copy.projectSummaryHelper}</p>
            <p className="lumen-forms-7-helper">{content.progress.summaryCharactersRemainingLabel}</p>
          </div>
        </section>

        <section className="lumen-forms-7-documents-section">
          <p className="lumen-forms-7-section-label">{content.copy.supportingDocumentsLabel}</p>
          <div className="lumen-forms-7-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <Upload className="lumen-forms-7-icon lumen-forms-7-icon-lg" aria-hidden="true" />
            <p>{content.copy.dropzoneLabel}</p>
            <p className="lumen-forms-7-helper">{content.copy.attachmentsHelper}</p>
            <LumenButton
              className="lumen-forms-7-choose-files"
              variant="outlined"
              tone="neutral"
              size="m"
              indicator="none"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              {content.copy.chooseFilesLabel}
            </LumenButton>
            <input
              ref={fileInputRef}
              className="lumen-forms-7-file-input"
              id={fileInputId}
              type="file"
              onChange={handleFileInputChange}
            />
          </div>
          {content.attachments.length > 0 ? (
            <ul
              className="lumen-forms-7-attachment-list"
              data-hbar-app-ui-list-strategy={content.attachmentList.kind}
              data-maximum-count={content.attachmentList.maximumCount}
            >
              {content.attachments.map((attachment) => (
                <li className="lumen-forms-7-attachment" key={attachment.id}>
                  <FileText className="lumen-forms-7-icon lumen-forms-7-icon-md" aria-hidden="true" />
                  <span className="lumen-forms-7-attachment-name">{attachment.fileName}</span>
                  <span className="lumen-forms-7-attachment-size">{attachment.sizeLabel}</span>
                  <button
                    className="lumen-forms-7-attachment-remove"
                    type="button"
                    aria-label={content.copy.removeAttachmentLabel(attachment.fileName)}
                    onClick={() => onAttachmentRemovalRequest(attachment.id)}
                  >
                    <X className="lumen-forms-7-icon lumen-forms-7-icon-sm" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="lumen-forms-7-consent-section">
          <label className="lumen-forms-7-consent" htmlFor={consentId} aria-label={content.copy.consentLabel}>
            <input
              id={consentId}
              type="checkbox"
              checked={content.draft.consentChecked}
              onChange={(event) => onConsentChange(event.currentTarget.checked)}
            />
            <span>{content.copy.consentLabel}</span>
          </label>
        </section>
      </div>

      <div className="lumen-forms-7-footer">
        <LumenButton
          className="lumen-forms-7-save-button"
          variant="outlined"
          tone="neutral"
          size="m"
          indicator="none"
          type="button"
          onClick={onSaveDraft}
        >
          {content.copy.saveDraftLabel}
        </LumenButton>
        <div className="lumen-forms-7-footer-actions">
          <span className="lumen-forms-7-completion-status">{content.progress.completionLabel}</span>
          <LumenButton
            className="lumen-forms-7-submit-button"
            variant="solid"
            tone="primary"
            size="m"
            indicator="none"
            type="button"
            disabled={content.submitDisabled}
            onClick={onSubmitApplication}
          >
            {content.copy.submitApplicationLabel}
          </LumenButton>
        </div>
      </div>
    </LumenSurface>
  )
}
