import {ChevronRight, Square} from 'lucide-react'
import {useState} from 'react'
import type {HbarAppUiAgentApprovalInlineContent} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalGlyph, AgentApprovalStateMark, AgentApprovalStatus, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

export function InlineApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalInlineContent}) {
    const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
    const [requestOpen, setRequestOpen] = useState(true)

    const decide = (value: 'approved' | 'rejected') => {
        setDecision(value)
        reportAgentApprovalAction(onAction, spec, 'decide-inline-approval', value)
    }

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-inline">
        <main className="hbar-app-ui-agent-approval-inline-body">
            <p className="hbar-app-ui-agent-approval-day">{content.labels.day}</p>
            <p className="hbar-app-ui-agent-approval-user-message">{content.userMessage}</p>
            <p className="hbar-app-ui-agent-approval-detail-message">{content.detailMessage}</p>
            <div className="hbar-app-ui-agent-approval-tool-row">
                <AgentApprovalStateMark state="complete"/><code>{content.toolName}</code><time>{content.toolDuration}</time>
            </div>
            <section className="hbar-app-ui-agent-approval-request-card">
                <div className="hbar-app-ui-agent-approval-request-summary">
                    <AgentApprovalStatus state="needs-approval" label={content.requestStatusLabel}/>
                    <h2>{content.requestTitle}</h2>
                    <p>{content.requestDescription}</p>
                </div>
                <footer className="hbar-app-ui-agent-approval-action-row">
                    <AgentApprovalButton aria-expanded={requestOpen} onClick={() => {
                        setRequestOpen((current) => !current)
                        reportAgentApprovalAction(onAction, spec, 'toggle-inline-request')
                    }}><AgentApprovalGlyph icon={ChevronRight} tier="sm"/><span>{content.labels.showRequest}</span></AgentApprovalButton>
                    <div>
                        <AgentApprovalButton disabled={decision !== 'pending'} onClick={() => decide('rejected')}><span>{content.labels.reject}</span></AgentApprovalButton>
                        <AgentApprovalButton disabled={decision !== 'pending'} onClick={() => decide('approved')}><AgentApprovalGlyph icon={Square} tier="sm"/><span>{content.labels.approve}</span></AgentApprovalButton>
                    </div>
                </footer>
            </section>
        </main>
    </AgentApprovalFrame>
}
