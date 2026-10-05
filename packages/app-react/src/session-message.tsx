import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePen,
  FilePlus,
  FileText,
  FolderOpen,
  GitFork,
  LoaderCircle,
  RotateCcw,
  Search,
  Terminal,
  Wrench,
} from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText, LumenToolCalls } from '@lumen/app-ui'
import { MessageMarkdown, MessageInlineMarkdown } from './message-markdown'
import type { MessageFileReferenceContext } from './message-file-reference'
import { MessageLiteralText } from './message-literal-text'
import type { HbarCodeBlockLabels } from './code-block-copy-action'
export { MessageMarkdown } from './message-markdown'
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
  type SessionMessageBlock,
  type SessionMessageRow,
  type SessionToolCall,
  type SessionToolResult,
  type SessionToolRow,
} from './session-message-model'
import './session-message.css'
import './session-text.css'
import {
  SessionToolDetails,
  type HbarMessageToolPresentation,
  type HbarToolDetailsLabels,
} from './session-tool-details'
import { sessionToolOutcome, toolErrorPreview, toolOutcomeCounts } from './session-tool-outcome-model'
export type { HbarMessageToolPresentation } from './session-tool-details'
import {
  HbarMessageImageContent,
  type HbarMessageImageOccurrence,
  type HbarMessageImageRenderer,
} from './session-images'

export interface HbarMessageActivitySummary {
  readonly thinkingCount: number
  readonly toolCounts: readonly { readonly name: string; readonly displayName?: string; readonly count: number }[]
  readonly failedCount: number
  readonly outcomeCounts: ReturnType<typeof toolOutcomeCounts>
}

export interface HbarMessageActivityPart {
  readonly role: 'thinking' | 'tool' | 'count' | 'danger' | 'warning' | 'separator'
  readonly text: string
}

export interface HbarMessageBlocksLabels extends HbarToolDetailsLabels {
  readonly thinking: string
  readonly thought: string
  readonly activity: (summary: HbarMessageActivitySummary) => string | readonly HbarMessageActivityPart[]
  readonly tool: (name: string) => string
  readonly failed: string
  readonly denied: string
  readonly cancelled: string
  readonly interrupted: string
  readonly unknown: string
  /** Legacy error results do not retain enough evidence to identify their cause. */
  readonly incomplete: string
  readonly resultAvailable: string
  readonly awaitingResult: string
  readonly running: string
  readonly codeBlock: HbarCodeBlockLabels
  readonly attachment: (kind: 'image' | 'file', name: string) => string
}

export interface HbarMessageBlocksProps {
  readonly sessionId: string
  readonly messageId: string
  readonly blocks: readonly SessionMessageBlock[]
  /** The owning timeline distinguishes authored operator prompts from generated Markdown. */
  readonly textFormat?: 'literal' | 'markdown' | undefined
  readonly results?: readonly SessionToolResult[]
  readonly streaming?: boolean
  readonly labels: HbarMessageBlocksLabels
  /** Local read-only output actions remain available in archived history. */
  readonly clipboard?: MessageClipboardPort | null | undefined
  /** Invalidate local copy receipts when the owning runtime/Host is replaced. */
  readonly copyOwner?: object | undefined
  readonly fileReferences?: MessageFileReferenceContext | undefined
  /** Domain-owned display metadata, not a hard-coded plugin/tool catalog in the view. */
  readonly describeTool?: ((call: SessionToolCall) => HbarMessageToolPresentation) | undefined
  /** Domain-owned text rendering, keyed to original block identity; non-text rows retain their order. */
  readonly renderText?: (row: Extract<SessionMessageRow, { kind: 'text' }>) => ReactNode
  /** Decisions are siblings after their tool disclosure, never inside its collapsed details. */
  readonly toolDecisions?: ReadonlyMap<string, ReactNode> | undefined
  /** Parent-owned actions stay visible beside the exact tool, outside collapsed JSON details. */
  readonly renderToolAction?: ((row: SessionToolRow) => ReactNode) | undefined
  readonly renderImages?: HbarMessageImageRenderer | undefined
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

const toolIcons: Record<HbarMessageToolPresentation['icon'], typeof Brain> = {
  file: FileText,
  'file-write': FilePlus,
  'file-edit': FilePen,
  directory: FolderOpen,
  terminal: Terminal,
  search: Search,
  tool: Wrench,
}

function Disclosure({
  label,
  preview,
  previewFormat,
  previewMarkdown = false,
  live = false,
  title,
  status,
  icon,
  children,
  className,
  failed = false,
  tool,
  action,
}: {
  readonly label: string
  readonly preview?: string | undefined
  readonly previewFormat?: 'code' | 'text' | undefined
  readonly previewMarkdown?: boolean
  readonly live?: boolean
  readonly title?: string | undefined
  readonly status?: ReactNode
  readonly icon: typeof Brain
  readonly children: ReactNode
  readonly className?: string | undefined
  readonly failed?: boolean
  readonly tool?: {
    readonly callId: string | undefined
    readonly name: string
    readonly outcome: ReturnType<typeof sessionToolOutcome>
    readonly icon: HbarMessageToolPresentation['icon']
  }
  readonly action?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = (
    <LumenButton
      variant="text"
      indicator="none"
      size="s"
      className="hbar-session-disclosure-trigger"
      aria-expanded={open}
      aria-controls={id}
      title={title}
      onClick={() => setOpen(!open)}
    >
      {!tool ? <LumenIcon icon={icon} tier="sm" /> : null}
      <LumenText as="span" className="hbar-session-disclosure-identity">
        <LumenText as="span" className="hbar-session-disclosure-label">
          {tool ? <LumenIcon icon={icon} tier="sm" /> : null}
          <LumenText
            as="span"
            className="lumen-effect hbar-session-disclosure-label-text"
            data-lumen-state={live ? 'running' : 'idle'}
            title={label}
          >
            {label}
          </LumenText>
        </LumenText>
        {preview ? (
          <LumenText as="span" className="hbar-session-disclosure-preview" data-format={previewFormat}>
            {previewMarkdown ? <MessageInlineMarkdown text={preview} /> : preview}
          </LumenText>
        ) : null}
      </LumenText>
      {status}
      <LumenIcon icon={open ? ChevronDown : ChevronRight} tier="sm" />
    </LumenButton>
  )
  return (
    <LumenFrame
      className={['hbar-session-disclosure', className].filter(Boolean).join(' ')}
      data-failed={failed || undefined}
      data-tool-call-id={tool?.callId}
      data-tool-name={tool?.name}
      data-outcome={tool?.outcome}
      data-presentation-icon={tool?.icon}
      data-live={live}
    >
      {action ? (
        <LumenFrame className="hbar-session-disclosure-heading">
          {trigger}
          {action}
        </LumenFrame>
      ) : (
        trigger
      )}
      <LumenFrame id={id} className="hbar-session-disclosure-content" hidden={!open}>
        {open ? children : null}
      </LumenFrame>
    </LumenFrame>
  )
}

function ToolStatus({
  outcome,
  running,
  labels,
}: {
  readonly outcome: ReturnType<typeof sessionToolOutcome>
  readonly running: boolean
  readonly labels: HbarMessageBlocksLabels
}) {
  const active = outcome === 'pending' && running
  const tone = active
    ? 'info'
    : outcome === 'failed'
      ? 'danger'
      : outcome === 'succeeded' || outcome === 'legacy-result'
        ? 'success'
        : 'warning'
  const label =
    outcome === 'pending'
      ? active
        ? labels.running
        : labels.awaitingResult
      : outcome === 'succeeded' || outcome === 'legacy-result'
        ? labels.resultAvailable
        : outcome === 'legacy-error'
          ? labels.incomplete
          : labels[outcome]
  return (
    <LumenText as="span" className="hbar-session-disclosure-status" data-status-tone={tone}>
      <LumenText
        as="span"
        className="lumen-effect hbar-session-tool-status-indicator"
        data-lumen-state={active ? 'running' : 'idle'}
        aria-hidden="true"
      />
      <LumenText as="span" className="hbar-session-disclosure-status-text" title={label}>
        {label}
      </LumenText>
    </LumenText>
  )
}

function ToolRow({
  row,
  running,
  labels,
  describeTool,
  sessionId,
  messageId,
  clipboard,
  renderToolAction,
}: {
  readonly row: SessionToolRow
  readonly running: boolean
  readonly labels: HbarMessageBlocksLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool'] | undefined
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: HbarMessageBlocksProps['clipboard']
  readonly renderToolAction?: HbarMessageBlocksProps['renderToolAction']
}) {
  const presentation = row.call && describeTool ? describeTool(row.call) : undefined
  const icon = toolIcons[presentation?.icon ?? 'tool']
  const errorPreview = toolErrorPreview(row.result)
  const outcome = sessionToolOutcome(row.result)
  const disclosure = (
    <Disclosure
      label={presentation?.label ?? labels.tool(row.name)}
      preview={errorPreview || presentation?.summary}
      previewFormat={errorPreview ? 'text' : presentation?.summaryFormat}
      title={presentation?.title}
      status={<ToolStatus outcome={outcome} running={running} labels={labels} />}
      live={running && outcome === 'pending'}
      icon={icon}
      className="hbar-session-tool"
      failed={outcome === 'failed'}
      action={renderToolAction?.(row)}
      tool={{
        callId: row.call?.callId ?? row.result?.callId,
        name: row.name,
        outcome,
        icon: presentation?.icon ?? 'tool',
      }}
    >
      <SessionToolDetails
        row={row}
        presentation={presentation}
        sessionId={sessionId}
        messageId={messageId}
        labels={labels}
        clipboard={clipboard}
      />
    </Disclosure>
  )
  return (
    <LumenToolCalls
      variant={outcome === 'pending' ? 6 : 1}
      variantId={outcome === 'pending' ? 'hbar-app-ui-tool-calls-6' : 'hbar-app-ui-tool-calls-1'}
      className="hbar-session-tool-inline"
      surface="inline"
      controlled={{ body: disclosure }}
    />
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
  copyOwner,
  renderToolAction,
}: {
  readonly rows: readonly ActivityRow[]
  readonly streaming: boolean
  readonly labels: HbarMessageBlocksLabels
  readonly describeTool?: HbarMessageBlocksProps['describeTool'] | undefined
  readonly sessionId: string
  readonly messageId: string
  readonly clipboard?: HbarMessageBlocksProps['clipboard']
  readonly copyOwner?: HbarMessageBlocksProps['copyOwner']
  readonly renderToolAction?: HbarMessageBlocksProps['renderToolAction']
}) {
  const [pinnedOpen, setPinnedOpen] = useState<boolean | null>(null)
  const contentId = useId()
  const open = pinnedOpen ?? streaming
  const toolCounts = new Map<string, { name: string; displayName: string; count: number }>()
  for (const row of rows) {
    if (row.kind !== 'tool') continue
    const displayName = (row.call && describeTool?.(row.call).label) || labels.tool(row.name)
    const prior = toolCounts.get(row.name)
    // Count by real name, never by translation. Mixed historical semantics use
    // the original name rather than attributing every call to its latest label.
    if (prior) {
      prior.count += 1
      if (prior.displayName !== displayName) prior.displayName = labels.tool(row.name)
    } else toolCounts.set(row.name, { name: row.name, displayName, count: 1 })
  }
  const outcomeCounts = toolOutcomeCounts(rows.filter((row): row is SessionToolRow => row.kind === 'tool'))
  const activity = labels.activity({
    thinkingCount: rows.filter((row) => row.kind === 'thinking').length,
    toolCounts: [...toolCounts.values()],
    failedCount: outcomeCounts.failed,
    outcomeCounts,
  })
  const summary = typeof activity === 'string' ? activity : activity.map((part) => part.text).join('')
  const children = rows.map((row) =>
    row.kind === 'thinking' ? (
      <Disclosure
        key={row.id}
        label={streaming ? labels.thinking : labels.thought}
        preview={thinkingPreview(row.text, streaming)}
        previewMarkdown
        live={streaming}
        icon={Brain}
        className="hbar-session-thinking"
      >
        <LumenFrame
          className="lumen-effect hbar-session-thinking-content"
          data-live={streaming}
          data-lumen-state={streaming ? 'running' : 'idle'}
        >
          <MessageMarkdown
            text={row.text}
            code={{
              sessionId,
              messageId,
              segmentId: row.id,
              labels: labels.codeBlock,
              streaming,
              clipboard,
              owner: copyOwner,
            }}
          />
        </LumenFrame>
      </Disclosure>
    ) : (
      <ToolRow
        key={row.id}
        row={row}
        running={streaming}
        labels={labels}
        describeTool={describeTool}
        sessionId={sessionId}
        messageId={messageId}
        clipboard={clipboard}
        renderToolAction={renderToolAction}
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
        title={summary}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setPinnedOpen(!open)}
      >
        <LumenText
          as="span"
          className="lumen-effect hbar-session-tool-status-indicator"
          data-lumen-state={streaming ? 'running' : 'idle'}
          aria-hidden="true"
        />
        <LumenText as="span" className="hbar-session-activity-summary-text">
          {typeof activity === 'string'
            ? activity
            : activity.map((part, index) => (
                <LumenText as="span" key={index} data-activity-role={part.role}>
                  {part.text}
                </LumenText>
              ))}
        </LumenText>
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
  copyOwner,
  fileReferences,
  blocks,
  textFormat = 'markdown',
  results,
  streaming = false,
  labels,
  describeTool,
  renderText,
  toolDecisions,
  renderImages,
  renderToolAction,
}: HbarMessageBlocksProps) {
  const rows = buildMessageRows(blocks, results)
  const groups: Array<
    | { readonly id: string; readonly rows: readonly ActivityRow[] }
    | Exclude<SessionMessageRow, ActivityRow>
    | SessionToolRow
    | { readonly kind: 'images'; readonly id: string; readonly images: readonly HbarMessageImageOccurrence[] }
  > = []
  let activity: ActivityRow[] = []
  let images: HbarMessageImageOccurrence[] = []
  let imageOrdinal = 0
  const flush = () => {
    const first = activity[0]
    if (first) groups.push({ id: first.id, rows: activity })
    activity = []
  }
  const flushImages = () => {
    const first = images[0]
    if (first) groups.push({ kind: 'images', id: `images:${first.ordinal}`, images })
    images = []
  }
  for (const row of rows) {
    if (renderImages && row.kind === 'attachment' && row.block.type === 'image') {
      flush()
      images.push({ key: row.id, ordinal: imageOrdinal++, artifact: row.block.artifact })
      continue
    }
    flushImages()
    if (row.kind === 'tool' && (toolDecisions?.has(row.id) || renderToolAction?.(row))) {
      flush()
      groups.push(row)
    } else if (row.kind === 'thinking' || row.kind === 'tool') activity.push(row)
    else {
      flush()
      groups.push(row)
    }
  }
  flush()
  flushImages()
  return (
    <LumenFrame className="hbar-session-message-blocks" data-live={streaming}>
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
            copyOwner={copyOwner}
            renderToolAction={renderToolAction}
          />
        ) : group.kind === 'images' ? (
          <LumenFrame key={group.id} className="hbar-session-message-images">
            {renderImages?.(group.images)}
          </LumenFrame>
        ) : group.kind === 'tool' ? (
          <LumenFrame key={group.id} className="hbar-session-tool-decision">
            <ToolRow
              row={group}
              running={streaming}
              labels={labels}
              describeTool={describeTool}
              sessionId={sessionId}
              messageId={messageId}
              clipboard={clipboard}
              renderToolAction={renderToolAction}
            />
            {toolDecisions?.get(group.id)}
          </LumenFrame>
        ) : group.kind === 'text' ? (
          <LumenFrame
            key={group.id}
            className="lumen-effect hbar-session-message-prose"
            data-live={streaming}
            data-lumen-state={streaming ? 'running' : 'idle'}
            data-session-find-segment={renderText ? undefined : group.id}
          >
            {renderText ? (
              renderText(group)
            ) : textFormat === 'literal' ? (
              <MessageLiteralText text={group.text} fileReferences={fileReferences} />
            ) : (
              <MessageMarkdown
                text={group.text}
                fileReferences={fileReferences ? { ...fileReferences, streaming } : undefined}
                code={{
                  sessionId,
                  messageId,
                  segmentId: group.id,
                  labels: labels.codeBlock,
                  streaming,
                  clipboard,
                  owner: copyOwner,
                }}
              />
            )}
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
  if (!props.blocks.some((block) => block.type === 'image'))
    return <MessageBlocksContent key={JSON.stringify([props.sessionId, props.messageId])} {...props} />
  return (
    <HbarMessageImageContent sessionId={props.sessionId} messageId={props.messageId}>
      {(renderImages) => (
        <MessageBlocksContent
          key={JSON.stringify([props.sessionId, props.messageId])}
          {...props}
          renderImages={renderImages ?? props.renderImages}
        />
      )}
    </HbarMessageImageContent>
  )
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
