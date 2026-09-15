import type {HbarAppUiToolCallsSearchContent} from './ToolCallsContent'
import {uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolSearchResults({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsSearchContent}) {
    const items = uniqueHbarAppUiToolCallsItems(content.items)
    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-search">
        <header><code>{content.toolName}</code><h2>{content.query}</h2><span>{content.statusLabel}</span></header>
        <main data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum} data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol>{items.map((item, index) => <li key={item.id}>
                <ToolCallsButton onClick={() => reportToolCallsAction(onAction, spec, 'open-search-result', item.id)}>
                    <span aria-hidden="true">{index + 1}</span>
                    <span><strong>{item.title}</strong><small>{item.source}</small><span className="hbar-app-ui-tool-calls-search-excerpt">{item.excerpt}</span></span>
                    <em>{item.relevance}</em>
                </ToolCallsButton>
            </li>)}</ol>
        </main>
    </ToolCallsFrame>
}
