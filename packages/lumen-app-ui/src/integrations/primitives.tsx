import { LumenButton, LumenIconButton, LumenStatus } from '../primitives'
import LumenSurface from '../LumenSurface'
import * as React from 'react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { type LumenIntegrationTone } from './content'
import { LumenProgress } from '../ui-controls'

export interface LumenIntegrationsCompositionProps {
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

export function IntegrationFrame({
  spec,
  className,
  children,
}: LumenIntegrationsCompositionProps & {
  readonly children: React.ReactNode
  readonly className?: string | undefined
}) {
  const contentClassName = [
    'lumen-integrations',
    'hbar-app-ui-integration-surface',
    `hbar-app-ui-integration-variant-${spec.variant}`,
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
      className="lumen-integrations-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="integrations"
      data-lumen-variant={spec.variant}
      data-hbar-app-ui-component={spec.id}
      data-hbar-app-ui-surface={spec.profile.surface}
      data-hbar-app-ui-state={spec.profile.initialState}
    >
      {children}
    </LumenSurface>
  )
}

export function IntegrationIcon({
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
      <span className={`hbar-app-ui-integration-icon hbar-app-ui-icon-${tier}`} aria-label={label}>
        {children}
      </span>
    )
  }
  return (
    <span className={`hbar-app-ui-integration-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">
      {children}
    </span>
  )
}

export const IntegrationButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent' | 'quiet' | 'danger'
  }
>(function IntegrationButton({ children, tone = 'neutral', className, ...props }, ref) {
  return (
    <LumenButton
      {...props}
      ref={ref}
      tone={tone === 'accent' ? 'primary' : tone === 'danger' ? 'danger' : 'neutral'}
      variant={tone === 'quiet' ? 'text' : tone === 'neutral' ? 'outlined' : 'solid'}
      className={`hbar-app-ui-integration-button hbar-app-ui-integration-button-${tone} ${className ?? ''}`}
    >
      {children}
    </LumenButton>
  )
})

export function IntegrationIconButton({
  children,
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string
}) {
  return (
    <LumenIconButton
      {...props}
      label={label}
      className={`hbar-app-ui-integration-icon-button ${className ?? ''}`}
      aria-label={props['aria-label'] ?? label}
      title={props.title ?? label}
    >
      {children}
    </LumenIconButton>
  )
}

export function IntegrationStatus({
  value,
  tone = 'neutral',
}: {
  readonly value: string
  readonly tone?: LumenIntegrationTone | undefined
}) {
  const tones = {
    neutral: 'neutral',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return <LumenStatus className="hbar-app-ui-integration-status" value={value} tone={tones[tone]} />
}

export function IntegrationProgress({
  value,
  label,
  tone = 'neutral',
}: {
  readonly value: number
  readonly label: string
  readonly tone?: LumenIntegrationTone | undefined
}) {
  const tones = {
    neutral: 'info',
    positive: 'success',
    warning: 'warning',
    danger: 'danger',
  } as const
  return <LumenProgress className="hbar-app-ui-integration-progress" label={label} value={value} tone={tones[tone]} />
}

export function IntegrationEmpty({ message }: { readonly message: string }) {
  return <p className="hbar-app-ui-integration-empty">{message}</p>
}
