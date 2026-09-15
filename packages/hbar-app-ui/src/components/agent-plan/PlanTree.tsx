import {ChevronDown, ChevronRight, RotateCcw} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiAgentPlanTreeContent} from './AgentPlanContent'
import {uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanButton, AgentPlanFrame, AgentPlanIcon, AgentPlanNumber, AgentPlanStatus, reportAgentPlanAction, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

export function PlanTree({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanTreeContent}) {
    const groups = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.groups), [content.groups])
    const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(groups.filter((group) => group.openByDefault).map((group) => group.id)))
    const done = groups.reduce((total, group) => total + group.done, 0)
    const total = groups.reduce((count, group) => count + group.total, 0)
    const toggle = (id: string) => {
        setOpenIds((current) => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
        reportAgentPlanAction(onAction, spec, 'toggle-plan-group', id)
    }

    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-tree">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <span>{content.labels.progress(done, total)}</span>
        </header>
        <main className="hbar-app-ui-agent-plan-tree-pane" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {groups.length ? <div className="hbar-app-ui-agent-plan-inset-card"><ul>
                {groups.map((group) => {
                    const open = openIds.has(group.id)
                    const items = uniqueHbarAppUiAgentPlanItems(group.items)
                    return <li key={group.id}>
                        <button aria-expanded={open} aria-label={open ? content.labels.collapse(group.title) : content.labels.expand(group.title)} className="hbar-app-ui-agent-plan-tree-group" type="button" onClick={() => toggle(group.id)}>
                            <span className="hbar-app-ui-agent-plan-tree-toggle"><AgentPlanIcon icon={open ? ChevronDown : ChevronRight} tier="sm"/></span>
                            <span className="hbar-app-ui-agent-plan-tree-group-title">{group.title}</span>
                            <span className="hbar-app-ui-agent-plan-tree-group-progress">{group.progressLabel}</span>
                        </button>
                        {open && <ol className="hbar-app-ui-agent-plan-tree-children">
                            {items.map((item, index) => <li key={item.id}>
                                <AgentPlanNumber value={index + 1}/>
                                <span className="hbar-app-ui-agent-plan-step-title">{item.title}</span>
                                {item.state === 'failed' && <AgentPlanButton onClick={() => reportAgentPlanAction(onAction, spec, 'retry-plan-step', item.id)}><AgentPlanIcon icon={RotateCcw} tier="xs"/><span>{content.labels.retry}</span></AgentPlanButton>}
                                <AgentPlanStatus state={item.state} label={item.stateLabel}/>
                            </li>)}
                        </ol>}
                    </li>
                })}
            </ul></div> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
        </main>
    </AgentPlanFrame>
}
