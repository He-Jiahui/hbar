import {useMemo} from 'react'
import type {HbarAppUiAgentPlanBoardContent} from './AgentPlanContent'
import {uniqueHbarAppUiAgentPlanItems} from './AgentPlanContent'
import {AgentPlanFrame, AgentPlanStateMark, type AgentPlanSurfaceProps} from './AgentPlanPrimitives'

export function PlanBoard({spec, onAction, content}: AgentPlanSurfaceProps & {readonly content: HbarAppUiAgentPlanBoardContent}) {
    const sections = useMemo(() => uniqueHbarAppUiAgentPlanItems(content.sections), [content.sections])
    return <AgentPlanFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-plan-board-surface">
        <header className="hbar-app-ui-agent-plan-heading">
            <h2>{content.labels.title}</h2>
            <span>{content.labels.progress(sections.reduce((sum, section) => sum + section.done, 0), sections.reduce((sum, section) => sum + section.total, 0))}</span>
        </header>
        <main className="hbar-app-ui-agent-plan-board-pane" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            {sections.length ? <div className="hbar-app-ui-agent-plan-board-columns">
                {sections.map((section) => {
                    const items = uniqueHbarAppUiAgentPlanItems(section.items)
                    return <section className="hbar-app-ui-agent-plan-board-column" key={section.id}>
                        <header><span>{section.title}</span><span>{section.progressLabel}</span></header>
                        {items.length ? <ol>{items.map((item) => <li className={`is-${item.state}`} key={item.id}>
                            <p>{item.title}</p>
                            <p><AgentPlanStateMark state={item.state}/><span>{item.stateLabel}</span>{item.duration && <><span aria-hidden="true">{content.labels.separator}</span><span>{item.duration}</span></>}</p>
                        </li>)}</ol> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
                    </section>
                })}
            </div> : <p className="hbar-app-ui-agent-plan-empty">{content.labels.empty}</p>}
        </main>
    </AgentPlanFrame>
}
