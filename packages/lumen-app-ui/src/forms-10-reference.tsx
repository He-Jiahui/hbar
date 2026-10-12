'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import LumenSurface from './LumenSurface'
import './forms-10-reference.css'

export type LumenForms10MatrixCriterionId = 'room-cleanliness' | 'check-in-flow' | 'staff-helpfulness' | 'breakfast'

export type LumenForms10MatrixRatingId = 'poor' | 'fair' | 'good' | 'very-good' | 'excellent'

export type LumenForms10HighlightId =
  'location' | 'housekeeping' | 'front-desk-team' | 'breakfast' | 'value-for-money' | 'nothing-in-particular'

export type LumenForms10NpsScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface LumenForms10Option {
  readonly id: string
  readonly label: string
}

export interface LumenForms10Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly answeredCount: (answered: number, total: number) => string
  readonly questionsRemaining: (remaining: number) => string
  readonly requiredMarker: string
  readonly propertyLabel: string
  readonly propertyPlaceholder: string
  readonly reservationReferenceLabel: string
  readonly reservationReferencePlaceholder: string
  readonly reservationReferenceHelper: string
  readonly recommendationLabel: string
  readonly recommendationLowEndpoint: string
  readonly recommendationHighEndpoint: string
  readonly npsOptionLabel: (score: number) => string
  readonly matrixHeading: string
  readonly matrixCriterionLabels: Readonly<Record<LumenForms10MatrixCriterionId, string>>
  readonly matrixRatingLabels: Readonly<Record<LumenForms10MatrixRatingId, string>>
  readonly matrixOptionLabel: (criterion: string, rating: string) => string
  readonly highlightsHeading: string
  readonly highlightLabels: Readonly<Record<LumenForms10HighlightId, string>>
  readonly conditionalFollowUpLabel: string
  readonly conditionalFollowUpPlaceholder: string
  readonly conditionalFollowUpRequiredHelper: string
  readonly followUpCharacterCount: (count: number, limit: number) => string
  readonly submitLabel: string
}

export interface LumenForms10PropertyCatalog {
  readonly completeness: 'partial'
  readonly items: readonly LumenForms10Option[]
}

export interface LumenForms10MatrixCriterion {
  readonly id: LumenForms10MatrixCriterionId
  readonly label: string
  readonly selectedRatingId: LumenForms10MatrixRatingId | null
}

export interface LumenForms10Highlight {
  readonly id: LumenForms10HighlightId
  readonly label: string
  readonly selected: boolean
}

export interface LumenForms10Content {
  readonly copy: LumenForms10Copy
  readonly propertyId: string | null
  readonly propertyCatalog: LumenForms10PropertyCatalog
  readonly reservationReference: string
  readonly npsScore: LumenForms10NpsScore | null
  readonly npsOptions: readonly LumenForms10NpsScore[]
  readonly matrixCriteria: readonly LumenForms10MatrixCriterion[]
  readonly matrixRatingIds: readonly LumenForms10MatrixRatingId[]
  readonly highlights: readonly LumenForms10Highlight[]
  readonly followUp: {
    readonly visible: boolean
    readonly required: boolean
    readonly value: string
    readonly characterCount: number
    readonly counterLimit: number
    readonly atOrBelowCounterDisplay: boolean
  }
  readonly progress: {
    readonly answered: number
    readonly total: number
    readonly remaining: number
  }
  readonly submit: {
    readonly disabled: boolean
    readonly resultBehavior: 'typed-host-request-only'
  }
  readonly collectionContract: {
    readonly kind: 'content-grown'
    readonly matrixCriterionCount: 4
    readonly highlightOptionCount: 6
    readonly highlightExclusivity: 'not-observed-no-exclusive-rule-applied'
    readonly narrowScrollOwner: 'not-captured'
    readonly matrixNarrowOverflow: 'local-horizontal-accessibility-scroll-source-owner-not-captured'
  }
}

export interface LumenForms10ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms10Content
  readonly onPropertyChange: (propertyId: string | null) => void
  readonly onReservationReferenceChange: (value: string) => void
  readonly onNpsScoreChange: (score: LumenForms10NpsScore) => void
  readonly onMatrixRatingChange: (
    criterionId: LumenForms10MatrixCriterionId,
    ratingId: LumenForms10MatrixRatingId,
  ) => void
  readonly onHighlightChange: (highlightId: LumenForms10HighlightId, selected: boolean) => void
  readonly onFollowUpChange: (value: string) => void
  readonly onSubmitRequest: () => void
}

export type LumenForms10ViewModel = Omit<LumenForms10ReferenceProps, 'instanceId'>

function controlId(instanceId: string, name: string): string {
  return `${instanceId}-forms-10-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function isNpsScore(value: number): value is LumenForms10NpsScore {
  return Number.isInteger(value) && value >= 0 && value <= 10
}

function LumenForms10PropertyPicker({
  id,
  label,
  placeholder,
  valueId,
  options,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly placeholder: string
  readonly valueId: string | null
  readonly options: readonly LumenForms10Option[]
  readonly onChange: (value: string | null) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const selectedOption = options.find((option) => option.id === valueId)
  const [activeOptionId, setActiveOptionId] = React.useState<string | null>(selectedOption?.id ?? null)
  const listboxId = `${id}-options`
  const activeOptionIndex = options.findIndex((option) => option.id === activeOptionId)
  const activeDescendantId = activeOptionIndex >= 0 ? `${listboxId}-${activeOptionId}` : undefined

  const open = (preferredIndex?: number) => {
    let optionIndex = preferredIndex
    if (optionIndex === undefined) {
      optionIndex = selectedOption ? options.indexOf(selectedOption) : 0
    }
    setExpanded(true)
    setActiveOptionId(options[optionIndex]?.id ?? null)
  }

  const moveActiveOption = (direction: -1 | 1) => {
    if (!options.length) {
      return
    }
    let start = activeOptionIndex
    if (start < 0) {
      start = direction === 1 ? -1 : 0
    }
    const nextIndex = (start + direction + options.length) % options.length
    setActiveOptionId(options[nextIndex]?.id ?? null)
  }

  const chooseActiveOption = () => {
    const activeOption = options.find((option) => option.id === activeOptionId)
    if (activeOption) {
      onChange(activeOption.id)
    }
    setExpanded(false)
  }

  return (
    <div
      className="lumen-forms-10-property-picker"
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false)
        }
      }}
    >
      <button
        aria-activedescendant={expanded ? activeDescendantId : undefined}
        aria-controls={listboxId}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-label={label}
        className="lumen-forms-10-property-trigger"
        id={id}
        onClick={() => {
          if (expanded) {
            setExpanded(false)
          } else {
            open()
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (expanded) {
              moveActiveOption(1)
            } else {
              open()
            }
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (expanded) {
              moveActiveOption(-1)
            } else {
              open(options.length - 1)
            }
          } else if (event.key === 'Home' && expanded) {
            event.preventDefault()
            setActiveOptionId(options[0]?.id ?? null)
          } else if (event.key === 'End' && expanded) {
            event.preventDefault()
            setActiveOptionId(options.at(-1)?.id ?? null)
          } else if (event.key === 'Enter' && expanded) {
            event.preventDefault()
            chooseActiveOption()
          } else if (event.key === 'Escape' && expanded) {
            event.preventDefault()
            setExpanded(false)
          }
        }}
        role="combobox"
        type="button"
      >
        <span>{selectedOption?.label ?? placeholder}</span>
        <ChevronDown className="lumen-forms-10-icon lumen-forms-10-icon-xs" aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="lumen-forms-10-property-options" id={listboxId} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.id === valueId}
              className="lumen-forms-10-property-option"
              id={`${listboxId}-${option.id}`}
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setExpanded(false)
              }}
              onMouseMove={() => setActiveOptionId(option.id)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function LumenForms10Reference({
  instanceId,
  content,
  onPropertyChange,
  onReservationReferenceChange,
  onNpsScoreChange,
  onMatrixRatingChange,
  onHighlightChange,
  onFollowUpChange,
  onSubmitRequest,
}: LumenForms10ReferenceProps): React.ReactElement {
  const { copy } = content
  const propertyFieldId = controlId(instanceId, 'property')
  const reservationFieldId = controlId(instanceId, 'reservation-reference')
  const followUpFieldId = controlId(instanceId, 'follow-up')
  const completedRatio = content.progress.total > 0 ? content.progress.answered / content.progress.total : 0
  const progressPercentage = Math.max(0, Math.min(100, completedRatio * 100))
  const selectedNpsIndex = content.npsOptions.findIndex((score) => score === content.npsScore)
  const npsOptionRefs = React.useRef(new Map<LumenForms10NpsScore, HTMLButtonElement>())

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-10-surface"
      contentClassName="lumen-forms-10-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-10"
      data-hbar-app-ui-list-strategy={content.collectionContract.kind}
    >
      <div className="lumen-forms-10-heading">
        <div className="lumen-forms-10-title">
          <h2>{copy.pageTitle}</h2>
          <p>{copy.pageDescription}</p>
        </div>
        <div className="lumen-forms-10-progress">
          <p>{copy.answeredCount(content.progress.answered, content.progress.total)}</p>
          <div className="lumen-forms-10-progress-track" aria-hidden="true">
            <span style={{ inlineSize: `${progressPercentage}%` }} />
          </div>
        </div>
      </div>

      <div className="lumen-forms-10-content">
        <div className="lumen-forms-10-details-row">
          <div className="lumen-forms-10-field">
            <span className="lumen-forms-10-field-label">
              {copy.propertyLabel}
              <span aria-hidden="true">{copy.requiredMarker}</span>
            </span>
            <LumenForms10PropertyPicker
              id={propertyFieldId}
              label={copy.propertyLabel}
              placeholder={copy.propertyPlaceholder}
              valueId={content.propertyId}
              options={content.propertyCatalog.items}
              onChange={onPropertyChange}
            />
          </div>

          <div className="lumen-forms-10-field">
            <span className="lumen-forms-10-field-label">{copy.reservationReferenceLabel}</span>
            <input
              aria-label={copy.reservationReferenceLabel}
              className="lumen-forms-10-text-input"
              id={reservationFieldId}
              onChange={(event) => onReservationReferenceChange(event.currentTarget.value)}
              placeholder={copy.reservationReferencePlaceholder}
              value={content.reservationReference}
            />
            <p className="lumen-forms-10-helper">{copy.reservationReferenceHelper}</p>
          </div>
        </div>

        <div className="lumen-forms-10-question">
          <div className="lumen-forms-10-question-label">
            {copy.recommendationLabel}
            <span aria-hidden="true">{copy.requiredMarker}</span>
          </div>
          <div
            aria-label={copy.recommendationLabel}
            className="lumen-forms-10-nps-options"
            data-nps-option-count={content.npsOptions.length}
            role="radiogroup"
          >
            {content.npsOptions.map((score, index) => (
              <button
                aria-checked={content.npsScore === score}
                aria-label={copy.npsOptionLabel(score)}
                className="lumen-forms-10-nps-option"
                data-nps-score={score}
                key={score}
                onClick={() => onNpsScoreChange(score)}
                ref={(node) => {
                  if (node) {
                    npsOptionRefs.current.set(score, node)
                  } else {
                    npsOptionRefs.current.delete(score)
                  }
                }}
                onKeyDown={(event) => {
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
                  const nextScore = content.npsOptions[index + direction]
                  if (nextScore !== undefined && isNpsScore(nextScore)) {
                    onNpsScoreChange(nextScore)
                    npsOptionRefs.current.get(nextScore)?.focus()
                  }
                }}
                role="radio"
                tabIndex={selectedNpsIndex === index || (selectedNpsIndex < 0 && index === 0) ? 0 : -1}
                type="button"
              >
                {score}
              </button>
            ))}
          </div>
          <div className="lumen-forms-10-nps-endpoints">
            <span>{copy.recommendationLowEndpoint}</span>
            <span>{copy.recommendationHighEndpoint}</span>
          </div>
        </div>

        {content.followUp.visible ? (
          <div className="lumen-forms-10-follow-up">
            <label htmlFor={followUpFieldId}>
              {copy.conditionalFollowUpLabel}
              {content.followUp.required ? <span aria-hidden="true">{copy.requiredMarker}</span> : null}
            </label>
            <textarea
              id={followUpFieldId}
              onChange={(event) => onFollowUpChange(event.currentTarget.value)}
              placeholder={copy.conditionalFollowUpPlaceholder}
              value={content.followUp.value}
            />
            <div className="lumen-forms-10-follow-up-meta">
              <p>{copy.conditionalFollowUpRequiredHelper}</p>
              <p>{copy.followUpCharacterCount(content.followUp.characterCount, content.followUp.counterLimit)}</p>
            </div>
          </div>
        ) : null}

        <div className="lumen-forms-10-question">
          <p className="lumen-forms-10-section-label">
            {copy.matrixHeading}
            <span aria-hidden="true">{copy.requiredMarker}</span>
          </p>
          <div
            className="lumen-forms-10-matrix-scroll"
            data-matrix-scroll-owner={content.collectionContract.matrixNarrowOverflow}
          >
            <div className="lumen-forms-10-matrix">
              <div className="lumen-forms-10-matrix-header" aria-hidden="true">
                <span className="lumen-forms-10-matrix-criterion-space" />
                <div className="lumen-forms-10-matrix-rating-headings">
                  {content.matrixRatingIds.map((ratingId) => (
                    <span key={ratingId}>{copy.matrixRatingLabels[ratingId]}</span>
                  ))}
                </div>
              </div>
              {content.matrixCriteria.map((criterion) => (
                <div
                  aria-label={criterion.label}
                  className="lumen-forms-10-matrix-row"
                  data-criterion-id={criterion.id}
                  key={criterion.id}
                  role="radiogroup"
                >
                  <span className="lumen-forms-10-matrix-criterion">{criterion.label}</span>
                  <div className="lumen-forms-10-matrix-rating-cells">
                    {content.matrixRatingIds.map((ratingId) => {
                      const ratingLabel = copy.matrixRatingLabels[ratingId]
                      const radioId = controlId(instanceId, `${criterion.id}-${ratingId}`)
                      return (
                        <label className="lumen-forms-10-matrix-rating-cell" key={ratingId}>
                          <input
                            aria-label={copy.matrixOptionLabel(criterion.label, ratingLabel)}
                            checked={criterion.selectedRatingId === ratingId}
                            id={radioId}
                            name={controlId(instanceId, criterion.id)}
                            onChange={() => onMatrixRatingChange(criterion.id, ratingId)}
                            type="radio"
                            value={ratingId}
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <fieldset className="lumen-forms-10-highlights">
          <legend>
            {copy.highlightsHeading}
            <span aria-hidden="true">{copy.requiredMarker}</span>
          </legend>
          <div className="lumen-forms-10-highlight-list">
            {content.highlights.map((highlight) => {
              const checkboxId = controlId(instanceId, `highlight-${highlight.id}`)
              return (
                <label
                  className="lumen-forms-10-highlight-option"
                  data-highlight-id={highlight.id}
                  htmlFor={checkboxId}
                  key={highlight.id}
                >
                  <input
                    checked={highlight.selected}
                    id={checkboxId}
                    onChange={(event) => onHighlightChange(highlight.id, event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>{highlight.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>

      <div className="lumen-forms-10-footer">
        <p>{copy.questionsRemaining(content.progress.remaining)}</p>
        <button
          className="lumen-forms-10-submit"
          disabled={content.submit.disabled}
          onClick={onSubmitRequest}
          type="button"
        >
          {copy.submitLabel}
        </button>
      </div>
    </LumenSurface>
  )
}
