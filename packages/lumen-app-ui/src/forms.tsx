'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { type LumenSize } from './appearance'
import LumenField from './LumenField'
import { LumenFloatingSurface, useFloatingTrigger } from './floating-surface'
import { LumenButton, LumenIconButton, LumenText, type LumenButtonProps } from './primitives'
import { LumenChip } from './ui-controls'
import LumenAnchoredPopup from './anchored-popup'

export type LumenFieldVariant = 'boundary' | 'outlined' | 'plain' | 'boxed'

export interface LumenControlOption {
  id: string
  label: string
  detail?: string | undefined
  disabled?: boolean | undefined
}

export interface LumenFormFieldProps {
  controlId: string
  label: string
  description?: string | undefined
  /** Place helper description before the control (the legacy default) or after it. */
  descriptionPlacement?: 'before-control' | 'after-control' | undefined
  hint?: string | undefined
  error?: string | undefined
  required?: boolean | undefined
  requiredIndicator?: string | undefined
  size?: LumenSize | undefined
  children: React.ReactNode
  className?: string | undefined
}

function containsControl(node: React.ReactNode, controlId: string): boolean {
  return React.Children.toArray(node).some(
    (child) =>
      React.isValidElement<{ id?: string; children?: React.ReactNode }>(child) &&
      (child.props.id === controlId || containsControl(child.props.children, controlId)),
  )
}

function bindDescendantControl(
  node: React.ReactNode,
  controlId: string,
  attributes: Readonly<Record<string, unknown>>,
): React.ReactNode {
  return React.Children.map(node, (child) => {
    if (!React.isValidElement<Record<string, unknown> & { children?: React.ReactNode }>(child)) {
      return child
    }
    if (child.props.id === controlId) {
      const binding = Object.fromEntries(
        Object.entries(attributes).map(([name, value]) => {
          if (name === 'aria-labelledby' && child.props['aria-label'] !== undefined) {
            return [name, child.props[name]]
          }
          return [name, child.props[name] ?? value]
        }),
      )
      return React.cloneElement(child, binding)
    }
    return child.props.children === undefined
      ? child
      : React.cloneElement(child, {
          children: bindDescendantControl(child.props.children, controlId, attributes),
        })
  })
}

export function LumenFormField({
  controlId,
  label,
  description,
  descriptionPlacement = 'before-control',
  hint,
  error,
  required,
  requiredIndicator,
  size,
  children,
  className,
}: LumenFormFieldProps) {
  const descriptionId = description ? `${controlId}-description` : undefined
  const labelId = `${controlId}-label`
  let messageId: string | undefined
  if (error) {
    messageId = `${controlId}-error`
  } else if (hint) {
    messageId = `${controlId}-hint`
  }
  const describedBy = [descriptionId, messageId].filter(Boolean).join(' ') || undefined
  const attributes = {
    required,
    'aria-describedby': describedBy,
    'aria-invalid': Boolean(error) || undefined,
    'aria-labelledby': labelId,
    'data-size': size,
  }
  const control = containsControl(children, controlId)
    ? bindDescendantControl(children, controlId, attributes)
    : React.isValidElement<Record<string, unknown>>(children)
      ? React.cloneElement(children, {
          id: children.props.id ?? controlId,
          required: children.props.required ?? required,
          'aria-describedby': children.props['aria-describedby'] ?? describedBy,
          'aria-invalid': children.props['aria-invalid'] ?? (Boolean(error) || undefined),
          'aria-labelledby':
            children.props['aria-labelledby'] ?? (children.props['aria-label'] === undefined ? labelId : undefined),
          'data-size': children.props['data-size'] ?? size,
        })
      : children

  let message: React.ReactNode
  if (error) {
    message = (
      <LumenText as="small" id={messageId} tone="danger" variant="supporting" size={size}>
        {error}
      </LumenText>
    )
  } else if (hint) {
    message = (
      <LumenText as="small" id={messageId} tone="muted" variant="supporting" size={size}>
        {hint}
      </LumenText>
    )
  }

  return (
    <div
      {...lumenPartProps("field.group")} className={['lumen-form-field', className].filter(Boolean).join(' ')}
      data-invalid={Boolean(error) || undefined}
    >
      <label htmlFor={controlId}>
        <LumenText as="span" id={labelId} variant="label" size={size}>
          {label}
        </LumenText>
        {required && requiredIndicator ? (
          <LumenText as="span" tone="danger" aria-hidden="true">
            {requiredIndicator}
          </LumenText>
        ) : null}
      </label>
      {description && descriptionPlacement === 'before-control' ? (
        <LumenText as="p" id={descriptionId} tone="muted" variant="supporting" size={size}>
          {description}
        </LumenText>
      ) : null}
      {control}
      {description && descriptionPlacement === 'after-control' ? (
        <LumenText as="p" id={descriptionId} tone="muted" variant="supporting" size={size}>
          {description}
        </LumenText>
      ) : null}
      {message}
    </div>
  )
}

interface LumenControlProps {
  /** @deprecated Fields use a continuous outline regardless of direction. */
  boundary?: 'horizontal' | 'vertical' | undefined
  size?: LumenSize | undefined
  variant?: LumenFieldVariant | undefined
}

export interface LumenInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, LumenControlProps {
  'data-size'?: string | undefined
  'data-variant'?: string | undefined
}

export interface LumenTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, LumenControlProps {
  'data-size'?: string | undefined
  'data-variant'?: string | undefined
}

export interface LumenSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, LumenControlProps {
  'data-size'?: string | undefined
  'data-variant'?: string | undefined
}

function controlClass(className: string | undefined): string {
  return [className, 'lumen-control', 'lumen-effect'].filter(Boolean).join(' ')
}

function normalizedVariant(variant: LumenFieldVariant): 'outlined' | 'plain' | 'boxed' {
  return variant === 'boundary' ? 'outlined' : variant
}

function isInvalid(value: React.AriaAttributes['aria-invalid']): boolean {
  return value === true || value === 'true'
}

function withBoundary(
  control: React.ReactElement,
  {
    boundary,
    disabled,
    invalid,
    variant,
  }: {
    boundary: 'horizontal' | 'vertical'
    disabled: boolean
    invalid: boolean
    variant: 'outlined' | 'plain' | 'boxed'
  },
): React.ReactElement {
  if (variant !== 'outlined') return control
  return (
    <LumenField boundary={boundary} invalid={invalid} state={disabled ? 'disabled' : 'idle'}>
      {control}
    </LumenField>
  )
}

export const LumenInput = React.forwardRef<HTMLInputElement, LumenInputProps>(function LumenInput(
  {
    className,
    boundary = 'horizontal',
    size,
    variant = 'outlined',
    'data-size': compatibilitySize,
    'data-variant': compatibilityVariant,
    ...other
  },
  ref,
) {
  const lumenVariant = normalizedVariant(variant)
  return withBoundary(
    <input
      {...other}
      ref={ref}
      data-lumen-component="input"
      {...lumenPartProps("control")} className={controlClass(className)}
      data-size={size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)}
      data-lumen-variant={lumenVariant}
      data-variant={typeof compatibilityVariant === 'string' ? compatibilityVariant : variant}
    />,
    {
      boundary,
      disabled: Boolean(other.disabled),
      invalid: isInvalid(other['aria-invalid']),
      variant: lumenVariant,
    },
  )
})

export const LumenTextarea = React.forwardRef<HTMLTextAreaElement, LumenTextareaProps>(function LumenTextarea(
  {
    className,
    boundary = 'horizontal',
    size,
    variant = 'outlined',
    'data-size': compatibilitySize,
    'data-variant': compatibilityVariant,
    ...other
  },
  ref,
) {
  const lumenVariant = normalizedVariant(variant)
  return withBoundary(
    <textarea
      {...other}
      ref={ref}
      data-lumen-component="textarea"
      {...lumenPartProps("control")} className={controlClass(className)}
      data-size={size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)}
      data-lumen-variant={lumenVariant}
      data-variant={typeof compatibilityVariant === 'string' ? compatibilityVariant : variant}
    />,
    {
      boundary,
      disabled: Boolean(other.disabled),
      invalid: isInvalid(other['aria-invalid']),
      variant: lumenVariant,
    },
  )
})

export const LumenSelect = React.forwardRef<HTMLSelectElement, LumenSelectProps>(function LumenSelect(
  {
    className,
    children,
    boundary = 'horizontal',
    size,
    variant = 'outlined',
    'data-size': compatibilitySize,
    'data-variant': compatibilityVariant,
    ...other
  },
  ref,
) {
  const lumenVariant = normalizedVariant(variant)
  return withBoundary(
    <select
      {...other}
      ref={ref}
      data-lumen-component="select"
      {...lumenPartProps("control")} className={controlClass(className)}
      data-size={size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)}
      data-lumen-variant={lumenVariant}
      data-variant={typeof compatibilityVariant === 'string' ? compatibilityVariant : variant}
    >
      {children}
    </select>,
    {
      boundary,
      disabled: Boolean(other.disabled),
      invalid: isInvalid(other['aria-invalid']),
      variant: lumenVariant,
    },
  )
})

export interface LumenCheckBoxControlProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  indeterminate?: boolean | undefined
  size?: LumenSize | undefined
}

export const LumenCheckBoxControl = React.forwardRef<HTMLInputElement, LumenCheckBoxControlProps>(
  function LumenCheckBoxControl({ size, className, indeterminate = false, disabled, ...other }, ref) {
    const compatibilitySize = (other as Record<string, unknown>)['data-size']
    const inputRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(ref, () => {
      const input = inputRef.current
      if (!input) throw new Error('Lumen checkbox input is not mounted.')
      return input
    })
    React.useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate
    }, [indeterminate])
    return (
      <span
        className={['lumen-checkbox-control', 'lumen-effect', className].filter(Boolean).join(' ')}
        data-size={size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)}
        data-disabled={disabled || undefined}
        data-indeterminate={indeterminate || undefined}
      >
        <input
          {...other}
          ref={inputRef}
          type="checkbox"
          className="lumen-checkbox-input"
          disabled={disabled}
          aria-checked={indeterminate ? 'mixed' : other['aria-checked']}
        />
        <span className="lumen-checkbox-mark" aria-hidden="true">
          <FormGlyph name={indeterminate ? 'minus' : 'check'} />
        </span>
      </span>
    )
  },
)

export interface LumenCheckBoxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'size'
> {
  label: string
  description?: string | undefined
  indeterminate?: boolean | undefined
  size?: LumenSize | undefined
}

export const LumenCheckBox = React.forwardRef<HTMLInputElement, LumenCheckBoxProps>(function LumenCheckBox(
  { label, description, size, className, ...other },
  ref,
) {
  return (
    <label {...lumenPartProps("checkbox")} className={['lumen-checkbox', className].filter(Boolean).join(' ')}>
      <LumenCheckBoxControl {...other} ref={ref} size={size} />
      <span className="lumen-checkbox-copy">
        <LumenText as="span" variant="label" size={size}>
          {label}
        </LumenText>
        {description ? (
          <LumenText as="small" tone="muted" variant="supporting" size={size}>
            {description}
          </LumenText>
        ) : null}
      </span>
    </label>
  )
})

export interface LumenToggleControlProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: LumenSize | undefined
}

export const LumenToggleControl = React.forwardRef<HTMLInputElement, LumenToggleControlProps>(
  function LumenToggleControl({ size, className, disabled, ...other }, ref) {
    const compatibilitySize = (other as Record<string, unknown>)['data-size']
    return (
      <span
        className={['lumen-toggle-control', 'lumen-effect', className].filter(Boolean).join(' ')}
        data-size={size ?? (typeof compatibilitySize === 'string' ? compatibilitySize : undefined)}
        data-disabled={disabled || undefined}
      >
        <input {...other} ref={ref} type="checkbox" role="switch" className="lumen-toggle-input" disabled={disabled} />
        <span className="lumen-toggle-track" aria-hidden="true">
          <span className="lumen-toggle-thumb" />
        </span>
      </span>
    )
  },
)

export interface LumenToggleProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'size'
> {
  label: string
  description?: string | undefined
  size?: LumenSize | undefined
}

export const LumenToggle = React.forwardRef<HTMLInputElement, LumenToggleProps>(function LumenToggle(
  { label, description, size, className, ...other },
  ref,
) {
  return (
    <label {...lumenPartProps("toggle.root")} className={['lumen-toggle', className].filter(Boolean).join(' ')}>
      <span className="lumen-toggle-copy">
        <LumenText as="span" variant="label" size={size}>
          {label}
        </LumenText>
        {description ? (
          <LumenText as="small" tone="muted" variant="supporting" size={size}>
            {description}
          </LumenText>
        ) : null}
      </span>
      <LumenToggleControl {...other} ref={ref} size={size} />
    </label>
  )
})

export interface LumenComboBoxLabels {
  open: string
  empty: string
  loading: string
}

export interface LumenComboBoxProps {
  id: string
  value: string | null
  query: string
  open: boolean
  options: readonly LumenControlOption[]
  labels: LumenComboBoxLabels
  placeholder?: string | undefined
  boundary?: 'horizontal' | 'vertical' | undefined
  size?: LumenSize | undefined
  variant?: LumenFieldVariant | undefined
  disabled?: boolean | undefined
  loading?: boolean | undefined
  invalid?: boolean | undefined
  describedBy?: string | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: React.AriaAttributes['aria-invalid']
  required?: boolean | undefined
  loadMoreLabel?: string | undefined
  onLoadMore?: (() => void) | undefined
  onQueryChange: (query: string) => void
  onOpenChange: (open: boolean) => void
  onValueChange: (value: string) => void
}

function uniqueOptions(options: readonly LumenControlOption[]): readonly LumenControlOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false
    }
    seen.add(option.id)
    return true
  })
}

function FormGlyph({ name }: { name: 'check' | 'chevron' | 'close' | 'minus' }) {
  return (
    <svg className="lumen-form-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'check' ? <path d="m3.5 8 3 3 6-6" /> : null}
      {name === 'chevron' ? <path d="m4 6 4 4 4-4" /> : null}
      {name === 'close' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
      {name === 'minus' ? <path d="M3 8h10" /> : null}
    </svg>
  )
}

export function LumenComboBox({
  id,
  value,
  query,
  open,
  options,
  labels,
  placeholder,
  boundary = 'horizontal',
  size,
  variant = 'outlined',
  disabled = false,
  loading = false,
  invalid = false,
  describedBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  required,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  loadMoreLabel,
  onLoadMore,
  onQueryChange,
  onOpenChange,
  onValueChange,
}: LumenComboBoxProps) {
  const root = React.useRef<HTMLDivElement>(null)
  const generatedId = React.useId().replaceAll(':', '')
  const listboxId = `${id}-${generatedId}-listbox`
  const lumenVariant = normalizedVariant(variant)
  const items = React.useMemo(() => uniqueOptions(options), [options])
  const available = React.useMemo(() => items.filter((option) => !option.disabled), [items])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>())
  const resolvedInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'

  React.useEffect(() => {
    if (!open) {
      setActiveId(null)
      return
    }
    if (activeId !== null && !available.some((option) => option.id === activeId)) {
      setActiveId(null)
    }
  }, [activeId, available, open])

  React.useEffect(() => {
    if (!open || activeId === null) return
    const option = optionRefs.current.get(activeId)
    if (option && typeof option.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [activeId, open])

  const floatingTrigger = useFloatingTrigger({
    open,
    onOpen: () => onOpenChange(true),
    onClose: () => onOpenChange(false),
  })

  const select = (option: LumenControlOption) => {
    if (option.disabled) {
      return
    }
    onQueryChange(option.label)
    onValueChange(option.id)
    onOpenChange(false)
  }
  const move = (direction: 1 | -1) => {
    if (available.length === 0) {
      return
    }
    const current = available.findIndex((option) => option.id === activeId)
    let next = (current + direction + available.length) % available.length
    if (current < 0) {
      next = direction > 0 ? 0 : available.length - 1
    }
    const option = available[next]
    if (option) setActiveId(option.id)
  }
  let optionContent: React.ReactNode
  if (loading) {
    optionContent = (
      <LumenText as="p" tone="muted" variant="supporting">
        {labels.loading}
      </LumenText>
    )
  } else if (items.length === 0) {
    optionContent = (
      <LumenText as="p" tone="muted" variant="supporting">
        {labels.empty}
      </LumenText>
    )
  } else {
    optionContent = items.map((option, index) => (
      <LumenButton
        key={`${option.id}:${index}`}
        ref={(element) => {
          if (element) optionRefs.current.set(option.id, element)
          else optionRefs.current.delete(option.id)
        }}
        id={`${listboxId}-${index}`}
        role="option"
        data-value={option.id}
        title={option.label}
        aria-selected={value === option.id}
        disabled={option.disabled}
        className={['lumen-combobox-option', activeId === option.id ? 'is-active' : ''].filter(Boolean).join(' ')}
        variant="text"
        size={size}
        onPointerMove={() => {
          if (!option.disabled) setActiveId(option.id)
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => select(option)}
      >
        <span>
          <LumenText as="strong" variant="label">
            {option.label}
          </LumenText>
          {option.detail ? (
            <LumenText as="small" tone="muted" variant="supporting">
              {option.detail}
            </LumenText>
          ) : null}
        </span>
        {value === option.id ? <FormGlyph name="check" /> : null}
      </LumenButton>
    ))
  }

  const control = (
    <div
      {...lumenPartProps("combobox.control")} className="lumen-combobox-control lumen-effect"
      data-size={size}
      data-variant={variant}
      data-invalid={resolvedInvalid || undefined}
    >
      <LumenInput
        id={id}
        type="text"
        role="combobox"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        size={size}
        variant="plain"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeId !== null ? `${listboxId}-${items.findIndex((option) => option.id === activeId)}` : undefined
        }
        aria-describedby={ariaDescribedBy ?? describedBy}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        title={query}
        onFocus={() => onOpenChange(true)}
        onChange={(event) => {
          onQueryChange(event.currentTarget.value)
          if (!open) onOpenChange(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) onOpenChange(true)
            move(event.key === 'ArrowDown' ? 1 : -1)
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            const option = available.find((candidate) => candidate.id === activeId)
            if (option) select(option)
          } else if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveId(available[0]?.id ?? null)
          } else if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveId(available.at(-1)?.id ?? null)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            onOpenChange(false)
          }
        }}
      />
      <LumenIconButton
        className="lumen-combobox-toggle"
        label={labels.open}
        size={size}
        disabled={disabled}
        aria-expanded={open}
        onPointerDown={floatingTrigger.onPointerDown}
        onClick={floatingTrigger.onClick}
      >
        <FormGlyph name="chevron" />
      </LumenIconButton>
    </div>
  )

  return (
    <div ref={root} className="lumen-combobox">
      {lumenVariant !== 'outlined' ? (
        control
      ) : (
        <LumenField boundary={boundary} invalid={resolvedInvalid} state={disabled ? 'disabled' : 'idle'}>
          {control}
        </LumenField>
      )}
      <LumenFloatingSurface
        open={open && !disabled}
        onClose={() => onOpenChange(false)}
        anchorRef={root}
        anchorMatchWidth
        placement="below"
        focusBehavior="preserve"
        className="lumen-combobox-popup-surface"
      >
        <div className="lumen-combobox-popup-content">
          <div id={listboxId} role="listbox">
            {optionContent}
          </div>
          {loadMoreLabel && onLoadMore ? (
            <LumenButton
              className="lumen-combobox-load-more"
              variant="text"
              size={size}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onLoadMore}
            >
              {loadMoreLabel}
            </LumenButton>
          ) : null}
        </div>
      </LumenFloatingSurface>
    </div>
  )
}

export interface LumenMultiSelectLabels extends LumenComboBoxLabels {
  remove: (label: string) => string
}

export interface LumenMultiSelectProps extends Omit<
  LumenComboBoxProps,
  'value' | 'options' | 'labels' | 'onValueChange'
> {
  values: readonly string[]
  options: readonly LumenControlOption[]
  labels: LumenMultiSelectLabels
  onValuesChange: (values: readonly string[]) => void
  /** Retain selections across paged catalogs; discard only when the host supplies a complete catalog. */
  unknownValuePolicy?: 'retain' | 'discard' | undefined
}

export function LumenMultiSelect({
  values,
  options,
  labels,
  disabled,
  size,
  onValuesChange,
  unknownValuePolicy = 'retain',
  ...comboBox
}: LumenMultiSelectProps) {
  const uniqueOptionItems = uniqueOptions(options)
  const uniqueValues = [...new Set(values)].filter(
    (value) => unknownValuePolicy === 'retain' || uniqueOptionItems.some((option) => option.id === value),
  )
  const selected = uniqueValues.map(
    (value) => uniqueOptionItems.find((option) => option.id === value) ?? { id: value, label: value },
  )
  const available = uniqueOptionItems.filter((option) => !uniqueValues.includes(option.id))

  return (
    <div className="lumen-multi-select" data-size={size} data-disabled={disabled || undefined}>
      {selected.length > 0 ? (
        <div className="lumen-multi-select-values">
          {selected.map((option) => (
            <LumenChip
              className="lumen-multi-select-value"
              key={option.id}
              label={option.label}
              disabled={disabled}
              removeAction={{
                label: labels.remove(option.label),
                onRemove: () => onValuesChange(uniqueValues.filter((value) => value !== option.id)),
              }}
            />
          ))}
        </div>
      ) : null}
      <LumenComboBox
        {...comboBox}
        value={null}
        options={available}
        labels={labels}
        size={size}
        disabled={disabled}
        onValueChange={(value) => onValuesChange([...uniqueValues, value])}
      />
    </div>
  )
}

export interface LumenFileButtonProps extends Omit<LumenButtonProps, 'children' | 'onChange' | 'onClick' | 'type'> {
  label: React.ReactNode
  accept?: string | undefined
  multiple?: boolean | undefined
  onFiles: (files: readonly File[]) => void
}

export function LumenFileButton({
  label,
  accept,
  multiple,
  onFiles,
  disabled,
  className,
  ...buttonProps
}: LumenFileButtonProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  return (
    <span className="lumen-file-button">
      <LumenButton {...buttonProps} className={className} disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </LumenButton>
      <input
        ref={inputRef}
        data-lumen-component="file-input"
        hidden
        tabIndex={-1}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length) {
            onFiles(files)
          }
          event.target.value = ''
        }}
      />
    </span>
  )
}

export interface LumenChoiceSelectProps {
  id: string
  label: string
  placeholder?: string | undefined
  describedBy?: string | undefined
  options: readonly LumenControlOption[]
  value: string | null
  onValueChange: (id: string) => void
  size?: LumenSize | undefined
  disabled?: boolean | undefined
  className?: string | undefined
}

export function LumenChoiceSelect({
  id,
  label,
  placeholder,
  describedBy,
  options,
  value,
  onValueChange,
  size,
  disabled = false,
  className,
}: LumenChoiceSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const items = uniqueOptions(options)
  const available = items.filter((item) => !item.disabled)
  const current = items.find((item) => item.id === value)
  const active = available.find((item) => item.id === activeId)
  const listId = `${id}-choices`
  const optionId = (itemId: string) => `${id}-choice-${encodeURIComponent(itemId)}`
  const select = (item: LumenControlOption) => {
    if (item.disabled) {
      return
    }
    onValueChange(item.id)
    setOpen(false)
    setActiveId(null)
  }
  const move = (direction: 1 | -1) => {
    if (!available.length) {
      return
    }
    const index = available.findIndex((item) => item.id === (active?.id ?? value))
    let next = (index + direction + available.length) % available.length
    if (index < 0) {
      next = direction > 0 ? 0 : available.length - 1
    }
    setActiveId(available[next]?.id ?? null)
  }
  return (
    <div
      ref={rootRef}
      className={['lumen-choice-select', className].filter(Boolean).join(' ')}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) {
          setOpen(false)
          setActiveId(null)
        }
      }}
    >
      <LumenButton
        id={id}
        ref={triggerRef}
        role="combobox"
        aria-label={label}
        aria-describedby={describedBy}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active ? optionId(active.id) : undefined}
        disabled={disabled}
        size={size}
        variant="outlined"
        className="lumen-choice-select-trigger"
        onClick={() => {
          setOpen((wasOpen) => !wasOpen)
          setActiveId(current && !current.disabled ? current.id : (available[0]?.id ?? null))
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            move(event.key === 'ArrowDown' ? 1 : -1)
          } else if (open && (event.key === 'Home' || event.key === 'End')) {
            event.preventDefault()
            setActiveId((event.key === 'Home' ? available[0] : available.at(-1))?.id ?? null)
          } else if (open && event.key === 'Enter' && active) {
            event.preventDefault()
            select(active)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            setActiveId(null)
          }
        }}
      >
        <span>{current?.label ?? placeholder ?? label}</span>
        <FormGlyph name="chevron" />
      </LumenButton>
      {open && !disabled ? (
        <LumenAnchoredPopup
          anchorRef={triggerRef}
          onDismiss={() => {
            setOpen(false)
            setActiveId(null)
          }}
          id={listId}
          role="listbox"
          aria-label={label}
          className="lumen-choice-select-list"
        >
          {items.map((item) => (
            <LumenButton
              key={item.id}
              id={optionId(item.id)}
              role="option"
              tabIndex={-1}
              aria-selected={item.id === value}
              data-active={item.id === activeId || undefined}
              disabled={item.disabled}
              size={size}
              variant="text"
              onMouseDown={(event) => event.preventDefault()}
              onPointerMove={() => !item.disabled && setActiveId(item.id)}
              onClick={() => select(item)}
            >
              <span>{item.label}</span>
              {item.id === value ? <FormGlyph name="check" /> : null}
            </LumenButton>
          ))}
        </LumenAnchoredPopup>
      ) : null}
    </div>
  )
}
