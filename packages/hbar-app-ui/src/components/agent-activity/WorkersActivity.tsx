import type {HbarAppUiAgentActivityWorkersContent} from './AgentActivityContent'
import {uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityFrame, AgentActivityProgress, AgentActivityStateMark, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function WorkersActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityWorkersContent}) {
    const workers = uniqueHbarAppUiAgentActivityItems(content.workers)

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-workers">
        <header className="hbar-app-ui-agent-activity-heading">
            <h2>{content.labels.title}</h2>
            <div className="hbar-app-ui-agent-activity-worker-summary"><span>{content.labels.activeSummary}</span><span>{content.labels.queuedSummary}</span></div>
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ul className="hbar-app-ui-agent-activity-worker-list">
                {workers.map((worker) => <li key={worker.id}>
                    <div className="hbar-app-ui-agent-activity-worker-heading">
                        <AgentActivityStateMark state={worker.state}/><strong>{worker.name}</strong><span>{worker.rate}</span>
                    </div>
                    <div className="hbar-app-ui-agent-activity-worker-detail"><span>{worker.task}</span><span>{worker.stateLabel}</span></div>
                    {worker.progress > 0 && (
                        <AgentActivityProgress label={worker.progressLabel} value={worker.progress}/>
                    )}
                </li>)}
            </ul>
        </main>
    </AgentActivityFrame>
}
