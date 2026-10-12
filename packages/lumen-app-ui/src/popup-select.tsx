'use client'

import * as React from 'react'
import type { LumenSize } from './appearance'
import LumenField from './LumenField'
import { LumenFloatingSurface, useFloatingTrigger } from './floating-surface'
import type { LumenFieldVariant, LumenControlOption } from './forms'
import './popup-select.css'

export type { LumenControlOption } from './forms'

export interface LumenPopupSelectProps {
  /** Stable DOM id used by the trigger and its listbox relationship. */
  id?: string | undefined
  /** Form field name. The component renders a constraint-validating form proxy. */
  name?: string | undefined
  value: string | null
  options: readonly LumenControlOption[]
  onValueChange: (value: string) => void
  /** Text shown when no option is selected. Copy belongs to the host locale. */
  placeholder?: string | undefined
  /** Host-provided text for a persisted value that is no longer in options. */
  selectedLabel?: string | undefined
  boundary?: 'horizontal' | 'vertical' | undefined
  size?: LumenSize | undefined
  variant?: LumenFieldVariant | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  /** Make the popup externally controlled when needed by a host. */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  onReset?: (() => void) | undefined
  className?: string | undefined
  'aria-label'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-errormessage'?: string | undefined
  'aria-invalid'?: React.AriaAttributes['aria-invalid'] | undefined
  'aria-labelledby'?: string | undefined
  form?: string | undefined
  'data-size'?: string | undefined
  'data-variant'?: string | undefined
  onFocus?: React.FocusEventHandler<HTMLButtonElement> | undefined
  onBlur?: React.FocusEventHandler<HTMLButtonElement> | undefined
}

function uniqueOptions(options: readonly LumenControlOption[]): readonly LumenControlOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}

function PopupChevron() {
  return (
    <svg className="lumen-popup-select-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

function PopupCheck() {
  return (
    <svg className="lumen-popup-select-check" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="m3.5 8 3 3 6-6" />
    </svg>
  )
}

function normalizedVariant(variant: LumenFieldVariant): 'outlined' | 'plain' | 'boxed' {
  return variant === 'boundary' ? 'outlined' : variant
}

function isInvalid(value: React.AriaAttributes['aria-invalid']): boolean {
  return value === true || value === 'true'
}

export const LumenPopupSelect = React.forwardRef<HTMLButtonElement, LumenPopupSelectProps>(function LumenPopupSelect(
  {
    id,
    name,
    value,
    options,
    onValueChange,
    placeholder,
    selectedLabel,
    boundary = 'horizontal',
    size,
    variant = 'outlined',
    disabled = false,
    required = false,
    open: controlledOpen,
    onOpenChange,
    onReset,
    className,
    form,
    onFocus,
    onBlur,
    'data-size': compatibilitySize,
    'data-variant': compatibilityVariant,
    ...aria
  },
  forwardedRef,
) {
  const generatedId = React.useId().replaceAll(':', '')
  const controlId = id ?? `lumen-popup-select-${generatedId}`
  const listboxId = `${controlId}-listbox`
  const validationId = `${controlId}-value`
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const validationRef = React.useRef<HTMLInputElement>(null)
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const isOpen = controlledOpen ?? uncontrolledOpen
  const items = React.useMemo(() => uniqueOptions(options), [options])
  const available = React.useMemo(() => items.filter((option) => !option.disabled), [items])
  const selected = items.find((option) => option.id === value)
  const stale = value !== null && selected === undefined
  const label = selected?.label ?? (stale ? selectedLabel : undefined) ?? placeholder ?? ''
  const invalid = isInvalid(aria['aria-invalid']) || stale
  const lumenVariant = normalizedVariant(variant)
  const resolvedSize = size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)

  React.useImperativeHandle(forwardedRef, () => {
    const trigger = triggerRef.current
    if (!trigger) throw new Error('Lumen popup select trigger is not mounted.')
    return trigger
  })

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled && next) return
      if (controlledOpen === undefined) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [controlledOpen, disabled, onOpenChange],
  )

  const floatingTrigger = useFloatingTrigger({
    open: isOpen,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  })

  React.useEffect(() => {
    if (!isOpen) {
      setActiveId(null)
      return
    }
    if (!available.some((option) => option.id === activeId)) {
      setActiveId(available.find((option) => option.id === value)?.id ?? available[0]?.id ?? null)
    }
  }, [activeId, available, isOpen, value])

  React.useEffect(() => {
    if (!isOpen || activeId === null) return
    const option = optionRefs.current.get(activeId)
    if (option && typeof option.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId, isOpen])

  React.useEffect(() => {
    const input = validationRef.current
    if (!input) return undefined
    const formElement = form ? document.getElementById(form) : input.form
    if (!(formElement instanceof HTMLFormElement) || !onReset) return undefined
    const reset = () => onReset()
    formElement.addEventListener('reset', reset)
    return () => formElement.removeEventListener('reset', reset)
  }, [form, onReset])

  const move = (direction: 1 | -1) => {
    if (available.length === 0) return
    const current = available.findIndex((option) => option.id === activeId)
    const next =
      current < 0
        ? direction > 0
          ? 0
          : available.length - 1
        : (current + direction + available.length) % available.length
    setActiveId(available[next]?.id ?? null)
  }

  const select = (option: LumenControlOption) => {
    if (disabled || option.disabled) return
    onValueChange(option.id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const selectActive = () => {
    const option = available.find((candidate) => candidate.id === activeId)
    if (option) select(option)
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) setOpen(true)
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Home' && isOpen) {
      event.preventDefault()
      setActiveId(available[0]?.id ?? null)
    } else if (event.key === 'End' && isOpen) {
      event.preventDefault()
      setActiveId(available.at(-1)?.id ?? null)
    } else if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault()
      selectActive()
    } else if ((event.key === 'Enter' || event.key === ' ') && !isOpen) {
      event.preventDefault()
      setOpen(true)
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setOpen(false)
    }
  }

  const trigger = (
    <button
      ref={triggerRef}
      id={controlId}
      type="button"
      className="lumen-popup-select-trigger lumen-control"
      data-size={resolvedSize}
      data-lumen-variant={lumenVariant}
      data-value={value ?? ''}
      data-stale={stale || undefined}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      aria-activedescendant={
        isOpen && activeId !== null ? `${listboxId}-${items.findIndex((option) => option.id === activeId)}` : undefined
      }
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={aria['aria-describedby']}
      aria-errormessage={aria['aria-errormessage']}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      disabled={disabled}
      onPointerDown={floatingTrigger.onPointerDown}
      onClick={floatingTrigger.onClick}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <span
        className={['lumen-popup-select-label', selected || stale ? '' : 'is-placeholder'].filter(Boolean).join(' ')}
      >
        {label}
      </span>
      <PopupChevron />
    </button>
  )

  return (
    <div
      ref={rootRef}
      className={['lumen-popup-select', className].filter(Boolean).join(' ')}
      data-size={resolvedSize}
      data-variant={typeof compatibilityVariant === 'string' ? compatibilityVariant : variant}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
    >
      {lumenVariant === 'outlined' ? (
        <LumenField boundary={boundary} invalid={invalid} state={disabled ? 'disabled' : 'idle'}>
          {trigger}
        </LumenField>
      ) : (
        trigger
      )}
      <input
        ref={validationRef}
        id={validationId}
        name={name}
        form={form}
        className="lumen-popup-select-validation"
        type="text"
        tabIndex={-1}
        value={value ?? ''}
        required={required}
        disabled={disabled}
        aria-hidden="true"
        onChange={() => undefined}
        onInvalid={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
      />
      <LumenFloatingSurface
        open={isOpen && !disabled}
        onClose={() => setOpen(false)}
        anchorRef={rootRef}
        anchorMatchWidth
        placement="below"
        focusBehavior="preserve"
        className="lumen-popup-select-surface"
      >
        <div id={listboxId} role="listbox" className="lumen-popup-select-listbox" aria-label={aria['aria-label']}>
          {items.map((option, index) => (
            <button
              key={option.id}
              ref={(element) => {
                if (element) optionRefs.current.set(option.id, element)
                else optionRefs.current.delete(option.id)
              }}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={option.id === value}
              aria-disabled={option.disabled || undefined}
              data-value={option.id}
              disabled={option.disabled}
              className={['lumen-popup-select-option', option.id === activeId ? 'is-active' : '']
                .filter(Boolean)
                .join(' ')}
              onPointerMove={() => {
                if (!option.disabled) setActiveId(option.id)
              }}
              onClick={() => select(option)}
            >
              <span className="lumen-popup-select-option-copy">
                <span className="lumen-popup-select-option-label">{option.label}</span>
                {option.detail ? <span className="lumen-popup-select-option-detail">{option.detail}</span> : null}
              </span>
              {option.id === value ? <PopupCheck /> : null}
            </button>
          ))}
        </div>
      </LumenFloatingSurface>
    </div>
  )
})
