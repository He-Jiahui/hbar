import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon, type HbarAppUiIconTier } from '../../icon'
import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiAgentPlanState} from './AgentPlanContent'

export type AgentPlanSurfaceProps = HbarAppUiVariantProps
export type AgentPlanIconTier = HbarAppUiIconTier



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
    return <LumenButton {...props} className={`hbar-app-ui-agent-plan-button ${className}`} type={type}>{children}</LumenButton>
}

export function AgentPlanIcon({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: AgentPlanIconTier}) { return <HbarAppUiIcon icon={Icon} tier={tier} /> }

export function AgentPlanStateMark({state}: {readonly state: HbarAppUiAgentPlanState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-agent-plan-state-mark is-${state}`}/>
}

export function AgentPlanStatus({state, label}: {readonly state: HbarAppUiAgentPlanState; readonly label: string}) {
    return <span className={`hbar-app-ui-agent-plan-status is-${state}`}><AgentPlanStateMark state={state}/><span>{label}</span></span>
}

export function AgentPlanNumber({value}: {readonly value: number}) {
    return <span aria-hidden="true" className="hbar-app-ui-agent-plan-number">{value}</span>
}
