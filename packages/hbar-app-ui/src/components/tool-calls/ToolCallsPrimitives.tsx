import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon, type HbarAppUiIconTier } from '../../icon'
import type {LucideIcon} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import type {HbarAppUiToolCallsState} from './ToolCallsContent'

export type ToolCallsSurfaceProps = HbarAppUiVariantProps
export type ToolCallsIconTier = HbarAppUiIconTier



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
    return <LumenButton {...props} className={`hbar-app-ui-tool-calls-button ${className}`} type={type}>{children}</LumenButton>
}

export function ToolCallsGlyph({icon: Icon, tier = 'md'}: {readonly icon: LucideIcon; readonly tier?: ToolCallsIconTier}) { return <HbarAppUiIcon icon={Icon} tier={tier} /> }

export function ToolCallsStatus({state, label}: {readonly state: HbarAppUiToolCallsState; readonly label: string}) {
    return <span className={`hbar-app-ui-tool-calls-status is-${state}`}><i aria-hidden="true"/><span>{label}</span></span>
}

export function ToolCallsStateMark({state}: {readonly state: HbarAppUiToolCallsState}) {
    return <i aria-hidden="true" className={`hbar-app-ui-tool-calls-state-mark is-${state}`}/>
}

export function ToolCallsToggle({checked, label, onClick}: {
    readonly checked: boolean;
    readonly label: string;
    readonly onClick: () => void
}) {
    return <LumenButton aria-checked={checked} aria-label={label}
                   className={`hbar-app-ui-tool-calls-toggle${checked ? ' is-enabled' : ''}`}
                   onClick={onClick} role="switch" type="button"><i aria-hidden="true"/></LumenButton>
}
