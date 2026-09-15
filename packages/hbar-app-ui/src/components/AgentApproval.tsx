import type {HbarAppUiVariantProps} from '../types'
import {
    HbarAppUiAgentApprovalProvider,
    useHbarAppUiAgentApprovalContent,
    type HbarAppUiAgentApprovalContent,
} from './agent-approval/AgentApprovalContent'
import {AgentApprovalFrame} from './agent-approval/AgentApprovalPrimitives'
import {CostApproval} from './agent-approval/CostApproval'
import {DiffApproval} from './agent-approval/DiffApproval'
import {HistoryApproval} from './agent-approval/HistoryApproval'
import {InlineApproval} from './agent-approval/InlineApproval'
import {PermissionApproval} from './agent-approval/PermissionApproval'
import {QueueApproval} from './agent-approval/QueueApproval'
import './agent-approval/AgentApprovalSurface.css'

export type HbarAppUiAgentApprovalProps = HbarAppUiVariantProps & {
    /** Direct content injection for one surface; catalog hosts normally use the provider. */
    readonly agentApprovalContent?: HbarAppUiAgentApprovalContent | undefined
}

export {HbarAppUiAgentApprovalProvider}
export type {
    HbarAppUiAgentApprovalChange,
    HbarAppUiAgentApprovalContent,
    HbarAppUiAgentApprovalCostContent,
    HbarAppUiAgentApprovalCostMetric,
    HbarAppUiAgentApprovalDiffContent,
    HbarAppUiAgentApprovalHistoryContent,
    HbarAppUiAgentApprovalHistoryEntry,
    HbarAppUiAgentApprovalHistoryFilter,
    HbarAppUiAgentApprovalInlineContent,
    HbarAppUiAgentApprovalListStrategy,
    HbarAppUiAgentApprovalPermissionContent,
    HbarAppUiAgentApprovalProviderProps,
    HbarAppUiAgentApprovalQueueContent,
    HbarAppUiAgentApprovalQueueItem,
    HbarAppUiAgentApprovalScope,
    HbarAppUiAgentApprovalState,
} from './agent-approval/AgentApprovalContent'
export {selectHbarAppUiAgentApprovalItem, uniqueHbarAppUiAgentApprovalItems} from './agent-approval/AgentApprovalContent'

function emptyAgentApprovalSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-empty">{null}</AgentApprovalFrame>
}

/** Category dispatcher; every approval pattern owns an independent TSX surface. */
export function AgentApproval({spec, onAction, agentApprovalContent}: HbarAppUiAgentApprovalProps) {
    const providerContent = useHbarAppUiAgentApprovalContent()
    const content = agentApprovalContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.inline ? <InlineApproval spec={spec} onAction={onAction} content={content.inline}/> : emptyAgentApprovalSurface({spec, onAction})
        case 2:
            return content?.diff ? <DiffApproval spec={spec} onAction={onAction} content={content.diff}/> : emptyAgentApprovalSurface({spec, onAction})
        case 3:
            return content?.queue ? <QueueApproval spec={spec} onAction={onAction} content={content.queue}/> : emptyAgentApprovalSurface({spec, onAction})
        case 4:
            return content?.permission ? <PermissionApproval spec={spec} onAction={onAction} content={content.permission}/> : emptyAgentApprovalSurface({spec, onAction})
        case 5:
            return content?.cost ? <CostApproval spec={spec} onAction={onAction} content={content.cost}/> : emptyAgentApprovalSurface({spec, onAction})
        case 6:
            return content?.history ? <HistoryApproval spec={spec} onAction={onAction} content={content.history}/> : emptyAgentApprovalSurface({spec, onAction})
        default:
            return emptyAgentApprovalSurface({spec, onAction})
    }
}
