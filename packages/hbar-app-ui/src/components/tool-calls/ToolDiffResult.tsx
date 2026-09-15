import {ChevronDown, ChevronRight} from 'lucide-react'
import {useEffect, useState} from 'react'
import type {HbarAppUiToolCallsDiffContent} from './ToolCallsContent'
import {selectHbarAppUiToolCallsItem, uniqueHbarAppUiToolCallsItems} from './ToolCallsContent'
import {reportToolCallsAction, ToolCallsButton, ToolCallsFrame, ToolCallsGlyph, type ToolCallsSurfaceProps} from './ToolCallsPrimitives'

export function ToolDiffResult({spec, onAction, content}: ToolCallsSurfaceProps & {readonly content: HbarAppUiToolCallsDiffContent}) {
    const files = uniqueHbarAppUiToolCallsItems(content.files)
    const [openFileId, setOpenFileId] = useState(content.activeFileId)
    const openFile = selectHbarAppUiToolCallsItem(files, openFileId)

    useEffect(() => setOpenFileId(content.activeFileId), [content.activeFileId])

    return <ToolCallsFrame spec={spec} onAction={onAction} className="hbar-app-ui-tool-calls-diff">
        <header className="hbar-app-ui-tool-calls-code-heading"><code>{content.toolName}</code><h2>{content.title}</h2><span>{content.summary}</span></header>
        <main data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum} data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <ol>{files.map((file) => {
                const isOpen = file.id === openFile?.id
                const lines = uniqueHbarAppUiToolCallsItems(file.lines)
                const detailsId = `hbar-app-ui-tool-diff-${file.id}`
                return <li key={file.id}>
                    <ToolCallsButton aria-controls={detailsId} aria-expanded={isOpen} className="hbar-app-ui-tool-calls-diff-file" onClick={() => {
                        setOpenFileId(file.id)
                        reportToolCallsAction(onAction, spec, 'toggle-diff-file', file.id)
                    }}>
                        <ToolCallsGlyph icon={isOpen ? ChevronDown : ChevronRight} tier="sm"/><code>{file.fileName}</code><span>{file.fileSummary}</span>
                    </ToolCallsButton>
                    {isOpen && <ol id={detailsId}>{lines.map((line) => <li className={`is-${line.kind}`} key={line.id}>
                        <span>{line.beforeLine}</span><span>{line.afterLine}</span><span>{line.marker}</span><code>{line.text}</code>
                    </li>)}</ol>}
                </li>
            })}</ol>
        </main>
    </ToolCallsFrame>
}
