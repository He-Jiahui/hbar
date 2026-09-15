import type {HbarAppUiVariantProps} from '../types'
import {DeploymentActivity} from './agent-activity/DeploymentActivity'
import {
    HbarAppUiAgentActivityProvider,
    useHbarAppUiAgentActivityContent,
    type HbarAppUiAgentActivityContent,
} from './agent-activity/AgentActivityContent'
import {FailureActivity} from './agent-activity/FailureActivity'
import {HistoryActivity} from './agent-activity/HistoryActivity'
import {LiveActivity} from './agent-activity/LiveActivity'
import {LogActivity} from './agent-activity/LogActivity'
import {NestedActivity} from './agent-activity/NestedActivity'
import {AgentActivityFrame} from './agent-activity/AgentActivityPrimitives'
import {WorkersActivity} from './agent-activity/WorkersActivity'
import './agent-activity/AgentActivitySurface.css'

export type HbarAppUiAgentActivityProps = HbarAppUiVariantProps & {
    /** Direct content injection for one surface; catalog hosts normally use the provider. */
    readonly agentActivityContent?: HbarAppUiAgentActivityContent | undefined
}

export {HbarAppUiAgentActivityProvider}
export type {
    HbarAppUiAgentActivityAttempt,
    HbarAppUiAgentActivityContent,
    HbarAppUiAgentActivityDeploymentContent,
    HbarAppUiAgentActivityDeploymentStep,
    HbarAppUiAgentActivityFailureContent,
    HbarAppUiAgentActivityHistoryContent,
    HbarAppUiAgentActivityHistoryRow,
    HbarAppUiAgentActivityInput,
    HbarAppUiAgentActivityListStrategy,
    HbarAppUiAgentActivityLiveContent,
    HbarAppUiAgentActivityLiveStep,
    HbarAppUiAgentActivityLogContent,
    HbarAppUiAgentActivityLogEntry,
    HbarAppUiAgentActivityLogFilter,
    HbarAppUiAgentActivityLogLevel,
    HbarAppUiAgentActivityNestedChild,
    HbarAppUiAgentActivityNestedContent,
    HbarAppUiAgentActivityNestedGroup,
    HbarAppUiAgentActivityOutput,
    HbarAppUiAgentActivityProviderProps,
    HbarAppUiAgentActivityState,
    HbarAppUiAgentActivityWorker,
    HbarAppUiAgentActivityWorkersContent,
} from './agent-activity/AgentActivityContent'
export {selectHbarAppUiAgentActivityItem, uniqueHbarAppUiAgentActivityItems} from './agent-activity/AgentActivityContent'

function emptyAgentActivitySurface({spec, onAction}: HbarAppUiVariantProps) {
    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-empty">{null}</AgentActivityFrame>
}

/** Category dispatcher; every execution-flow pattern owns an independent TSX surface. */
export function AgentActivity({spec, onAction, agentActivityContent}: HbarAppUiAgentActivityProps) {
    const providerContent = useHbarAppUiAgentActivityContent()
    const content = agentActivityContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.live ? <LiveActivity spec={spec} onAction={onAction} content={content.live}/> : emptyAgentActivitySurface({spec, onAction})
        case 2:
            return content?.nested ? <NestedActivity spec={spec} onAction={onAction} content={content.nested}/> : emptyAgentActivitySurface({spec, onAction})
        case 3:
            return content?.deployment ? <DeploymentActivity spec={spec} onAction={onAction} content={content.deployment}/> : emptyAgentActivitySurface({spec, onAction})
        case 4:
            return content?.history ? <HistoryActivity spec={spec} onAction={onAction} content={content.history}/> : emptyAgentActivitySurface({spec, onAction})
        case 5:
            return content?.log ? <LogActivity spec={spec} onAction={onAction} content={content.log}/> : emptyAgentActivitySurface({spec, onAction})
        case 6:
            return content?.workers ? <WorkersActivity spec={spec} onAction={onAction} content={content.workers}/> : emptyAgentActivitySurface({spec, onAction})
        case 7:
            return content?.failure ? <FailureActivity spec={spec} onAction={onAction} content={content.failure}/> : emptyAgentActivitySurface({spec, onAction})
        default:
            return emptyAgentActivitySurface({spec, onAction})
    }
}
