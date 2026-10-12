import './theme-bridge'
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import ReactMarkdown, { type ExtraProps } from 'react-markdown'
import { resourceReferenceSchema, parseResourceReference } from '@hbar/contracts/resources'
import { MessageResourceLink, useMessageResources, useMessageResourceSource } from './message-resource'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import type { MessageClipboardPort } from './message-copy'
import { CodeBlockCopyAction, type HbarCodeBlockLabels } from './code-block-copy-action'
import { CODE_BLOCK_PREVIEW_LINES, messageCodeBlock } from './message-code-block-model'
import { registerSessionCodeBlock } from './session-code-block-dom'
import { MarkdownDiagram } from './markdown-diagram'
import { isDiagramCode } from './markdown-diagram-model'
import { MarkdownCodeContent } from './markdown-code-content'
import {
  sessionMarkdownRemarkPlugins,
  sessionMarkdownRehypePlugins,
  sessionMarkdownRehypeOptions,
} from './session-find-text'
import './message-code-block.css'
import { MessageFileReferenceLink, type MessageFileReferenceContext } from './message-file-reference'
import { parseMessageFileReference } from './message-file-reference-model'
import { MessageImagePreview } from './message-image-preview'
import { imageLinkSource, MAX_MESSAGE_IMAGE_PREVIEWS } from './message-image-preview-model'

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
const ImageLinkContext = createContext(false)

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
        <MarkdownCodeContent
          source={code.domText}
          language={code.language}
          owner={context.owner}
          streaming={context.streaming}
          previewEnd={code.previewEnd}
          collapsible={collapsible}
          expanded={expanded}
        />
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
  const resources = useMessageResources()
  const files = useContext(FileContext)
  const code = useContext(CodeContext)
  const rawResource = node?.properties.dataHbarResource
  if (resources && files?.source && typeof rawResource === 'string') {
    let reference: unknown
    try {
      reference = JSON.parse(rawResource)
    } catch {
      reference = null
    }
    const parsed = resourceReferenceSchema.safeParse(reference)
    if (parsed.success && !files.streaming)
      return (
        <ImageLinkContext.Provider value={true}>
          <MessageResourceLink reference={parsed.data} context={files}>
            {props.children}
          </MessageResourceLink>
        </ImageLinkContext.Provider>
      )
    if (files.streaming) return props.children
  }
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
  const { ref: anchorRef, ...anchorProps } = props
  const compatibleRef = (node: HTMLAnchorElement | null) => {
    if (typeof anchorRef === 'function') {
      const cleanup = anchorRef(node)
      if (typeof cleanup === 'function')
        return () => {
          cleanup()
        }
    } else if (anchorRef) anchorRef.current = node
    return undefined
  }
  const anchor = (
    <ImageLinkContext.Provider value={true}>
      <LumenFrame
        as="a"
        {...anchorProps}
        ref={anchorRef ? compatibleRef : undefined}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer noopener' : undefined}
      />
    </ImageLinkContext.Provider>
  )
  const ordinal = node?.properties.dataHbarImageOrdinal
  const image =
    !code?.streaming && !files?.streaming && typeof ordinal === 'number' && ordinal < MAX_MESSAGE_IMAGE_PREVIEWS
      ? imageLinkSource(props.href)
      : null
  return image ? (
    <LumenFrame as="span" className="hbar-message-image-link">
      {anchor}
      <MessageImagePreview source={image} />
    </LumenFrame>
  ) : (
    anchor
  )
}

function MarkdownImage({ node, src, alt }: ComponentProps<'img'> & ExtraProps) {
  const resources = useMessageResources()
  const linked = useContext(ImageLinkContext)
  const code = useContext(CodeContext)
  const files = useContext(FileContext)
  if (resources && files?.source) {
    if (linked || files.streaming) return alt
    const reference = typeof src === 'string' ? parseResourceReference(src, true, 'authored-link') : null
    if (!reference) return alt
    return (
      <MessageResourceLink
        reference={reference.kind === 'web' ? { ...reference, image: true } : reference}
        context={files}
      >
        {alt ?? ''}
      </MessageResourceLink>
    )
  }
  const ordinal = node?.properties.dataHbarImageOrdinal
  return (
    <MessageImagePreview
      source={typeof src === 'string' ? src : undefined}
      alt={alt ?? undefined}
      linked={linked}
      preview={
        !code?.streaming && !files?.streaming && typeof ordinal === 'number' && ordinal < MAX_MESSAGE_IMAGE_PREVIEWS
      }
    />
  )
}

const linkComponents = { a: MarkdownLink, img: MarkdownImage }
const components = { ...linkComponents, pre: MarkdownPre }

function InlineContainer({ children }: { readonly children?: ReactNode }) {
  return <span>{children}</span>
}
function InlineLink({ children }: { readonly children?: ReactNode }) {
  return <span className="hbar-session-inline-link">{children}</span>
}
function InlineImage({ alt }: { readonly alt?: string | undefined }) {
  return <span>{alt}</span>
}
const inlineComponents = {
  p: InlineContainer,
  h1: InlineContainer,
  h2: InlineContainer,
  h3: InlineContainer,
  h4: InlineContainer,
  h5: InlineContainer,
  h6: InlineContainer,
  pre: InlineContainer,
  blockquote: InlineContainer,
  ul: InlineContainer,
  ol: InlineContainer,
  li: InlineContainer,
  table: InlineContainer,
  thead: InlineContainer,
  tbody: InlineContainer,
  tr: InlineContainer,
  th: InlineContainer,
  td: InlineContainer,
  a: InlineLink,
  img: InlineImage,
  input: () => null,
  hr: () => null,
  br: () => null,
}

/** A disclosure preview retains Markdown emphasis without nested controls or image requests. */
export function MessageInlineMarkdown({ text }: { readonly text: string }) {
  return (
    <LumenText as="span" className="hbar-session-inline-markdown">
      <ReactMarkdown
        remarkPlugins={sessionMarkdownRemarkPlugins}
        rehypePlugins={sessionMarkdownRehypePlugins}
        remarkRehypeOptions={sessionMarkdownRehypeOptions}
        components={inlineComponents}
      >
        {text}
      </ReactMarkdown>
    </LumenText>
  )
}

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
  const inheritedReferences = useMessageResourceSource()
  const references = fileReferences ?? inheritedReferences
  const content = (
    <FileContext.Provider value={references}>
      <CodeContext.Provider
        value={code ? { ...code, source: text, streaming: code.streaming ?? references?.streaming } : null}
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
