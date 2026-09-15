import {useEffect, useMemo, useState} from 'react'
import {AlertTriangle, FileCode2, Play, X} from 'lucide-react'
import type {HbarAppUiCodeFile, HbarAppUiCodeWorkspaceContent} from './EditorContent'
import {selectHbarAppUiEditorItem, uniqueHbarAppUiEditorItems} from './EditorContent'
import {
    EditorButton,
    EditorFrame,
    EditorIcon,
    EditorIconButton,
    reportEditorAction,
    type EditorSurfaceProps,
} from './EditorPrimitives'

type CodeWorkspaceProps = EditorSurfaceProps & {
    readonly content: HbarAppUiCodeWorkspaceContent
}

function linesForFile(file: HbarAppUiCodeFile | undefined): readonly string[] {
    return file ? file.source.split('\n') : []
}

/** A short content-grown file tab strip and host-owned source/status data. */
export function CodeWorkspace({spec, onAction, content}: CodeWorkspaceProps) {
    const [activeFileId, setActiveFileId] = useState<string | undefined>(content.activeFileId)
    const [closedFileIds, setClosedFileIds] = useState<ReadonlySet<string>>(() => new Set())
    const [running, setRunning] = useState(false)
    const uniqueFiles = useMemo(() => uniqueHbarAppUiEditorItems(content.files), [content.files])

    useEffect(() => {
        setActiveFileId(content.activeFileId)
        setClosedFileIds(new Set())
    }, [content.activeFileId, content.files])

    const openFiles = uniqueFiles.filter((file) => !closedFileIds.has(file.id))
    const activeFile = selectHbarAppUiEditorItem(openFiles, activeFileId)
    const lines = linesForFile(activeFile)

    const selectFile = (file: HbarAppUiCodeFile) => {
        setActiveFileId(file.id)
        content.onSelectFile?.(file.id)
        reportEditorAction(onAction, spec, 'file', file.id)
    }

    const closeFile = (file: HbarAppUiCodeFile) => {
        const nextFiles = openFiles.filter((candidate) => candidate.id !== file.id)
        const nextActive = file.id === activeFile?.id
            ? selectHbarAppUiEditorItem(nextFiles, undefined)
            : selectHbarAppUiEditorItem(nextFiles, activeFile?.id)
        setClosedFileIds((current) => new Set(current).add(file.id))
        setActiveFileId(nextActive?.id)
        content.onCloseFile?.(file.id)
        if (nextActive && nextActive.id !== activeFile?.id) content.onSelectFile?.(nextActive.id)
        reportEditorAction(onAction, spec, 'close-file', file.id)
    }

    const toggleRunning = () => {
        setRunning((current) => {
            const next = !current
            content.onRunChange?.(next)
            reportEditorAction(onAction, spec, next ? 'run' : 'stop')
            return next
        })
    }

    return <EditorFrame spec={spec} onAction={onAction} className="hbar-app-ui-editor-code">
        <header className="hbar-app-ui-editor-code-tabs" role="tablist" aria-label={content.labels.openFilesLabel}>
            <div className="hbar-app-ui-editor-code-file-list">
                {openFiles.map((file) => <div className={`hbar-app-ui-editor-code-file${activeFile?.id === file.id ? ' is-active' : ''}`}
                                                 key={file.id}>
                    <EditorButton kind="quiet" role="tab" aria-selected={activeFile?.id === file.id}
                                  onClick={() => selectFile(file)}>
                        <EditorIcon icon={FileCode2} tier="sm" aria-hidden="true"/>
                        <span>{file.name}</span>
                        {file.dirty && <i className="hbar-app-ui-editor-file-dirty" aria-label={content.labels.unsavedLabel}/>}
                    </EditorButton>
                    <EditorIconButton label={content.labels.closeFileLabel(file.name)} className="hbar-app-ui-editor-code-close"
                                      onClick={() => closeFile(file)}>
                        <EditorIcon icon={X} tier="xs"/>
                    </EditorIconButton>
                </div>)}
            </div>
            <EditorButton kind="light" className="hbar-app-ui-editor-run" onClick={toggleRunning}>
                <EditorIcon icon={Play} tier="sm"/>{running ? content.labels.stopLabel : content.labels.runLabel}
            </EditorButton>
        </header>
        {activeFile ? <main className="hbar-app-ui-editor-code-main" aria-label={content.labels.codeEditorLabel}>
            <div className="hbar-app-ui-editor-code-gutter" aria-hidden="true">
                {lines.map((_, index) => <span className={index + 1 === content.currentLine ? 'is-current' : ''} key={index}>{index + 1}</span>)}
            </div>
            <pre className="hbar-app-ui-editor-code-content"><code>
                {lines.map((line, index) => <span className={index + 1 === content.currentLine ? 'is-current' : ''}
                                                   key={`${index}-${line}`}><span>{line}</span></span>)}
            </code></pre>
            <aside className="hbar-app-ui-editor-minimap" aria-label={content.labels.codeOverviewLabel}>
                {lines.slice(0, 18).map((line, index) => <i key={index}
                                                             style={{inlineSize: `${Math.max(18, Math.min(96, line.length * 2.1))}%`}}/>)}
            </aside>
        </main> : <main className="hbar-app-ui-editor-code-main hbar-app-ui-editor-code-empty">
            <p>{content.labels.emptyFilesLabel}</p>
        </main>}
        <footer className="hbar-app-ui-editor-code-footer">
            <span>{content.footer.cursor}</span><span>{content.footer.language}</span><span>{content.footer.encoding}</span>
            <span>{content.footer.indentation}</span>
            {content.footer.warningCount > 0 && <span className="hbar-app-ui-editor-warning">
                <EditorIcon icon={AlertTriangle} tier="sm"/>{content.labels.warningLabel(content.footer.warningCount)}
            </span>}
        </footer>
    </EditorFrame>
}
