import type { HTMLAttributes, ReactNode } from 'react'
import SpotlightCard from './SpotlightCard'
import {
  SegmentedControl,
  StatusBadge,
  Surface,
  type SegmentedOption,
  type StatusBadgeStatus,
  type SurfaceVariant,
} from './semantic'
import { REFERENCE_SKILL } from './reference/reference-types'

/**
 * Keep the clean-room reference binding visible in the DOM.  This is useful
 * for visual QA and accessibility audits without coupling production views to
 * fixture-only components or private ReactBits source.
 */
export function referenceAttributes(reference: string, adapter?: string) {
  return {
    'data-reactbits-skill': REFERENCE_SKILL,
    'data-reactbits-reference': reference,
    ...(adapter ? { 'data-reactbits-adapter': adapter } : {}),
  } as const
}

export interface ReferenceSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode
  reference: string
  adapter?: string
  variant?: SurfaceVariant
  effect?: 'none' | 'glass'
}

/** Semantic surface that records the exact public reference used by a view. */
export function ReferenceSurface({
  children,
  reference,
  adapter,
  variant = 'panel',
  effect = 'none',
  className = '',
  ...props
}: ReferenceSurfaceProps) {
  return (
    <Surface
      {...props}
      {...referenceAttributes(reference, adapter)}
      variant={variant}
      effect={effect}
      className={`rb-production-surface${className ? ` ${className}` : ''}`}
    >
      {children}
    </Surface>
  )
}

export interface ReferenceSectionHeaderProps {
  reference: string
  adapter?: string
  icon?: ReactNode
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/** Shared title/description/action hierarchy used by panel and detail views. */
export function ReferenceSectionHeader({
  reference,
  adapter,
  icon,
  eyebrow,
  title,
  description,
  actions,
  className = '',
}: ReferenceSectionHeaderProps) {
  return (
    <header
      {...referenceAttributes(reference, adapter)}
      className={`rb-reference-section-header${className ? ` ${className}` : ''}`}
    >
      {icon ? <span className="rb-reference-section-header__icon" aria-hidden="true">{icon}</span> : null}
      <div className="rb-reference-section-header__copy">
        {eyebrow ? <span className="rb-reference-section-header__eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="rb-reference-section-header__actions">{actions}</div> : null}
    </header>
  )
}

export interface ReferenceMetric {
  id: string
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  status?: StatusBadgeStatus
}

export interface ReferenceMetricStripProps {
  metrics: readonly ReferenceMetric[]
  reference: string
  adapter?: string
  className?: string
}

/** Metric/card strip shared by AI usage, activity, dashboards and inspectors. */
export function ReferenceMetricStrip({ metrics, reference, adapter, className = '' }: ReferenceMetricStripProps) {
  return (
    <div
      {...referenceAttributes(reference, adapter)}
      className={`rb-reference-metric-strip${className ? ` ${className}` : ''}`}
    >
      {metrics.map((metric) => (
        <SpotlightCard
          className="rb-reference-metric"
          key={metric.id}
          spotlightColor="color-mix(in srgb, var(--rb-accent) 22%, transparent)"
        >
          <span className="rb-reference-metric__label">{metric.label}</span>
          <strong className="rb-reference-metric__value">{metric.value}</strong>
          {metric.detail ? <small className="rb-reference-metric__detail">{metric.detail}</small> : null}
          {metric.status ? <StatusBadge status={metric.status} /> : null}
        </SpotlightCard>
      ))}
    </div>
  )
}

export interface ReferenceTabsProps<Value extends string> {
  value: Value
  options: readonly SegmentedOption<Value>[]
  onChange(value: Value): void
  ariaLabel: string
  reference: string
  adapter?: string
  className?: string
}

/** Tab treatment used by chat/console, activity/trace, Git and settings. */
export function ReferenceTabs<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  reference,
  adapter,
  className = '',
}: ReferenceTabsProps<Value>) {
  return (
    <SegmentedControl
      {...referenceAttributes(reference, adapter)}
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel}
      className={`rb-reference-tabs${className ? ` ${className}` : ''}`}
    />
  )
}
