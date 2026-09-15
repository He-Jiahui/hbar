import {RotateCcw, Square} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiToolCallsActivityContent} from './ToolCallsContent'
import {selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, ToolCallsGlyph, ToolCallsStateMark, ToolCallsStatus, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolActivity({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsActivityContent}) {
    const filters = uniqueHbarAppUiToolCallsItems(content.filters)
    const items = uniqueHbarAppUiToolCallsItems(content.items)
    const [activeFilterId, setActiveFilterId] = useState(content.activeFilterId)
    const activeFilter = selectHbarAppUiToolCallsItem(filters, activeFilterId)
    const visibleItems = activeFilter ? items.filter((item) => item.filterIds.includes(activeFilter.id)) : items

    useEffect(() => setActiveFilterId(content.activeFilterId), [content.activeFilterId])

    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-activity">
        <header className="hbar-app-ui-tool-calls-activity-heading">
            <h2>{content.labels.title}</h2>
            <ToolCallsButton aria-label={content.labels.stop} className="hbar-app-ui-tool-calls-stop" onClick={() => reportToolCallsAction(onAction, spec, 'stop')}>
                <ToolCallsGlyph icon={Square} tier="sm"/><span>{content.labels.stop}</span>
            </ToolCallsButton>
            <nav aria-label={content.labels.filtersLabel} role="tablist">
                {filters.map((filter) => <ToolCallsButton aria-selected={filter.id === activeFilter?.id} className={filter.id === activeFilter?.id ? 'is-selected' : ''}
                                                          key={filter.id} onClick={() => {
                    setActiveFilterId(filter.id)
                    reportToolCallsAction(onAction, spec, 'filter-tool-activity', filter.id)
                }} role="tab">{filter.label}</ToolCallsButton>)}
            </nav>
        </header>
        <main className="hbar-app-ui-tool-calls-activity-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol>
                {visibleItems.map((item) => <li key={item.id}>
                    <ToolCallsButton className="hbar-app-ui-tool-calls-activity-row" onClick={() => reportToolCallsAction(onAction, spec, 'open-tool-activity', item.id)}>
                        <ToolCallsStateMark state={item.state}/>
                        <span><code>{item.name}</code><small>{item.detail}</small></span>
                        <time>{item.duration}</time>
                        <ToolCallsStatus label={item.stateLabel} state={item.state}/>
                    </ToolCallsButton>
                    {item.retryLabel && <ToolCallsButton aria-label={item.retryLabel} className="hbar-app-ui-tool-calls-retry" onClick={() => reportToolCallsAction(onAction, spec, 'retry-tool-activity', item.id)}>
                        <ToolCallsGlyph icon={RotateCcw} tier="sm"/>
                    </ToolCallsButton>}
                </li>)}
            </ol>
        </main>
    </ToolCallsFrame>
}
