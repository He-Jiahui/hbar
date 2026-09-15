import {ChevronDown, ChevronRight} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import type {HbarAppUiAgentActivityNestedContent} from './AgentActivityContent'
import {uniqueHbarAppUiAgentActivityItems} from './AgentActivityContent'
import {AgentActivityButton, AgentActivityFrame, AgentActivityGlyph, AgentActivityProgress, reportAgentActivityAction, type AgentActivitySurfaceProps} from './AgentActivityPrimitives'

export function NestedActivity({spec, onAction, content}: AgentActivitySurfaceProps & {readonly content: HbarAppUiAgentActivityNestedContent}) {
    const groups = useMemo(() => uniqueHbarAppUiAgentActivityItems(content.groups), [content.groups])
    const [openIds, setOpenIds] = useState<readonly string[]>(groups.filter((group) => group.openByDefault).map((group) => group.id))

    useEffect(() => setOpenIds(groups.filter((group) => group.openByDefault).map((group) => group.id)), [content.groups, groups])

    const allOpen = groups.length > 0 && groups.every((group) => openIds.includes(group.id))
    const toggleGroup = (groupId: string) => {
        setOpenIds((current) => current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId])
        reportAgentActivityAction(onAction, spec, 'toggle-nested-group', groupId)
    }
    const toggleAll = () => {
        setOpenIds(allOpen ? [] : groups.map((group) => group.id))
        reportAgentActivityAction(onAction, spec, 'toggle-nested-groups', allOpen ? 'collapse' : 'expand')
    }

    return <AgentActivityFrame spec={spec} onAction={onAction} className="hbar-app-ui-agent-activity-nested">
        <header className="hbar-app-ui-agent-activity-heading">
            <div>
                <h2>{content.labels.title}</h2>
                <p><span>{content.labels.status}</span><span aria-hidden="true">{content.labels.separator}</span><span>{content.labels.elapsed}</span></p>
            </div>
            <AgentActivityButton aria-label={allOpen ? content.labels.collapse : content.labels.expand} onClick={toggleAll}>
                <AgentActivityGlyph icon={allOpen ? ChevronDown : ChevronRight} tier="sm"/><span>{allOpen ? content.labels.collapse : content.labels.expand}</span>
            </AgentActivityButton>
        </header>
        <main className="hbar-app-ui-agent-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol className="hbar-app-ui-agent-activity-nested-list">
                {groups.map((group) => {
                    const open = openIds.includes(group.id)
                    const children = uniqueHbarAppUiAgentActivityItems(group.children)
                    const detailsId = `hbar-app-ui-agent-activity-group-${group.id}`
                    return <li key={group.id}>
                        <AgentActivityButton aria-controls={detailsId} aria-expanded={open} aria-label={open ? content.labels.collapseGroup : content.labels.expandGroup}
                                             className="hbar-app-ui-agent-activity-group-row" onClick={() => toggleGroup(group.id)}>
                            <AgentActivityGlyph icon={open ? ChevronDown : ChevronRight} tier="sm"/>
                            <strong>{group.label}</strong>
                            <time>{group.duration}</time>
                        </AgentActivityButton>
                        {open && <ol className="hbar-app-ui-agent-activity-child-list" id={detailsId}>
                            {children.map((child) => <li key={child.id}>
                                <span>{child.label}</span>
                                <AgentActivityProgress label={child.label} value={child.progress}/>
                                <time>{child.duration}</time>
                            </li>)}
                        </ol>}
                    </li>
                })}
            </ol>
        </main>
    </AgentActivityFrame>
}
