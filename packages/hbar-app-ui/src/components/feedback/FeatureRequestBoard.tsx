import {ArrowUp, MessageCircle, Plus, Search} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {uniqueHbarAppUiFeedbackItems, type HbarAppUiFeedbackFeatureBoardContent} from './FeedbackContent'
import {FeedbackButton, FeedbackFrame, FeedbackStatus} from './FeedbackPrimitives'

export function FeatureRequestBoard({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackFeatureBoardContent}) {
    const [sortId, setSortId] = useState(content.initialSortId)
    const [query, setQuery] = useState('')
    const [votedIds, setVotedIds] = useState<ReadonlySet<string>>(() => new Set(content.requests.filter((request) => request.votedByDefault).map((request) => request.id)))
    const requests = useMemo(() => uniqueHbarAppUiFeedbackItems(content.requests), [content.requests])
    const visibleRequests = query.trim() ? requests.filter((request) => request.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : requests
    const toggleVote = (id: string) => {
        setVotedIds((current) => new Set(current.has(id) ? [...current].filter((value) => value !== id) : [...current, id]))
        onAction?.({variantId: spec.id, actionId: 'vote', value: id})
    }

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-feature-board-surface">
        <section className="hbar-app-ui-feedback-feature-board" aria-labelledby={`${spec.id}-title`}>
            <header className="hbar-app-ui-feedback-feature-header"><div><h2 id={`${spec.id}-title`}>{content.labels.title}</h2><p>{content.labels.description}</p></div><FeedbackButton tone="accent" type="button" onClick={() => onAction?.({variantId: spec.id, actionId: 'new-request'})}><Plus className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" />{content.labels.newRequest}</FeedbackButton></header>
            <div className="hbar-app-ui-feedback-feature-toolbar"><div className="hbar-app-ui-feedback-filter-tabs" role="radiogroup" aria-label={content.labels.sortGroup}>{content.sortOptions.map((option) => <button type="button" role="radio" aria-checked={sortId === option.id} className={sortId === option.id ? 'is-selected' : ''} key={option.id} onClick={() => setSortId(option.id)}>{option.label}</button>)}</div><label className="hbar-app-ui-feedback-search"><Search className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={content.labels.search} aria-label={content.labels.search} /></label></div>
            <div className="hbar-app-ui-feedback-request-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{visibleRequests.map((request) => {const voted = votedIds.has(request.id); return <article className="hbar-app-ui-feedback-request" key={request.id}><button type="button" className={voted ? 'is-voted' : ''} aria-label={voted ? content.labels.removeVote(request.title) : content.labels.voteFor(request.title)} onClick={() => toggleVote(request.id)}><ArrowUp className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm" aria-hidden="true" /><strong>{request.voteCount + (voted && !request.votedByDefault ? 1 : 0)}</strong></button><div className="hbar-app-ui-feedback-request-body"><header><h3>{request.title}</h3><FeedbackStatus label={request.statusLabel} tone={request.status === 'shipped' ? 'positive' : request.status === 'in-progress' ? 'warning' : 'neutral'} /></header><p>{request.description}</p><footer><span>{request.category}</span><span><MessageCircle className="hbar-app-ui-feedback-icon hbar-app-ui-icon-xs" aria-hidden="true" />{content.labels.commentCount(request.commentCount)}</span></footer></div></article>})}{!visibleRequests.length && <p className="hbar-app-ui-feedback-empty">{content.labels.empty}</p>}</div>
        </section>
    </FeedbackFrame>
}
