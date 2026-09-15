import type {HbarAppUiVariantProps} from '../types'
import {ChecklistPlan} from './agent-plan/ChecklistPlan'
import {EditablePlan} from './agent-plan/EditablePlan'
import {PlanActual} from './agent-plan/PlanActual'
import {PlanBoard} from './agent-plan/PlanBoard'
import {PlanSummary} from './agent-plan/PlanSummary'
import {PlanTree} from './agent-plan/PlanTree'
import {
    HbarAppUiAgentPlanProvider,
    useHbarAppUiAgentPlanContent,
    type HbarAppUiAgentPlanContent,
} from './agent-plan/AgentPlanContent'
import {AgentPlanFrame} from './agent-plan/AgentPlanPrimitives'
import './agent-plan/AgentPlanSurface.css'

export type HbarAppUiAgentPlanProps = HbarAppUiVariantProps & {
    /** Direct content injection for one surface; catalog hosts normally use the provider. */
    readonly agentPlanContent?: HbarAppUiAgentPlanContent | undefined
}

export {HbarAppUiAgentPlanProvider}
export type {
    HbarAppUiAgentPlanActualContent,
    HbarAppUiAgentPlanActualMetric,
    HbarAppUiAgentPlanActualRow,
    HbarAppUiAgentPlanBoardContent,
    HbarAppUiAgentPlanBoardSection,
    HbarAppUiAgentPlanBreakdownRow,
    HbarAppUiAgentPlanChecklistContent,
    HbarAppUiAgentPlanContent,
    HbarAppUiAgentPlanEditableContent,
    HbarAppUiAgentPlanGroup,
    HbarAppUiAgentPlanListStrategy,
    HbarAppUiAgentPlanProviderProps,
    HbarAppUiAgentPlanState,
    HbarAppUiAgentPlanStep,
    HbarAppUiAgentPlanSummaryContent,
    HbarAppUiAgentPlanSummaryMetric,
    HbarAppUiAgentPlanTreeContent,
} from './agent-plan/AgentPlanContent'
export {selectHbarAppUiAgentPlanItem, uniqueHbarAppUiAgentPlanItems} from './agent-plan/AgentPlanContent'

function emptyAgentPlanSurface({spec, onAction}: HbarAppUiVariantProps) {
    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-empty-surface">{null}</AgentPlanFrame>
}

/** Category dispatcher; every planning pattern owns an independent TSX surface. */
export function AgentPlan({spec, onAction, agentPlanContent}: HbarAppUiAgentPlanProps) {
    const providerContent = useHbarAppUiAgentPlanContent()
    const content = agentPlanContent ?? providerContent

    switch (spec.variant) {
        case 1:
            return content?.checklist ? <ChecklistPlan spec={spec} onAction={onAction} content={content.checklist}/> : emptyAgentPlanSurface({spec, onAction})
        case 2:
            return content?.editable ? <EditablePlan spec={spec} onAction={onAction} content={content.editable}/> : emptyAgentPlanSurface({spec, onAction})
        case 3:
            return content?.tree ? <PlanTree spec={spec} onAction={onAction} content={content.tree}/> : emptyAgentPlanSurface({spec, onAction})
        case 4:
            return content?.actual ? <PlanActual spec={spec} onAction={onAction} content={content.actual}/> : emptyAgentPlanSurface({spec, onAction})
        case 5:
            return content?.board ? <PlanBoard spec={spec} onAction={onAction} content={content.board}/> : emptyAgentPlanSurface({spec, onAction})
        case 6:
            return content?.summary ? <PlanSummary spec={spec} onAction={onAction} content={content.summary}/> : emptyAgentPlanSurface({spec, onAction})
        default:
            return emptyAgentPlanSurface({spec, onAction})
    }
}
