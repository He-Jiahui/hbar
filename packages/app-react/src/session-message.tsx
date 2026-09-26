import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GitFork,
  LoaderCircle,
  RotateCcw,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import {
  copyMessageText,
  messageCopyText,
  type MessageClipboardPort,
  type MessageCopyInput,
  type MessageCopyResult,
} from './message-copy'
import {
  buildMessageRows,
  thinkingPreview,
  toolInputText,
  type SessionMessageBlock,
  type SessionMessageRow,
  type SessionToolCall,
  type SessionToolResult,
  type SessionToolRow,
} from './session-message-model'
import './session-message.css'
import { ToolResultCopyAction, type HbarToolResultCopyLabels } from './tool-result-copy-action'

export interface HbarMessageActivitySummary {
  readonly thinkingCount: number
  readonly toolCounts: readonly { readonly name: string; readonly count: number }[]
  readonly failedCount: number
}

export interface HbarMessageBlocksLabels {
  readonly thinking: string
  readonly thought: string
  readonly activity: (summary: HbarMessageActivitySummary) => string
  readonly tool: (name: string) => string
  readonly failed: string
  readonly resultAvailable: string
  readonly awaitingResult: string
  readonly input: string
  readonly output: string
  readonly toolResultCopy: HbarToolResultCopyLabels
  readonly emptyOutput: string
  readonly unavailableInput: string
  readonly showFullContent: string
  readonly showLessContent: string
  readonly attachment: (kind: 'image' | 'file', name: string) => string
}

export interface HbarMessageToolPresentation {
  readonly icon: 'file' | 'terminal' | 'search' | 'tool'
  readonly summary?: string
  readonly input?: { readonly format: 'command' | 'text'; readonly text: string }
}

export interface HbarMessageBlocksProps {
  readonly sessionId: string
  readonly messageId: string
  readonly blocks: readonly SessionMessageBlock[]
  readonly results?: readonly SessionToolResult[]
  readonly streaming?: boolean
  readonly labels: HbarMessageBlocksLabels
  /** Local read-only output actions remain available in archived history. */
  readonly clipboard?: MessageClipboardPort | null | undefined
  /** Domain-owned display metadata, not a hard-coded plugin/tool catalog in the view. */
  readonly describeTool?: (call: SessionToolCall) => HbarMessageToolPresentation
  /** Domain-owned text rendering, keyed to original block identity; non-text rows retain their order. */
  readonly renderText?: (row: Extract<SessionMessageRow, { kind: 'text' }>) => ReactNode
  /** Decisions are siblings after their tool disclosure, never inside its collapsed details. */
  readonly toolDecisions?: ReadonlyMap<string, ReactNode> | undefined
}

export interface HbarMessageActionLabels {
  readonly copy: string
  readonly copyMessage?: string
  readonly copying: string
  readonly copied: string
  readonly copyFailed: string
  readonly copyUnavailable: string
  readonly retryCopy: string
}

export interface HbarMessageActionBarProps extends MessageCopyInput {
  readonly labels: HbarMessageActionLabels
  readonly copyLabel?: string | undefined
  readonly clipboard?: MessageClipboardPort | null
  readonly metadata?: ReactNode
  /** The owner selects eligible user/final assistant messages and owns the Host receipt. */
  readonly fork?: HbarMessageForkAction | undefined
}

export interface HbarMessageForkTarget {
  readonly sessionId: string
  readonly messageId: string
}

export interface HbarMessageForkAction {
  /** Host-localized accessible label for this status, including retry/recheck. */
  readonly label: string
  readonly status: 'ready' | 'submitting' | 'unknown' | 'failed'
  /** Host-localized failure detail; never pass a raw Host error or payload. */
  readonly error?: string | null
  readonly onFork: (target: HbarMessageForkTarget) => void
  readonly onReconcile?: (target: HbarMessageForkTarget) => void
}

/** An unknown write may only recheck its original receipt, never submit another Fork. */
export function invokeMessageForkAction(action: HbarMessageForkAction, target: HbarMessageForkTarget): boolean {
  if (action.status === 'ready' || action.status === 'failed') {
    action.onFork(target)
    return true
  }
  if (action.status === 'unknown' && action.onReconcile) {
    action.onReconcile(target)
    return true
  }
  return false
}

export function MessageMarkdown({ text }: { readonly text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
      {text}
    </ReactMarkdown>
  )
}

function Disclosure({
  label,
  preview,
  status,
  icon,
  children,
  defaultOpen = false,
  className,
  failed = false,
}: {
  readonly label: string
  readonly preview?: string | undefined
  readonly status?: string | undefined
  readonly icon: typeof Brain
  readonly children: ReactNode
  readonly defaultOpen?: boolean
  readonly className?: string | undefined
  readonly failed?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <LumenFrame
      className={['hbar-session-disclosure', className].filter(Boolean).join(' ')}
      data-failed={failed || undefined}
    >
      <LumenButton
        variant="text"
        indicator="none"
        size="s"
        className="hbar-session-disclosure-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <LumenIcon icon={icon} tier="sm" />
        <LumenText as="span" className="hbar-session-disclosure-label">
          {label}
        </LumenText>
        {preview ? (
          <LumenText as="span" className="hbar-session-disclosure-preview">
            {preview}
          </LumenText>
        ) : null}
        {status ? (
          <LumenText as="span" className="hbar-session-disclosure-status">
            {status}
          </LumenText>
        ) : null}
        <LumenIcon icon={open ? ChevronDown : ChevronRight} tier="sm" />
      </LumenButton>
      <LumenFrame id={id} className="hbar-session-disclosure-content" hidden={!open}>
        {open ? children : null}
      </LumenFrame>
    </LumenFrame>
  )
}

const DETAIL_PREVIEW_CHARACTERS = 12_000

function DetailText({
  text,
  labels,
  command = false,
}: {
  readonly text: string
  readonly labels: HbarMessageBlocksLabels
  readonly command?: boolean
}) {
  const [full, setFull] = useState(false)
  const long = text.length > DETAIL_PREVIEW_CHARACTERS
  return (
    <LumenFrame className="hbar-session-detail-text" data-format={command ? 'command' : undefined}>
      <LumenText as="pre" tabIndex={0}>
        {long && !full ? `${text.slice(0, DETAIL_PREVIEW_CHARACTERS)}…` : text}
      </LumenText>
      {long ? (
        <LumenButton variant="text" indicator="none" size="s" onClick={() => setFull(!full)} aria-expanded={full}>
          {full ? labels.showLessContent : labels.showFullContent}
        </LumenButton>
      ) : null}
    </LumenFrame>
  )
}

function ToolRow({
  row,
  labels,
  describeTool,
  sessionId,
  messageId,
  clipboard,
}: {
  readonly row: SessionToolRow
  readonly labels: HbarMessageBlocksLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool'] | undefined
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: HbarMessageBlocksProps['clipboard']
}) {
  const presentation = row.call && describeTool ? describeTool(row.call) : undefined
  const icon =
    presentation?.icon === 'terminal'
      ? Terminal
      : presentation?.icon === 'file'
        ? FileText
        : presentation?.icon === 'search'
          ? Search
          : Wrench
  const status = row.result ? (row.result.isError ? labels.failed : labels.resultAvailable) : labels.awaitingResult
  return (
    <Disclosure
      label={labels.tool(row.name)}
      preview={presentation?.summary}
      status={status}
      icon={icon}
      className="hbar-session-tool"
      defaultOpen={Boolean(row.result?.isError)}
      failed={Boolean(row.result?.isError)}
    >
      {row.call ? (
        <LumenFrame className="hbar-session-tool-section">
          <LumenText as="span" className="hbar-session-tool-heading">
            {labels.input}
          </LumenText>
          <DetailText
            text={presentation?.input?.text ?? toolInputText(row.call.args, labels.unavailableInput)}
            labels={labels}
            command={presentation?.input?.format === 'command'}
          />
        </LumenFrame>
      ) : null}
      {row.result ? (
        <LumenFrame
          className="hbar-session-tool-section"
          data-tool-call-id={row.result.callId}
          data-tool-name={row.result.name}
        >
          <LumenFrame className="hbar-session-tool-result-heading">
            <LumenText as="span" className="hbar-session-tool-heading">
              {labels.output}
            </LumenText>
            <ToolResultCopyAction
              sessionId={sessionId}
              messageId={messageId}
              callId={row.result.callId}
              toolName={row.result.name}
              text={row.result.text}
              labels={labels.toolResultCopy}
              clipboard={clipboard}
            />
          </LumenFrame>
          <DetailText
            text={row.result.text || labels.emptyOutput}
            labels={labels}
            command={presentation?.input?.format === 'command'}
          />
        </LumenFrame>
      ) : null}
    </Disclosure>
  )
}

type ActivityRow = Extract<SessionMessageRow, { kind: 'thinking' | 'tool' }>

function Activity({
  rows,
  streaming,
  labels,
  describeTool,
  sessionId,
  messageId,
  clipboard,
}: {
  readonly rows: readonly ActivityRow[]
  readonly streaming: boolean
  readonly labels: HbarMessageBlocksLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool'] | undefined
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: HbarMessageBlocksProps['clipboard']
}) {
  const [pinnedOpen, setPinnedOpen] = useState<boolean | null>(null)
  const contentId = useId()
  const open = pinnedOpen ?? streaming
  const toolCounts = new Map<string, number>()
  for (const row of rows) if (row.kind === 'tool') toolCounts.set(row.name, (toolCounts.get(row.name) ?? 0) + 1)
  const summary = labels.activity({
    thinkingCount: rows.filter((row) => row.kind === 'thinking').length,
    toolCounts: [...toolCounts].map(([name, count]) => ({ name, count })),
    failedCount: rows.filter((row) => row.kind === 'tool' && row.result?.isError).length,
  })
  const children = rows.map((row) =>
    row.kind === 'thinking' ? (
      <Disclosure
        key={row.id}
        label={streaming ? labels.thinking : labels.thought}
        preview={thinkingPreview(row.text, streaming)}
        icon={Brain}
        className="hbar-session-thinking"
      >
        <LumenFrame className="hbar-session-thinking-content">
          <MessageMarkdown text={row.text} />
        </LumenFrame>
      </Disclosure>
    ) : (
      <ToolRow
        key={row.id}
        row={row}
        labels={labels}
        describeTool={describeTool}
        sessionId={sessionId}
        messageId={messageId}
        clipboard={clipboard}
      />
    ),
  )
  if (rows.length === 1) return <LumenFrame className="hbar-session-activity">{children}</LumenFrame>
  return (
    <LumenFrame className="hbar-session-activity" data-live={streaming}>
      <LumenButton
        variant="text"
        indicator="none"
        size="s"
        className="hbar-session-activity-summary"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setPinnedOpen(!open)}
      >
        <LumenText as="span">{summary}</LumenText>
        <LumenIcon icon={open ? ChevronDown : ChevronRight} tier="sm" />
      </LumenButton>
      <LumenFrame id={contentId} className="hbar-session-activity-steps" hidden={!open}>
        {open ? children : null}
      </LumenFrame>
    </LumenFrame>
  )
}

function MessageBlocksContent({
  sessionId,
  messageId,
  clipboard,
  blocks,
  results,
  streaming = false,
  labels,
  describeTool,
  renderText,
  toolDecisions,
}: HbarMessageBlocksProps) {
  const rows = buildMessageRows(blocks, results)
  const groups: Array<
    | { readonly id: string; readonly rows: readonly ActivityRow[] }
    | Exclude<SessionMessageRow, ActivityRow>
    | SessionToolRow
  > = []
  let activity: ActivityRow[] = []
  const flush = () => {
    const first = activity[0]
    if (first) groups.push({ id: first.id, rows: activity })
    activity = []
  }
  for (const row of rows) {
    if (row.kind === 'tool' && toolDecisions?.has(row.id)) {
      flush()
      groups.push(row)
    } else if (row.kind === 'thinking' || row.kind === 'tool') activity.push(row)
    else {
      flush()
      groups.push(row)
    }
  }
  flush()
  return (
    <LumenFrame className="hbar-session-message-blocks">
      {groups.map((group) =>
        'rows' in group ? (
          <Activity
            key={group.id}
            rows={group.rows}
            streaming={streaming}
            labels={labels}
            describeTool={describeTool}
            sessionId={sessionId}
            messageId={messageId}
            clipboard={clipboard}
          />
        ) : group.kind === 'tool' ? (
          <LumenFrame key={group.id} className="hbar-session-tool-decision">
            <ToolRow
              row={group}
              labels={labels}
              describeTool={describeTool}
              sessionId={sessionId}
              messageId={messageId}
              clipboard={clipboard}
            />
            {toolDecisions?.get(group.id)}
          </LumenFrame>
        ) : group.kind === 'text' ? (
          <LumenFrame key={group.id} className="hbar-session-message-prose">
            {renderText ? renderText(group) : <MessageMarkdown text={group.text} />}
          </LumenFrame>
        ) : (
          <LumenText as="span" key={group.id} className="hbar-session-message-attachment">
            <LumenIcon icon={FileText} tier="sm" />
            {labels.attachment(group.block.type, group.block.artifact.name)}
          </LumenText>
        ),
      )}
    </LumenFrame>
  )
}

/** Normal-flow message content; the timeline remains the owner of history paging/virtualization. */
export function HbarMessageBlocks(props: HbarMessageBlocksProps) {
  return <MessageBlocksContent key={JSON.stringify([props.sessionId, props.messageId])} {...props} />
}

type CopyStatus = MessageCopyResult['status'] | 'idle' | 'copying'

function MessageActionBarContent({
  labels,
  copyLabel,
  clipboard,
  metadata,
  fork,
  ...input
}: HbarMessageActionBarProps) {
  const text = messageCopyText(input.content)
  const [receipt, setReceipt] = useState<{ readonly text: string; readonly status: CopyStatus }>({
    text,
    status: 'idle',
  })
  const generation = useRef(0)
  const pendingText = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current += 1
    }
  }, [])
  const status = receipt.text === text ? receipt.status : 'idle'
  const failure = status === 'failed' || status === 'unavailable'
  const copy = () => {
    if (pendingText.current === text) return
    const version = ++generation.current
    pendingText.current = text
    setReceipt({ text, status: 'copying' })
    const port =
      clipboard === undefined ? (typeof navigator === 'undefined' ? null : (navigator.clipboard ?? null)) : clipboard
    void copyMessageText(input, port).then((result) => {
      if (mounted.current && generation.current === version) {
        pendingText.current = null
        setReceipt({ text, status: result.status })
      }
    })
  }
  if (!text && !metadata && !fork) return null
  const label =
    status === 'copied'
      ? labels.copied
      : status === 'copying'
        ? labels.copying
        : failure
          ? labels.retryCopy
          : (copyLabel ?? labels.copy)
  return (
    <LumenFrame className="hbar-session-message-actions" data-copy-status={status}>
      {text ? (
        <LumenButton
          variant="text"
          indicator="none"
          size="s"
          className="hbar-session-message-action hbar-session-message-copy"
          aria-label={label}
          title={label}
          disabled={status === 'copying'}
          aria-busy={status === 'copying' || undefined}
          onClick={copy}
        >
          <LumenIcon
            icon={status === 'copied' ? Check : status === 'copying' ? LoaderCircle : failure ? RotateCcw : Copy}
            tier="sm"
          />
        </LumenButton>
      ) : null}
      {fork ? (
        <LumenButton
          variant="text"
          indicator="none"
          size="s"
          className="hbar-session-message-action hbar-session-message-fork"
          data-message-action="fork"
          aria-label={fork.label}
          title={fork.label}
          disabled={fork.status === 'submitting' || (fork.status === 'unknown' && !fork.onReconcile)}
          loading={fork.status === 'submitting'}
          onClick={() => invokeMessageForkAction(fork, { sessionId: input.sessionId, messageId: input.messageId })}
        >
          <LumenIcon
            icon={fork.status === 'submitting' ? LoaderCircle : fork.status === 'unknown' ? RotateCcw : GitFork}
            tier="sm"
          />
        </LumenButton>
      ) : null}
      {fork?.status === 'submitting' || fork?.status === 'unknown' ? (
        <LumenText as="span" role="status">
          {fork.label}
        </LumenText>
      ) : null}
      {fork?.error ? (
        <LumenText as="span" role="alert">
          {fork.error}
        </LumenText>
      ) : null}
      {status === 'copied' || status === 'copying' ? (
        <LumenText as="span" role="status">
          {label}
        </LumenText>
      ) : null}
      {failure ? (
        <LumenText as="span" role="alert">
          {status === 'unavailable' ? labels.copyUnavailable : labels.copyFailed}
        </LumenText>
      ) : null}
      {metadata ? (
        <LumenText as="span" className="hbar-session-message-metadata">
          {metadata}
        </LumenText>
      ) : null}
    </LumenFrame>
  )
}

/** Local clipboard feedback remounts on target change; fork navigation is a separate runtime action. */
export function HbarMessageActionBar(props: HbarMessageActionBarProps) {
  return <MessageActionBarContent key={JSON.stringify([props.sessionId, props.messageId])} {...props} />
}
