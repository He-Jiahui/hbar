'use client'

import * as React from 'react'
import {
  ArrowRight,
  BookOpen,
  CreditCard,
  KeyRound,
  MessageSquareText,
  Plug,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { LumenInput } from './forms'
import { LumenButton, LumenText } from './primitives'
import type { LumenSupportHelpContent, LumenSupportProps } from './support'
import type { LumenSupportHelpReferenceLayout } from './support/reference-content'
import './support-help-reference.css'

export interface LumenSupportHelpReferenceProps {
  readonly content: LumenSupportHelpContent
  readonly layout: LumenSupportHelpReferenceLayout
  readonly onAction?: LumenSupportProps['onAction'] | undefined
}

type TopicIconKind = LumenSupportHelpReferenceLayout['topicIcons'][number]['kind']

const topicIcons: Record<TopicIconKind, LucideIcon> = {
  accounts: KeyRound,
  billing: CreditCard,
  integrations: Plug,
  reports: BookOpen,
}

function report(onAction: LumenSupportHelpReferenceProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function TopicIcon({ kind }: { readonly kind: TopicIconKind | undefined }) {
  if (!kind) return null
  const Icon = topicIcons[kind]
  return (
    <span className="lumen-support-help-topic-icon" aria-hidden="true">
      <Icon className="lumen-support-help-icon lumen-support-help-icon-sm" aria-hidden="true" />
    </span>
  )
}

function EmptyMessage({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-support-help-empty" tone="muted">
      {children}
    </LumenText>
  )
}

export function LumenSupportHelpReference({ content, layout, onAction }: LumenSupportHelpReferenceProps) {
  const searchId = React.useId()
  const articlesHeadingId = React.useId()
  const flow = content.referenceFlow
  const topics = uniqueById(content.topics)
  const articles = uniqueById(content.articles)
  const query = flow?.query ?? ''
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleTopics = topics.filter((topic) =>
    `${topic.title} ${topic.detail}`.toLocaleLowerCase().includes(normalizedQuery),
  )
  const visibleArticles = articles.filter((article) => article.title.toLocaleLowerCase().includes(normalizedQuery))

  return (
    <div className="lumen-support-help-reference" data-hbar-app-ui-region="help-center">
      <header className="lumen-support-help-header">
        <LumenText as="h2" variant="title">
          {content.labels.title}
        </LumenText>
        <LumenText as="p" className="lumen-support-help-intro" tone="muted">
          {content.labels.detail}
        </LumenText>
      </header>

      <label className="lumen-support-help-search" htmlFor={searchId} data-hbar-app-ui-region="search">
        <Search className="lumen-support-help-icon lumen-support-help-icon-sm" aria-hidden="true" />
        <LumenInput
          id={searchId}
          aria-label={content.labels.search}
          autoComplete="off"
          data-hbar-app-ui-action="support-help:search"
          data-hbar-app-ui-field="help-search"
          onChange={(event) => flow?.onQueryChange(event.currentTarget.value)}
          placeholder={layout.labels.searchPlaceholder}
          readOnly={!flow}
          type="search"
          value={query}
          variant="plain"
        />
      </label>

      <section
        className="lumen-support-help-topics"
        aria-label={content.labels.topics}
        data-hbar-app-ui-region="topics"
      >
        <ul className="lumen-support-help-topic-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {visibleTopics.length ? (
            visibleTopics.map((topic) => {
              const iconKind = layout.topicIcons.find((icon) => icon.topicId === topic.id)?.kind
              return (
                <li key={topic.id}>
                  <LumenButton
                    className="lumen-support-help-topic"
                    variant="text"
                    aria-label={content.labels.open(topic.title)}
                    data-hbar-app-ui-action="support-help:open-topic"
                    onClick={() => report(onAction, 'support-help:open-topic', topic.id)}
                  >
                    <TopicIcon kind={iconKind} />
                    <span className="lumen-support-help-topic-copy">
                      <LumenText as="strong" variant="label">
                        {topic.title}
                      </LumenText>
                      <LumenText as="small" tone="muted" variant="supporting">
                        {topic.detail}
                      </LumenText>
                    </span>
                    <LumenText as="span" className="lumen-support-help-topic-count" tone="muted">
                      {topic.count}
                    </LumenText>
                  </LumenButton>
                </li>
              )
            })
          ) : (
            <li className="lumen-support-help-empty-item">
              <EmptyMessage>{content.labels.empty}</EmptyMessage>
            </li>
          )}
        </ul>
      </section>

      <section className="lumen-support-help-articles" aria-labelledby={articlesHeadingId}>
        <LumenText
          as="h3"
          id={articlesHeadingId}
          className="lumen-support-help-section-label"
          tone="muted"
          variant="supporting"
        >
          {content.labels.articles}
        </LumenText>
        <ul
          className="lumen-support-help-article-list"
          data-hbar-app-ui-region="articles"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        >
          {visibleArticles.length ? (
            visibleArticles.map((article) => (
              <li key={article.id}>
                <LumenButton
                  className="lumen-support-help-article"
                  variant="text"
                  aria-label={content.labels.open(article.title)}
                  data-hbar-app-ui-action="support-help:open-article"
                  onClick={() => report(onAction, 'support-help:open-article', article.id)}
                >
                  <LumenText as="span" className="lumen-support-help-article-title">
                    {article.title}
                  </LumenText>
                  {article.detail ? (
                    <LumenText as="span" className="lumen-support-help-article-count" tone="muted" variant="supporting">
                      {article.detail}
                    </LumenText>
                  ) : null}
                  <ArrowRight
                    className="lumen-support-help-icon lumen-support-help-icon-xs lumen-support-help-article-arrow"
                    aria-hidden="true"
                  />
                </LumenButton>
              </li>
            ))
          ) : (
            <li className="lumen-support-help-empty-item">
              <EmptyMessage>{content.labels.noArticles}</EmptyMessage>
            </li>
          )}
        </ul>
      </section>

      <footer className="lumen-support-help-contact" data-hbar-app-ui-region="contact">
        <span className="lumen-support-help-contact-icon" aria-hidden="true">
          <MessageSquareText className="lumen-support-help-icon lumen-support-help-icon-md" aria-hidden="true" />
        </span>
        <span className="lumen-support-help-contact-copy">
          <LumenText as="strong" variant="label">
            {content.labels.contactTitle}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {content.labels.contactDetail}
          </LumenText>
        </span>
        <LumenButton
          className="lumen-support-help-contact-action"
          tone="primary"
          data-hbar-app-ui-action="support-help:contact-support"
          onClick={() => report(onAction, 'support-help:contact-support')}
        >
          {content.labels.contact}
        </LumenButton>
      </footer>
    </div>
  )
}
