import { LumenInput, LumenTextarea } from '@lumen/app-ui'
import {useEffect, useState} from 'react'
import {Bold, ChevronDown, Code2, Italic, Link2, Redo2, Strikethrough, Undo2} from 'lucide-react'
import type {HbarAppUiEditorFormattingAction, HbarAppUiRichTextEditorContent} from './EditorContent'
import {
    EditorButton,
    EditorFrame,
    EditorIcon,
    EditorIconButton,
    EditorToolbar,
    reportEditorAction,
    type EditorSurfaceProps,
} from './EditorPrimitives'

const formattingActions: readonly {readonly id: HbarAppUiEditorFormattingAction; readonly icon: typeof Bold}[] = [
    {id: 'bold', icon: Bold},
    {id: 'italic', icon: Italic},
    {id: 'strikethrough', icon: Strikethrough},
    {id: 'inline-code', icon: Code2},
    {id: 'link', icon: Link2},
]

type RichTextEditorProps = EditorSurfaceProps & {
    readonly content: HbarAppUiRichTextEditorContent
}

/** A host-controlled rich-text draft with local, ephemeral edit feedback. */
export function RichTextEditor({spec, onAction, content}: RichTextEditorProps) {
    const [draft, setDraft] = useState(() => ({title: content.document.title, body: content.document.body}))

    useEffect(() => {
        setDraft({title: content.document.title, body: content.document.body})
    }, [content.document.body, content.document.id, content.document.title])

    const hasDraftChanges = draft.title !== content.document.title || draft.body !== content.document.body
    const saved = content.saved && !hasDraftChanges

    const edit = (field: 'title' | 'body', value: string) => {
        setDraft((current) => ({...current, [field]: value}))
        content.onChange?.({documentId: content.document.id, field, value})
    }

    return <EditorFrame spec={spec} onAction={onAction} className="hbar-app-ui-editor-rich-text">
        <EditorToolbar className="hbar-app-ui-editor-rich-toolbar">
            <EditorButton kind="quiet" className="hbar-app-ui-editor-block-menu" aria-label={content.labels.blockMenuLabel}
                          onClick={() => reportEditorAction(onAction, spec, 'block-menu')}>
                <span>{content.labels.blockMenuLabel}</span><EditorIcon icon={ChevronDown} tier="sm" aria-hidden="true"/>
            </EditorButton>
            <div className="hbar-app-ui-editor-format-group" role="toolbar" aria-label={content.labels.formattingToolbarLabel}>
                {formattingActions.map(({id, icon}) => <EditorIconButton key={id} label={content.labels.formatActionLabel(id)}
                                                                          className={id === 'bold' ? 'is-selected' : ''}
                                                                          onClick={() => reportEditorAction(onAction, spec, id)}>
                    <EditorIcon icon={icon} tier="md" strokeWidth={1.8}/>
                </EditorIconButton>)}
            </div>
            <div className="hbar-app-ui-editor-history-group" role="toolbar" aria-label={content.labels.historyToolbarLabel}>
                <EditorIconButton label={content.labels.undoLabel} onClick={() => reportEditorAction(onAction, spec, 'undo')}>
                    <EditorIcon icon={Undo2} tier="md"/>
                </EditorIconButton>
                <EditorIconButton label={content.labels.redoLabel} onClick={() => reportEditorAction(onAction, spec, 'redo')}>
                    <EditorIcon icon={Redo2} tier="md"/>
                </EditorIconButton>
            </div>
            <span className={`hbar-app-ui-editor-save-state${saved ? ' is-saved' : ''}`} aria-live="polite">
                <i aria-hidden="true"/>{saved ? content.labels.savedLabel : content.labels.unsavedLabel}
            </span>
        </EditorToolbar>
        <main className="hbar-app-ui-editor-rich-main">
            <section className="hbar-app-ui-editor-rich-document" aria-label={content.labels.documentEditorLabel}>
                <LumenInput aria-label={content.labels.documentTitleLabel} value={draft.title}
                       readOnly={content.onChange === undefined}
                       onChange={(event) => edit('title', event.target.value)}/>
                <p className="hbar-app-ui-editor-rich-meta">{content.document.metadata}</p>
                <LumenTextarea aria-label={content.labels.documentBodyLabel} value={draft.body}
                          readOnly={content.onChange === undefined}
                          onChange={(event) => edit('body', event.target.value)} spellCheck={false}/>
            </section>
        </main>
        <footer className="hbar-app-ui-editor-rich-footer">
            <div className="hbar-app-ui-editor-rich-stats">
                {content.document.statistics.map((statistic, index) => <span key={`${index}-${statistic}`}>{statistic}</span>)}
            </div>
            <div className="hbar-app-ui-editor-rich-footer-actions"><span>{content.document.footerNote}</span></div>
        </footer>
    </EditorFrame>
}
