import type { HbarAppUiAgentPlanEditableContent } from './AgentPlanContent'
import { AgentPlanFrame, type AgentPlanSurfaceProps } from './AgentPlanPrimitives'
import { HbarAppUiPlanEditor } from './PlanEditor'
export function EditablePlan({ spec, onAction, content }: AgentPlanSurfaceProps & { readonly content: HbarAppUiAgentPlanEditableContent }) {
 return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-editable"><HbarAppUiPlanEditor {...content} /></AgentPlanFrame>
}
