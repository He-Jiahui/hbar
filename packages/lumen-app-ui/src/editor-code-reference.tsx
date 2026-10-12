'use client'

import * as React from 'react'
import { FileCode2, Play, TriangleAlert, X } from 'lucide-react'
import type { LumenCodeFile, LumenCodeWorkspaceFooter, LumenEditorAction } from './editor'
import { tokenizeLumenCodeLine, uniqueLumenCodeFiles } from './editor-code-model'
import './editor-code-reference.css'

export interface LumenCodeReferenceContent {
  readonly labels: {
    readonly openFiles: string
    readonly closeFile: (name: string) => string
    readonly unsavedChanges: string
    readonly run: string
    readonly emptyFiles: string
    readonly codeOverview: string
    readonly warning: (count: number) => string
    readonly cursor: (line: number, column: number) => string
  }
  readonly files: readonly LumenCodeFile[]
  readonly activeFileId: string | undefined
  readonly activeLine?: number | undefined
  readonly cursor?: Readonly<{ line: number; column: number }> | undefined
  readonly footer: LumenCodeWorkspaceFooter
  /** The source region scrolls both axes; the footer and file strip remain outside it. */
  readonly paneStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximumLines: number }>
  readonly onSelectFile?: ((fileId: string) => void) | undefined
  readonly onCloseFile?: ((fileId: string) => void) | undefined
  readonly onRun?: (() => void) | undefined
  readonly onCursorChange?: ((fileId: string, line: number, column: number) => void) | undefined
}

export function LumenCodeReference({
  content,
  onAction,
}: {
  readonly content: LumenCodeReferenceContent
  readonly onAction: ((action: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const files = uniqueLumenCodeFiles(content.files)
  const active = files.find((file) => file.id === content.activeFileId) ?? files[0]
  const lines = active?.source.split('\n') ?? []
  return (
    <>
      <div className="lumen-code-reference-strip" aria-label={content.labels.openFiles}>
        {files.map((file) => (
          <div className={`lumen-code-reference-tab ${active?.id === file.id ? 'is-active' : ''}`} key={file.id}>
            <button
              type="button"
              className="lumen-code-reference-file"
              aria-current={active?.id === file.id ? 'true' : undefined}
              onClick={() => {
                content.onSelectFile?.(file.id)
                onAction?.({ actionId: 'file', value: file.id })
              }}
            >
              <FileCode2
                className="lumen-code-reference-icon"
                data-icon-tier="sm"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{file.name}</span>
              {file.dirty ? (
                <span className="lumen-code-reference-dirty" aria-label={content.labels.unsavedChanges} />
              ) : null}
            </button>
            <button
              type="button"
              className="lumen-code-reference-close"
              aria-label={content.labels.closeFile(file.name)}
              onClick={() => {
                content.onCloseFile?.(file.id)
                onAction?.({ actionId: 'close-file', value: file.id })
              }}
            >
              <X className="lumen-code-reference-icon" data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="lumen-code-reference-run"
          onClick={() => {
            content.onRun?.()
            onAction?.({ actionId: 'run' })
          }}
        >
          <Play className="lumen-code-reference-icon" data-icon-tier="sm" strokeWidth={1.5} aria-hidden="true" />
          {content.labels.run}
        </button>
      </div>
      <div className="lumen-code-reference-body">
        <div
          className="lumen-code-reference-scroll"
          data-hbar-app-ui-list-strategy={content.paneStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.paneStrategy.expectedMaximumLines}
        >
          {active ? (
            <div className="lumen-code-reference-lines">
              <div className="lumen-code-reference-gutter" aria-hidden="true">
                {lines.map((_, index) => (
                  <div key={index}>{index + 1}</div>
                ))}
              </div>
              <div className="lumen-code-reference-code" aria-label={active.name}>
                {lines.map((line, index) => (
                  <div
                    className={`lumen-code-reference-line ${content.activeLine === index + 1 ? 'is-active' : ''}`}
                    key={index}
                    onClick={() => active && content.onCursorChange?.(active.id, index + 1, line.length)}
                  >
                    {tokenizeLumenCodeLine(line).map((token, tokenIndex) => (
                      <span className={`lumen-code-reference-token-${token.kind}`} key={tokenIndex}>
                        {token.value}
                      </span>
                    ))}
                    {line === '' ? String.fromCharCode(160) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="lumen-code-reference-empty">{content.labels.emptyFiles}</p>
          )}
        </div>
        <div className="lumen-code-reference-overview" aria-label={content.labels.codeOverview}>
          {lines.map((line, index) => (
            <span key={index} style={{ inlineSize: `${Math.min(100, Math.max(8, line.trim().length * 2))}%` }} />
          ))}
        </div>
      </div>
      <footer className="lumen-code-reference-footer" role="contentinfo">
        <span>
          {content.cursor ? content.labels.cursor(content.cursor.line, content.cursor.column) : content.footer.cursor}
        </span>
        <span>{content.footer.language}</span>
        <span>{content.footer.encoding}</span>
        <span>{content.footer.indentation}</span>
        {content.footer.warningCount > 0 ? (
          <span className="lumen-code-reference-warning">
            <TriangleAlert
              className="lumen-code-reference-icon"
              data-icon-tier="sm"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {content.labels.warning(content.footer.warningCount)}
          </span>
        ) : null}
      </footer>
    </>
  )
}
