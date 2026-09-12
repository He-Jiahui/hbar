import { useCallback, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import GlassSurface from './GlassSurface'
import GlareButton from './GlareButton'

export type SurfaceVariant = 'canvas' | 'panel' | 'card' | 'overlay' | 'code' | 'decision'

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode
  variant?: SurfaceVariant
  effect?: 'none' | 'glass'
}

/** Semantic container for the shared ReactBits surface hierarchy. */
export function Surface({ children, variant = 'panel', effect = 'none', className = '', ...props }: SurfaceProps) {
  return (
    <div {...props} className={`hbar-surface hbar-surface--${variant}${className ? ` ${className}` : ''}`}>
      {effect === 'glass' ? <GlassSurface className="hbar-surface__glass" width="100%" height="100%" aria-hidden="true" /> : null}
      <div className="hbar-surface__content">{children}</div>
    </div>
  )
}

export type ActionButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ActionButtonSize = 'sm' | 'md' | 'lg'

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant
  size?: ActionButtonSize
  loading?: boolean
}

/** Native button semantics with ReactBits glare reserved for decisive actions. */
export function ActionButton({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ActionButtonProps) {
  const classes = `hbar-action-button hbar-action-button--${variant} hbar-action-button--${size}${className ? ` ${className}` : ''}`
  const content = (
    <>
      {loading ? <span className="hbar-action-button__spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </>
  )
  const buttonProps = {
    ...props,
    type,
    disabled: disabled || loading,
    'aria-busy': loading || undefined,
  }
  return variant === 'primary' ? (
    <GlareButton {...buttonProps} className={classes}>
      {content}
    </GlareButton>
  ) : (
    <button {...buttonProps} className={classes}>
      {content}
    </button>
  )
}

export type StatusBadgeStatus = 'idle' | 'queued' | 'running' | 'waiting' | 'success' | 'warning' | 'error'

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus
  children?: ReactNode
}

export const statusLabels: Record<StatusBadgeStatus, string> = {
  idle: '空闲',
  queued: '排队中',
  running: '运行中',
  waiting: '等待确认',
  success: '完成',
  warning: '注意',
  error: '失败',
}

export function statusLabel(status: StatusBadgeStatus): string {
  return statusLabels[status]
}

export function StatusBadge({ status, children, className = '', ...props }: StatusBadgeProps) {
  return (
    <span {...props} className={`hbar-status-badge hbar-status-badge--${status}${className ? ` ${className}` : ''}`}>
      <span className="hbar-status-badge__dot" aria-hidden="true" />
      <span>{children ?? statusLabels[status]}</span>
    </span>
  )
}

export interface SegmentedOption<Value extends string> {
  value: Value
  label: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<Value extends string> extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  value: Value
  options: readonly SegmentedOption<Value>[]
  onChange: (value: Value) => void
  ariaLabel: string
}

export function SegmentedControl<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  ...props
}: SegmentedControlProps<Value>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = useCallback(
    (index: number, direction: 1 | -1) => {
      if (options.length === 0) return
      for (let offset = 1; offset <= options.length; offset += 1) {
        const candidate = (index + direction * offset + options.length) % options.length
        const option = options[candidate]
        if (option && !option.disabled) {
          onChange(option.value)
          refs.current[candidate]?.focus()
          return
        }
      }
    },
    [onChange, options],
  )
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      move(index, -1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const direction = event.key === 'Home' ? 1 : -1
      move(direction === 1 ? -1 : options.length, direction)
    }
  }
  return (
    <div {...props} className={`hbar-segmented-control${className ? ` ${className}` : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            refs.current[index] = element
          }}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'selected' : undefined}
          tabIndex={option.value === value ? 0 : -1}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export type EmptyStateVariant = 'empty' | 'loading' | 'error' | 'dropzone'

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  variant?: EmptyStateVariant
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  variant = 'empty',
  icon,
  title,
  description,
  action,
  className = '',
  ...props
}: EmptyStateProps) {
  const role = variant === 'error' ? 'alert' : 'status'
  return (
    <div {...props} className={`hbar-empty-state hbar-empty-state--${variant}${className ? ` ${className}` : ''}`} role={role}>
      {icon ? <div className="hbar-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="hbar-empty-state__copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {action ? <div className="hbar-empty-state__action">{action}</div> : null}
    </div>
  )
}

export type TimelineStatus = 'idle' | 'queued' | 'running' | 'waiting' | 'success' | 'warning' | 'error'

export interface TimelineItem {
  id: string
  title: ReactNode
  meta?: ReactNode
  detail?: ReactNode
  status?: TimelineStatus
}

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  items: readonly TimelineItem[]
  empty?: ReactNode
}

export function Timeline({ items, empty = '暂无活动', className = '', ...props }: TimelineProps) {
  if (items.length === 0) return <div className={`hbar-timeline-empty${className ? ` ${className}` : ''}`}>{empty}</div>
  return (
    <ol {...props} className={`hbar-timeline${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <li key={item.id} className={`hbar-timeline__item hbar-timeline__item--${item.status ?? 'idle'}`}>
          <span className="hbar-timeline__rail" aria-hidden="true"><span className="hbar-timeline__dot" /></span>
          <div className="hbar-timeline__body">
            <div className="hbar-timeline__heading"><strong>{item.title}</strong>{item.meta ? <span>{item.meta}</span> : null}</div>
            {item.detail ? <div className="hbar-timeline__detail">{item.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export type ProgressStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface ProgressStep {
  id: string
  title: ReactNode
  description?: ReactNode
  status: ProgressStepStatus
}

export interface ProgressRailProps extends HTMLAttributes<HTMLOListElement> {
  steps: readonly ProgressStep[]
}

export function ProgressRail({ steps, className = '', ...props }: ProgressRailProps) {
  return (
    <ol {...props} className={`hbar-progress-rail${className ? ` ${className}` : ''}`}>
      {steps.map((step, index) => (
        <li key={step.id} className={`hbar-progress-rail__step hbar-progress-rail__step--${step.status}`}>
          <span className="hbar-progress-rail__marker" aria-hidden="true">{step.status === 'completed' ? '✓' : index + 1}</span>
          {index < steps.length - 1 ? <span className="hbar-progress-rail__line" aria-hidden="true" /> : null}
          <div className="hbar-progress-rail__copy">
            <strong>{step.title}</strong>
            {step.description ? <span>{step.description}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
