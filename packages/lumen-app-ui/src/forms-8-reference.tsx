'use client'

import * as React from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton } from './primitives'
import './forms-8-reference.css'

export interface LumenForms8Option {
  readonly id: string
  readonly label: string
}

export type LumenForms8ValueKind =
  'number' | 'number-range' | 'text' | 'text-list' | 'choice' | 'choice-many' | 'boolean'

export type LumenForms8ConditionValue =
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'number-range'; readonly lower: string; readonly upper: string }
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'text-list'; readonly values: readonly string[] }
  | { readonly kind: 'choice'; readonly optionId: string }
  | { readonly kind: 'choice-many'; readonly optionIds: readonly string[] }
  | { readonly kind: 'boolean'; readonly value: boolean }

export interface LumenForms8Operator extends LumenForms8Option {
  readonly valueKind: LumenForms8ValueKind
}

export interface LumenForms8Field extends LumenForms8Option {
  readonly kind: 'number' | 'text' | 'choice' | 'boolean'
  readonly operators: readonly LumenForms8Operator[]
  readonly unitLabel?: string
  readonly options?: {
    readonly completeness: 'complete' | 'partial' | 'unobserved'
    readonly items: readonly LumenForms8Option[]
  }
}

export interface LumenForms8Condition {
  readonly id: string
  readonly fieldId: string
  readonly operatorId: string
  readonly value: LumenForms8ConditionValue
}

export type LumenForms8Action =
  | {
      readonly id: string
      readonly kind: 'route-to-zone'
      readonly label: string
      readonly zoneId: string
      readonly zoneLabel: string
    }
  | {
      readonly id: string
      readonly kind: 'notify'
      readonly label: string
      readonly recipientId: string
      readonly recipientLabel: string
    }

export type LumenForms8MatchMode = 'all' | 'any'

export interface LumenForms8Draft {
  readonly matchMode: LumenForms8MatchMode
  readonly conditions: readonly LumenForms8Condition[]
  readonly actions: readonly LumenForms8Action[]
}

export interface LumenForms8Copy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly whenHeading: string
  readonly thenHeading: string
  readonly actionOrderHelper: string
  readonly matchModeGroupLabel: string
  readonly matchAllLabel: string
  readonly matchAnyLabel: string
  readonly addConditionLabel: string
  readonly removeConditionLabel: string
  readonly fieldPickerLabel: (conditionNumber: number) => string
  readonly operatorPickerLabel: (fieldLabel: string) => string
  readonly numberValueLabel: (fieldLabel: string) => string
  readonly lowerRangeLabel: (fieldLabel: string) => string
  readonly upperRangeLabel: (fieldLabel: string) => string
  readonly textValueLabel: (fieldLabel: string) => string
  readonly choiceValueLabel: (fieldLabel: string) => string
  readonly choicePlaceholder: string
  readonly numberPlaceholder: string
  readonly summaryLabel: string
  readonly incompleteConditionMessage: string
  readonly booleanValueGroupLabel: (fieldLabel: string) => string
  readonly yesLabel: string
  readonly noLabel: string
  readonly testRuleLabel: string
  readonly saveRuleLabel: string
}

export interface LumenForms8Content {
  readonly copy: LumenForms8Copy
  readonly fields: readonly LumenForms8Field[]
  readonly matchMode: LumenForms8MatchMode
  readonly conditions: readonly LumenForms8Condition[]
  readonly actions: readonly LumenForms8Action[]
  readonly summary: string
  readonly isComplete: boolean
  readonly validationMessage: string | undefined
  readonly conditionCollection: {
    readonly kind: 'pane-scroll'
    readonly capacityEvidence: 'not-observed'
  }
}

export interface LumenForms8ReferenceProps {
  readonly instanceId: string
  readonly content: LumenForms8Content
  readonly onMatchModeChange: (mode: LumenForms8MatchMode) => void
  readonly onConditionFieldChange: (conditionId: string, fieldId: string) => void
  readonly onConditionOperatorChange: (conditionId: string, operatorId: string) => void
  readonly onConditionValueChange: (conditionId: string, value: LumenForms8ConditionValue) => void
  readonly onAddCondition: () => void
  readonly onRemoveCondition: (conditionId: string) => void
  readonly onActionPickerRequest: (actionId: string, part: 'kind' | 'target') => void
  readonly onTestRule: (draft: LumenForms8Draft) => void
  readonly onSaveRule: (draft: LumenForms8Draft) => void
}

export type LumenForms8ViewModel = Omit<LumenForms8ReferenceProps, 'instanceId'>

function controlId(instanceId: string, name: string): string {
  return `${instanceId}-forms-8-${name}`
}

function valueLabel(field: LumenForms8Field, content: LumenForms8Content, value: LumenForms8ConditionValue): string {
  if (value.kind === 'choice') {
    return field.options?.items.find((option) => option.id === value.optionId)?.label ?? content.copy.choicePlaceholder
  }
  if (value.kind === 'choice-many') {
    return (
      value.optionIds
        .map((id) => field.options?.items.find((option) => option.id === id)?.label)
        .filter((label): label is string => label !== undefined)
        .join(', ') || content.copy.choicePlaceholder
    )
  }
  return content.copy.choicePlaceholder
}

function ChoicePicker({
  id,
  label,
  choices,
  selectedIds,
  placeholder,
  multi,
  onChoose,
}: {
  readonly id: string
  readonly label?: string | undefined
  readonly choices: readonly LumenForms8Option[]
  readonly selectedIds: readonly string[]
  readonly placeholder: string
  readonly multi: boolean
  readonly onChoose: (id: string) => void
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false)
  const selectedIndex = choices.findIndex((choice) => selectedIds.includes(choice.id))
  const [activeIndex, setActiveIndex] = React.useState(Math.max(selectedIndex, 0))
  const listboxId = `${id}-options`
  const activeChoice = choices[activeIndex]
  const selectedLabels = choices.filter((choice) => selectedIds.includes(choice.id)).map((choice) => choice.label)
  const displayValue = selectedLabels.join(', ') || placeholder

  const choose = (choiceId: string) => {
    onChoose(choiceId)
    if (!multi) setExpanded(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (choices.length === 0) return
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
      setActiveIndex((index) => (index + delta + choices.length) % choices.length)
      return
    }
    if (expanded && event.key === 'Enter') {
      event.preventDefault()
      if (activeChoice) choose(activeChoice.id)
    }
  }

  return (
    <div className="lumen-forms-8-picker">
      <LumenButton
        id={id}
        className="lumen-forms-8-picker-trigger"
        variant="outlined"
        tone="neutral"
        size="m"
        indicator="none"
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-activedescendant={expanded && activeChoice ? `${listboxId}-${activeChoice.id}` : undefined}
        onClick={() => {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
          setExpanded((open) => !open)
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{displayValue}</span>
        <ChevronDown className="lumen-forms-8-icon lumen-forms-8-icon-xs" aria-hidden="true" />
      </LumenButton>
      {expanded ? (
        <div className="lumen-forms-8-options" id={listboxId} role="listbox" aria-multiselectable={multi || undefined}>
          {choices.map((choice, index) => {
            const selected = selectedIds.includes(choice.id)
            return (
              <div
                className="lumen-forms-8-option"
                data-active={index === activeIndex || undefined}
                id={`${listboxId}-${choice.id}`}
                key={choice.id}
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(choice.id)}
              >
                {choice.label}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function ConditionValueControl({
  instanceId,
  content,
  condition,
  field,
  onChange,
}: {
  readonly instanceId: string
  readonly content: LumenForms8Content
  readonly condition: LumenForms8Condition
  readonly field: LumenForms8Field
  readonly onChange: (value: LumenForms8ConditionValue) => void
}): React.ReactElement {
  const id = controlId(instanceId, `condition-${condition.id}-value`)
  const value = condition.value

  if (value.kind === 'number') {
    return (
      <div className="lumen-forms-8-value-control">
        <LumenInput
          id={id}
          className="lumen-forms-8-input"
          aria-label={content.copy.numberValueLabel(field.label)}
          placeholder={content.copy.numberPlaceholder}
          value={value.value}
          variant="boxed"
          onChange={(event) => onChange({ kind: 'number', value: event.currentTarget.value })}
        />
        {field.unitLabel ? <span className="lumen-forms-8-unit">{field.unitLabel}</span> : null}
      </div>
    )
  }

  if (value.kind === 'number-range') {
    return (
      <div className="lumen-forms-8-range-control">
        <LumenInput
          id={`${id}-lower`}
          className="lumen-forms-8-input"
          aria-label={content.copy.lowerRangeLabel(field.label)}
          placeholder={content.copy.numberPlaceholder}
          value={value.lower}
          variant="boxed"
          onChange={(event) => onChange({ ...value, lower: event.currentTarget.value })}
        />
        <LumenInput
          id={`${id}-upper`}
          className="lumen-forms-8-input"
          aria-label={content.copy.upperRangeLabel(field.label)}
          placeholder={content.copy.numberPlaceholder}
          value={value.upper}
          variant="boxed"
          onChange={(event) => onChange({ ...value, upper: event.currentTarget.value })}
        />
      </div>
    )
  }

  if (value.kind === 'text') {
    return (
      <LumenInput
        id={id}
        className="lumen-forms-8-input"
        aria-label={content.copy.textValueLabel(field.label)}
        value={value.value}
        variant="boxed"
        onChange={(event) => onChange({ kind: 'text', value: event.currentTarget.value })}
      />
    )
  }

  if (value.kind === 'text-list') {
    return (
      <LumenInput
        id={id}
        className="lumen-forms-8-input"
        aria-label={content.copy.textValueLabel(field.label)}
        value={value.values.join(', ')}
        variant="boxed"
        onChange={(event) =>
          onChange({
            kind: 'text-list',
            values: event.currentTarget.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          })
        }
      />
    )
  }

  if (value.kind === 'choice' || value.kind === 'choice-many') {
    const selectedIds = value.kind === 'choice' ? (value.optionId ? [value.optionId] : []) : value.optionIds
    const selectedLabel = valueLabel(field, content, value)
    return (
      <ChoicePicker
        id={id}
        label={selectedLabel}
        choices={field.options?.items ?? []}
        selectedIds={selectedIds}
        placeholder={content.copy.choicePlaceholder}
        multi={value.kind === 'choice-many'}
        onChoose={(optionId) =>
          onChange(
            value.kind === 'choice'
              ? { kind: 'choice', optionId }
              : {
                  kind: 'choice-many',
                  optionIds: selectedIds.includes(optionId)
                    ? selectedIds.filter((selectedId) => selectedId !== optionId)
                    : [...selectedIds, optionId],
                },
          )
        }
      />
    )
  }

  return (
    <div className="lumen-forms-8-boolean" role="group" aria-label={content.copy.booleanValueGroupLabel(field.label)}>
      {[
        { value: true, label: content.copy.yesLabel },
        { value: false, label: content.copy.noLabel },
      ].map((option) => (
        <LumenButton
          className="lumen-forms-8-boolean-option"
          data-selected={value.value === option.value}
          key={option.label}
          variant="text"
          tone="neutral"
          size="m"
          indicator="none"
          type="button"
          aria-pressed={value.value === option.value}
          onClick={() => onChange({ kind: 'boolean', value: option.value })}
        >
          {option.label}
        </LumenButton>
      ))}
    </div>
  )
}

function ConditionRow({
  instanceId,
  content,
  condition,
  onFieldChange,
  onOperatorChange,
  onValueChange,
  onRemove,
}: {
  readonly instanceId: string
  readonly content: LumenForms8Content
  readonly condition: LumenForms8Condition
  readonly onFieldChange: (conditionId: string, fieldId: string) => void
  readonly onOperatorChange: (conditionId: string, operatorId: string) => void
  readonly onValueChange: (conditionId: string, value: LumenForms8ConditionValue) => void
  readonly onRemove: (conditionId: string) => void
}): React.ReactElement | null {
  const field = content.fields.find((candidate) => candidate.id === condition.fieldId)
  const operator = field?.operators.find((candidate) => candidate.id === condition.operatorId)
  if (!field || !operator) return null
  const fieldControlId = controlId(instanceId, `condition-${condition.id}-field`)
  const operatorControlId = controlId(instanceId, `condition-${condition.id}-operator`)
  return (
    <div className="lumen-forms-8-condition" data-condition-id={condition.id}>
      <ChoicePicker
        id={fieldControlId}
        label={field.label}
        choices={content.fields}
        selectedIds={[field.id]}
        placeholder={field.label}
        multi={false}
        onChoose={(fieldId) => onFieldChange(condition.id, fieldId)}
      />
      <ChoicePicker
        id={operatorControlId}
        label={operator.label}
        choices={field.operators}
        selectedIds={[operator.id]}
        placeholder={operator.label}
        multi={false}
        onChoose={(operatorId) => onOperatorChange(condition.id, operatorId)}
      />
      <ConditionValueControl
        instanceId={instanceId}
        content={content}
        condition={condition}
        field={field}
        onChange={(value) => onValueChange(condition.id, value)}
      />
      <LumenButton
        className="lumen-forms-8-remove-condition"
        variant="text"
        tone="neutral"
        size="m"
        indicator="none"
        type="button"
        aria-label={content.copy.removeConditionLabel}
        onClick={() => onRemove(condition.id)}
      >
        <Trash2 className="lumen-forms-8-icon lumen-forms-8-icon-sm" aria-hidden="true" />
      </LumenButton>
    </div>
  )
}

function ActionPicker({
  action,
  part,
  label,
  actionId,
  onRequest,
}: {
  readonly action: LumenForms8Action
  readonly part: 'kind' | 'target'
  readonly label: string
  readonly actionId: string
  readonly onRequest: (actionId: string, part: 'kind' | 'target') => void
}): React.ReactElement {
  const displayValue = part === 'kind' ? action.label : label
  return (
    <LumenButton
      className="lumen-forms-8-action-picker"
      variant="outlined"
      tone="neutral"
      size="m"
      indicator="none"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={false}
      onClick={() => onRequest(actionId, part)}
    >
      <span>{displayValue}</span>
      <ChevronDown className="lumen-forms-8-icon lumen-forms-8-icon-xs" aria-hidden="true" />
    </LumenButton>
  )
}

export function LumenForms8Reference({
  instanceId,
  content,
  onMatchModeChange,
  onConditionFieldChange,
  onConditionOperatorChange,
  onConditionValueChange,
  onAddCondition,
  onRemoveCondition,
  onActionPickerRequest,
  onTestRule,
  onSaveRule,
}: LumenForms8ReferenceProps): React.ReactElement {
  const draft: LumenForms8Draft = {
    matchMode: content.matchMode,
    conditions: content.conditions,
    actions: content.actions,
  }

  return (
    <LumenSurface
      as="div"
      className="lumen-forms-8-surface"
      contentClassName="lumen-forms-8-reference"
      material="solid"
      data-hbar-app-ui-component="hbar-app-ui-forms-8"
      data-hbar-app-ui-list-strategy={content.conditionCollection.kind}
    >
      <div className="lumen-forms-8-heading">
        <h2>{content.copy.pageTitle}</h2>
        <p>{content.copy.pageDescription}</p>
      </div>

      <div className="lumen-forms-8-content">
        <section className="lumen-forms-8-when">
          <div className="lumen-forms-8-section-heading">
            <h3>{content.copy.whenHeading}</h3>
            <div className="lumen-forms-8-match-mode" role="group" aria-label={content.copy.matchModeGroupLabel}>
              <LumenButton
                className="lumen-forms-8-match-option"
                data-selected={content.matchMode === 'all'}
                variant="text"
                tone="neutral"
                size="m"
                indicator="none"
                type="button"
                aria-pressed={content.matchMode === 'all'}
                onClick={() => onMatchModeChange('all')}
              >
                {content.copy.matchAllLabel}
              </LumenButton>
              <LumenButton
                className="lumen-forms-8-match-option"
                data-selected={content.matchMode === 'any'}
                variant="text"
                tone="neutral"
                size="m"
                indicator="none"
                type="button"
                aria-pressed={content.matchMode === 'any'}
                onClick={() => onMatchModeChange('any')}
              >
                {content.copy.matchAnyLabel}
              </LumenButton>
            </div>
          </div>

          <div className="lumen-forms-8-condition-list">
            {content.conditions.map((condition) => (
              <ConditionRow
                key={condition.id}
                instanceId={instanceId}
                content={content}
                condition={condition}
                onFieldChange={onConditionFieldChange}
                onOperatorChange={onConditionOperatorChange}
                onValueChange={onConditionValueChange}
                onRemove={onRemoveCondition}
              />
            ))}
          </div>

          <LumenButton
            className="lumen-forms-8-add-condition"
            variant="outlined"
            tone="neutral"
            size="m"
            indicator="none"
            type="button"
            onClick={onAddCondition}
          >
            <Plus className="lumen-forms-8-icon lumen-forms-8-icon-sm" aria-hidden="true" />
            {content.copy.addConditionLabel}
          </LumenButton>
        </section>

        <section className="lumen-forms-8-then">
          <div className="lumen-forms-8-section-heading lumen-forms-8-action-heading">
            <h3>{content.copy.thenHeading}</h3>
            <p>{content.copy.actionOrderHelper}</p>
          </div>
          <div className="lumen-forms-8-action-list">
            {content.actions.map((action) => (
              <div className="lumen-forms-8-action-row" key={action.id} data-action-id={action.id}>
                <ActionPicker
                  action={action}
                  part="kind"
                  label={action.label}
                  actionId={action.id}
                  onRequest={onActionPickerRequest}
                />
                <ActionPicker
                  action={action}
                  part="target"
                  label={action.kind === 'route-to-zone' ? action.zoneLabel : action.recipientLabel}
                  actionId={action.id}
                  onRequest={onActionPickerRequest}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="lumen-forms-8-summary">
          <div className="lumen-forms-8-summary-card">
            <p>{content.copy.summaryLabel}</p>
            <p>{content.summary}</p>
          </div>
        </section>
      </div>

      <div className="lumen-forms-8-footer">
        <LumenButton
          className="lumen-forms-8-test-button"
          variant="outlined"
          tone="neutral"
          size="m"
          indicator="none"
          type="button"
          disabled={!content.isComplete}
          onClick={() => onTestRule(draft)}
        >
          {content.copy.testRuleLabel}
        </LumenButton>
        {content.validationMessage ? (
          <span className="lumen-forms-8-validation">{content.validationMessage}</span>
        ) : null}
        <LumenButton
          className="lumen-forms-8-save-button"
          variant="solid"
          tone="primary"
          size="m"
          indicator="none"
          type="button"
          disabled={!content.isComplete}
          onClick={() => onSaveRule(draft)}
        >
          {content.copy.saveRuleLabel}
        </LumenButton>
      </div>
    </LumenSurface>
  )
}
