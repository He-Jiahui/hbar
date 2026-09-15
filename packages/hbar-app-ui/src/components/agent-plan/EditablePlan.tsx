import {ArrowDown, ArrowUp, CornerUpLeft, Play, Plus, X} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {HbarAppUiAgentPlanEditableContent, HbarAppUiAgentPlanStep} from './AgentPlanContent'
import {uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanButton, AgentPlanFrame, AgentPlanIcon, AgentPlanNumber, reportAgentPlanAction, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

function movePlanStep(items: readonly HbarAppUiAgentPlanStep[], id: string, direction: -1 | 1): readonly HbarAppUiAgentPlanStep[] {
    const index = items.findIndex((item) => item.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return items
    const next = [...items]
    const current = next[index]
    const swapped = next[target]
    if (!current || !swapped) return items
    next[index] = swapped
    next[target] = current
    return next
}

export function EditablePlan({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanEditableContent}) {
    const sourceSteps = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.steps), [content.steps])
    const [steps, setSteps] = useState<readonly HbarAppUiAgentPlanStep[]>(sourceSteps)
    const [draft, setDraft] = useState('')
    const [draftSequence, setDraftSequence] = useState(0)

    useEffect(() => {
        // The host owns domain data and may replace it when locale or run state
        // changes.  Reset the ephemeral editor projection to that new source.
        setSteps(sourceSteps)
    }, [sourceSteps])

    const activeSteps = steps.filter((step) => step.state !== 'skipped')
    const toggleSkipped = (id: string) => {
        setSteps((current) => current.map((step) => step.id === id
            ? {...step, state: step.state === 'skipped' ? 'queued' : 'skipped', stateLabel: step.state === 'skipped' ? content.labels.newStepStateLabel : step.stateLabel}
            : step))
        reportAgentPlanAction(onAction, spec, 'toggle-plan-step', id)
    }
    const addStep = () => {
        const title = draft.trim()
        if (!title) return
        const id = `draft-${draftSequence}`
        setSteps((current) => [...current, {id, title, state: 'queued', stateLabel: content.labels.newStepStateLabel}])
        setDraft('')
        setDraftSequence((current) => current + 1)
        reportAgentPlanAction(onAction, spec, 'add-plan-step', title)
    }

    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-editable">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <span>{content.labels.summary}</span>
        </header>
        <main className="hbar-app-ui-agent-plan-editable-body">
            {steps.length ? <div className="hbar-app-ui-agent-plan-editable-card" data-hbar-app-ui-list-strategy={content.listStrategy.kind}><div className="hbar-app-ui-agent-plan-editable-list-viewport"><ol>
                {steps.map((step, index) => {
                    const skipped = step.state === 'skipped'
                    return <li className={skipped ? 'is-skipped' : ''} key={step.id}>
                        <AgentPlanNumber value={index + 1}/>
                        <span className="hbar-app-ui-agent-plan-step-title">{step.title}</span>
                        <div className="hbar-app-ui-agent-plan-row-actions">
                            <AgentPlanButton aria-label={content.labels.moveUp(step.title)} disabled={index === 0} onClick={() => {
                                setSteps((current) => movePlanStep(current, step.id, -1))
                                reportAgentPlanAction(onAction, spec, 'move-plan-step-up', step.id)
                            }}><AgentPlanIcon icon={ArrowUp} tier="sm"/></AgentPlanButton>
                            <AgentPlanButton aria-label={content.labels.moveDown(step.title)} disabled={index === steps.length - 1} onClick={() => {
                                setSteps((current) => movePlanStep(current, step.id, 1))
                                reportAgentPlanAction(onAction, spec, 'move-plan-step-down', step.id)
                            }}><AgentPlanIcon icon={ArrowDown} tier="sm"/></AgentPlanButton>
                            <AgentPlanButton aria-label={skipped ? content.labels.restore(step.title) : content.labels.skip(step.title)} onClick={() => toggleSkipped(step.id)}>
                                <AgentPlanIcon icon={skipped ? CornerUpLeft : X} tier="sm"/>
                            </AgentPlanButton>
                        </div>
                    </li>
                })}
            </ol></div></div> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
            <form className="hbar-app-ui-agent-plan-add-row" onSubmit={(event) => {
                event.preventDefault()
                addStep()
            }}>
                <input aria-label={content.labels.addPlaceholder} onChange={(event) => setDraft(event.target.value)} placeholder={content.labels.addPlaceholder} value={draft}/>
                <AgentPlanButton type="submit"><AgentPlanIcon icon={Plus} tier="sm"/><span>{content.labels.add}</span></AgentPlanButton>
            </form>
        </main>
        <footer className="hbar-app-ui-agent-plan-editable-footer">
            <p className="hbar-app-ui-agent-plan-editable-review">{content.labels.review}</p>
            <AgentPlanButton className="is-primary" onClick={() => reportAgentPlanAction(onAction, spec, 'start-plan', String(activeSteps.length))}><AgentPlanIcon icon={Play} tier="sm"/><span>{content.labels.start(activeSteps.length)}</span></AgentPlanButton>
        </footer>
    </AgentPlanFrame>
}
