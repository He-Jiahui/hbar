import {ChevronRight} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiAgentApprovalQueueContent, HbarAppUiAgentApprovalQueueItem} from './AgentApprovalContent'
import {uniqueHbarAppUiAgentApprovalItems} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalGlyph, AgentApprovalStateMark, AgentApprovalStatus, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

function QueueCompactRow({item}: {readonly item: HbarAppUiAgentApprovalQueueItem}) {
    return <li className="hbar-app-ui-agent-approval-queue-compact-row">
        <AgentApprovalStateMark state={item.state}/><strong>{item.title}</strong><span className={`hbar-app-ui-agent-approval-queue-state is-${item.state}`}>{item.stateLabel}</span><time>{item.when}</time>
    </li>
}

export function QueueApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalQueueContent}) {
    const pending = useMemo(() => uniqueHbarAppUiAgentApprovalItems(content.pending), [content.pending])
    const history = useMemo(() => uniqueHbarAppUiAgentApprovalItems(content.history), [content.history])
    const firstPending = pending[0]
    const [open, setOpen] = useState(firstPending?.id)
    const [decision, setDecision] = useState<string | undefined>()

    const decide = (itemId: string, value: 'approve' | 'reject') => {
        setDecision(itemId)
        reportAgentApprovalAction(onAction, spec, value === 'approve' ? 'approve-queue-item' : 'reject-queue-item', itemId)
    }

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-queue">
        <header className="hbar-app-ui-agent-approval-global-heading"><h2>{content.labels.title}</h2><span><AgentApprovalStateMark state="needs-approval"/>{content.labels.waiting}</span></header>
        <main className="hbar-app-ui-agent-approval-queue-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ul>
                {firstPending && <li className="hbar-app-ui-agent-approval-queue-featured">
                    <section className="hbar-app-ui-agent-approval-card-content">
                        <AgentApprovalStatus state={firstPending.state} label={firstPending.stateLabel}/>
                        <h2>{firstPending.title}</h2>
                        <p>{firstPending.detail}</p>
                    </section>
                    <footer className="hbar-app-ui-agent-approval-action-row">
                        <AgentApprovalButton aria-expanded={open === firstPending.id} onClick={() => {
                            setOpen((current) => current === firstPending.id ? undefined : firstPending.id)
                            reportAgentApprovalAction(onAction, spec, 'toggle-queue-request', firstPending.id)
                        }}><AgentApprovalGlyph icon={ChevronRight} tier="sm"/><span>{content.labels.showRequest}</span></AgentApprovalButton>
                        <div>
                            <AgentApprovalButton disabled={decision === firstPending.id} onClick={() => decide(firstPending.id, 'reject')}><span>{content.labels.reject}</span></AgentApprovalButton>
                            <AgentApprovalButton disabled={decision === firstPending.id} onClick={() => decide(firstPending.id, 'approve')}><span>{content.labels.approve}</span></AgentApprovalButton>
                        </div>
                    </footer>
                </li>}
                {pending.slice(1).map((item) => <QueueCompactRow item={item} key={item.id}/>)}
                {history.map((item) => <QueueCompactRow item={item} key={item.id}/>)}
            </ul>
        </main>
    </AgentApprovalFrame>
}
