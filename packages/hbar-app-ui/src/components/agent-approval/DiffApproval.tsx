import {ChevronRight} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiAgentApprovalDiffContent} from './AgentApprovalContent'
import {uniqueHbarAppUiAgentApprovalItems} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalGlyph, AgentApprovalStatus, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

export function DiffApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalDiffContent}) {
    const changes = uniqueHbarAppUiAgentApprovalItems(content.changes)
    const [diffOpen, setDiffOpen] = useState(true)
    const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')

    const decide = (value: 'approved' | 'rejected' | 'always-allow') => {
        setDecision(value === 'always-allow' ? 'approved' : value)
        reportAgentApprovalAction(onAction, spec, 'decide-diff-approval', value)
    }

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-diff">
        <header className="hbar-app-ui-agent-approval-global-heading"><h2>{content.labels.headerTitle}</h2><span>{content.labels.agent}</span></header>
        <main className="hbar-app-ui-agent-approval-centered-body">
            <section className="hbar-app-ui-agent-approval-card">
                <div className="hbar-app-ui-agent-approval-card-content">
                    <AgentApprovalStatus state={decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'needs-approval'} label={content.labels.status}/>
                    <h2>{content.title}</h2>
                    <p>{content.description}</p>
                    {diffOpen && <dl className="hbar-app-ui-agent-approval-change-list">
                        {changes.map((change) => <div key={change.id}><dt>{change.label}</dt><dd><s>{change.previousValue}</s><span aria-hidden="true">{content.labels.changeSeparator}</span><strong>{change.nextValue}</strong></dd></div>)}
                    </dl>}
                </div>
                <footer className="hbar-app-ui-agent-approval-action-row">
                    <AgentApprovalButton aria-expanded={diffOpen} onClick={() => {
                        setDiffOpen((current) => !current)
                        reportAgentApprovalAction(onAction, spec, 'toggle-diff-details')
                    }}><AgentApprovalGlyph icon={ChevronRight} tier="sm"/><span>{content.labels.showDiff}</span></AgentApprovalButton>
                    <div>
                        <AgentApprovalButton disabled={decision !== 'pending'} onClick={() => decide('rejected')}><span>{content.labels.reject}</span></AgentApprovalButton>
                        <AgentApprovalButton disabled={decision !== 'pending'} onClick={() => decide('always-allow')}><span>{content.labels.alwaysAllow}</span></AgentApprovalButton>
                        <AgentApprovalButton disabled={decision !== 'pending'} onClick={() => decide('approved')}><span>{content.labels.approve}</span></AgentApprovalButton>
                    </div>
                </footer>
            </section>
        </main>
    </AgentApprovalFrame>
}
