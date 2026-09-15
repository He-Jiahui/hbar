import {ChevronRight} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {HbarAppUiAgentApprovalPermissionContent} from './AgentApprovalContent'
import {uniqueHbarAppUiAgentApprovalItems} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalGlyph, AgentApprovalStatus, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

export function PermissionApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalPermissionContent}) {
    const scopes = useMemo(() => uniqueHbarAppUiAgentApprovalItems(content.scopes), [content.scopes])
    const [checked, setChecked] = useState<readonly string[]>(scopes.filter((scope) => scope.checked).map((scope) => scope.id))
    const [requestOpen, setRequestOpen] = useState(true)

    useEffect(() => setChecked(scopes.filter((scope) => scope.checked).map((scope) => scope.id)), [content.scopes, scopes])

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-permission">
        <header className="hbar-app-ui-agent-approval-global-heading"><h2>{content.labels.title}</h2><span>{content.labels.agent}</span></header>
        <main className="hbar-app-ui-agent-approval-centered-body">
            <section className="hbar-app-ui-agent-approval-card">
                <div className="hbar-app-ui-agent-approval-card-content">
                    <AgentApprovalStatus state="needs-approval" label={content.labels.status}/>
                    <h2>{content.requestTitle}</h2>
                    <p>{content.description}</p>
                </div>
                {requestOpen && <div aria-label={content.labels.scopes} className="hbar-app-ui-agent-approval-scope-list" role="group"><p className="hbar-app-ui-agent-approval-scope-heading">{content.labels.scopes}</p>
                    {scopes.map((scope) => <label key={scope.id} htmlFor={`hbar-app-ui-approval-scope-${scope.id}`}>
                        <input checked={checked.includes(scope.id)} id={`hbar-app-ui-approval-scope-${scope.id}`} onChange={() => {
                            setChecked((current) => current.includes(scope.id) ? current.filter((id) => id !== scope.id) : [...current, scope.id])
                            reportAgentApprovalAction(onAction, spec, 'toggle-permission-scope', scope.id)
                        }} type="checkbox"/>
                        <span><strong>{scope.title}</strong><small>{scope.description}</small></span>
                    </label>)}
                </div>}
                <footer className="hbar-app-ui-agent-approval-action-row">
                    <AgentApprovalButton aria-expanded={requestOpen} onClick={() => {
                        setRequestOpen((current) => !current)
                        reportAgentApprovalAction(onAction, spec, 'toggle-permission-request')
                    }}><AgentApprovalGlyph icon={ChevronRight} tier="sm"/><span>{content.labels.showRequest}</span></AgentApprovalButton>
                    <span className="hbar-app-ui-agent-approval-expiry"><span>{content.labels.expires}</span><span aria-hidden="true">{content.labels.separator}</span><strong>{content.expiry}</strong></span>
                    <div><AgentApprovalButton onClick={() => reportAgentApprovalAction(onAction, spec, 'reject-permission')}><span>{content.labels.reject}</span></AgentApprovalButton><AgentApprovalButton onClick={() => reportAgentApprovalAction(onAction, spec, 'approve-permission')}><span>{content.labels.approve}</span></AgentApprovalButton></div>
                </footer>
            </section>
        </main>
    </AgentApprovalFrame>
}
