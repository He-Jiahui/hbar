import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiAgentPlanState} from './AgentPlanContent'

export type AgentPlanSurfaceProps = HbarAppUiVariantProps
export type AgentPlanIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const iconSizeByTier: Readonly<Record<AgentPlanIconTier, string>> = {
    xs: 'var(--hbar-app-ui-icon-xs)',
    sm: 'var(--hbar-app-ui-icon-sm)',
    md: 'var(--hbar-app-ui-icon-md)',
    lg: 'var(--hbar-app-ui-icon-lg)',
    xl: 'var(--hbar-app-ui-icon-xl)',
}

export function reportAgentPlanAction(
    onAction: AgentPlanSurfaceProps['onAction'],
    spec: AgentPlanSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined ? {variantId: spec.id, actionId} : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function AgentPlanFrame({spec, onAction, className, children}: AgentPlanSurfaceProps & {
    readonly className: string
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-agent-plan-surface hbar-app-ui-agent-plan-variant-${spec.variant} ${className}`}>{children}</ActionSurfaceFrame>
}

export function AgentPlanButton({children, className = '', type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly children: ReactNode
}) {
    return <button {...props} className={`hbar-app-ui-agent-plan-button ${className}`} type={type}>{children}</button>
}

export function AgentPlanIcon({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: AgentPlanIconTier}) {
    const size = iconSizeByTier[tier]
    return <Icon aria-hidden="true" style={{inlineSize: size, blockSize: size}}/>
}

export function AgentPlanStateMark({state}: {readonly state: HbarAppUiAgentPlanState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-agent-plan-state-mark is-${state}`}/>
}

export function AgentPlanStatus({state, label}: {readonly state: HbarAppUiAgentPlanState; readonly label: string}) {
    return <span className={`hbar-app-ui-agent-plan-status is-${state}`}><AgentPlanStateMark state={state}/><span>{label}</span></span>
}

export function AgentPlanNumber({value}: {readonly value: number}) {
    return <span aria-hidden="true" className="hbar-app-ui-agent-plan-number">{value}</span>
}
