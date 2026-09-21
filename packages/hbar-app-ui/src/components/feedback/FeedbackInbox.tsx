import { LumenButton, LumenTextarea } from '@lumen/app-ui'
import {Archive, MessageCircle, Plus, Tag} from 'lucide-react'
import {useMemo, useState} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {selectHbarAppUiFeedbackItem, uniqueHbarAppUiFeedbackItems, type HbarAppUiFeedbackInboxContent} from './FeedbackContent'
import {FeedbackAvatar, FeedbackButton, FeedbackFrame, FeedbackStatus} from './FeedbackPrimitives'

export function FeedbackInbox({spec, onAction, content}: HbarAppUiVariantProps & {readonly content: HbarAppUiFeedbackInboxContent}) {
    const [selectedId, setSelectedId] = useState(content.initialThreadId)
    const [archived, setArchived] = useState(false)
    const threads = useMemo(() => uniqueHbarAppUiFeedbackItems(content.threads), [content.threads])
    const selectedThread = selectHbarAppUiFeedbackItem(threads, selectedId)
    const selectedDetail = content.details.find((detail) => detail.threadId === selectedThread?.id)
    const archive = () => {
        setArchived(true)
        if (selectedThread) onAction?.({variantId: spec.id, actionId: 'archive', value: selectedThread.id})
    }

    return <FeedbackFrame spec={spec} onAction={onAction} className="hbar-app-ui-feedback-inbox-surface">
        <section className="hbar-app-ui-feedback-inbox" aria-labelledby={`${spec.id}-title`}>
            <header className="hbar-app-ui-feedback-inbox-header">
                <div><h2 id={`${spec.id}-title`}>{content.labels.title}</h2><p>{content.labels.summary}</p></div>
                <FeedbackButton type="button" onClick={archive} disabled={archived}><Archive
                    className="hbar-app-ui-feedback-icon hbar-app-ui-icon-sm"
                    aria-hidden="true"/>{content.labels.archiveRead}</FeedbackButton></header>
            <div className="hbar-app-ui-feedback-inbox-layout">
                <nav className="hbar-app-ui-feedback-thread-list" aria-label={content.labels.title}
                     data-hbar-app-ui-list-strategy={content.listStrategy.kind}>{threads.map((thread) => <LumenButton
                    type="button" className={selectedThread?.id === thread.id ? 'is-selected' : ''}
                    aria-label={content.labels.openThread(thread.subject)} key={thread.id} onClick={() => {
                    setSelectedId(thread.id);
                    onAction?.({variantId: spec.id, actionId: 'open-thread', value: thread.id})
                }}><span className="hbar-app-ui-feedback-thread-heading">{thread.unread &&
                    <i aria-hidden="true"/>}{thread.sender}<small>{thread.relativeTime}</small></span><span>{thread.subject}</span><small><MessageCircle
                    className="hbar-app-ui-feedback-icon hbar-app-ui-icon-xs" aria-hidden="true"/>{thread.account}
                </small></LumenButton>)}{!threads.length &&
                    <p className="hbar-app-ui-feedback-empty">{content.labels.empty}</p>}</nav>
                {selectedThread && selectedDetail && <main className="hbar-app-ui-feedback-thread-detail">
                    <header>
                        <div><FeedbackAvatar initials={selectedThread.initials} label={selectedThread.sender}/>
                            <div>
                                <strong>{selectedThread.sender}</strong><small>{content.labels.threadMeta(selectedThread.account, selectedThread.channel, selectedThread.relativeTime)}</small>
                            </div>
                        </div>
                        <FeedbackStatus label={selectedDetail.sentiment} tone="danger"/></header>
                    <h3>{selectedThread.subject}</h3><p
                    className="hbar-app-ui-feedback-thread-body">{selectedDetail.body}</p>
                    <div className="hbar-app-ui-feedback-tag-row">{selectedDetail.tags.map((tag) => <span key={tag}><Tag
                        className="hbar-app-ui-feedback-icon hbar-app-ui-icon-xs"
                        aria-hidden="true"/>{tag}</span>)}<FeedbackButton type="button" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'add-tag',
                        value: selectedThread.id
                    })}><Plus className="hbar-app-ui-feedback-icon hbar-app-ui-icon-xs"
                              aria-hidden="true"/>{content.labels.addTag}</FeedbackButton></div>
                    <dl className="hbar-app-ui-feedback-inbox-metrics">{selectedDetail.metrics.map((metric) => <div
                        key={metric.id}>
                        <dt>{metric.label}</dt>
                        <dd>{metric.value}</dd>
                    </div>)}</dl>
                    <section className="hbar-app-ui-feedback-related">
                        <h4>{content.labels.detailLabel}</h4>{selectedDetail.related.map((item) => <p
                        key={item.id}>{item.text}<small>{item.author}</small></p>)}</section>
                    <LumenTextarea placeholder={content.labels.internalNotePlaceholder}
                              aria-label={content.labels.internalNotePlaceholder}/>
                    <footer className="hbar-app-ui-feedback-inbox-actions"><FeedbackButton type="button"
                                                                                           onClick={() => onAction?.({
                                                                                               variantId: spec.id,
                                                                                               actionId: 'reply',
                                                                                               value: selectedThread.id
                                                                                           })}>{content.labels.reply}</FeedbackButton><FeedbackButton
                        type="button" onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'create-issue',
                        value: selectedThread.id
                    })}>{content.labels.createIssue}</FeedbackButton><FeedbackButton type="button"
                                                                                     onClick={archive}>{content.labels.archive}</FeedbackButton>
                    </footer>
                </main>}</div>
        </section>
    </FeedbackFrame>
}
