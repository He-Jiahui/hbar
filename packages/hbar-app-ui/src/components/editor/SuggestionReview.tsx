import {useEffect, useMemo, useState} from 'react'
import {Check, MessageSquare, X} from 'lucide-react'
import type {HbarAppUiSuggestion, HbarAppUiSuggestionReviewContent} from './EditorContent'
import {uniqueHbarAppUiEditorItems} from './EditorContent'
import {
    EditorButton,
    EditorFrame,
    EditorIcon,
    EditorInlineText,
    reportEditorAction,
    type EditorSurfaceProps,
} from './EditorPrimitives'

type SuggestionReviewProps = EditorSurfaceProps & {
    readonly content: HbarAppUiSuggestionReviewContent
}

type SuggestionCardProps = {
    readonly item: HbarAppUiSuggestion
    readonly labels: HbarAppUiSuggestionReviewContent['labels']
    readonly resolved: boolean
    readonly onAccept: () => void
    readonly onDismiss: () => void
}

function SuggestionCard({item, labels, resolved, onAccept, onDismiss}: SuggestionCardProps) {
    const actionLabel = item.primaryAction === 'resolve' ? labels.resolveLabel : labels.acceptLabel
    return <article className={`hbar-app-ui-editor-suggestion-card${resolved ? ' is-resolved' : ''}`}>
        <header><span className="hbar-app-ui-editor-avatar">{item.initials}</span><strong>{item.author}</strong><time>{item.age}</time></header>
        {item.replacement ? <div className="hbar-app-ui-editor-suggestion-quote"><p><s>{item.selected}</s></p><p><strong>{item.replacement}</strong></p></div>
            : <p className="hbar-app-ui-editor-suggestion-quote"><s>{item.selected}</s></p>}
        <p>{item.detail}</p>
        <footer>
            <EditorButton kind="light" disabled={resolved} onClick={onAccept}>
                <EditorIcon icon={Check} tier="sm"/>{resolved ? labels.resolvedLabel : actionLabel}
            </EditorButton>
            <EditorButton kind="quiet" disabled={resolved} onClick={onDismiss}>
                <EditorIcon icon={X} tier="sm"/>{labels.dismissLabel}
            </EditorButton>
        </footer>
    </article>
}

/** Flowing review prose and a pane-owned scroll list of host-supplied suggestions. */
export function SuggestionReview({spec, onAction, content}: SuggestionReviewProps) {
    const suggestions = useMemo(() => uniqueHbarAppUiEditorItems(content.suggestions), [content.suggestions])
    const suggestionIds = useMemo(() => new Set(suggestions.map((item) => item.id)), [suggestions])
    const [resolved, setResolved] = useState<ReadonlySet<string>>(() => new Set())

    useEffect(() => {
        setResolved((current) => new Set([...current].filter((id) => suggestionIds.has(id))))
    }, [suggestionIds])

    const remaining = suggestions.filter((item) => !resolved.has(item.id))

    const resolve = (id: string, action: HbarAppUiSuggestion['primaryAction'] | 'dismiss') => {
        setResolved((current) => new Set(current).add(id))
        content.onResolve?.(id, action)
        reportEditorAction(onAction, spec, action, id)
    }

    const openSuggestion = (id: string) => {
        content.onOpenSuggestion?.(id)
        reportEditorAction(onAction, spec, 'open-suggestion', id)
    }

    const acceptAll = () => {
        setResolved(new Set(suggestions.map((item) => item.id)))
        remaining.forEach((item) => content.onResolve?.(item.id, 'accept'))
        reportEditorAction(onAction, spec, 'accept-all')
    }

    return <EditorFrame spec={spec} onAction={onAction} className="hbar-app-ui-editor-suggestions">
        <div className="hbar-app-ui-editor-suggestion-document">
            <header className="hbar-app-ui-editor-suggestion-title">
                <div><h1>{content.document.title}</h1><p>{content.document.summary}</p></div>
                <span><EditorIcon icon={MessageSquare} tier="sm"/>{content.labels.openCountLabel(remaining.length)}</span>
            </header>
            <main className="hbar-app-ui-editor-suggestion-copy">
                {content.document.paragraphs.map((paragraph) => <p key={paragraph.id}>
                    <EditorInlineText segments={paragraph.segments} onOpenSuggestion={openSuggestion}/>
                </p>)}
            </main>
        </div>
        <aside className="hbar-app-ui-editor-suggestion-panel" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
            <header><h2>{content.labels.suggestionPanelLabel}</h2><EditorButton kind="quiet" onClick={acceptAll}>
                {content.labels.acceptAllLabel}
            </EditorButton></header>
            <div className="hbar-app-ui-editor-suggestion-list">
                {suggestions.length > 0 ? suggestions.map((item) => <SuggestionCard key={item.id} item={item}
                                                                                    labels={content.labels} resolved={resolved.has(item.id)}
                                                                                    onAccept={() => resolve(item.id, item.primaryAction)}
                                                                                    onDismiss={() => resolve(item.id, 'dismiss')}/>)
                    : <p>{content.labels.emptySuggestionsLabel}</p>}
            </div>
            <p className="hbar-app-ui-editor-suggestion-remaining">{content.labels.remainingCountLabel(remaining.length)}</p>
        </aside>
    </EditorFrame>
}
