import {useEffect, useState} from 'react'
import type {HbarAppUiToolCallsCommandContent} from './ToolCallsContent'
import {selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolCommandOutput({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsCommandContent}) {
    const tabs = uniqueHbarAppUiToolCallsItems(content.tabs)
    const [selectedTabId, setSelectedTabId] = useState(content.initialTabId)
    const selectedTab = selectHbarAppUiToolCallsItem(tabs, selectedTabId)

    useEffect(() => setSelectedTabId(content.initialTabId), [content.initialTabId])

    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-command">
        <header><code>{content.toolName}</code><h2>{content.title}</h2><time>{content.duration}</time></header>
        <main data-hbar-app-ui-expected-maximum={content.outputStrategy.expectedMaximum} data-hbar-app-ui-list-strategy={content.outputStrategy.kind}>
            <section>
                <header><pre className="hbar-app-ui-tool-calls-command-line">{content.command}</pre><span>{content.exitLabel}</span></header>
                <nav aria-label={content.tabsLabel} role="tablist">{tabs.map((tab) => <ToolCallsButton aria-selected={tab.id === selectedTab?.id}
                                                                                                            className={tab.id === selectedTab?.id ? 'is-selected' : ''} key={tab.id}
                                                                                                            onClick={() => {
                    setSelectedTabId(tab.id)
                    reportToolCallsAction(onAction, spec, 'select-command-output', tab.id)
                }} role="tab">{tab.label}</ToolCallsButton>)}</nav>
                {selectedTab && <pre className="hbar-app-ui-tool-calls-command-output">{selectedTab.output}</pre>}
            </section>
        </main>
    </ToolCallsFrame>
}
