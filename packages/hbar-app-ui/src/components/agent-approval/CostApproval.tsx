import {useState} from 'react'
import type {HbarAppUiAgentApprovalCostContent} from './AgentApprovalContent'
import {uniqueHbarAppUiAgentApprovalItems} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalProgress, AgentApprovalStateMark, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

export function CostApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalCostContent}) {
    const metrics = uniqueHbarAppUiAgentApprovalItems(content.metrics)
    const [approved, setApproved] = useState(false)

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-cost">
        <main className="hbar-app-ui-agent-approval-centered-body">
            <section className="hbar-app-ui-agent-approval-card">
                <section className="hbar-app-ui-agent-approval-cost-summary">
                    <header className="hbar-app-ui-agent-approval-cost-heading"><span><AgentApprovalStateMark state="needs-approval"/>{content.labels.badge}</span><span>{content.labels.agent}</span></header>
                    <div className="hbar-app-ui-agent-approval-card-content">
                        <h2>{content.labels.title}</h2>
                        {content.description && <p>{content.description}</p>}
                    </div>
                </section>
                <section className="hbar-app-ui-agent-approval-cost-details">
                    <dl className="hbar-app-ui-agent-approval-cost-metrics">
                        {metrics.map((metric) => <div key={metric.id}><dt>{metric.label}</dt><dd><strong>{metric.value}</strong><span>{metric.detail}</span></dd></div>)}
                    </dl>
                    <div className="hbar-app-ui-agent-approval-projected"><div><span>{content.labels.projected}</span><span>{content.projectedValue}</span></div><AgentApprovalProgress label={content.progressLabel} value={content.progress}/></div>
                </section>
                <footer className="hbar-app-ui-agent-approval-action-row">
                    <AgentApprovalButton onClick={() => reportAgentApprovalAction(onAction, spec, 'toggle-cost-request')}><span>{content.labels.showRequest}</span></AgentApprovalButton>
                    <div><AgentApprovalButton disabled={approved} onClick={() => reportAgentApprovalAction(onAction, spec, 'reject-cost')}><span>{content.labels.reject}</span></AgentApprovalButton><AgentApprovalButton disabled={approved} onClick={() => {
                        setApproved(true)
                        reportAgentApprovalAction(onAction, spec, 'approve-cost')
                    }}><span>{content.labels.approve}</span></AgentApprovalButton></div>
                </footer>
            </section>
        </main>
    </AgentApprovalFrame>
}
