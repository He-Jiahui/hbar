import type {ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type SupportSurfaceProps = HbarAppUiVariantProps

export function reportSupportAction(
    onAction: SupportSurfaceProps['onAction'],
    spec: SupportSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function SupportFrame({
    spec,
    onAction,
    className,
    children,
}: SupportSurfaceProps & {readonly className: string; readonly children: ReactNode}): React.JSX.Element {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-support-surface ${className}`}>{children}</ActionSurfaceFrame>
}

export function SupportIconButton({
    label,
    children,
    onClick,
}: {
    readonly label: string
    readonly children: ReactNode
    readonly onClick: () => void
}): React.JSX.Element {
    return <button type="button" className="hbar-app-ui-support-icon-button" aria-label={label} title={label} onClick={onClick}>{children}</button>
}

export function SupportChip({children, tone = 'neutral'}: {readonly children: ReactNode; readonly tone?: 'neutral' | 'light' | 'warning'}): React.JSX.Element {
    return <span className={`hbar-app-ui-support-chip hbar-app-ui-support-chip-${tone}`}>{children}</span>
}
