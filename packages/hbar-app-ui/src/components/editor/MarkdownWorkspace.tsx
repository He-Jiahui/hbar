import {useEffect, useState} from 'react'
import {Columns2, Eye, Pencil} from 'lucide-react'
import type {HbarAppUiMarkdownMode, HbarAppUiMarkdownWorkspaceContent} from './EditorContent'
import {
    EditorButton,
    EditorFrame,
    EditorIcon,
    EditorToolbar,
    reportEditorAction,
    type EditorSurfaceProps,
} from './EditorPrimitives'

const modeOptions: readonly {readonly id: HbarAppUiMarkdownMode; readonly icon: typeof Pencil}[] = [
    {id: 'write', icon: Pencil},
    {id: 'split', icon: Columns2},
    {id: 'preview', icon: Eye},
]

type MarkdownWorkspaceProps = EditorSurfaceProps & {
    readonly content: HbarAppUiMarkdownWorkspaceContent
}

/** A host-provided markdown source and semantic preview rendered in flow. */
export function MarkdownWorkspace({spec, onAction, content}: MarkdownWorkspaceProps) {
    const [mode, setMode] = useState<HbarAppUiMarkdownMode>(content.initialMode)
    const [source, setSource] = useState(content.document.source)

    useEffect(() => {
        setMode(content.initialMode)
        setSource(content.document.source)
    }, [content.document.id, content.document.source, content.initialMode])

    const changeMode = (next: HbarAppUiMarkdownMode) => {
        setMode(next)
        content.onModeChange?.(next)
        reportEditorAction(onAction, spec, 'mode', next)
    }

    const changeSource = (value: string) => {
        setSource(value)
        content.onSourceChange?.(content.document.id, value)
    }

    return <EditorFrame spec={spec} onAction={onAction}
                        className={`hbar-app-ui-editor-markdown hbar-app-ui-editor-markdown-mode-${mode}`}>
        <EditorToolbar className="hbar-app-ui-editor-markdown-header">
            <div className="hbar-app-ui-editor-file-summary"><h1>{content.document.fileName}</h1><p>{content.document.summary}</p></div>
            <div className="hbar-app-ui-editor-mode-tabs" role="tablist" aria-label={content.labels.modeTabsLabel}>
                {modeOptions.map(({id, icon}) => <EditorButton key={id} kind="quiet" role="tab" aria-selected={mode === id}
                                                               className={mode === id ? 'is-selected' : ''}
                                                               onClick={() => changeMode(id)}>
                    <EditorIcon icon={icon} tier="sm" aria-hidden="true"/>{content.labels.modeLabel(id)}
                </EditorButton>)}
            </div>
        </EditorToolbar>
        <main className="hbar-app-ui-editor-markdown-main">
            {(mode === 'write' || mode === 'split') && <section className="hbar-app-ui-editor-markdown-source">
                <header><span>{content.labels.sourcePanelLabel}</span></header>
                <textarea aria-label={content.labels.sourceInputLabel} value={source} readOnly={content.onSourceChange === undefined}
                          onChange={(event) => changeSource(event.target.value)} spellCheck={false}/>
            </section>}
            {(mode === 'preview' || mode === 'split') && <section className="hbar-app-ui-editor-markdown-preview">
                <header><span>{content.labels.previewPanelLabel}</span></header>
                <div className="hbar-app-ui-editor-markdown-preview-content">{content.document.preview}</div>
            </section>}
        </main>
    </EditorFrame>
}
