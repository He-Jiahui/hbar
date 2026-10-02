import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { flushSync } from 'react-dom'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { CodeBlockCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
import { CODE_BLOCK_PREVIEW_LINES, messageCodeBlock } from './message-code-block-model'
import { registerSessionCodeBlock } from './session-code-block-dom'
import { MarkdownDiagram } from './markdown-diagram'
import { isDiagramCode } from './markdown-diagram-model'
import {
  sessionMarkdownRemarkPlugins,
  sessionMarkdownRehypePlugins,
  sessionMarkdownRehypeOptions,
} from './session-find-text'
import './message-code-block.css'
import { MessageFileReferenceLink, type MessageFileReferenceContext } from './message-file-reference'
import { parseMessageFileReference } from './message-file-reference-model'

export interface MessageCodeContext {
  readonly sessionId: string
  readonly messageId: string
  readonly segmentId: string
  readonly labels: HbarCodeBlockLabels
  readonly streaming?: boolean | undefined
  readonly owner?: object | undefined
  readonly clipboard?: MessageClipboardPort | null | undefined
}
const CodeContext = createContext<
  (MessageCodeContext & { readonly source: string; readonly streaming?: boolean | undefined }) | null
>(null)
const FileContext = createContext<MessageFileReferenceContext | null>(null)

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
  if (context && code && isDiagramCode(code.language, code.text))
    return (
      <MarkdownDiagram
        key={JSON.stringify([context.sessionId, context.messageId, context.segmentId, code.occurrenceId])}
        text={code.text}
        sourceText={code.domText}
        owner={context.owner}
        streaming={context.streaming}
        labels={context.labels.diagram}
        occurrenceId={code.occurrenceId}
        find
        copy={<CodeBlockCopyAction {...context} occurrenceId={code.occurrenceId} text={code.text} />}
      />
    )
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
function MarkdownLink({ node, ...props }: ComponentProps<'a'> & ExtraProps) {
  const files = useContext(FileContext)
  const path = node?.properties.dataHbarFilePath
  if (typeof path === 'string') {
    const line = node?.properties.dataHbarFileLine
    const column = node?.properties.dataHbarFileColumn
    const reference = parseMessageFileReference(`${path}${line ? `:${line}${column ? `:${column}` : ''}` : ''}`)
    if (!reference || !files || (files.streaming && node?.properties.dataHbarFileKind === 'prose'))
      return props.children
    return (
      <MessageFileReferenceLink reference={reference} context={files}>
        {props.children}
      </MessageFileReferenceLink>
    )
  }
  // The parser's AST node is not a DOM attribute. Retain the sanitized anchor
  // metadata (including footnote navigation) without passing that object on.
  void node
  const external = props.href !== undefined && /^https?:\/\//i.test(props.href)
  // Unsupported local/absolute paths must not accidentally navigate the app's
  // browser route. File capabilities are explicit; footnotes and mail stay links.
  if (props.href && !external && !props.href.startsWith('#') && !/^mailto:/i.test(props.href)) return props.children
  return <a {...props} target={external ? '_blank' : undefined} rel={external ? 'noreferrer noopener' : undefined} />
}

const linkComponents = { a: MarkdownLink }
const components = { ...linkComponents, pre: MarkdownPre }

/** One sanitized Markdown body shared by messages and Plan documents. */
export function MessageMarkdown({
  text,
  findSegmentId,
  code,
  fileReferences,
}: {
  readonly text: string
  readonly findSegmentId?: string | undefined
  readonly code?: MessageCodeContext | undefined
  readonly fileReferences?: MessageFileReferenceContext | undefined
}) {
  const content = (
    <FileContext.Provider value={fileReferences ?? null}>
      <CodeContext.Provider
        value={code ? { ...code, source: text, streaming: code.streaming ?? fileReferences?.streaming } : null}
      >
        <ReactMarkdown
          remarkPlugins={sessionMarkdownRemarkPlugins}
          rehypePlugins={sessionMarkdownRehypePlugins}
          remarkRehypeOptions={sessionMarkdownRehypeOptions}
          components={code ? components : linkComponents}
        >
          {text}
        </ReactMarkdown>
      </CodeContext.Provider>
    </FileContext.Provider>
  )
  return findSegmentId ? <LumenFrame data-session-find-segment={findSegmentId}>{content}</LumenFrame> : content
}
