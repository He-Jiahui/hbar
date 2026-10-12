'use client'

import * as React from 'react'
import { Pencil, Columns2, Eye } from 'lucide-react'
import type { LumenEditorAction, LumenMarkdownMode } from './editor'
import { countLumenMarkdownWords, parseLumenReferenceMarkdown, type LumenMarkdownInline } from './editor-markdown-model'
import './editor-markdown-reference.css'

export interface LumenMarkdownReferenceContent {
  readonly labels: {
    readonly view: string
    readonly mode: (mode: LumenMarkdownMode) => string
    readonly summary: (words: number) => string
    readonly source: string
    readonly preview: string
    readonly sourceInput: string
  }
  readonly document: Readonly<{ id: string; fileName: string; source: string }>
  /** Both the editor and rendered output own native scrolling within the bounded workbench pane. */
  readonly paneStrategy: Readonly<{ kind: 'pane-scroll'; expectedMaximumWords: number }>
  readonly mode: LumenMarkdownMode
  readonly onModeChange?: ((documentId: string, mode: LumenMarkdownMode) => void) | undefined
  readonly onSourceChange?: ((documentId: string, source: string) => void) | undefined
}

function Inline({ tokens }: { readonly tokens: readonly LumenMarkdownInline[] }): React.ReactElement {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `${index}-${token.kind}`
        if (token.kind === 'strong') return <strong key={key}>{token.value}</strong>
        if (token.kind === 'emphasis') return <em key={key}>{token.value}</em>
        if (token.kind === 'code') return <code key={key}>{token.value}</code>
        return <React.Fragment key={key}>{token.value}</React.Fragment>
      })}
    </>
  )
}

function MarkdownPreview({ source }: { readonly source: string }): React.ReactElement {
  return (
    <div className="lumen-markdown-reference-prose">
      {parseLumenReferenceMarkdown(source).map((block, index) => {
        const key = `${index}-${block.kind}`
        if (block.kind === 'heading')
          return (
            <h3 key={key}>
              <Inline tokens={block.content} />
            </h3>
          )
        if (block.kind === 'subheading')
          return (
            <h4 key={key}>
              <Inline tokens={block.content} />
            </h4>
          )
        if (block.kind === 'quote')
          return (
            <p className="lumen-markdown-reference-quote" key={key}>
              <Inline tokens={block.content} />
            </p>
          )
        if (block.kind === 'paragraph')
          return (
            <p key={key}>
              <Inline tokens={block.content} />
            </p>
          )
        const items = block.items.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item.marker}`}>
            <span className="lumen-markdown-reference-marker" aria-hidden={block.kind === 'bullets' ? true : undefined}>
              {item.marker}
            </span>
            <span>
              <Inline tokens={item.content} />
            </span>
          </li>
        ))
        return block.kind === 'bullets' ? <ul key={key}>{items}</ul> : <ol key={key}>{items}</ol>
      })}
    </div>
  )
}

export function LumenMarkdownReference({
  content,
  onAction,
}: {
  readonly content: LumenMarkdownReferenceContent
  readonly onAction: ((action: LumenEditorAction) => void) | undefined
}): React.ReactElement {
  const modes = [
    { id: 'write', icon: Pencil },
    { id: 'split', icon: Columns2 },
    { id: 'preview', icon: Eye },
  ] as const
  return (
    <>
      <header className="lumen-markdown-reference-toolbar" role="banner">
        <div className="lumen-markdown-reference-file">
          <h2>{content.document.fileName}</h2>
          <p>{content.labels.summary(countLumenMarkdownWords(content.document.source))}</p>
        </div>
        <div className="lumen-markdown-reference-tabs" role="tablist" aria-label={content.labels.view}>
          {modes.map(({ id, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              aria-selected={content.mode === id}
              key={id}
              onClick={() => {
                content.onModeChange?.(content.document.id, id)
                onAction?.({ actionId: 'mode', value: id })
              }}
            >
              <Icon
                className="lumen-markdown-reference-icon"
                data-icon-tier="sm"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {content.labels.mode(id)}
            </button>
          ))}
        </div>
      </header>
      <div className={`lumen-markdown-reference-panes lumen-markdown-reference-mode-${content.mode}`}>
        {content.mode !== 'preview' ? (
          <div className="lumen-markdown-reference-pane lumen-markdown-reference-source">
            <div className="lumen-markdown-reference-pane-title">{content.labels.source}</div>
            <textarea
              aria-label={content.labels.sourceInput}
              value={content.document.source}
              readOnly={!content.onSourceChange}
              spellCheck={false}
              data-hbar-app-ui-list-strategy={content.paneStrategy.kind}
              data-hbar-app-ui-expected-maximum={content.paneStrategy.expectedMaximumWords}
              onChange={(event) => content.onSourceChange?.(content.document.id, event.currentTarget.value)}
            />
          </div>
        ) : null}
        {content.mode !== 'write' ? (
          <div className="lumen-markdown-reference-pane lumen-markdown-reference-preview">
            <div className="lumen-markdown-reference-pane-title">{content.labels.preview}</div>
            <div
              className="lumen-markdown-reference-scroll"
              data-hbar-app-ui-list-strategy={content.paneStrategy.kind}
              data-hbar-app-ui-expected-maximum={content.paneStrategy.expectedMaximumWords}
            >
              <MarkdownPreview source={content.document.source} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
