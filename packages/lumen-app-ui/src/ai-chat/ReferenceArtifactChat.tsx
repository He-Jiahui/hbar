'use client'

import * as React from 'react'
import { Copy, Download } from 'lucide-react'
import { ReferenceComposer, ReferenceFrame, ReferenceMessages, uniqueReferenceItems } from './primitives'
import type { LumenAiChatAction } from '../ai-chat'
import type { LumenAiChatArtifactReferenceContent, LumenAiChatReferenceViewProps } from './reference-content'
import './reference-artifact.css'

export function ReferenceArtifactChat({
  variantId,
  className,
  onAction,
  viewModel,
}: LumenAiChatReferenceViewProps<LumenAiChatArtifactReferenceContent>) {
  const { content } = viewModel
  const artifactDetails = React.useRef<HTMLDetailsElement>(null)
  const versions = uniqueReferenceItems(content.artifact.versions)
  const selectedVersionId =
    versions.find((version) => version.id === content.artifact.selectedVersionId)?.id ?? versions[0]?.id
  let artifactText = content.artifact.labels.empty
  if (selectedVersionId) {
    if (content.artifact.mode === 'code') {
      artifactText = content.artifact.code(selectedVersionId)
    } else {
      artifactText = content.artifact.document(selectedVersionId)
    }
  }

  function handleMessageAction(event: LumenAiChatAction) {
    if (event.actionId === 'artifact-open') {
      const details = artifactDetails.current
      if (details) {
        details.open = true
        details.querySelector('summary')?.focus()
        details.scrollIntoView({ block: 'nearest' })
      }
    }
    onAction?.(event)
  }

  return (
    <ReferenceFrame
      content={content}
      variantId={variantId}
      className={`lumen-ai-chat-reference-artifact ${className ?? ''}`}
    >
      <div className="lumen-ai-chat-artifact-layout">
        <section className="lumen-ai-chat-artifact-conversation">
          <header className="lumen-ai-chat-reference-header lumen-ai-chat-artifact-header">
            <h1>{content.title}</h1>
            {content.subtitle ? <small>{content.subtitle}</small> : null}
          </header>
          <div className="lumen-ai-chat-reference-conversation">
            <ReferenceMessages content={content} onAction={handleMessageAction} />
            {content.composer ? (
              <ReferenceComposer
                composer={content.composer}
                onDraftChange={viewModel.onDraftChange}
                onRemoveAttachment={viewModel.onRemoveAttachment}
                onAction={onAction}
              />
            ) : null}
          </div>
        </section>

        <aside
          className="lumen-ai-chat-artifact-aside"
          aria-label={content.artifact.fileName}
          data-hbar-app-ui-region="artifact"
        >
          <details ref={artifactDetails} className="lumen-ai-chat-artifact-details" open>
            <summary>{content.artifact.fileName}</summary>
            <div className="lumen-ai-chat-artifact-panel">
              <div className="lumen-ai-chat-artifact-toolbar">
                <button
                  type="button"
                  aria-label={content.artifact.labels.copy}
                  title={content.artifact.labels.copy}
                  data-hbar-app-ui-action="artifact-copy"
                  onClick={() => onAction?.({ actionId: 'artifact-copy', value: content.artifact.fileName })}
                >
                  <Copy aria-hidden="true" className="lumen-ai-chat-reference-icon" />
                </button>
                <button
                  type="button"
                  aria-label={content.artifact.labels.download}
                  title={content.artifact.labels.download}
                  data-hbar-app-ui-action="artifact-download"
                  onClick={() => onAction?.({ actionId: 'artifact-download', value: content.artifact.fileName })}
                >
                  <Download aria-hidden="true" className="lumen-ai-chat-reference-icon" />
                </button>
              </div>

              <div className="lumen-ai-chat-artifact-modes" role="group" aria-label={content.artifact.fileName}>
                <button
                  type="button"
                  aria-pressed={content.artifact.mode === 'code'}
                  data-hbar-app-ui-action="artifact-mode-code"
                  onClick={() => viewModel.onArtifactModeChange?.('code')}
                >
                  {content.artifact.labels.code}
                </button>
                <button
                  type="button"
                  aria-pressed={content.artifact.mode === 'document'}
                  data-hbar-app-ui-action="artifact-mode-document"
                  onClick={() => viewModel.onArtifactModeChange?.('document')}
                >
                  {content.artifact.labels.document}
                </button>
              </div>

              <div className="lumen-ai-chat-artifact-versions" role="group" aria-label={content.artifact.fileName}>
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    aria-pressed={version.id === selectedVersionId}
                    data-hbar-app-ui-action="artifact-version"
                    data-artifact-version-id={version.id}
                    onClick={() => viewModel.onArtifactVersionChange?.(version.id)}
                  >
                    {version.label}
                  </button>
                ))}
              </div>

              <pre
                className="lumen-ai-chat-artifact-output"
                data-hbar-app-ui-region="artifact-content"
                data-artifact-mode={content.artifact.mode}
              >
                <code>{artifactText}</code>
              </pre>
            </div>
          </details>
        </aside>
      </div>
    </ReferenceFrame>
  )
}

export default ReferenceArtifactChat
