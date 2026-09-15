import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiToolCallsState} from './ToolCallsContent'

export type ToolCallsSurfaceProps = HbarAppUiVariantProps
export type ToolCallsIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const iconSizeByTier: Readonly<Record<ToolCallsIconTier, string>> = {
    xs: 'var(--hbar-app-ui-icon-xs)',
    sm: 'var(--hbar-app-ui-icon-sm)',
    md: 'var(--hbar-app-ui-icon-md)',
    lg: 'var(--hbar-app-ui-icon-lg)',
    xl: 'var(--hbar-app-ui-icon-xl)',
}

export function reportToolCallsAction(
    onAction: ToolCallsSurfaceProps['onAction'],
    spec: ToolCallsSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined ? {variantId: spec.id, actionId} : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function ToolCallsFrame({spec, onAction, className, children}: ToolCallsSurfaceProps & {
    readonly className: string
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-tool-calls-surface hbar-app-ui-tool-calls-variant-${spec.variant} ${className}`}>{children}</ActionSurfaceFrame>
}

export function ToolCallsButton({children, className = '', type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly children: ReactNode
}) {
    return <button {...props} className={`hbar-app-ui-tool-calls-button ${className}`} type={type}>{children}</button>
}

export function ToolCallsGlyph({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: ToolCallsIconTier}) {
    const size = iconSizeByTier[tier]
    return <Icon aria-hidden="true" style={{inlineSize: size, blockSize: size}}/>
}

export function ToolCallsStatus({state, label}: {readonly state: HbarAppUiToolCallsState; readonly label: string}) {
    return <span className={`hbar-app-ui-tool-calls-status is-${state}`}><i aria-hidden="true"/><span>{label}</span></span>
}

export function ToolCallsStateMark({state}: {readonly state: HbarAppUiToolCallsState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-tool-calls-state-mark is-${state}`}/>
}

export function ToolCallsToggle({checked, label, onClick}: {readonly checked: boolean; readonly label: string; readonly onClick: () => void}) {
    return <button aria-checked={checked} aria-label={label} className={`hbar-app-ui-tool-calls-toggle${checked ? ' is-enabled' : ''}`}
                   onClick={onClick} role="switch" type="button"><i aria-hidden="true"/></button>
}
