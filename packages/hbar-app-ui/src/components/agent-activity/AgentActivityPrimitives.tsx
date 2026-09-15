import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, CSSProperties, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiAgentActivityState} from './AgentActivityContent'

export type AgentActivitySurfaceProps = HbarAppUiVariantProps
export type AgentActivityIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const iconSizeByTier: Readonly<Record<AgentActivityIconTier, string>> = {
    xs: 'var(--hbar-app-ui-icon-xs)',
    sm: 'var(--hbar-app-ui-icon-sm)',
    md: 'var(--hbar-app-ui-icon-md)',
    lg: 'var(--hbar-app-ui-icon-lg)',
    xl: 'var(--hbar-app-ui-icon-xl)',
}

export function reportAgentActivityAction(
    onAction: AgentActivitySurfaceProps['onAction'],
    spec: AgentActivitySurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined ? {variantId: spec.id, actionId} : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function AgentActivityFrame({spec, onAction, className, children}: AgentActivitySurfaceProps & {
    readonly className: string
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-agent-activity-surface hbar-app-ui-agent-activity-variant-${spec.variant} ${className}`}>{children}</ActionSurfaceFrame>
}

export function AgentActivityButton({children, className = '', type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly children: ReactNode
}) {
    return <button {...props} className={`hbar-app-ui-agent-activity-button ${className}`} type={type}>{children}</button>
}

export function AgentActivityGlyph({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: AgentActivityIconTier}) {
    const size = iconSizeByTier[tier]
    return <Icon aria-hidden="true" style={{inlineSize: size, blockSize: size}}/>
}

export function AgentActivityStatus({state, label}: {readonly state: HbarAppUiAgentActivityState; readonly label: string}) {
    return <span className={`hbar-app-ui-agent-activity-status is-${state}`}><i aria-hidden="true"/><span>{label}</span></span>
}

export function AgentActivityStateMark({state}: {readonly state: HbarAppUiAgentActivityState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-agent-activity-state-mark is-${state}`}/>
}

export function AgentActivityProgress({value, label}: {readonly value: number; readonly label: string}) {
    const bounded = Math.max(0, Math.min(100, value))
    const style = {inlineSize: `${bounded}%`} satisfies CSSProperties
    return <div aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}
                className="hbar-app-ui-agent-activity-progress" role="progressbar"><span style={style}/></div>
}
