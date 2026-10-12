'use client'

import * as React from 'react'
import { ChevronDown, Info, X } from 'lucide-react'
import { LumenInput, LumenSelect, LumenTextarea } from './forms'
import LumenSurface from './LumenSurface'
import './forms-11-reference.css'

export type LumenForms11EnvironmentKindId = 'preview' | 'staging' | 'production'
export type LumenForms11RegionId = 'us-east-n-virginia' | 'us-west-oregon' | 'europe-ireland' | 'asia-pacific-sydney'

export interface LumenForms11EnvironmentKindOption {
  readonly id: LumenForms11EnvironmentKindId
  readonly label: string
  readonly description: string | null
}

export interface LumenForms11RegionOption {
  readonly id: LumenForms11RegionId
  readonly label: string
}

export interface LumenForms11CopyVariableSourceOption {
  readonly id: string
  readonly label: string
}

export interface LumenForms11Copy {
  readonly dialogTitle: string
  readonly dialogDescription: string
  readonly closeLabel: string
  readonly environmentKindLabel: string
  readonly environmentKindLabels: Readonly<Record<LumenForms11EnvironmentKindId, string>>
  readonly environmentKindDescriptions: Readonly<Partial<Record<LumenForms11EnvironmentKindId, string>>>
  readonly nameLabel: string
  readonly requiredMarker: string
  readonly namePlaceholder: string
  readonly deployTarget: (slug: string) => string
  readonly regionLabel: string
  readonly copyVariablesLabel: string
  readonly noVariableSourceLabel: string
  readonly compatibleVariablesHelp: string
  readonly autoDeployLabel: string
  readonly autoDeployHelp: string
  readonly descriptionLabel: string
  readonly descriptionPlaceholder: string
  readonly descriptionCounter: (count: number, limit: number) => string
  readonly cancelLabel: string
  readonly createLabel: string
}

export interface LumenForms11Content {
  readonly copy: LumenForms11Copy
  readonly environmentKind: {
    readonly selectedId: LumenForms11EnvironmentKindId
    readonly options: readonly LumenForms11EnvironmentKindOption[]
    readonly selectedDescription: string | null
  }
  readonly name: {
    readonly value: string
    readonly required: true
    readonly placeholder: string
    readonly slug: string
    readonly deployTarget: string
    readonly createEnabled: boolean
  }
  readonly region: {
    readonly selectedId: LumenForms11RegionId
    readonly options: readonly LumenForms11RegionOption[]
  }
  readonly copyVariables: {
    readonly selectedId: string
    readonly options: readonly LumenForms11CopyVariableSourceOption[]
  }
  readonly autoDeployOnPush: boolean
  readonly description: {
    readonly value: string
    readonly characterCount: number
    readonly counterLimit: number
    readonly counterLabel: string
  }
}

export interface LumenForms11ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms11Content
  readonly onEnvironmentKindChange: (kindId: LumenForms11EnvironmentKindId) => void
  readonly onNameChange: (value: string) => void
  readonly onRegionChange: (regionId: LumenForms11RegionId) => void
  readonly onCopyVariablesChange: (sourceId: string) => void
  readonly onAutoDeployChange: (enabled: boolean) => void
  readonly onDescriptionChange: (value: string) => void
  readonly onCreateRequest: () => void
  readonly onCancelRequest: () => void
  readonly onCloseRequest: () => void
}

export type LumenForms11ViewModel = Omit<LumenForms11ReferenceProps, 'instanceId'>

function controlId(instanceId: string, name: string): string {
  return `${instanceId}-forms-11-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function LumenForms11RegionPicker({
  id,
  label,
  valueId,
  options,
  onChange,
}: {
  readonly id: string
  readonly label: string
  readonly valueId: LumenForms11RegionId
  readonly options: readonly LumenForms11RegionOption[]
  readonly onChange: (regionId: LumenForms11RegionId) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const selectedOption = options.find((option) => option.id === valueId)
  const [activeOptionId, setActiveOptionId] = React.useState<LumenForms11RegionId>(valueId)
  const listboxId = `${id}-options`
  const activeOptionIndex = options.findIndex((option) => option.id === activeOptionId)
  const activeDescendantId = activeOptionIndex >= 0 ? `${listboxId}-${activeOptionId}` : undefined

  const open = (preferredIndex?: number) => {
    const optionIndex =
      preferredIndex ??
      Math.max(
        0,
        options.findIndex((option) => option.id === valueId),
      )
    setActiveOptionId(options[optionIndex]?.id ?? valueId)
    setExpanded(true)
  }

  const moveActiveOption = (direction: -1 | 1) => {
    if (options.length === 0) {
      return
    }
    let startIndex = activeOptionIndex
    if (activeOptionIndex < 0) {
      startIndex = direction === 1 ? -1 : 0
    }
    const nextIndex = (startIndex + direction + options.length) % options.length
    const nextOption = options[nextIndex]
    if (nextOption) {
      setActiveOptionId(nextOption.id)
    }
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
      className="lumen-forms-11-region-control"
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
        className="lumen-forms-11-combobox"
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
            const firstOption = options[0]
            if (firstOption) {
              setActiveOptionId(firstOption.id)
            }
          } else if (event.key === 'End' && expanded) {
            event.preventDefault()
            const lastOption = options.at(-1)
            if (lastOption) {
              setActiveOptionId(lastOption.id)
            }
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
        <span>{selectedOption?.label ?? ''}</span>
        <ChevronDown className="lumen-forms-11-icon lumen-forms-11-icon-sm" aria-hidden="true" />
      </button>
      {expanded ? (
        <div className="lumen-forms-11-region-options" id={listboxId} role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.id === valueId}
              className="lumen-forms-11-region-option"
              id={`${listboxId}-${option.id}`}
              key={option.id}
              onClick={() => {
                onChange(option.id)
                setActiveOptionId(option.id)
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

export function LumenForms11Reference({
  instanceId,
  content,
  onEnvironmentKindChange,
  onNameChange,
  onRegionChange,
  onCopyVariablesChange,
  onAutoDeployChange,
  onDescriptionChange,
  onCreateRequest,
  onCancelRequest,
  onCloseRequest,
}: LumenForms11ReferenceProps): React.ReactElement {
  const { copy } = content
  const titleId = controlId(instanceId, 'title')
  const descriptionId = controlId(instanceId, 'dialog-description')
  const nameId = controlId(instanceId, 'name')
  const nameHelpId = controlId(instanceId, 'name-help')
  const regionId = controlId(instanceId, 'region')
  const copyVariablesId = controlId(instanceId, 'copy-variables')
  const descriptionFieldId = controlId(instanceId, 'description')

  return (
    <LumenSurface
      as="div"
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="lumen-forms-11-surface"
      contentClassName="lumen-forms-11-reference"
      data-hbar-app-ui-component="hbar-app-ui-forms-11"
      material="solid"
      role="dialog"
    >
      <header className="lumen-forms-11-heading">
        <div className="lumen-forms-11-heading-copy">
          <h2 id={titleId}>{copy.dialogTitle}</h2>
          <p id={descriptionId}>{copy.dialogDescription}</p>
        </div>
        <button
          aria-label={copy.closeLabel}
          className="lumen-forms-11-close"
          onClick={onCloseRequest}
          title={copy.closeLabel}
          type="button"
        >
          <X className="lumen-forms-11-icon lumen-forms-11-icon-sm" aria-hidden="true" />
        </button>
      </header>

      <div className="lumen-forms-11-body">
        <section className="lumen-forms-11-kind-field">
          <span className="lumen-forms-11-field-label">{copy.environmentKindLabel}</span>
          <div aria-label={copy.environmentKindLabel} className="lumen-forms-11-kind-picker" role="radiogroup">
            {content.environmentKind.options.map((option) => (
              <button
                aria-checked={content.environmentKind.selectedId === option.id}
                className="lumen-forms-11-kind-option"
                key={option.id}
                onClick={() => onEnvironmentKindChange(option.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                    return
                  }
                  event.preventDefault()
                  const direction = event.key === 'ArrowRight' ? 1 : -1
                  const selectedIndex = content.environmentKind.options.findIndex(
                    (item) => item.id === content.environmentKind.selectedId,
                  )
                  const nextIndex =
                    (selectedIndex + direction + content.environmentKind.options.length) %
                    content.environmentKind.options.length
                  const nextOption = content.environmentKind.options[nextIndex]
                  if (nextOption) {
                    onEnvironmentKindChange(nextOption.id)
                  }
                }}
                role="radio"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {content.environmentKind.selectedDescription ? (
            <div className="lumen-forms-11-kind-description">
              <Info className="lumen-forms-11-icon lumen-forms-11-icon-xs" aria-hidden="true" />
              <p>{content.environmentKind.selectedDescription}</p>
            </div>
          ) : null}
        </section>

        <div className="lumen-forms-11-field">
          <label className="lumen-forms-11-field-label" htmlFor={nameId}>
            {copy.nameLabel}
            <span aria-hidden="true">{copy.requiredMarker}</span>
          </label>
          <LumenInput
            aria-describedby={nameHelpId}
            className="lumen-forms-11-input"
            id={nameId}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            placeholder={copy.namePlaceholder}
            required={content.name.required}
            value={content.name.value}
            variant="boxed"
          />
          <p className="lumen-forms-11-field-help" id={nameHelpId}>
            {content.name.deployTarget}
          </p>
        </div>

        <div className="lumen-forms-11-field">
          <label className="lumen-forms-11-field-label" htmlFor={regionId}>
            {copy.regionLabel}
          </label>
          <LumenForms11RegionPicker
            id={regionId}
            label={copy.regionLabel}
            valueId={content.region.selectedId}
            options={content.region.options}
            onChange={onRegionChange}
          />
        </div>

        <div className="lumen-forms-11-field">
          <label className="lumen-forms-11-field-label" htmlFor={copyVariablesId}>
            {copy.copyVariablesLabel}
          </label>
          <LumenSelect
            aria-label={copy.copyVariablesLabel}
            className="lumen-forms-11-select"
            id={copyVariablesId}
            onChange={(event) => onCopyVariablesChange(event.currentTarget.value)}
            value={content.copyVariables.selectedId}
            variant="boxed"
          >
            {content.copyVariables.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </LumenSelect>
          <p className="lumen-forms-11-field-help">{copy.compatibleVariablesHelp}</p>
        </div>

        <div className="lumen-forms-11-auto-deploy">
          <div className="lumen-forms-11-auto-deploy-copy">
            <span className="lumen-forms-11-field-label">{copy.autoDeployLabel}</span>
            <p className="lumen-forms-11-field-help">{copy.autoDeployHelp}</p>
          </div>
          <button
            aria-checked={content.autoDeployOnPush}
            aria-label={copy.autoDeployLabel}
            className="lumen-forms-11-switch"
            onClick={() => onAutoDeployChange(!content.autoDeployOnPush)}
            role="switch"
            type="button"
          >
            <span />
          </button>
        </div>

        <div className="lumen-forms-11-field">
          <label className="lumen-forms-11-field-label" htmlFor={descriptionFieldId}>
            {copy.descriptionLabel}
          </label>
          <LumenTextarea
            className="lumen-forms-11-textarea"
            id={descriptionFieldId}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            placeholder={copy.descriptionPlaceholder}
            rows={3}
            value={content.description.value}
            variant="boxed"
          />
          <p className="lumen-forms-11-description-counter">{content.description.counterLabel}</p>
        </div>
      </div>

      <footer className="lumen-forms-11-footer">
        <button className="lumen-forms-11-cancel" onClick={onCancelRequest} type="button">
          {copy.cancelLabel}
        </button>
        <button
          className="lumen-forms-11-create"
          disabled={!content.name.createEnabled}
          onClick={onCreateRequest}
          type="button"
        >
          {copy.createLabel}
        </button>
      </footer>
    </LumenSurface>
  )
}
