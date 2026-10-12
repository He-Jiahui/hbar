'use client'

import * as React from 'react'
import type { LumenSize } from './appearance'
import type { LumenControlOption } from './forms'
import { LumenContentText } from './content-text'
import './toggle-group.css'

export type { LumenControlOption } from './forms'

/** Optional option-level accessibility metadata supplied by the host. */
export type LumenToggleOption = LumenControlOption &
  Pick<
    React.AriaAttributes,
    | 'aria-describedby'
    | 'aria-details'
    | 'aria-errormessage'
    | 'aria-keyshortcuts'
    | 'aria-label'
    | 'aria-labelledby'
    | 'aria-roledescription'
  >

interface LumenToggleGroupBaseProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'id' | 'role' | 'className' | 'onChange' | 'data-value'
> {
  /** Stable DOM id. A generated id is used when omitted. */
  id?: string | undefined
  /** Optional accessible name. `aria-label`/`aria-labelledby` take precedence. */
  label?: string | undefined
  /** Form field name used by the validation proxy inputs. */
  name?: string | undefined
  /** Form id used when the control is rendered outside its form element. */
  form?: string | undefined
  /** Require a value when the group participates in native form validation. */
  required?: boolean | undefined
  disabled?: boolean | undefined
  size?: LumenSize | undefined
  className?: string | undefined
  /** Compatibility size attribute used by existing Lumen form-field binding. */
  'data-size'?: string | undefined
  /** Called when the owning form is reset. */
  onReset?: (() => void) | undefined
  options: readonly LumenToggleOption[]
}

export interface LumenToggleGroupSingleProps extends LumenToggleGroupBaseProps {
  type: 'single'
  value: string | null
  onValueChange: (value: string) => void
  values?: never | undefined
  onValuesChange?: never | undefined
}

export interface LumenToggleGroupMultipleProps extends LumenToggleGroupBaseProps {
  type: 'multiple'
  values: readonly string[]
  onValuesChange: (values: string[]) => void
  value?: never | undefined
  onValueChange?: never | undefined
}

export type LumenToggleGroupProps = LumenToggleGroupSingleProps | LumenToggleGroupMultipleProps

type OptionButton = HTMLButtonElement

function uniqueOptions(options: readonly LumenToggleOption[]): readonly LumenToggleOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false
    }
    seen.add(option.id)
    return true
  })
}

function optionAria(
  option: LumenToggleOption,
): Pick<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  | 'aria-describedby'
  | 'aria-details'
  | 'aria-errormessage'
  | 'aria-keyshortcuts'
  | 'aria-label'
  | 'aria-labelledby'
  | 'aria-roledescription'
> {
  return {
    'aria-describedby': option['aria-describedby'],
    'aria-details': option['aria-details'],
    'aria-errormessage': option['aria-errormessage'],
    'aria-keyshortcuts': option['aria-keyshortcuts'],
    'aria-label': option['aria-label'],
    'aria-labelledby': option['aria-labelledby'],
    'aria-roledescription': option['aria-roledescription'],
  }
}

function isAriaInvalid(value: React.AriaAttributes['aria-invalid']): boolean {
  return value === true || value === 'true' || value === 'grammar' || value === 'spelling'
}

/**
 * A host-controlled choice group.
 *
 * Single groups expose radio semantics and a roving tab stop. Multiple groups
 * expose toggle-button semantics and retain the order of the host's values.
 */
export const LumenToggleGroup = React.forwardRef<HTMLDivElement, LumenToggleGroupProps>(
  function LumenToggleGroup(props, forwardedRef) {
    const {
      id,
      label,
      name,
      form,
      required = false,
      disabled = false,
      size,
      className,
      options: rawOptions,
      onReset,
      type,
      value,
      values,
      onValueChange,
      onValuesChange,
      'data-size': compatibilitySize,
      ...rootProps
    } = props
    const generatedId = React.useId().replaceAll(':', '')
    const controlId = id ?? `lumen-toggle-group-${generatedId}`
    const validationId = `${controlId}-value`
    const options = React.useMemo(() => uniqueOptions(rawOptions), [rawOptions])
    const buttonRefs = React.useRef<Map<string, OptionButton>>(new Map())
    const [activeId, setActiveId] = React.useState<string | null>(null)
    const isSingle = type === 'single'
    const selectedValue = isSingle ? value : null
    const selectedValues = React.useMemo(() => (type === 'multiple' ? [...new Set(values)] : []), [type, values])
    const selectedSet = React.useMemo(() => new Set(selectedValues), [selectedValues])
    const availableIds = React.useMemo(
      () => (disabled ? [] : options.filter((option) => !option.disabled).map((option) => option.id)),
      [disabled, options],
    )
    const selectedIsStale = isSingle
      ? selectedValue !== null && !options.some((option) => option.id === selectedValue)
      : selectedValues.some((value) => !options.some((option) => option.id === value))
    const invalid = isAriaInvalid(rootProps['aria-invalid']) || selectedIsStale
    const resolvedSize = size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)
    const hasSelectedOption = isSingle
      ? selectedValue !== null && options.some((option) => option.id === selectedValue)
      : selectedValues.some((selected) => options.some((option) => option.id === selected))
    const fallbackActiveId =
      isSingle && selectedValue !== null && availableIds.includes(selectedValue)
        ? selectedValue
        : (availableIds[0] ?? null)
    const tabStopId = activeId !== null && availableIds.includes(activeId) ? activeId : fallbackActiveId

    React.useEffect(() => {
      if (!isSingle) {
        return
      }
      setActiveId((current) => {
        if (selectedValue !== null && availableIds.includes(selectedValue)) {
          return selectedValue
        }
        if (current !== null && availableIds.includes(current)) {
          return current
        }
        return availableIds[0] ?? null
      })
    }, [availableIds, isSingle, selectedValue])

    React.useEffect(() => {
      const input = buttonRefs.current.get(tabStopId ?? '')
      if (!input) {
        return
      }
      // Keep the map free from detached options after a host list mutation.
      for (const [optionId, button] of buttonRefs.current) {
        if (!button.isConnected || !options.some((option) => option.id === optionId)) {
          buttonRefs.current.delete(optionId)
        }
      }
    }, [options, tabStopId])

    React.useEffect(() => {
      const input = document.getElementById(validationId)
      if (!(input instanceof HTMLInputElement) || !onReset) {
        return undefined
      }
      const formElement = form ? document.getElementById(form) : input.form
      if (!(formElement instanceof HTMLFormElement)) {
        return undefined
      }
      const reset = () => onReset()
      formElement.addEventListener('reset', reset)
      return () => formElement.removeEventListener('reset', reset)
    }, [form, onReset, validationId])

    const setButtonRef = React.useCallback((optionId: string, button: OptionButton | null) => {
      if (button) {
        buttonRefs.current.set(optionId, button)
      } else {
        buttonRefs.current.delete(optionId)
      }
    }, [])

    const focusOption = React.useCallback((optionId: string | null) => {
      if (optionId === null) {
        return
      }
      setActiveId(optionId)
      buttonRefs.current.get(optionId)?.focus()
    }, [])

    const activateSingle = React.useCallback(
      (option: LumenToggleOption) => {
        if (disabled || option.disabled || type !== 'single' || !onValueChange) {
          return
        }
        onValueChange(option.id)
      },
      [disabled, onValueChange, type],
    )

    const toggleMultiple = React.useCallback(
      (option: LumenToggleOption) => {
        if (disabled || option.disabled || type !== 'multiple' || !onValuesChange) {
          return
        }
        const next = selectedSet.has(option.id)
          ? selectedValues.filter((value) => value !== option.id)
          : [...selectedValues, option.id]
        onValuesChange(next)
      },
      [disabled, onValuesChange, selectedSet, selectedValues, type],
    )

    const handleSingleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>, option: LumenToggleOption) => {
        if (disabled || option.disabled || type !== 'single') {
          return
        }
        const currentIndex = availableIds.indexOf(option.id)
        let nextId: string | null = null
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
          event.preventDefault()
          nextId = availableIds[(currentIndex + 1 + availableIds.length) % availableIds.length] ?? null
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
          event.preventDefault()
          nextId = availableIds[(currentIndex - 1 + availableIds.length) % availableIds.length] ?? null
        } else if (event.key === 'Home') {
          event.preventDefault()
          nextId = availableIds[0] ?? null
        } else if (event.key === 'End') {
          event.preventDefault()
          nextId = availableIds.at(-1) ?? null
        } else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          activateSingle(option)
          return
        }
        if (nextId !== null) {
          focusOption(nextId)
          const nextOption = options.find((candidate) => candidate.id === nextId)
          if (nextOption) {
            activateSingle(nextOption)
          }
        }
      },
      [activateSingle, availableIds, disabled, focusOption, options, type],
    )

    const handleMultipleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>, option: LumenToggleOption) => {
        if (disabled || option.disabled || type !== 'multiple') {
          return
        }
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
          event.preventDefault()
          toggleMultiple(option)
        }
      },
      [disabled, toggleMultiple, type],
    )

    const multipleValueEntries = selectedValues.length > 0 ? selectedValues : ['']
    const hiddenValueEntries = isSingle ? [selectedValue ?? ''] : multipleValueEntries
    const describedBy = rootProps['aria-describedby']
    const rootAriaLabel = rootProps['aria-label'] ?? (rootProps['aria-labelledby'] ? undefined : label)

    return (
      <div
        {...rootProps}
        ref={forwardedRef}
        id={controlId}
        className={['lumen-toggle-group', className].filter(Boolean).join(' ')}
        data-size={resolvedSize}
        data-type={type}
        data-value={isSingle ? (selectedValue ?? '') : undefined}
        data-stale={selectedIsStale || undefined}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        role={isSingle ? 'radiogroup' : 'group'}
        aria-disabled={disabled || undefined}
        aria-label={rootAriaLabel}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
      >
        <div className="lumen-toggle-options">
          {options.map((option) => {
            const optionDisabled = disabled || Boolean(option.disabled)
            const selected = isSingle ? selectedValue === option.id : selectedSet.has(option.id)
            const optionLabel = option.label
            const optionAttributes = optionAria(option)
            const optionTabIndex = !isSingle || option.id === tabStopId ? 0 : -1
            return (
              <button
                {...optionAttributes}
                key={option.id}
                ref={(button) => setButtonRef(option.id, button)}
                type="button"
                className={['lumen-toggle-option', 'lumen-effect', selected ? 'is-selected' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-value={option.id}
                data-size={resolvedSize}
                data-selected={selected || undefined}
                role={isSingle ? 'radio' : undefined}
                aria-checked={isSingle ? selected : undefined}
                aria-pressed={!isSingle ? selected : undefined}
                aria-disabled={optionDisabled || undefined}
                disabled={optionDisabled}
                tabIndex={optionTabIndex}
                onFocus={() => {
                  if (isSingle && !optionDisabled) {
                    setActiveId(option.id)
                  }
                }}
                onClick={() => {
                  if (isSingle) {
                    activateSingle(option)
                  } else {
                    toggleMultiple(option)
                  }
                }}
                onKeyDown={(event) => {
                  if (isSingle) {
                    handleSingleKeyDown(event, option)
                  } else {
                    handleMultipleKeyDown(event, option)
                  }
                }}
              >
                <span className="lumen-toggle-option-copy">
                  <LumenContentText context="control.label" className="lumen-toggle-option-label">
                    {optionLabel}
                  </LumenContentText>
                  {option.detail ? (
                    <LumenContentText context="form.description" className="lumen-toggle-option-detail">
                      {option.detail}
                    </LumenContentText>
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
        {hiddenValueEntries.map((entry, index) => (
          <input
            key={`${validationId}-${index}`}
            id={index === 0 ? validationId : `${validationId}-${index}`}
            className="lumen-toggle-group-validation"
            type="text"
            tabIndex={-1}
            name={name}
            form={form}
            value={entry}
            required={required && !hasSelectedOption && index === 0}
            disabled={disabled}
            aria-hidden="true"
            aria-describedby={describedBy}
            onChange={() => undefined}
            onInvalid={(event) => {
              event.preventDefault()
              buttonRefs.current.get(tabStopId ?? '')?.focus()
            }}
          />
        ))}
      </div>
    )
  },
)
