'use client'

import * as React from 'react'
import type { LumenAiChatReferenceViewProps, LumenAiChatCitationsReferenceContent } from './reference-content'
import { uniqueReferenceItems, ReferenceComposer, ReferenceFrame, ReferenceMessages } from './primitives'
import './reference-citations.css'

export function ReferenceCitationsChat({
  viewModel,
  variantId,
  className,
  onAction,
}: LumenAiChatReferenceViewProps<LumenAiChatCitationsReferenceContent>) {
  const { content } = viewModel
  const sources = uniqueReferenceItems(content.sources)
  const [sourcesOpen, setSourcesOpen] = React.useState(true)
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 48rem)')
    const updateForViewport = () => setSourcesOpen(!media.matches)
    updateForViewport()
    media.addEventListener('change', updateForViewport)
    return () => media.removeEventListener('change', updateForViewport)
  }, [])
  const selectSource = (id: string) => {
    viewModel.onSourceSelect?.(id)
    onAction?.({ actionId: 'source-select', value: id })
  }
  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-citations ${className ?? ''}`}
    >
      <div className="lumen-ai-chat-citations-layout">
        <aside className="lumen-ai-chat-citations-sources" aria-label={content.sourcesTitle}>
          <details open={sourcesOpen} onToggle={(event) => setSourcesOpen(event.currentTarget.open)}>
            <summary>{content.sourcesTitle}</summary>
            <h2>{content.sourcesTitle}</h2>
            <ul>
              {sources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    aria-pressed={content.selectedSourceId === source.id}
                    data-hbar-app-ui-action="source-select"
                    data-hbar-app-ui-target={source.id}
                    onClick={() => selectSource(source.id)}
                  >
                    <span>
                      {source.badge ? <small>{source.badge}</small> : null}
                      {source.label}
                    </span>
                    {source.detail ? <small>{source.detail}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
            {sources.length === 0 ? <p>{content.labels.empty}</p> : null}
          </details>
        </aside>
        <section className="lumen-ai-chat-citations-conversation" aria-label={content.title}>
          <header className="lumen-ai-chat-reference-header">
            <h1>{content.title}</h1>
            {content.subtitle ? <small>{content.subtitle}</small> : null}
          </header>
          <ReferenceMessages content={content} onAction={onAction} onSourceSelect={viewModel.onSourceSelect} />
          {content.composer ? (
            <ReferenceComposer
              composer={content.composer}
              onDraftChange={viewModel.onDraftChange}
              onRemoveAttachment={viewModel.onRemoveAttachment}
              onAction={onAction}
            />
          ) : null}
        </section>
      </div>
    </ReferenceFrame>
  )
}
export default ReferenceCitationsChat
