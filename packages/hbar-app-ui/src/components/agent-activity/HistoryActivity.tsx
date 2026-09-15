import {RotateCcw} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {HbarAppUiAgentActivityHistoryContent} from './AgentActivityContent'
import {uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityStatus, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function HistoryActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityHistoryContent}) {
    const rows = useMemo(() => uniqueHbarAppUiAgentActivityItems(content.rows), [content.rows])
    const [selectedId, setSelectedId] = useState<string | undefined>(rows[0]?.id)

    useEffect(() => setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id), [content.rows, rows])

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-history">
        <header className="hbar-app-ui-agent-activity-heading hbar-app-ui-agent-activity-history-heading">
            <div><h2>{content.labels.title}</h2><span>{content.labels.count}</span></div>
            <p>{content.labels.description}</p>
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <div className="hbar-app-ui-agent-activity-history-table" role="table" aria-label={content.labels.title}>
                <div className="hbar-app-ui-agent-activity-history-header" role="row">
                    <span>{content.labels.run}</span><span>{content.labels.status}</span><span>{content.labels.duration}</span><span>{content.labels.cost}</span><span>{content.labels.started}</span><span>{content.labels.actions}</span>
                </div>
                <ol>
                    {rows.map((row) => <li className={row.id === selectedId ? 'is-selected' : ''} key={row.id} role="row" onClick={() => setSelectedId(row.id)}>
                        <span className="hbar-app-ui-agent-activity-history-cell hbar-app-ui-agent-activity-history-name"><small>{content.labels.run}</small><strong>{row.name}</strong></span>
                        <span className="hbar-app-ui-agent-activity-history-cell"><small>{content.labels.status}</small><AgentActivityStatus state={row.state} label={row.stateLabel}/></span>
                        <span className="hbar-app-ui-agent-activity-history-cell"><small>{content.labels.duration}</small><span>{row.duration}</span></span>
                        <span className="hbar-app-ui-agent-activity-history-cell"><small>{content.labels.cost}</small><span>{row.cost}</span></span>
                        <span className="hbar-app-ui-agent-activity-history-cell"><small>{content.labels.started}</small><span>{row.started}</span></span>
                        <AgentActivityButton aria-label={`${content.labels.rerun} ${row.name}`} className="hbar-app-ui-agent-activity-history-action" onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(row.id)
                            reportAgentActivityAction(onAction, spec, 'rerun-history', row.id)
                        }}><AgentActivityGlyph icon={RotateCcw} tier="sm"/></AgentActivityButton>
                    </li>)}
                </ol>
            </div>
        </main>
    </AgentActivityFrame>
}
