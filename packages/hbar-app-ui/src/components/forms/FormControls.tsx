import {
  forwardRef,
  createContext,
  useEffect,
  useContext,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import type { HbarAppUiSize } from '../../appearance'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiIconButton, HbarAppUiLabel, HbarAppUiText } from '../../primitives'
import './FormControls.css'

export interface HbarAppUiControlOption {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly disabled?: boolean
}

export interface HbarAppUiFieldProps {
  readonly controlId: string
  readonly label: string
  readonly description?: string
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
  readonly requiredIndicator?: string
  readonly size?: HbarAppUiSize
  readonly children: ReactNode
  readonly className?: string
}

interface FieldAccessibilityValue {
  readonly describedBy?: string
  readonly invalid: boolean
  readonly size?: HbarAppUiSize
}

const FieldAccessibility = createContext<FieldAccessibilityValue>({
  invalid: false,
})

export function HbarAppUiField({
  controlId,
  label,
  description,
  hint,
  error,
  required,
  requiredIndicator,
  size,
  children,
  className = '',
}: HbarAppUiFieldProps) {
  const descriptionId = description ? `${controlId}-description` : undefined
  const messageId = error ? `${controlId}-error` : hint ? `${controlId}-hint` : undefined
  return (
    <div
      className={`hbar-app-ui-field${error ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}
      data-description-id={descriptionId}
      data-message-id={messageId}
    >
      <HbarAppUiLabel htmlFor={controlId} {...(size ? { size } : {})}>
        {label}
        {required && requiredIndicator && <span aria-hidden="true">{requiredIndicator}</span>}
      </HbarAppUiLabel>
      {description && (
        <HbarAppUiText as="p" id={descriptionId} tone="muted" variant="supporting" {...(size ? { size } : {})}>
          {description}
        </HbarAppUiText>
      )}
      <FieldAccessibility.Provider
        value={{
          ...(descriptionId || messageId ? { describedBy: [descriptionId, messageId].filter(Boolean).join(' ') } : {}),
          ...(size ? { size } : {}),
          invalid: Boolean(error),
        }}
      >
        {children}
      </FieldAccessibility.Provider>
      {error ? (
        <HbarAppUiText
          as="small"
          id={messageId}
          className="hbar-app-ui-field-error"
          tone="danger"
          variant="supporting"
          {...(size ? { size } : {})}
        >
          {error}
        </HbarAppUiText>
      ) : (
        hint && (
          <HbarAppUiText as="small" id={messageId} tone="muted" variant="supporting" {...(size ? { size } : {})}>
            {hint}
          </HbarAppUiText>
        )
      )}
    </div>
  )
}

function controlClass(className: string | undefined): string {
  return `hbar-app-ui-control${className ? ` ${className}` : ''}`
}

function uniqueOptions(options: readonly HbarAppUiControlOption[]): readonly HbarAppUiControlOption[] {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.id)) return false
    seen.add(option.id)
    return true
  })
}

export type HbarAppUiFieldVariant = 'outline' | 'plain'

export interface HbarAppUiInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly size?: HbarAppUiSize
  readonly variant?: HbarAppUiFieldVariant
}

export interface HbarAppUiTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly size?: HbarAppUiSize
  readonly variant?: HbarAppUiFieldVariant
}

export interface HbarAppUiSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  readonly size?: HbarAppUiSize
  readonly variant?: HbarAppUiFieldVariant
}

export const HbarAppUiInput = forwardRef<HTMLInputElement, HbarAppUiInputProps>(function HbarAppUiInput(
  { className, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <input
      {...props}
      ref={ref}
      className={controlClass(className)}
      data-size={size ?? field.size}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    />
  )
})

export const HbarAppUiTextarea = forwardRef<HTMLTextAreaElement, HbarAppUiTextareaProps>(function HbarAppUiTextarea(
  { className, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <textarea
      {...props}
      ref={ref}
      className={controlClass(className)}
      data-size={size ?? field.size}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    />
  )
})

export const HbarAppUiSelect = forwardRef<HTMLSelectElement, HbarAppUiSelectProps>(function HbarAppUiSelect(
  { className, children, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <select
      {...props}
      ref={ref}
      className={controlClass(className)}
      data-size={size ?? field.size}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    >
      {children}
    </select>
  )
})

export interface HbarAppUiCheckBoxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children' | 'size'
> {
  readonly label: string
  readonly description?: string
  readonly size?: HbarAppUiSize
}

export const HbarAppUiCheckBox = forwardRef<HTMLInputElement, HbarAppUiCheckBoxProps>(function HbarAppUiCheckBox(
  { label, description, size, className = '', ...props },
  ref,
) {
  return (
    <HbarAppUiLabel className={`hbar-app-ui-checkbox${className ? ` ${className}` : ''}`} {...(size ? { size } : {})}>
      <input {...props} ref={ref} type="checkbox" />
      <span className="hbar-app-ui-checkbox-copy">
        <HbarAppUiText as="span" variant="label" {...(size ? { size } : {})}>
          {label}
        </HbarAppUiText>
        {description && (
          <HbarAppUiText as="small" tone="muted" variant="supporting" {...(size ? { size } : {})}>
            {description}
          </HbarAppUiText>
        )}
      </span>
    </HbarAppUiLabel>
  )
})

export interface HbarAppUiComboBoxLabels {
  readonly open: string
  readonly empty: string
  readonly loading: string
}

export interface HbarAppUiComboBoxProps {
  readonly id: string
  readonly value: string | null
  readonly query: string
  readonly open: boolean
  readonly options: readonly HbarAppUiControlOption[]
  readonly labels: HbarAppUiComboBoxLabels
  readonly placeholder?: string
  readonly size?: HbarAppUiSize
  readonly variant?: HbarAppUiFieldVariant
  readonly disabled?: boolean
  readonly loading?: boolean
  readonly invalid?: boolean
  readonly describedBy?: string
  readonly loadMoreLabel?: string
  readonly onLoadMore?: () => void
  readonly onQueryChange: (query: string) => void
  readonly onOpenChange: (open: boolean) => void
  readonly onValueChange: (value: string) => void
}

export function HbarAppUiComboBox({
  id,
  value,
  query,
  open,
  options,
  labels,
  placeholder,
  size,
  variant = 'outline',
  disabled = false,
  loading = false,
  invalid = false,
  describedBy,
  loadMoreLabel,
  onLoadMore,
  onQueryChange,
  onOpenChange,
  onValueChange,
}: HbarAppUiComboBoxProps) {
  const field = useContext(FieldAccessibility)
  const resolvedSize = size ?? field.size
  const root = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const listboxId = `${id}-${generatedId.replaceAll(':', '')}-listbox`
  const items = uniqueOptions(options)
  const available = items.filter((option) => !option.disabled)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setActiveId(null)
    else if (!available.some((option) => option.id === activeId)) setActiveId(available[0]?.id ?? null)
  }, [activeId, available, open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [onOpenChange, open])

  const select = (option: HbarAppUiControlOption) => {
    if (option.disabled) return
    onQueryChange(option.label)
    onValueChange(option.id)
    onOpenChange(false)
  }
  const move = (direction: 1 | -1) => {
    if (available.length === 0) return
    const current = available.findIndex((option) => option.id === activeId)
    const next =
      current < 0
        ? direction > 0
          ? 0
          : available.length - 1
        : (current + direction + available.length) % available.length
    setActiveId(available[next]!.id)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) onOpenChange(true)
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      const option = available.find((candidate) => candidate.id === activeId)
      if (option) select(option)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      onOpenChange(false)
    }
  }

  return (
    <div ref={root} className="hbar-app-ui-combobox">
      <div
        className="hbar-app-ui-combobox-control"
        data-size={resolvedSize}
        data-variant={variant}
        data-invalid={invalid || field.invalid || undefined}
      >
        <HbarAppUiInput
          id={id}
          type="text"
          role="combobox"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || field.invalid || undefined}
          aria-describedby={describedBy ?? field.describedBy}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeId ? `${listboxId}-${items.findIndex((option) => option.id === activeId)}` : undefined
          }
          onFocus={() => onOpenChange(true)}
          onChange={(event) => {
            onQueryChange(event.currentTarget.value)
            if (!open) onOpenChange(true)
          }}
          onKeyDown={handleKeyDown}
          variant={variant}
          {...(resolvedSize ? { size: resolvedSize } : {})}
        />
        <HbarAppUiIconButton
          label={labels.open}
          className="hbar-app-ui-combobox-toggle"
          variant="ghost"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => onOpenChange(!open)}
          {...(resolvedSize ? { size: resolvedSize } : {})}
        >
          <HbarAppUiIcon icon={ChevronsUpDown} tier="xs" />
        </HbarAppUiIconButton>
      </div>
      {open && !disabled && (
        <div className="hbar-app-ui-dialog-menu hbar-app-ui-combobox-popup">
          <div id={listboxId} role="listbox">
            {loading ? (
              <HbarAppUiText as="p" tone="muted" variant="supporting">
                {labels.loading}
              </HbarAppUiText>
            ) : items.length === 0 ? (
              <HbarAppUiText as="p" tone="muted" variant="supporting">
                {labels.empty}
              </HbarAppUiText>
            ) : (
              items.map((option, index) => (
                <HbarAppUiButton
                  key={`${option.id}:${index}`}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={value === option.id}
                  disabled={option.disabled}
                  className={`hbar-app-ui-combobox-option${activeId === option.id ? ' is-active' : ''}`}
                  variant="ghost"
                  onPointerMove={() => !option.disabled && setActiveId(option.id)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option)}
                  {...(resolvedSize ? { size: resolvedSize } : {})}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.detail && <small>{option.detail}</small>}
                  </span>
                  {value === option.id && <HbarAppUiIcon icon={Check} tier="xs" />}
                </HbarAppUiButton>
              ))
            )}
          </div>
          {loadMoreLabel && onLoadMore && (
            <HbarAppUiButton
              className="hbar-app-ui-combobox-load-more"
              variant="ghost"
              onClick={onLoadMore}
              {...(resolvedSize ? { size: resolvedSize } : {})}
            >
              {loadMoreLabel}
            </HbarAppUiButton>
          )}
        </div>
      )}
    </div>
  )
}

export interface HbarAppUiMultiSelectLabels extends HbarAppUiComboBoxLabels {
  readonly remove: (label: string) => string
}

export interface HbarAppUiMultiSelectProps extends Omit<
  HbarAppUiComboBoxProps,
  'value' | 'options' | 'labels' | 'onValueChange'
> {
  readonly values: readonly string[]
  readonly options: readonly HbarAppUiControlOption[]
  readonly labels: HbarAppUiMultiSelectLabels
  readonly onValuesChange: (values: readonly string[]) => void
}

export function HbarAppUiMultiSelect({
  values,
  options,
  labels,
  disabled,
  size,
  onValuesChange,
  ...comboBox
}: HbarAppUiMultiSelectProps) {
  const uniqueOptionItems = uniqueOptions(options)
  const uniqueValues = [...new Set(values)]
  const selected = uniqueValues.map(
    (value) => uniqueOptionItems.find((candidate) => candidate.id === value) ?? { id: value, label: value },
  )
  const available = uniqueOptionItems.filter((option) => !uniqueValues.includes(option.id))
  return (
    <div className={`hbar-app-ui-multi-select${disabled ? ' is-disabled' : ''}`} data-size={size}>
      {selected.length > 0 && (
        <div className="hbar-app-ui-multi-select-values">
          {selected.map((option) => (
            <span key={option.id}>
              {option.label}
              <HbarAppUiIconButton
                label={labels.remove(option.label)}
                variant="ghost"
                disabled={disabled}
                onClick={() => onValuesChange(uniqueValues.filter((value) => value !== option.id))}
                {...(size ? { size } : {})}
              >
                <HbarAppUiIcon icon={X} tier="xs" />
              </HbarAppUiIconButton>
            </span>
          ))}
        </div>
      )}
      <HbarAppUiComboBox
        {...comboBox}
        value={null}
        options={available}
        labels={labels}
        {...(size ? { size } : {})}
        {...(disabled === undefined ? {} : { disabled })}
        onValueChange={(value) => onValuesChange([...uniqueValues, value])}
      />
    </div>
  )
}
