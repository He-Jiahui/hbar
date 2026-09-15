import {Edit3, Play} from 'lucide-react'
import {useMemo} from 'react'
import type {HbarAppUiAgentPlanSummaryContent} from './AgentPlanContent'
import {uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanButton, AgentPlanFrame, AgentPlanIcon, AgentPlanNumber, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

export function PlanSummary({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanSummaryContent}) {
    const metrics = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.metrics), [content.metrics])
    const breakdown = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.breakdown), [content.breakdown])
    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-summary">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <span>{content.labels.stepCount}</span>
        </header>
        <main className="hbar-app-ui-agent-plan-summary-body" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <section className="hbar-app-ui-agent-plan-summary-section">
                <h3>{content.labels.goal}</h3>
                <div className="hbar-app-ui-agent-plan-summary-copy"><p>{content.goal}</p></div>
            </section>
            <dl className="hbar-app-ui-agent-plan-metrics">
                {metrics.map((metric) => <div key={metric.id}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
            </dl>
            <section className="hbar-app-ui-agent-plan-summary-section">
                <h3>{content.labels.tools}</h3>
                <div className="hbar-app-ui-agent-plan-chip-list"><ul>{content.tools.map((tool) => <li key={tool}>{tool}</li>)}</ul></div>
            </section>
            <section className="hbar-app-ui-agent-plan-summary-section">
                <h3>{content.labels.breakdown}</h3>
                {breakdown.length ? <ul className="hbar-app-ui-agent-plan-breakdown-list">{breakdown.map((row, index) => <li key={row.id}>
                    <AgentPlanNumber value={index + 1}/><span>{row.title}</span><span>{row.countLabel}</span><span>{row.duration}</span>
                </li>)}</ul> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
            </section>
            <p className="hbar-app-ui-agent-plan-summary-review">{content.labels.review}</p>
        </main>
        <footer className="hbar-app-ui-agent-plan-summary-footer">
            <AgentPlanButton onClick={() => reportSummaryAction(onAction, spec, 'edit-plan')}><AgentPlanIcon icon={Edit3} tier="sm"/><span>{content.labels.edit}</span></AgentPlanButton>
            <AgentPlanButton className="is-primary" onClick={() => reportSummaryAction(onAction, spec, 'run-plan')}><AgentPlanIcon icon={Play} tier="sm"/><span>{content.labels.run}</span></AgentPlanButton>
        </footer>
    </AgentPlanFrame>
}

function reportSummaryAction(onAction: AgentPlanSurfaceProps['onAction'], spec: AgentPlanSurfaceProps['spec'], actionId: string): void {
    onAction?.({variantId: spec.id, actionId})
}
