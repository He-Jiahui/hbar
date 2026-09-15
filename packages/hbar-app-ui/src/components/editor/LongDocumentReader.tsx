import {useEffect, useMemo, useState} from 'react'
import {Maximize2, PanelLeft} from 'lucide-react'
import type {HbarAppUiLongDocumentReaderContent} from './EditorContent'
import {selectHbarAppUiEditorItem, uniqueHbarAppUiEditorItems} from './EditorContent'
import {
    EditorButton,
    EditorFrame,
    EditorIcon,
    EditorIconButton,
    reportEditorAction,
    type EditorSurfaceProps,
} from './EditorPrimitives'

type LongDocumentReaderProps = EditorSurfaceProps & {
    readonly content: HbarAppUiLongDocumentReaderContent
}

/** A flowing long document with a pane-owned, scrollable outline. */
export function LongDocumentReader({spec, onAction, content}: LongDocumentReaderProps) {
    const sections = useMemo(() => uniqueHbarAppUiEditorItems(content.sections), [content.sections])
    const [outlineOpen, setOutlineOpen] = useState(content.initialOutlineOpen)
    const [focusSectionId, setFocusSectionId] = useState<string | undefined>(content.initialFocusSectionId)
    const [focusMode, setFocusMode] = useState(content.initialFocusMode)

    useEffect(() => {
        setOutlineOpen(content.initialOutlineOpen)
        setFocusSectionId(content.initialFocusSectionId)
        setFocusMode(content.initialFocusMode)
    }, [content.initialFocusMode, content.initialFocusSectionId, content.initialOutlineOpen, content.sections])

    const focusedSection = selectHbarAppUiEditorItem(sections, focusSectionId)

    const selectSection = (id: string) => {
        setFocusSectionId(id)
        content.onSelectSection?.(id)
        reportEditorAction(onAction, spec, 'section', id)
    }

    const toggleOutline = () => {
        const next = !outlineOpen
        setOutlineOpen(next)
        content.onOutlineOpenChange?.(next)
        reportEditorAction(onAction, spec, 'outline', next ? 'open' : 'closed')
    }

    const toggleFocus = () => {
        const next = !focusMode
        setFocusMode(next)
        content.onFocusModeChange?.(next)
        reportEditorAction(onAction, spec, 'focus', next ? 'on' : 'off')
    }

    return <EditorFrame spec={spec} onAction={onAction} className={`hbar-app-ui-editor-reader${focusMode ? ' is-focus-mode' : ''}`}>
        {outlineOpen && <aside className="hbar-app-ui-editor-reader-outline" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <header><span>{content.labels.outlineLabel}</span></header>
            <nav aria-label={content.labels.documentOutlineLabel}>
                {sections.length > 0 ? sections.map((section) => <EditorButton kind="quiet" key={section.id}
                                                                                className={focusedSection?.id === section.id ? 'is-selected' : ''}
                                                                                onClick={() => selectSection(section.id)}>{section.label}</EditorButton>)
                    : <p>{content.labels.emptyOutlineLabel}</p>}
            </nav>
            <footer>{content.labels.sectionCountLabel(sections.length)}</footer>
        </aside>}
        <div className="hbar-app-ui-editor-reader-main">
            <header className="hbar-app-ui-editor-reader-toolbar">
                <EditorIconButton label={content.labels.toggleOutlineLabel} className="hbar-app-ui-editor-reader-toggle"
                                  onClick={toggleOutline}><EditorIcon icon={PanelLeft} tier="sm"/></EditorIconButton>
                <p><span>{content.workspaceLabel}</span><span>{content.labels.breadcrumbSeparator}</span><strong>{content.documentLabel}</strong></p>
                <EditorButton kind="light" aria-pressed={focusMode} onClick={toggleFocus}>
                    <EditorIcon icon={Maximize2} tier="sm"/>{content.labels.focusLabel}
                </EditorButton>
            </header>
            <main className="hbar-app-ui-editor-reader-content"><article>
                {sections.map((section) => <section className={focusMode && focusedSection?.id !== section.id ? 'is-dimmed' : ''}
                                                    key={section.id}>
                    <h2>{section.title}</h2>{section.paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph}`}>{paragraph}</p>)}
                </section>)}
            </article></main>
        </div>
    </EditorFrame>
}
