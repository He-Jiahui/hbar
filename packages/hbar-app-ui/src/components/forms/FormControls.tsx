import {
  LumenCheckBox,
  LumenCheckBoxControl,
  LumenComboBox,
  LumenFrame,
  LumenInput,
  LumenMultiSelect,
  LumenSelect,
  LumenText,
  LumenTextarea,
  LumenToggle,
  LumenToggleControl,
  type LumenCheckBoxControlProps,
  type LumenCheckBoxProps,
  type LumenToggleControlProps,
  type LumenToggleProps,
} from '@lumen/app-ui'
import {
  createContext,
  forwardRef,
  useContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import type { HbarAppUiSize } from '../../appearance'
import { HbarAppUiLabel, HbarAppUiText } from '../../primitives'
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

const FieldAccessibility = createContext<FieldAccessibilityValue>({ invalid: false })

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
    <LumenFrame
      className={`hbar-app-ui-field${error ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}
      data-description-id={descriptionId}
      data-message-id={messageId}
    >
      <HbarAppUiLabel htmlFor={controlId} {...(size ? { size } : {})}>
        {label}
        {required && requiredIndicator ? (
          <LumenText as="span" aria-hidden="true">
            {requiredIndicator}
          </LumenText>
        ) : null}
      </HbarAppUiLabel>
      {description ? (
        <HbarAppUiText as="p" id={descriptionId} tone="muted" variant="supporting" {...(size ? { size } : {})}>
          {description}
        </HbarAppUiText>
      ) : null}
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
      ) : hint ? (
        <HbarAppUiText as="small" id={messageId} tone="muted" variant="supporting" {...(size ? { size } : {})}>
          {hint}
        </HbarAppUiText>
      ) : null}
    </LumenFrame>
  )
}

function controlClass(className: string | undefined): string {
  return `hbar-app-ui-control${className ? ` ${className}` : ''}`
}

export type HbarAppUiFieldVariant = 'outline' | 'plain'

interface HbarAppUiControlProps {
  readonly boundary?: 'horizontal' | 'vertical'
  readonly size?: HbarAppUiSize
  readonly variant?: HbarAppUiFieldVariant
}

export interface HbarAppUiInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, HbarAppUiControlProps {}

export interface HbarAppUiTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, HbarAppUiControlProps {}

export interface HbarAppUiSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'>, HbarAppUiControlProps {}

export const HbarAppUiInput = forwardRef<HTMLInputElement, HbarAppUiInputProps>(function HbarAppUiInput(
  { boundary, className, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <LumenInput
      {...props}
      ref={ref}
      className={controlClass(className)}
      boundary={boundary}
      size={size ?? field.size}
      variant={variant === 'plain' ? 'plain' : 'boundary'}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    />
  )
})

export const HbarAppUiTextarea = forwardRef<HTMLTextAreaElement, HbarAppUiTextareaProps>(function HbarAppUiTextarea(
  { boundary, className, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <LumenTextarea
      {...props}
      ref={ref}
      className={controlClass(className)}
      boundary={boundary}
      size={size ?? field.size}
      variant={variant === 'plain' ? 'plain' : 'boundary'}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    />
  )
})

export const HbarAppUiSelect = forwardRef<HTMLSelectElement, HbarAppUiSelectProps>(function HbarAppUiSelect(
  { boundary, className, children, size, variant = 'outline', ...props },
  ref,
) {
  const field = useContext(FieldAccessibility)
  return (
    <LumenSelect
      {...props}
      ref={ref}
      className={controlClass(className)}
      boundary={boundary}
      size={size ?? field.size}
      variant={variant === 'plain' ? 'plain' : 'boundary'}
      data-variant={variant}
      aria-describedby={props['aria-describedby'] ?? field.describedBy}
      aria-invalid={props['aria-invalid'] ?? (field.invalid || undefined)}
    >
      {children}
    </LumenSelect>
  )
})

export type HbarAppUiCheckBoxControlProps = Omit<LumenCheckBoxControlProps, 'size'> & {
  readonly size?: HbarAppUiSize
}

export const HbarAppUiCheckBoxControl = forwardRef<HTMLInputElement, HbarAppUiCheckBoxControlProps>(
  function HbarAppUiCheckBoxControl({ size, className = '', ...props }, ref) {
    return (
      <LumenCheckBoxControl
        {...props}
        ref={ref}
        className={`hbar-app-ui-checkbox-control${className ? ` ${className}` : ''}`}
        size={size}
      />
    )
  },
)

export type HbarAppUiCheckBoxProps = Omit<LumenCheckBoxProps, 'size'> & {
  readonly size?: HbarAppUiSize
}

export const HbarAppUiCheckBox = forwardRef<HTMLInputElement, HbarAppUiCheckBoxProps>(function HbarAppUiCheckBox(
  { size, className = '', ...props },
  ref,
) {
  return (
    <LumenCheckBox
      {...props}
      ref={ref}
      className={`hbar-app-ui-checkbox${className ? ` ${className}` : ''}`}
      size={size}
    />
  )
})

export type HbarAppUiToggleControlProps = Omit<LumenToggleControlProps, 'size'> & {
  readonly size?: HbarAppUiSize
}

export const HbarAppUiToggleControl = forwardRef<HTMLInputElement, HbarAppUiToggleControlProps>(
  function HbarAppUiToggleControl({ size, className = '', ...props }, ref) {
    return (
      <LumenToggleControl
        {...props}
        ref={ref}
        className={`hbar-app-ui-toggle-control${className ? ` ${className}` : ''}`}
        size={size}
      />
    )
  },
)

export type HbarAppUiToggleProps = Omit<LumenToggleProps, 'size'> & {
  readonly size?: HbarAppUiSize
}

export const HbarAppUiToggle = forwardRef<HTMLInputElement, HbarAppUiToggleProps>(function HbarAppUiToggle(
  { size, className = '', ...props },
  ref,
) {
  return (
    <LumenToggle {...props} ref={ref} className={`hbar-app-ui-toggle${className ? ` ${className}` : ''}`} size={size} />
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
  readonly boundary?: 'horizontal' | 'vertical'
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
  size,
  variant = 'outline',
  invalid = false,
  describedBy,
  ...props
}: HbarAppUiComboBoxProps) {
  const field = useContext(FieldAccessibility)
  return (
    <LumenComboBox
      {...props}
      size={size ?? field.size}
      variant={variant === 'plain' ? 'plain' : 'boundary'}
      invalid={invalid || field.invalid}
      describedBy={describedBy ?? field.describedBy}
    />
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

export function HbarAppUiMultiSelect(props: HbarAppUiMultiSelectProps) {
  const field = useContext(FieldAccessibility)
  const { size, variant = 'outline', invalid = false, describedBy, ...other } = props
  return (
    <LumenMultiSelect
      {...other}
      size={size ?? field.size}
      variant={variant === 'plain' ? 'plain' : 'boundary'}
      invalid={invalid || field.invalid}
      describedBy={describedBy ?? field.describedBy}
    />
  )
}
