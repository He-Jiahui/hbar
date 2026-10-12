'use client'

import * as React from 'react'
import { ArrowRight, FileText, Send, Sparkles, X } from 'lucide-react'
import { LumenTextarea } from './forms'
import { LumenButton, LumenText } from './primitives'
import type { LumenSupportAssistantContent, LumenSupportProps } from './support'
import type { LumenSupportAssistantReferenceLayout } from './support/reference-content'
import './support-assistant-reference.css'

export interface LumenSupportAssistantReferenceProps {
  readonly content: LumenSupportAssistantContent
  readonly layout: LumenSupportAssistantReferenceLayout
  readonly onAction?: LumenSupportProps['onAction'] | undefined
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function LumenSupportAssistantReference({ content, layout, onAction }: LumenSupportAssistantReferenceProps) {
  const flow = content.referenceFlow
  const isOpen = flow?.open ?? layout.initialOpen
  const messages = uniqueById(content.messages)
  const articles = uniqueById(content.articles)
  const actions = uniqueById(content.actions)
  const draft = flow?.draft ?? ''
  const pending = flow?.pending ?? false
  const sendDisabled = !flow || pending || flow.limitReached === true || !draft.trim()

  function changeOpen(nextOpen: boolean): void {
    if (flow) {
      flow.onOpenChange(nextOpen)
      return
    }
    onAction?.({
      actionId: nextOpen ? 'assistant:open' : 'assistant:close',
      value: layout.conversationId,
    })
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!flow || sendDisabled) return
    flow.onSubmit()
  }

  if (!isOpen) {
    return (
      <section className="lumen-support-assistant-reference-closed">
        <LumenButton
          indicator="none"
          data-hbar-app-ui-action="assistant:open"
          aria-expanded={false}
          onClick={() => changeOpen(true)}
        >
          {content.labels.trigger}
        </LumenButton>
      </section>
    )
  }

  return (
    <section className="lumen-support-assistant-reference" aria-label={content.labels.title}>
      <header className="lumen-support-assistant-reference-header">
        <span className="lumen-support-assistant-reference-mark" aria-hidden="true">
          <Sparkles className="lumen-support-assistant-reference-icon lumen-support-assistant-reference-icon-md" />
        </span>
        <div className="lumen-support-assistant-reference-heading">
          <LumenText as="h2" variant="label">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted" variant="supporting">
            {content.labels.detail}
          </LumenText>
        </div>
        <LumenButton
          className="lumen-support-assistant-reference-close"
          variant="text"
          indicator="none"
          aria-label={content.labels.close}
          data-hbar-app-ui-action="assistant:close"
          onClick={() => changeOpen(false)}
        >
          <X
            className="lumen-support-assistant-reference-icon lumen-support-assistant-reference-icon-md"
            aria-hidden="true"
          />
        </LumenButton>
      </header>

      <main className="lumen-support-assistant-reference-main">
        <div
          className="lumen-support-assistant-reference-transcript"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          data-hbar-app-ui-region="assistant-transcript"
        >
          {messages.length ? (
            <div
              className="lumen-support-assistant-reference-messages"
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.own
                      ? 'lumen-support-assistant-reference-message is-own'
                      : 'lumen-support-assistant-reference-message'
                  }
                  data-hbar-app-ui-item-id={message.id}
                >
                  <LumenText as="p">{message.body}</LumenText>
                  {message.status ? (
                    <LumenText as="small" tone="muted" variant="supporting" role="status">
                      {message.status}
                    </LumenText>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <LumenText as="p" className="lumen-support-assistant-reference-empty" tone="muted">
              {content.labels.empty}
            </LumenText>
          )}

          {articles.length ? (
            <ul className="lumen-support-assistant-reference-articles">
              {articles.map((article) => (
                <li key={article.id} data-hbar-app-ui-item-id={article.id}>
                  <LumenButton
                    variant="text"
                    indicator="none"
                    data-hbar-app-ui-action="assistant:open-article"
                    onClick={() =>
                      onAction?.({
                        actionId: 'assistant:open-article',
                        value: JSON.stringify({
                          conversationId: layout.conversationId,
                          articleId: article.id,
                          outcome: 'intent-only',
                        }),
                      })
                    }
                  >
                    <FileText
                      className="lumen-support-assistant-reference-icon lumen-support-assistant-reference-icon-sm"
                      aria-hidden="true"
                    />
                    {article.title}
                  </LumenButton>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {actions.length ? (
          <div className="lumen-support-assistant-reference-actions">
            {actions.map((action) => (
              <LumenButton
                key={action.id}
                variant="outlined"
                indicator="none"
                data-hbar-app-ui-action="assistant:request-action"
                onClick={() =>
                  onAction?.({
                    actionId: 'assistant:request-action',
                    value: JSON.stringify({
                      conversationId: layout.conversationId,
                      actionId: action.id,
                      outcome: 'intent-only',
                    }),
                  })
                }
              >
                {action.label}
                {action.id === 'talk-to-person' ? (
                  <ArrowRight
                    className="lumen-support-assistant-reference-icon lumen-support-assistant-reference-icon-sm"
                    aria-hidden="true"
                  />
                ) : null}
              </LumenButton>
            ))}
          </div>
        ) : null}

        <form className="lumen-support-assistant-reference-composer" aria-busy={pending || undefined} onSubmit={submit}>
          <LumenTextarea
            className="lumen-support-assistant-reference-input"
            aria-label={layout.labels.inputLabel}
            data-hbar-app-ui-field="assistant-message"
            disabled={!flow || pending}
            placeholder={content.labels.placeholder}
            rows={3}
            value={draft}
            onChange={(event) => flow?.onDraftChange(event.currentTarget.value)}
          />
          <footer>
            <LumenText as="small" tone="muted" variant="supporting">
              {content.labels.disclaimer}
            </LumenText>
            <LumenButton
              type="submit"
              tone="primary"
              indicator="none"
              loading={pending}
              disabled={sendDisabled}
              aria-label={content.labels.send}
              data-hbar-app-ui-action="assistant:send"
            >
              <Send
                className="lumen-support-assistant-reference-icon lumen-support-assistant-reference-icon-sm"
                aria-hidden="true"
              />
            </LumenButton>
          </footer>
          {flow?.error ? (
            <LumenText as="p" className="lumen-support-assistant-reference-feedback" tone="danger" role="alert">
              {flow.error}
            </LumenText>
          ) : flow?.feedback ? (
            <LumenText
              as="p"
              className="lumen-support-assistant-reference-feedback"
              tone="muted"
              role="status"
              aria-live="polite"
            >
              {flow.feedback}
            </LumenText>
          ) : null}
        </form>
      </main>
    </section>
  )
}
