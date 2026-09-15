import {Square} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiAgentActivityDeploymentContent} from './AgentActivityContent'
import {selectHbarAppUiAgentActivityItem, uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityProgress, AgentActivityStateMark, AgentActivityStatus, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function DeploymentActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityDeploymentContent}) {
    const steps = uniqueHbarAppUiAgentActivityItems(content.steps)
    const [activeStepId, setActiveStepId] = useState(content.activeStepId)
    const activeStep = selectHbarAppUiAgentActivityItem(steps, activeStepId)

    useEffect(() => setActiveStepId(content.activeStepId), [content.activeStepId])

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-deployment">
        <header className="hbar-app-ui-agent-activity-heading">
            <div>
                <h2>{content.labels.title}</h2>
                <p><AgentActivityStateMark state={activeStep?.state ?? 'queued'}/><span>{content.labels.status}</span></p>
            </div>
            <span className="hbar-app-ui-agent-activity-step-count">{content.labels.currentStep}</span>
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol className="hbar-app-ui-agent-activity-deployment-list">
                {steps.map((step) => <li className={step.id === activeStep?.id ? 'is-active' : ''} key={step.id}>
                    <AgentActivityStateMark state={step.state}/>
                    <AgentActivityButton className="hbar-app-ui-agent-activity-deployment-row" onClick={() => {
                        setActiveStepId(step.id)
                        reportAgentActivityAction(onAction, spec, 'select-deployment-step', step.id)
                    }}>
                        <span>{step.label}</span>
                        <AgentActivityStatus state={step.state} label={step.stateLabel}/>
                    </AgentActivityButton>
                </li>)}
            </ol>
            <footer className="hbar-app-ui-agent-activity-deployment-footer">
                <AgentActivityProgress label={content.labels.elapsed} value={content.progress}/>
                <span>{content.labels.elapsed}</span>
                <AgentActivityButton aria-label={content.labels.stop} className="hbar-app-ui-agent-activity-stop" onClick={() => reportAgentActivityAction(onAction, spec, 'stop')}>
                    <AgentActivityGlyph icon={Square} tier="sm"/><span>{content.labels.stop}</span>
                </AgentActivityButton>
            </footer>
        </main>
    </AgentActivityFrame>
}
