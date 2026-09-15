import {useMemo} from 'react'
import type {HbarAppUiAgentPlanActualContent} from './AgentPlanContent'
import {uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanFrame, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

export function PlanActual({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanActualContent}) {
    const metrics = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.metrics), [content.metrics])
    const rows = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.rows), [content.rows])

    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-actual">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <span>{content.labels.remaining}</span>
        </header>
        <dl className="hbar-app-ui-agent-plan-metrics">
            {metrics.map((metric) => <div className={`is-${metric.tone ?? 'neutral'}`} key={metric.id}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
        </dl>
        <main className="hbar-app-ui-agent-plan-actual-pane" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <div className="hbar-app-ui-agent-plan-inset-card hbar-app-ui-agent-plan-table-card">
                <table>
                    <caption>{content.labels.description}</caption>
                    <thead><tr><th scope="col">{content.labels.step}</th><th scope="col">{content.labels.duration}</th><th scope="col">{content.labels.planned}</th><th scope="col">{content.labels.actual}</th><th scope="col">{content.labels.drift}</th></tr></thead>
                    <tbody>{rows.length ? rows.map((row) => <tr className={`is-${row.tone ?? 'neutral'}`} key={row.id}>
                        <th scope="row">{row.title}</th><td className="hbar-app-ui-agent-plan-duration-cell"><progress aria-label={content.labels.duration} max={1} value={Math.max(0, Math.min(1, row.durationProgress ?? 0))}/></td><td>{row.planned}</td><td>{row.actual}</td><td>{row.drift}</td>
                    </tr>) : <tr><td colSpan={5}>{content.labels.empty}</td></tr>}</tbody>
                </table>
            </div>
        </main>
    </AgentPlanFrame>
}
