import { Children, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

type SurfaceTone = 'base' | 'raised' | 'subtle' | 'accent' | 'danger'

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly tone?: SurfaceTone
}

export function Surface({ className = '', tone = 'base', ...props }: SurfaceProps) {
  return <div {...props} className={`ui-surface ui-surface-${tone}${className ? ` ${className}` : ''}`} />
}

export interface SpotlightSurfaceProps extends SurfaceProps {
  readonly spotlightColor?: string
}

export function SpotlightSurface({
  className = '',
  spotlightColor = 'color-mix(in srgb, var(--hbar-ac) 28%, transparent)',
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: SpotlightSurfaceProps) {
  return (
    <Surface
      {...props}
      className={`ui-spotlight ${className}`}
      style={{ ...style, ['--ui-spotlight-color' as string]: spotlightColor }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty('--ui-spotlight-x', `${event.clientX - rect.left}px`)
        event.currentTarget.style.setProperty('--ui-spotlight-y', `${event.clientY - rect.top}px`)
        onPointerMove?.(event)
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.removeProperty('--ui-spotlight-x')
        event.currentTarget.style.removeProperty('--ui-spotlight-y')
        onPointerLeave?.(event)
      }}
    />
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string
}

export function IconButton({ label, className = '', ...props }: IconButtonProps) {
  return (
    <button {...props} className={`ui-icon-button${className ? ` ${className}` : ''}`} aria-label={props['aria-label'] ?? label} title={props.title ?? label}>
      {props.children}
    </button>
  )
}

export interface GlareButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'quiet' | 'danger'
}

export function GlareButton({ className = '', variant = 'primary', ...props }: GlareButtonProps) {
  return <button {...props} className={`ui-glare-button ui-glare-${variant}${className ? ` ${className}` : ''}`} />
}

export interface AnimatedListProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode
}

export function AnimatedList({ children, className = '', ...props }: AnimatedListProps) {
  const items = Children.toArray(children)
  return (
    <div {...props} className={`ui-animated-list${className ? ` ${className}` : ''}`}>
      {items.map((child, index) => (
        <div className="ui-animated-list-item" style={{ ['--ui-list-index' as string]: index }} key={index}>
          {child}
        </div>
      ))}
    </div>
  )
}

export interface TabsProps<T extends string> {
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (value: T) => void
  readonly label: string
  readonly className?: string
}

export function Tabs<T extends string>({ value, options, onChange, label, className = '' }: TabsProps<T>) {
  return (
    <div className={`ui-tabs${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'selected' : ''}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export interface Metric {
  readonly label: string
  readonly value: string
  readonly detail?: string
  readonly tone?: 'neutral' | 'positive' | 'warning' | 'negative'
}

export function MetricStrip({ metrics, className = '' }: { readonly metrics: readonly Metric[]; readonly className?: string }) {
  return (
    <dl className={`ui-metric-strip${className ? ` ${className}` : ''}`}>
      {metrics.map((metric) => (
        <div className={`ui-metric ui-metric-${metric.tone ?? 'neutral'}`} key={metric.label}>
          <dt>{metric.label}</dt>
          <dd>{metric.value}</dd>
          {metric.detail && <small>{metric.detail}</small>}
        </div>
      ))}
    </dl>
  )
}

export function EmptyState({ icon, title, description, action, className = '' }: {
  readonly icon?: ReactNode
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div className={`ui-empty-state${className ? ` ${className}` : ''}`}>
      {icon && <span className="ui-empty-icon" aria-hidden="true">{icon}</span>}
      <strong>{title}</strong>
      {description && <span>{description}</span>}
      {action}
    </div>
  )
}

export interface TimelineStep {
  readonly id: string
  readonly label: string
  readonly detail?: string
  readonly status: 'pending' | 'active' | 'complete' | 'failed'
}

export function Timeline({ steps, className = '' }: { readonly steps: readonly TimelineStep[]; readonly className?: string }) {
  return (
    <ol className={`ui-timeline${className ? ` ${className}` : ''}`}>
      {steps.map((step) => (
        <li className={`ui-timeline-step ui-timeline-${step.status}`} key={step.id}>
          <span className="ui-timeline-marker" aria-hidden="true" />
          <div>
            <strong>{step.label}</strong>
            {step.detail && <small>{step.detail}</small>}
          </div>
        </li>
      ))}
    </ol>
  )
}
