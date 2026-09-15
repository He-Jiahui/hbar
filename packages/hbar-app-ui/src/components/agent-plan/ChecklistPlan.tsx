import {Square} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiAgentPlanChecklistContent} from './AgentPlanContent'
import {selectHbarAppUiAgentPlanItem, uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanButton, AgentPlanFrame, AgentPlanIcon, AgentPlanNumber, AgentPlanStatus, reportAgentPlanAction, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

export function ChecklistPlan({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanChecklistContent}) {
    const steps = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.steps), [content.steps])
    const initialActive = selectHbarAppUiAgentPlanItem(steps, content.activeStepId)?.id
    const [activeStepId, setActiveStepId] = useState<string | undefined>(initialActive)
    const [stopped, setStopped] = useState(false)
    const activeStep = selectHbarAppUiAgentPlanItem(steps, activeStepId)
    const done = steps.filter((step) => step.state === 'done').length

    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-checklist">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <div className="hbar-app-ui-agent-plan-heading-actions">
                <div className="hbar-app-ui-agent-plan-progress">
                    <progress aria-label={content.labels.progress(done, steps.length)} max={steps.length || 1} value={done}/>
                    <span>{content.labels.progress(done, steps.length)}</span>
                </div>
                <AgentPlanButton disabled={stopped} onClick={() => {
                    setStopped(true)
                    reportAgentPlanAction(onAction, spec, 'stop-plan')
                }}><AgentPlanIcon icon={Square} tier="sm"/><span>{content.labels.stop}</span></AgentPlanButton>
            </div>
        </header>
        <main aria-label={activeStep ? content.labels.workingOn(activeStep.title) : undefined} className="hbar-app-ui-agent-plan-checklist-pane" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {steps.length ? <div className="hbar-app-ui-agent-plan-inset-card"><ol>
                {steps.map((step, index) => {
                    const isActive = step.id === activeStep?.id
                    return <li className={isActive ? 'is-active' : ''} key={step.id}>
                        <button aria-pressed={isActive} type="button" onClick={() => {
                            setActiveStepId(step.id)
                            reportAgentPlanAction(onAction, spec, 'select-plan-step', step.id)
                        }}>
                            <AgentPlanNumber value={index + 1}/>
                            <span className="hbar-app-ui-agent-plan-step-title">{step.title}</span>
                            <AgentPlanStatus state={step.state} label={step.stateLabel}/>
                        </button>
                        {isActive && (step.detail || step.target || step.estimate) && <div className="hbar-app-ui-agent-plan-step-detail">
                            {step.detail && <p>{step.detail}</p>}
                            {(step.target || step.estimate) && <dl>
                                {step.target && <div><dt>{content.labels.target}</dt><dd>{step.target}</dd></div>}
                                {step.estimate && <div><dt>{content.labels.estimate}</dt><dd>{step.estimate}</dd></div>}
                            </dl>}
                        </div>}
                    </li>
                })}
            </ol></div> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
        </main>
    </AgentPlanFrame>
}
