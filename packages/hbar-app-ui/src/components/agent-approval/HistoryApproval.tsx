import {Download, Search} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {HbarAppUiAgentApprovalHistoryContent} from './AgentApprovalContent'
import {selectHbarAppUiAgentApprovalItem, uniqueHbarAppUiAgentApprovalItems} from './AgentApprovalContent'
import {AgentApprovalButton, AgentApprovalFrame, AgentApprovalGlyph, AgentApprovalStateMark, reportAgentApprovalAction, type AgentApprovalSurfaceProps} from './AgentApprovalPrimitives'

export function HistoryApproval({spec, onAction, content}: AgentApprovalSurfaceProps & {readonly content: HbarAppUiAgentApprovalHistoryContent}) {
    const filters = useMemo(() => uniqueHbarAppUiAgentApprovalItems(content.filters), [content.filters])
    const entries = useMemo(() => uniqueHbarAppUiAgentApprovalItems(content.entries), [content.entries])
    const [activeFilterId, setActiveFilterId] = useState(content.activeFilterId)
    const [query, setQuery] = useState('')
    const activeFilter = selectHbarAppUiAgentApprovalItem(filters, activeFilterId)
    const visibleEntries = entries.filter((entry) => {
        const matchesFilter = activeFilter ? entry.filterIds.includes(activeFilter.id) : true
        const normalizedQuery = query.trim().toLocaleLowerCase()
        return matchesFilter && (!normalizedQuery || `${entry.title} ${entry.detail}`.toLocaleLowerCase().includes(normalizedQuery))
    })

    useEffect(() => setActiveFilterId(content.activeFilterId), [content.activeFilterId])

    return <AgentApprovalFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-approval-history">
        <header className="hbar-app-ui-agent-approval-global-heading"><h2>{content.labels.title}</h2><AgentApprovalButton onClick={() => reportAgentApprovalAction(onAction, spec, 'export-approval-history')}><AgentApprovalGlyph icon={Download} tier="sm"/><span>{content.labels.export}</span></AgentApprovalButton></header>
        <div className="hbar-app-ui-agent-approval-history-toolbar">
            <label className="hbar-app-ui-agent-approval-search"><AgentApprovalGlyph icon={Search} tier="sm"/><input aria-label={content.labels.searchLabel} placeholder={content.searchPlaceholder} value={query} onChange={(event) => setQuery(event.target.value)}/></label>
            <nav aria-label={content.labels.filtersLabel} role="tablist">
                {filters.map((filter) => <AgentApprovalButton aria-selected={filter.id === activeFilter?.id} className={filter.id === activeFilter?.id ? 'is-selected' : ''} key={filter.id} onClick={() => {
                    setActiveFilterId(filter.id)
                    reportAgentApprovalAction(onAction, spec, 'filter-approval-history', filter.id)
                }} role="tab">{filter.label}</AgentApprovalButton>)}
            </nav>
        </div>
        <main className="hbar-app-ui-agent-approval-history-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ul>
                {visibleEntries.map((entry) => <li key={entry.id}>
                    <AgentApprovalStateMark state={entry.state}/><span className="hbar-app-ui-agent-approval-history-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span>
                    <span className={`hbar-app-ui-agent-approval-history-state is-${entry.state}`}>{entry.stateLabel}</span><time>{entry.when}</time>
                </li>)}
            </ul>
        </main>
    </AgentApprovalFrame>
}
