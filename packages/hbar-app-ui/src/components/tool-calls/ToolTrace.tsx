import {ChevronDown, ChevronRight, Square} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiToolCallsTraceContent} from './ToolCallsContent'
import {selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, ToolCallsGlyph, ToolCallsStatus, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolTrace({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsTraceContent}) {
    const items = uniqueHbarAppUiToolCallsItems(content.items)
    const [openId, setOpenId] = useState(content.activeItemId)
    const activeItem = selectHbarAppUiToolCallsItem(items, openId)

    useEffect(() => setOpenId(content.activeItemId), [content.activeItemId])

    const chooseItem = (itemId: string) => {
        setOpenId(itemId)
        reportToolCallsAction(onAction, spec, 'toggle-trace-item', itemId)
    }

    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-trace">
        <header className="hbar-app-ui-tool-calls-heading">
            <h2>{content.labels.title}</h2>
            <ToolCallsButton aria-label={content.labels.stop} className="hbar-app-ui-tool-calls-stop" onClick={() => reportToolCallsAction(onAction, spec, 'stop')}>
                <ToolCallsGlyph icon={Square} tier="sm"/><span>{content.labels.stop}</span>
            </ToolCallsButton>
        </header>
        <main className="hbar-app-ui-tool-calls-trace-pane" data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol>
                {items.map((item) => {
                    const isOpen = item.id === activeItem?.id
                    const detailsId = `hbar-app-ui-tool-trace-${item.id}`
                    return <li key={item.id}>
                        <ToolCallsButton aria-controls={detailsId} aria-expanded={isOpen} className="hbar-app-ui-tool-calls-trace-row"
                                         onClick={() => chooseItem(item.id)}>
                            <ToolCallsGlyph icon={isOpen ? ChevronDown : ChevronRight} tier="sm"/>
                            <code>{item.name}</code>
                            <time>{item.duration}</time>
                            <ToolCallsStatus label={item.stateLabel} state={item.state}/>
                        </ToolCallsButton>
                        {isOpen && <section id={detailsId} className="hbar-app-ui-tool-calls-trace-details">
                            <dl>
                                {item.startedAt && <div><dt>{content.labels.started}</dt><dd>{item.startedAt}</dd></div>}
                                <div><dt>{content.labels.duration}</dt><dd>{item.duration}</dd></div>
                            </dl>
                            {item.argumentsText && <div><p>{content.labels.arguments}</p><pre>{item.argumentsText}</pre></div>}
                            {item.resultText && <div><p>{content.labels.result}</p><pre>{item.resultText}</pre></div>}
                        </section>}
                    </li>
                })}
            </ol>
        </main>
    </ToolCallsFrame>
}
