'use client'

import * as React from 'react'
import { FileText, RotateCcw, Upload, X } from 'lucide-react'
import type { LumenPromptReferenceViewProps, LumenPromptUploadReferenceContent } from './reference-content'
import { PromptComposer, PromptFrame, uniquePromptItems } from './primitives'
import './reference-upload.css'

export function ReferenceUploadPrompt({
  variantId,
  className,
  viewModel,
  onAction,
}: LumenPromptReferenceViewProps<LumenPromptUploadReferenceContent>) {
  const { content } = viewModel
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const uploads = uniquePromptItems(content.uploads)
  const reportAction = viewModel.onAction ?? onAction

  const reportFileCount = (count: number) => {
    if (count > 0) {
      reportAction?.({ actionId: 'files-selected', value: String(count) })
    }
  }

  return (
    <PromptFrame content={content} variantId={variantId} className={className}>
      <div className="lumen-prompt-upload-reference">
        {content.composer ? (
          <PromptComposer
            composer={content.composer}
            onDraftChange={viewModel.onDraftChange}
            onRemoveAttachment={viewModel.onRemoveAttachment}
            onAction={reportAction}
          />
        ) : null}

        {uploads.length ? (
          <ul
            className="lumen-prompt-upload-reference-list"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            data-expected-maximum={content.listStrategy.expectedMaximum}
          >
            {uploads.map((upload) => (
              <li
                className="lumen-prompt-upload-reference-row"
                data-failed={upload.failed || undefined}
                data-hbar-app-ui-item-id={upload.id}
                key={upload.id}
              >
                <FileText aria-hidden="true" className="lumen-prompt-upload-reference-icon" />
                <span className="lumen-prompt-upload-reference-name">{upload.name}</span>
                <span className="lumen-prompt-upload-reference-detail" role={upload.failed ? 'status' : undefined}>
                  {upload.detail}
                </span>
                {upload.failed ? (
                  <button
                    className="lumen-prompt-upload-reference-icon-button"
                    type="button"
                    aria-label={content.labels.retry(upload.name)}
                    title={content.labels.retry(upload.name)}
                    disabled={!reportAction}
                    onClick={() => reportAction?.({ actionId: 'retry-upload', value: upload.id })}
                  >
                    <RotateCcw aria-hidden="true" className="lumen-prompt-upload-reference-icon" />
                  </button>
                ) : null}
                <button
                  className="lumen-prompt-upload-reference-icon-button"
                  type="button"
                  aria-label={content.labels.remove(upload.name)}
                  title={content.labels.remove(upload.name)}
                  disabled={!viewModel.onRemoveUpload}
                  onClick={() => viewModel.onRemoveUpload?.(upload.id)}
                >
                  <X aria-hidden="true" className="lumen-prompt-upload-reference-icon" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lumen-prompt-upload-reference-empty">{content.labels.empty}</p>
        )}

        <input
          ref={fileInputRef}
          className="lumen-prompt-upload-reference-file-input"
          type="file"
          multiple
          aria-label={content.labels.browse}
          tabIndex={-1}
          onChange={(event) => {
            reportFileCount(event.currentTarget.files?.length ?? 0)
            event.currentTarget.value = ''
          }}
        />
        <button
          className="lumen-prompt-upload-reference-drop"
          type="button"
          title={content.labels.drop}
          aria-label={content.labels.browse}
          data-dragging={dragging || undefined}
          disabled={!reportAction}
          onClick={() => fileInputRef.current?.click()}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragging(true)
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget
            if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
              setDragging(false)
            }
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            reportFileCount(event.dataTransfer.files.length)
          }}
        >
          <Upload aria-hidden="true" className="lumen-prompt-upload-reference-icon" />
          <span>{content.labels.browse}</span>
        </button>
      </div>
    </PromptFrame>
  )
}

export default ReferenceUploadPrompt
