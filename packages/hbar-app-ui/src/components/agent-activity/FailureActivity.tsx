import {Download, RotateCcw} from 'lucide-react'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityStateMark, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'
import type {HbarAppUiAgentActivityFailureContent} from './AgentActivityContent'
import {uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'

export function FailureActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityFailureContent}) {
    const inputs = uniqueHbarAppUiAgentActivityItems(content.inputs)
    const attempts = uniqueHbarAppUiAgentActivityItems(content.attempts)
    const outputs = uniqueHbarAppUiAgentActivityItems(content.outputs)

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-failure">
        <header className="hbar-app-ui-agent-activity-heading">
            <div>
                <h2>{content.labels.title}</h2>
                <p><AgentActivityStateMark state="failed"/><span>{content.labels.status}</span><span aria-hidden="true">{content.labels.separator}</span><span>{content.labels.duration}</span></p>
            </div>
            <AgentActivityButton aria-label={content.labels.viewLog} onClick={() => reportAgentActivityAction(onAction, spec, 'view-failure-log')}><span>{content.labels.viewLog}</span></AgentActivityButton>
        </header>
        <main className="hbar-app-ui-agent-activity-failure-body" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <section aria-label={content.labels.errorTitle} className="hbar-app-ui-agent-activity-error-card">
                <h3><AgentActivityStateMark state="failed"/><span>{content.summaryTitle}</span></h3>
                <p>{content.summaryDescription}</p>
            </section>
            <div className="hbar-app-ui-agent-activity-action-row">
                <AgentActivityButton onClick={() => reportAgentActivityAction(onAction, spec, 'retry-failure')}><AgentActivityGlyph icon={RotateCcw} tier="sm"/><span>{content.labels.retry}</span></AgentActivityButton>
            </div>
            <section>
                <h3>{content.labels.inputs}</h3>
                <dl className="hbar-app-ui-agent-activity-definition-list">
                    {inputs.map((input) => <div key={input.id}><dt>{input.label}</dt><dd>{input.value}</dd></div>)}
                </dl>
            </section>
            <section>
                <h3>{content.labels.attempts}</h3>
                <ol className="hbar-app-ui-agent-activity-attempt-list">
                    {attempts.map((attempt) => <li key={attempt.id}><strong>{attempt.label}</strong><span>{attempt.description}</span><time>{attempt.duration}</time></li>)}
                </ol>
            </section>
            <section>
                <h3>{content.labels.output}</h3>
                <ul className="hbar-app-ui-agent-activity-output-list">
                    {outputs.map((output) => <li key={output.id}><div><strong>{output.name}</strong><span>{output.detail}</span></div><AgentActivityButton aria-label={`${content.labels.download} ${output.name}`} onClick={() => reportAgentActivityAction(onAction, spec, 'download-failure-output', output.id)}><AgentActivityGlyph icon={Download} tier="sm"/><span>{output.downloadLabel}</span></AgentActivityButton></li>)}
                </ul>
            </section>
        </main>
    </AgentActivityFrame>
}
