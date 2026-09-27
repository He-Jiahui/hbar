import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { CodeBlockCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
import { CODE_BLOCK_PREVIEW_LINES, messageCodeBlock } from './message-code-block-model'
import { registerSessionCodeBlock } from './session-code-block-dom'
import {
  sessionMarkdownRemarkPlugins,
  sessionMarkdownRehypePlugins,
  sessionMarkdownRehypeOptions,
} from './session-find-text'
import './message-code-block.css'

export interface MessageCodeContext {
  readonly sessionId: string
  readonly messageId: string
  readonly segmentId: string
  readonly labels: HbarCodeBlockLabels
  readonly owner?: object | undefined
  readonly clipboard?: MessageClipboardPort | null | undefined
}
const CodeContext = createContext<(MessageCodeContext & { readonly source: string }) | null>(null)

function MessageCodeBlock({
  code,
  context,
}: {
  readonly code: NonNullable<ReturnType<typeof messageCodeBlock>>
  readonly context: MessageCodeContext & { readonly source: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLDivElement>(null)
  const bodyId = useId()
  const collapsible = code.lines > CODE_BLOCK_PREVIEW_LINES
  // A different runtime/Host is a new reading owner, even if its IDs match.
  // Ordinary stream appends keep the user's explicit expansion untouched.
  useLayoutEffect(() => setExpanded(false), [context.owner])
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    return registerSessionCodeBlock({
      root: element,
      chrome: [header.current, footer.current].flatMap((item) => (item ? [item] : [])),
      revealHiddenTail: (ranges) => {
        const tail = element.querySelector<HTMLElement>('[data-code-tail]')
        if (!tail?.hidden || !ranges.some((range) => range.intersectsNode(tail))) return false
        // Find invokes this visual-only capability from its verified RAF reveal,
        // never during render. Commit before it remaps and measures the Range.
        flushSync(() => setExpanded(true))
        return !tail.hidden
      },
    })
  }, [collapsible, context.owner, context.source])
  return (
    <LumenFrame
      ref={root}
      className="hbar-message-code"
      data-code-occurrence={code.occurrenceId}
      data-expanded={expanded}
    >
      <LumenFrame ref={header} className="hbar-message-code-header" data-session-find-exclude="code-chrome">
        <LumenFrame className="hbar-message-code-metadata">
          <LumenText as="span">{context.labels.language(code.language)}</LumenText>
          <LumenText as="span">{context.labels.lines(code.lines)}</LumenText>
        </LumenFrame>
        <CodeBlockCopyAction {...context} occurrenceId={code.occurrenceId} text={code.text} />
      </LumenFrame>
      <LumenText as="pre" variant="code" className="hbar-message-code-body" id={bodyId} tabIndex={0}>
        <LumenText as="code" variant="code">
          {code.domText.slice(0, code.previewEnd)}
          {collapsible && (
            <LumenText as="span" variant="code" data-code-tail="" hidden={!expanded}>
              {code.domText.slice(code.previewEnd)}
            </LumenText>
          )}
        </LumenText>
      </LumenText>
      {collapsible && (
        <LumenFrame ref={footer} className="hbar-message-code-footer" data-session-find-exclude="code-chrome">
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

function MarkdownPre({ node, children, className }: ComponentProps<'pre'> & ExtraProps) {
  const context = useContext(CodeContext)
  const code = messageCodeBlock(node)
  return context && code ? (
    <MessageCodeBlock
      key={JSON.stringify([context.sessionId, context.messageId, context.segmentId, code.occurrenceId])}
      context={context}
      code={code}
    />
  ) : (
    <LumenText as="pre" className={className}>
      {children}
    </LumenText>
  )
}
const components = { pre: MarkdownPre }

/** One sanitized Markdown body shared by messages and Plan documents. */
export function MessageMarkdown({
  text,
  findSegmentId,
  code,
}: {
  readonly text: string
  readonly findSegmentId?: string | undefined
  readonly code?: MessageCodeContext | undefined
}) {
  const content = (
    <CodeContext.Provider value={code ? { ...code, source: text } : null}>
      <ReactMarkdown
        remarkPlugins={sessionMarkdownRemarkPlugins}
        rehypePlugins={sessionMarkdownRehypePlugins}
        remarkRehypeOptions={sessionMarkdownRehypeOptions}
        {...(code ? { components } : {})}
      >
        {text}
      </ReactMarkdown>
    </CodeContext.Provider>
  )
  return findSegmentId ? <LumenFrame data-session-find-segment={findSegmentId}>{content}</LumenFrame> : content
}
