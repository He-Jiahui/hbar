import { LumenButton, LumenStatus } from '../primitives'
import LumenSurface from '../LumenSurface'
import * as React from 'react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import {
  type LumenBillingMetric,
  type LumenBillingTone,
  type LumenBillingValueRow,
  type LumenBillingWorkflowStep,
} from './content'
import { LumenProgress } from '../ui-controls'

export interface LumenBillingCompositionProps {
  readonly spec: {
    readonly id: string
    readonly variant: number
    readonly density?: string | undefined
    readonly className?: string | undefined
    readonly profile: {
      readonly surface?: string | undefined
      readonly initialState?: string | undefined
      readonly visualMode?: string | undefined
    }
  }
  readonly onAction?:
    | ((event: { readonly variantId: string; readonly actionId: string; readonly value?: string | undefined }) => void)
    | undefined
}

export function BillingFrame({
  spec,
  className,
  children,
}: LumenBillingCompositionProps & {
  readonly children: React.ReactNode
  readonly className?: string | undefined
}) {
  const contentClassName = [
    'lumen-billing',
    'hbar-app-ui-billing-surface',
    `hbar-app-ui-billing-variant-${spec.variant}`,
    spec.density ? `hbar-app-ui-density-${spec.density}` : '',
    spec.profile.surface ? `hbar-app-ui-surface-${spec.profile.surface}` : '',
    spec.profile.initialState ? `hbar-app-ui-state-${spec.profile.initialState}` : '',
    spec.profile.visualMode ? `hbar-app-ui-visual-${spec.profile.visualMode}` : '',
    spec.className,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-billing-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="billing"
      data-lumen-variant={spec.variant}
      data-hbar-app-ui-component={spec.id}
      data-hbar-app-ui-surface={spec.profile.surface}
      data-hbar-app-ui-state={spec.profile.initialState}
    >
      {children}
    </LumenSurface>
  )
}

export function BillingIcon({
  children,
  tier = 'sm',
  label,
}: {
  readonly children: React.ReactNode
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
  readonly label?: string | undefined
}) {
  if (label) {
    return (
      <span className={`hbar-app-ui-billing-icon hbar-app-ui-icon-${tier}`} aria-label={label}>
        {children}
      </span>
    )
  }
  return (
    <span className={`hbar-app-ui-billing-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">
      {children}
    </span>
  )
}

export const BillingButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { readonly tone?: 'neutral' | 'accent' | 'quiet' }
>(function BillingButton({ children, tone = 'neutral', className, ...props }, ref) {
  return (
    <LumenButton
      {...props}
      ref={ref}
      tone={tone === 'accent' ? 'primary' : 'neutral'}
      variant={tone === 'accent' ? 'solid' : tone === 'quiet' ? 'text' : 'outlined'}
      className={`hbar-app-ui-billing-button hbar-app-ui-billing-button-${tone} ${className ?? ''}`}
    >
      {children}
    </LumenButton>
  )
})

export function BillingIconButton({
  children,
  label,
  tier = 'sm',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | undefined
}) {
  return (
    <BillingButton
      {...props}
      className={`hbar-app-ui-billing-icon-button ${props.className ?? ''}`}
      aria-label={props['aria-label'] ?? label}
      title={props.title ?? label}
    >
      <BillingIcon tier={tier}>{children}</BillingIcon>
    </BillingButton>
  )
}

export function BillingStatus({
  value,
  tone = 'neutral',
}: {
  readonly value: string
  readonly tone?: LumenBillingTone | undefined
}) {
  const tones = {
    neutral: 'neutral',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return <LumenStatus className="hbar-app-ui-billing-status" value={value} tone={tones[tone]} />
}

export function BillingProgress({
  value,
  label,
  tone = 'neutral',
}: {
  readonly value: number
  readonly label: string
  readonly tone?: LumenBillingTone | undefined
}) {
  const tones = {
    neutral: 'info',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return <LumenProgress className="hbar-app-ui-billing-progress" label={label} value={value} tone={tones[tone]} />
}

export function BillingMetricCard({
  metric,
  progressLabel,
}: {
  readonly metric: LumenBillingMetric
  readonly progressLabel: string
}) {
  return (
    <section className={`hbar-app-ui-billing-metric hbar-app-ui-billing-tone-${metric.tone ?? 'neutral'}`}>
      <header>
        <span>{metric.label}</span>
        {metric.trend && <strong>{metric.trend}</strong>}
      </header>
      <b>{metric.value}</b>
      {metric.detail && <small>{metric.detail}</small>}
      {metric.progress !== undefined && (
        <BillingProgress value={metric.progress} label={progressLabel} tone={metric.tone} />
      )}
    </section>
  )
}

export function BillingValueRows({
  rows,
  className,
}: {
  readonly rows: readonly LumenBillingValueRow[]
  readonly className?: string | undefined
}) {
  return (
    <dl className={`hbar-app-ui-billing-value-rows ${className ?? ''}`}>
      {rows.map((row) => (
        <div key={row.id} className={`hbar-app-ui-billing-value-row hbar-app-ui-billing-tone-${row.tone ?? 'neutral'}`}>
          <dt>{row.label}</dt>
          <dd>
            <span>{row.value}</span>
            {row.detail && <small>{row.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function BillingWorkflowSteps({
  steps,
  activeId,
}: {
  readonly steps: readonly LumenBillingWorkflowStep[]
  readonly activeId: string
}) {
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeId),
  )
  const stepClassName = (index: number) => {
    if (index === activeIndex) {
      return 'is-active'
    }
    if (index < activeIndex) {
      return 'is-complete'
    }
    return ''
  }
  return (
    <ol className="hbar-app-ui-billing-workflow-steps">
      {steps.map((step, index) => (
        <li key={step.id} className={stepClassName(index)} aria-current={index === activeIndex ? 'step' : undefined}>
          <span>{index + 1}</span>
          <div>
            <strong>{step.label}</strong>
            <small>{step.description}</small>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function BillingListStrategy({ kind }: { readonly kind: LumenBillingListStrategyKind }) {
  return <span className="hbar-app-ui-billing-strategy" data-hbar-app-ui-list-strategy={kind} aria-hidden="true" />
}

type LumenBillingListStrategyKind = 'content-grown' | 'pane-scroll' | 'virtualized'

export function BillingEmptyState({ message }: { readonly message: string }) {
  return <p className="hbar-app-ui-billing-empty">{message}</p>
}
