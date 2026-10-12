import { LumenButton, LumenIconButton, type LumenButtonProps } from '../primitives'
import LumenSurface from '../LumenSurface'
import * as React from 'react'
import { type ReactNode } from 'react'

export type NavbarIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type NavbarIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>

export interface LumenNavbarInternalEvent {
  readonly variantId: string
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenNavbarCompositionProps {
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
  readonly onAction?: ((event: LumenNavbarInternalEvent) => void) | undefined
}

export type NavbarSurfaceProps = LumenNavbarCompositionProps

export function reportNavbarAction(
  onAction: NavbarSurfaceProps['onAction'],
  spec: NavbarSurfaceProps['spec'],
  actionId: string,
  value?: string,
): void {
  onAction?.(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
}

export function NavbarFrame({
  spec,
  className,
  children,
}: NavbarSurfaceProps & {
  readonly className: string
  readonly children: React.ReactNode
}) {
  const contentClassName = [
    'lumen-navbar',
    'hbar-app-ui-navbar-surface',
    `hbar-app-ui-navbar-variant-${spec.variant}`,
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
      className="lumen-navbar-root-surface"
      contentClassName={contentClassName}
      data-lumen-component="navbar"
      data-lumen-variant={spec.variant}
      data-hbar-app-ui-component={spec.id}
      data-hbar-app-ui-surface={spec.profile.surface}
      data-hbar-app-ui-state={spec.profile.initialState}
    >
      {children}
    </LumenSurface>
  )
}

export function NavbarButton({
  children,
  type = 'button',
  className,
  ...props
}: LumenButtonProps & {
  readonly children: ReactNode
}) {
  return (
    <LumenButton {...props} type={type} className={['hbar-app-ui-button', className].filter(Boolean).join(' ')}>
      {children}
    </LumenButton>
  )
}

export function NavbarGlyph({
  icon: Icon,
  tier = 'md',
}: {
  readonly icon: NavbarIcon
  readonly tier?: NavbarIconTier | undefined
}) {
  return (
    <span className={`hbar-app-ui-navbar-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">
      <Icon />
    </span>
  )
}

export function NavbarIconOnly({
  icon,
  tier = 'md',
  children,
  label,
  type = 'button',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon: NavbarIcon
  readonly label: string
  readonly tier?: NavbarIconTier | undefined
  readonly children?: React.ReactNode
}) {
  return (
    <LumenIconButton
      {...props}
      type={type}
      label={label}
      className={['hbar-app-ui-icon-button', className].filter(Boolean).join(' ')}
    >
      {children ?? <NavbarGlyph icon={icon} tier={tier} />}
    </LumenIconButton>
  )
}
