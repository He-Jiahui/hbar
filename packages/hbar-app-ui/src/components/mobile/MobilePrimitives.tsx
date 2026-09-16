import { HbarAppUiIcon } from '../../icon'
import type {ReactNode} from 'react'
import type {LucideIcon} from 'lucide-react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type MobileSurfaceProps = HbarAppUiVariantProps

export type MobileTab = {
    readonly id: string
    readonly label: string
    readonly icon: LucideIcon
    readonly badge?: string
}

export function reportMobileAction(
    onAction: MobileSurfaceProps['onAction'],
    spec: MobileSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function MobileFrame({
    spec,
    onAction,
    className,
    children,
}: MobileSurfaceProps & {readonly className: string; readonly children: ReactNode}): React.JSX.Element {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-mobile-surface ${className}`}>{children}</ActionSurfaceFrame>
}

export function MobilePhone({children, className = ''}: {readonly children: ReactNode; readonly className?: string}): React.JSX.Element {
    return <section className={`hbar-app-ui-mobile-phone${className ? ` ${className}` : ''}`}>{children}</section>
}

export function MobileAvatar({children}: {readonly children: ReactNode}): React.JSX.Element {
    return <span className="hbar-app-ui-mobile-avatar" aria-hidden="true">{children}</span>
}

export function MobileIconButton({
    label,
    children,
    onClick,
    pressed,
}: {
    readonly label: string
    readonly children: ReactNode
    readonly onClick: () => void
    readonly pressed?: boolean
}): React.JSX.Element {
    return <button type="button" className="hbar-app-ui-mobile-icon-button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>{children}</button>
}

export function MobileBottomTabs({
    tabs,
    value,
    onChange,
    label,
}: {
    readonly tabs: readonly MobileTab[]
    readonly value: string
    readonly onChange: (value: string) => void
    readonly label: string
}): React.JSX.Element {
    return <nav className="hbar-app-ui-mobile-bottom-tabs" role="tablist" aria-label={label}>{tabs.map(({id, label: tabLabel, icon: Icon, badge}) => <button
        type="button"
        role="tab"
        aria-selected={value === id}
        className={value === id ? 'is-selected' : ''}
        key={id}
        onClick={() => onChange(id)}
    >
        <span className="hbar-app-ui-mobile-tab-icon"><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.8} aria-hidden="true"/>{badge && <small>{badge}</small>}</span>
        <span>{tabLabel}</span>
    </button>)}</nav>
}
