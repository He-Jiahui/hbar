import {Square} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiAgentActivityLiveContent} from './AgentActivityContent'
import {selectHbarAppUiAgentActivityItem, uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityStateMark, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function LiveActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityLiveContent}) {
    const steps = uniqueHbarAppUiAgentActivityItems(content.steps)
    const [activeStepId, setActiveStepId] = useState(content.activeStepId)
    const activeStep = selectHbarAppUiAgentActivityItem(steps, activeStepId)

    useEffect(() => setActiveStepId(content.activeStepId), [content.activeStepId])

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-live">
        <header className="hbar-app-ui-agent-activity-heading">
            <div>
                <h2>{content.labels.title}</h2>
                <p><AgentActivityStateMark state={activeStep?.state ?? 'queued'}/><span>{content.labels.status}</span><span aria-hidden="true">{content.labels.separator}</span><span>{content.labels.elapsed}</span></p>
            </div>
            <AgentActivityButton aria-label={content.labels.stop} className="hbar-app-ui-agent-activity-stop" onClick={() => reportAgentActivityAction(onAction, spec, 'stop')}>
                <AgentActivityGlyph icon={Square} tier="sm"/><span>{content.labels.stop}</span>
            </AgentActivityButton>
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol className="hbar-app-ui-agent-activity-live-list">
                {steps.map((step) => <li className={step.id === activeStep?.id ? 'is-active' : ''} key={step.id}>
                    <AgentActivityStateMark state={step.state}/>
                    <AgentActivityButton className="hbar-app-ui-agent-activity-live-row" onClick={() => {
                        setActiveStepId(step.id)
                        reportAgentActivityAction(onAction, spec, 'select-live-step', step.id)
                    }}>
                        <span>{step.label}</span>
                        <time>{step.duration}</time>
                    </AgentActivityButton>
                </li>)}
            </ol>
        </main>
    </AgentActivityFrame>
}
