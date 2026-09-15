import {Square} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiAgentActivityLogContent} from './AgentActivityContent'
import {selectHbarAppUiAgentActivityItem, uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityStateMark, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function LogActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityLogContent}) {
    const filters = uniqueHbarAppUiAgentActivityItems(content.filters)
    const entries = uniqueHbarAppUiAgentActivityItems(content.entries)
    const [activeFilterId, setActiveFilterId] = useState(content.activeFilterId)
    const activeFilter = selectHbarAppUiAgentActivityItem(filters, activeFilterId)
    const visibleEntries = activeFilter?.level ? entries.filter((entry) => entry.level === activeFilter.level) : entries

    useEffect(() => setActiveFilterId(content.activeFilterId), [content.activeFilterId])

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-log">
        <header className="hbar-app-ui-agent-activity-heading">
            <h2>{content.labels.title}</h2>
            <span className="hbar-app-ui-agent-activity-line-count">{content.labels.lineCount}</span>
            <nav aria-label={content.labels.filters} className="hbar-app-ui-agent-activity-log-filters" role="tablist">
                {filters.map((filter) => <AgentActivityButton aria-selected={filter.id === activeFilter?.id} className={filter.id === activeFilter?.id ? 'is-selected' : ''}
                                                               key={filter.id} onClick={() => {
                            setActiveFilterId(filter.id)
                            reportAgentActivityAction(onAction, spec, 'filter-log', filter.id)
                        }} role="tab">{filter.label}</AgentActivityButton>)}
            </nav>
            {content.labels.stop && <AgentActivityButton aria-label={content.labels.stop} className="hbar-app-ui-agent-activity-stop" onClick={() => reportAgentActivityAction(onAction, spec, 'stop')}>
                <AgentActivityGlyph icon={Square} tier="sm"/><span>{content.labels.stop}</span>
            </AgentActivityButton>}
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol className="hbar-app-ui-agent-activity-log-list" role="log" aria-live="polite">
                {visibleEntries.map((entry) => <li className={`is-${entry.level}`} key={entry.id}>
                    <time>{entry.time}</time>
                    <AgentActivityStateMark state={entry.level === 'error' ? 'failed' : entry.level === 'warning' ? 'needs-approval' : 'complete'}/>
                    <span>{entry.message}</span>
                </li>)}
            </ol>
        </main>
    </AgentActivityFrame>
}
