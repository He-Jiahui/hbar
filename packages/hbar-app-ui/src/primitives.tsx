import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIconButton,
  LumenNavigationButton,
  LumenSurface,
  LumenText,
  LumenTextarea,
} from '@lumen/app-ui'
import {
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  useState,
} from 'react'
import type { HbarAppUiSize } from './appearance'
import type { HbarAppUiDataRow, HbarAppUiMetric, HbarAppUiOption, HbarAppUiTimelineStep } from './types'
import './primitives.css'

export function HbarAppUiSurface({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <LumenSurface {...props} className={`hbar-app-ui-surface${className ? ` ${className}` : ''}`}>
      {children}
    </LumenSurface>
  )
}

type HbarAppUiSpotlightProps = HTMLAttributes<HTMLElement> & { readonly as?: 'div' | 'form' | 'section' }

export function HbarAppUiSpotlight({ as = 'div', className = '', children, ...props }: HbarAppUiSpotlightProps) {
  const Element: ElementType = as
  return (
    <Element
      {...props}
      className={`hbar-app-ui-spotlight${className ? ` ${className}` : ''}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty('--hbar-app-ui-x', `${event.clientX - rect.left}px`)
        event.currentTarget.style.setProperty('--hbar-app-ui-y', `${event.clientY - rect.top}px`)
        props.onPointerMove?.(event)
      }}
    >
      {children}
    </Element>
  )
}

export type HbarAppUiButtonTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'
export type HbarAppUiButtonSize = HbarAppUiSize
export type HbarAppUiButtonVariant = 'contained' | 'outlined' | 'text' | 'solid' | 'outline' | 'ghost'
export type HbarAppUiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: HbarAppUiButtonTone
  readonly size?: HbarAppUiButtonSize
  readonly variant?: HbarAppUiButtonVariant
  readonly loading?: boolean
}

export function HbarAppUiButton({
  tone = 'neutral',
  size,
  variant = 'solid',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: HbarAppUiButtonProps) {
  const lumenTone = tone === 'accent' ? 'primary' : tone === 'positive' ? 'success' : tone
  const lumenVariant = variant === 'outline' ? 'outlined' : variant === 'ghost' ? 'text' : variant
  return (
    <LumenButton
      {...props}
      type={props.type ?? 'button'}
      className={`hbar-app-ui-button${className ? ` ${className}` : ''}`}
      data-variant={variant}
      size={size}
      tone={lumenTone}
      variant={lumenVariant}
      loading={loading}
      disabled={disabled}
    >
      {children}
    </LumenButton>
  )
}

export type HbarAppUiIconButtonProps = HbarAppUiButtonProps & { readonly label: string }

export function HbarAppUiIconButton({
  label,
  className = '',
  children,
  tone = 'neutral',
  size = 'm',
  loading = false,
  disabled,
  variant = 'text',
  ...props
}: HbarAppUiIconButtonProps) {
  return (
    <LumenIconButton
      {...props}
      className={`hbar-app-ui-button hbar-app-ui-icon-button${className ? ` ${className}` : ''}`}
      label={label}
      size={size}
      tone={tone === 'accent' ? 'primary' : tone === 'positive' ? 'success' : tone}
      variant={variant === 'outline' ? 'outlined' : variant === 'ghost' ? 'text' : variant}
      loading={loading}
      disabled={disabled}
    >
      {children}
    </LumenIconButton>
  )
}

export type HbarAppUiNavigationButtonProps = Omit<HbarAppUiButtonProps, 'variant'> & {
  readonly selected?: boolean
}

export function HbarAppUiNavigationButton({
  selected = false,
  size = 's',
  tone = 'neutral',
  className = '',
  children,
  ...props
}: HbarAppUiNavigationButtonProps) {
  return (
    <LumenNavigationButton
      {...props}
      className={`hbar-app-ui-button hbar-app-ui-navigation-button${className ? ` ${className}` : ''}`}
      size={size}
      tone={tone === 'accent' ? 'primary' : tone === 'positive' ? 'success' : tone}
      data-variant="ghost"
      selected={selected}
    >
      {children}
    </LumenNavigationButton>
  )
}

export type HbarAppUiTextTone = 'neutral' | 'muted' | 'subtle' | 'positive' | 'warning' | 'danger'
export type HbarAppUiTextVariant = 'body' | 'label' | 'supporting' | 'code'
export type HbarAppUiTextProps = HTMLAttributes<HTMLElement> & {
  readonly as?: 'span' | 'p' | 'small' | 'code'
  readonly size?: HbarAppUiSize
  readonly tone?: HbarAppUiTextTone
  readonly variant?: HbarAppUiTextVariant
}

export function HbarAppUiText({
  as = 'span',
  size,
  tone = 'neutral',
  variant = 'body',
  className = '',
  children,
  ...props
}: HbarAppUiTextProps) {
  const lumenTone = tone === 'positive' ? 'success' : tone
  return (
    <LumenText
      {...props}
      as={as}
      className={`hbar-app-ui-text${className ? ` ${className}` : ''}`}
      size={size}
      tone={lumenTone}
      variant={variant}
    >
      {children}
    </LumenText>
  )
}

export type HbarAppUiLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  readonly size?: HbarAppUiSize
  readonly tone?: HbarAppUiTextTone
}

export function HbarAppUiLabel({ size, tone = 'neutral', className = '', children, ...props }: HbarAppUiLabelProps) {
  return (
    <LumenFrame
      as="label"
      {...props}
      className={`hbar-app-ui-label${className ? ` ${className}` : ''}`}
      data-size={size}
      data-tone={tone}
    >
      {children}
    </LumenFrame>
  )
}

export function HbarAppUiTabs({
  options,
  value,
  onChange,
  label,
}: {
  readonly options: readonly HbarAppUiOption[]
  readonly value: string
  readonly onChange: (value: string) => void
  readonly label: string
}) {
  return (
    <LumenFrame className="hbar-app-ui-tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <HbarAppUiButton
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          className={value === option.id ? 'is-selected' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </HbarAppUiButton>
      ))}
    </LumenFrame>
  )
}

export function HbarAppUiMetricStrip({ metrics }: { readonly metrics: readonly HbarAppUiMetric[] }) {
  return (
    <LumenCollection as="dl" className="hbar-app-ui-metrics">
      {metrics.map((metric) => (
        <LumenFrame className={`hbar-app-ui-metric hbar-app-ui-metric-${metric.tone ?? 'neutral'}`} key={metric.label}>
          <LumenCollectionItem as="dt">{metric.label}</LumenCollectionItem>
          <LumenCollectionItem as="dd">{metric.value}</LumenCollectionItem>
          {metric.detail && <LumenText as="small">{metric.detail}</LumenText>}
        </LumenFrame>
      ))}
    </LumenCollection>
  )
}

export function HbarAppUiProgress({
  value,
  label,
  tone = 'accent',
}: {
  readonly value: number
  readonly label?: string
  readonly tone?: 'accent' | 'positive' | 'warning' | 'danger'
}) {
  const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return (
    <LumenFrame
      className="hbar-app-ui-progress"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={bounded}
      role="progressbar"
    >
      <LumenText
        as="span"
        className={`hbar-app-ui-progress-fill hbar-app-ui-progress-${tone}`}
        style={{ width: `${bounded}%` }}
      />
    </LumenFrame>
  )
}

export function HbarAppUiTimeline({ steps }: { readonly steps: readonly HbarAppUiTimelineStep[] }) {
  return (
    <LumenCollection as="ol" className="hbar-app-ui-timeline">
      {steps.map((step) => (
        <LumenCollectionItem className={`hbar-app-ui-timeline-step hbar-app-ui-timeline-${step.status}`} key={step.id}>
          <LumenText as="span" className="hbar-app-ui-timeline-marker" aria-hidden="true" />
          <LumenFrame>
            <LumenText as="strong">{step.label}</LumenText>
            {step.detail && <LumenText as="small">{step.detail}</LumenText>}
          </LumenFrame>
        </LumenCollectionItem>
      ))}
    </LumenCollection>
  )
}

export function HbarAppUiEmptyState({
  icon,
  title,
  description,
  action,
}: {
  readonly icon?: ReactNode
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
}) {
  return (
    <LumenFrame className="hbar-app-ui-empty">
      <LumenText as="span" className="hbar-app-ui-empty-icon" aria-hidden="true">
        {icon ?? '·'}
      </LumenText>
      <LumenText as="strong">{title}</LumenText>
      <LumenText as="p">{description}</LumenText>
      {action}
    </LumenFrame>
  )
}

export function HbarAppUiStatus({
  value,
  tone = 'neutral',
}: {
  readonly value: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}) {
  return (
    <LumenText as="span" className={`hbar-app-ui-status hbar-app-ui-status-${tone}`}>
      <LumenFrame as="i" aria-hidden="true" />
      {value}
    </LumenText>
  )
}

export function HbarAppUiToolbar({
  title,
  detail,
  children,
}: {
  readonly title: string
  readonly detail?: string
  readonly children?: ReactNode
}) {
  return (
    <LumenFrame as="header" className="hbar-app-ui-toolbar">
      <LumenFrame>
        <LumenText as="strong">{title}</LumenText>
        {detail && <LumenText as="small">{detail}</LumenText>}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-toolbar-actions">{children}</LumenFrame>
    </LumenFrame>
  )
}

export function HbarAppUiDataTable({
  rows,
  labels,
  statusTone,
  selected,
  onSelect,
}: {
  readonly rows: readonly HbarAppUiDataRow[]
  readonly labels: { readonly name: string; readonly status: string; readonly value: string; readonly details: string }
  readonly statusTone?: (row: HbarAppUiDataRow) => 'neutral' | 'positive' | 'warning' | 'danger'
  readonly selected?: string
  readonly onSelect: (id: string) => void
}) {
  return (
    <LumenFrame className="hbar-app-ui-table-wrap">
      <LumenCollection as="table" className="hbar-app-ui-table">
        <LumenCollection as="thead">
          <LumenCollectionItem as="tr">
            <LumenCollectionItem as="th">{labels.name}</LumenCollectionItem>
            <LumenCollectionItem as="th">{labels.status}</LumenCollectionItem>
            <LumenCollectionItem as="th">{labels.value}</LumenCollectionItem>
            <LumenCollectionItem as="th">{labels.details}</LumenCollectionItem>
          </LumenCollectionItem>
        </LumenCollection>
        <LumenCollection as="tbody">
          {rows.map((row) => (
            <LumenCollectionItem
              as="tr"
              className={selected === row.id ? 'is-selected' : ''}
              key={row.id}
              onClick={() => onSelect(row.id)}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(row.id)
                }
              }}
            >
              <LumenCollectionItem as="td">{row.name}</LumenCollectionItem>
              <LumenCollectionItem as="td">
                <HbarAppUiStatus value={row.status} tone={statusTone?.(row) ?? 'neutral'} />
              </LumenCollectionItem>
              <LumenCollectionItem as="td">{row.value}</LumenCollectionItem>
              <LumenCollectionItem as="td">{row.detail}</LumenCollectionItem>
            </LumenCollectionItem>
          ))}
        </LumenCollection>
      </LumenCollection>
    </LumenFrame>
  )
}

export function HbarAppUiComposer({
  labels,
  placeholder,
  onSubmit,
}: {
  readonly placeholder?: string
  readonly labels: {
    readonly input: string
    readonly placeholder: string
    readonly send: string
    readonly characterCount: (count: number) => string
  }
  readonly onSubmit?: (value: string) => void
}) {
  const [value, setValue] = useState('')
  const submit = () => {
    const next = value.trim()
    if (!next) return
    onSubmit?.(next)
    setValue('')
  }
  return (
    <LumenFrame
      as="form"
      className="hbar-app-ui-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <LumenTextarea
        className="hbar-app-ui-composer-input"
        value={value}
        aria-label={labels.input}
        placeholder={placeholder ?? labels.placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <LumenFrame>
        <LumenText as="span">{labels.characterCount(value.length)}</LumenText>
        <HbarAppUiButton type="submit" variant="contained" tone="accent" disabled={!value.trim()}>
          {labels.send}
        </HbarAppUiButton>
      </LumenFrame>
    </LumenFrame>
  )
}

export { HbarAppUiDialog } from './components/app-dialog/NativeDialog'
