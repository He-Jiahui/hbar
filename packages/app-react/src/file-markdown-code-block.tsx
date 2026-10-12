import './theme-bridge'
import { createContext, useContext, useId, useLayoutEffect, useState, type ComponentProps } from 'react'
import type { ExtraProps } from 'react-markdown'
import { LumenContentText, LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { CodeTextCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
import type { MessageClipboardPort } from './message-copy'
import { CODE_BLOCK_PREVIEW_LINES, markdownCodeBlock } from './markdown-code-block-model'
import { MarkdownDiagram } from './markdown-diagram'
import { isDiagramCode } from './markdown-diagram-model'
import { MarkdownCodeContent } from './markdown-code-content'
import './message-code-block.css'

export interface FileMarkdownCodeContext {
  readonly previewId: string
  readonly path: string
  readonly source: string
  readonly owner: object
  readonly labels: HbarCodeBlockLabels
  readonly clipboard?: MessageClipboardPort | null | undefined
}

export const FileCodeContext = createContext<FileMarkdownCodeContext | null>(null)

function FileCodeBlock({
  code,
  context,
}: {
  readonly code: NonNullable<ReturnType<typeof markdownCodeBlock>>
  readonly context: FileMarkdownCodeContext
}) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const collapsible = code.lines > CODE_BLOCK_PREVIEW_LINES
  useLayoutEffect(() => setExpanded(false), [context.owner])
  return (
    <LumenFrame className="hbar-message-code hbar-file-markdown-code" data-code-occurrence={code.occurrenceId}>
      <LumenFrame className="hbar-message-code-header">
        <LumenFrame className="hbar-message-code-metadata">
          <LumenContentText context="message.inline">{context.labels.language(code.language)}</LumenContentText>
          <LumenContentText context="message.inline">{context.labels.lines(code.lines)}</LumenContentText>
        </LumenFrame>
        <CodeTextCopyAction
          identity={['file', context.previewId, context.path, code.occurrenceId]}
          source={context.source}
          owner={context.owner}
          labels={context.labels}
          clipboard={context.clipboard}
          text={code.text}
        />
      </LumenFrame>
      <LumenText as="pre" variant="code" className="hbar-message-code-body" id={bodyId} tabIndex={0}>
        <MarkdownCodeContent
          source={code.domText}
          language={code.language}
          owner={context.owner}
          previewEnd={code.previewEnd}
          collapsible={collapsible}
          expanded={expanded}
        />
      </LumenText>
      {collapsible && (
        <LumenFrame className="hbar-message-code-footer">
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? context.labels.showLess : context.labels.showMore(code.lines - CODE_BLOCK_PREVIEW_LINES)}
          </LumenButton>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}

export function FileMarkdownPre({ node, children, className }: ComponentProps<'pre'> & ExtraProps) {
  const context = useContext(FileCodeContext)
  const code = markdownCodeBlock(node)
  if (context && code && isDiagramCode(code.language, code.text))
    return (
      <MarkdownDiagram
        key={JSON.stringify([context.previewId, context.path, code.occurrenceId])}
        className="hbar-file-markdown-code"
        text={code.text}
        sourceText={code.domText}
        owner={context.owner}
        labels={context.labels.diagram}
        occurrenceId={code.occurrenceId}
        find={false}
        copy={
          <CodeTextCopyAction
            identity={['file', context.previewId, context.path, code.occurrenceId]}
            source={context.source}
            owner={context.owner}
            labels={context.labels}
            clipboard={context.clipboard}
            text={code.text}
          />
        }
      />
    )
  // The provider mounts once per actual file-preview/runtime lifetime. Replacing
  // source text updates Copy's generation, without constructing a fake message.
  return context && code ? (
    <FileCodeBlock
      key={JSON.stringify([context.previewId, context.path, code.occurrenceId])}
      context={context}
      code={code}
    />
  ) : (
    <LumenText as="pre" className={className}>
      {children}
    </LumenText>
  )
}
