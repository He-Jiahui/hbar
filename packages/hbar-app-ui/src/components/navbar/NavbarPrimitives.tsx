import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import {HbarAppUiButton, HbarAppUiIconButton} from '../../primitives'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type NavbarSurfaceProps = HbarAppUiVariantProps
export type NavbarIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const iconSizeByTier: Readonly<Record<NavbarIconTier, string>> = {
    xs: 'var(--hbar-app-ui-icon-xs)',
    sm: 'var(--hbar-app-ui-icon-sm)',
    md: 'var(--hbar-app-ui-icon-md)',
    lg: 'var(--hbar-app-ui-icon-lg)',
    xl: 'var(--hbar-app-ui-icon-xl)',
}

export function reportNavbarAction(
    onAction: NavbarSurfaceProps['onAction'],
    spec: NavbarSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined ? {variantId: spec.id, actionId} : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function NavbarFrame({spec, onAction, className, children}: NavbarSurfaceProps & {readonly className: string; readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-navbar-surface hbar-app-ui-navbar-variant-${spec.variant} ${className}`}>{children}</ActionSurfaceFrame>
}

export function NavbarButton({children, type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {readonly children: ReactNode}) {
    return <HbarAppUiButton {...props} type={type}>{children}</HbarAppUiButton>
}

export function NavbarGlyph({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: NavbarIconTier}) {
    const size = iconSizeByTier[tier]
    return <Icon aria-hidden="true" style={{inlineSize: size, blockSize: size}}/>
}

export function NavbarIconOnly({icon, tier = 'md', children, label, type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly icon: LucideIcon
    readonly label: string
    readonly tier?: NavbarIconTier
    readonly children?: ReactNode
}) {
    return <HbarAppUiIconButton {...props} type={type} label={label}>{children ?? <NavbarGlyph icon={icon} tier={tier}/>}</HbarAppUiIconButton>
}
