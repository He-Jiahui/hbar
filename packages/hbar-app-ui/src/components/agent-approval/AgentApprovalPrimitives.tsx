import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon, type HbarAppUiIconTier } from '../../icon'
import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, CSSProperties, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiAgentApprovalState} from './AgentApprovalContent'

export type AgentApprovalSurfaceProps = HbarAppUiVariantProps
export type AgentApprovalIconTier = HbarAppUiIconTier



export function reportAgentApprovalAction(
    onAction: AgentApprovalSurfaceProps['onAction'],
    spec: AgentApprovalSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined ? {variantId: spec.id, actionId} : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function AgentApprovalFrame({spec, onAction, className, children}: AgentApprovalSurfaceProps & {
    readonly className: string
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-agent-approval-surface hbar-app-ui-agent-approval-variant-${spec.variant} ${className}`}>{children}</ActionSurfaceFrame>
}

export function AgentApprovalButton({children, className = '', type = 'button', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly children: ReactNode
}) {
    return <LumenButton {...props} className={`hbar-app-ui-agent-approval-button ${className}`}
                   type={type}>{children}</LumenButton>
}

export function AgentApprovalGlyph({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: AgentApprovalIconTier}) { return <HbarAppUiIcon icon={Icon} tier={tier} /> }

export function AgentApprovalStateMark({state}: {readonly state: HbarAppUiAgentApprovalState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-agent-approval-state-mark is-${state}`}/>
}

export function AgentApprovalStatus({state, label}: {readonly state: HbarAppUiAgentApprovalState; readonly label: string}) {
    return <span className={`hbar-app-ui-agent-approval-status is-${state}`}><AgentApprovalStateMark state={state}/><span>{label}</span></span>
}

export function AgentApprovalProgress({value, label}: {readonly value: number; readonly label: string}) {
    const bounded = Math.max(0, Math.min(100, value))
    const style = {inlineSize: `${bounded}%`} satisfies CSSProperties
    return <div aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}
                className="hbar-app-ui-agent-approval-progress" role="progressbar"><span style={style}/></div>
}
