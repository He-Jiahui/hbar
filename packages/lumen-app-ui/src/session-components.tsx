'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { LumenIcon } from './workbench'
import { LumenChip } from './ui-controls'
import {
  useConversationViewport,
  type LumenConversationScrollTarget,
  type LumenConversationScrollTargetResult,
} from './conversation-viewport'
import { ConversationHorizontalScrollMemory } from './conversation-horizontal-scroll'
import { ConversationVirtualMessageRow } from './conversation-virtual-message-row'
import { LumenDisclosure } from './disclosure'
import { LumenInput, LumenTextarea } from './forms'
import { LumenFilePicker } from './file-picker'
import LumenDivider from './LumenDivider'
import LumenSurface from './LumenSurface'
import { type LumenSurfaceProps } from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { LumenCompactMetrics } from './workspace-components'
import { LumenAdaptiveToolbar, type LumenToolbarItem } from './workbench-compositions'
import './session-components.css'

export type { LumenConversationScrollTarget, LumenConversationScrollTargetResult } from './conversation-viewport'

function uniqueById<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function SessionGlyph({
  name,
}: {
  name: 'add' | 'check' | 'copy' | 'down' | 'file' | 'loading' | 'remove' | 'retry' | 'send' | 'shield' | 'stop'
}) {
  return (
    <svg className="lumen-session-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'add' ? <path d="M8 3v10M3 8h10" /> : null}
      {name === 'check' ? <path d="m3.5 8 3 3 6-6" /> : null}
      {name === 'copy' ? <path d="M5 5h8v8H5zM3 11H2.5v-8h8V4" /> : null}
      {name === 'down' ? <path d="m4 6 4 4 4-4" /> : null}
      {name === 'file' ? <path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" /> : null}
      {name === 'loading' ? <path d="M8 2.5a5.5 5.5 0 1 1-4 1.7" /> : null}
      {name === 'remove' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
      {name === 'retry' ? <path d="M12.5 6A5 5 0 1 0 13 9m-.5-3V2.5M12.5 6H9" /> : null}
      {name === 'send' ? <path d="m3 8 10-5-3.5 10-2-3-4.5-2Z" /> : null}
      {name === 'shield' ? <path d="M8 2.5 13 4v3.5c0 3-2 5-5 6-3-1-5-3-5-6V4z" /> : null}
      {name === 'stop' ? <path d="M4.5 4.5h7v7h-7z" /> : null}
    </svg>
  )
}

export interface LumenMessageProps {
  id: string
  role: 'user' | 'system' | 'assistant' | 'tool'
  author: string
  avatar: string
  timestamp?: string | undefined
  streaming?: boolean | undefined
  /** Transcript omits repeated role chrome and uses prose-first conversation flow. */
  appearance?: 'card' | 'transcript' | undefined
  /** A host-owned action row; null explicitly suppresses the legacy copy action. */
  actions?: React.ReactNode
  copyLabel: string
  copied?: boolean | undefined
  onCopy?: (() => void) | undefined
  children: React.ReactNode
}

export function LumenMessage({
  id,
  role,
  author,
  avatar,
  timestamp,
  streaming,
  appearance = 'card',
  actions,
  copyLabel,
  copied,
  onCopy,
  children,
}: LumenMessageProps) {
  let actionContent = actions
  if (actionContent === undefined && onCopy) {
    actionContent = (
      <LumenIconButton label={copyLabel} size="s" onClick={onCopy}>
        <SessionGlyph name={copied ? 'check' : 'copy'} />
      </LumenIconButton>
    )
  }
  if (appearance === 'transcript') {
    return (
      <article
        className="lumen-message-transcript"
        data-role={role}
        data-message-id={id}
        aria-label={author}
        aria-busy={streaming || undefined}
      >
        <div className="lumen-message-transcript-body">{children}</div>
        {actionContent || timestamp ? (
          <footer>
            {actionContent}
            {timestamp ? <time>{timestamp}</time> : null}
          </footer>
        ) : null}
      </article>
    )
  }
  return (
    <LumenSurface
      as="article"
      boundary="none"
      className="lumen-message-surface"
      contentClassName="lumen-message"
      data-role={role}
      data-message-id={id}
      material="frost"
      state={streaming ? 'running' : 'idle'}
    >
      {role !== 'tool' ? (
        <header>
          <span className="lumen-message-avatar" aria-hidden="true">
            {avatar}
          </span>
          <LumenText as="strong" variant="label">
            {author}
          </LumenText>
          {timestamp ? <time>{timestamp}</time> : null}
          {streaming ? <SessionGlyph name="loading" /> : null}
        </header>
      ) : null}
      <div {...lumenPartProps("message.body")} className="lumen-message-body">{children}</div>
      {actionContent ? <footer>{actionContent}</footer> : null}
    </LumenSurface>
  )
}

export interface LumenConversationProps {
  title: string
  messages: readonly LumenMessageProps[]
  empty: React.ReactNode
  composer: React.ReactNode
  header?: React.ReactNode
  beforeMessages?: React.ReactNode
  afterMessages?: React.ReactNode
  scrollKey?: string | undefined
  contentRevision?: string | number | undefined
  latestLabel?: string | undefined
  /** Controlled one-shot message navigation; cancelled by a new source/intent or user scrolling. */
  scrollTarget?: LumenConversationScrollTarget | null | undefined
  onScrollTargetResult?: ((result: LumenConversationScrollTargetResult) => void) | undefined
  /** Defaults to true. False preserves reading position even at the geometric end while finding. */
  followLatest?: boolean | undefined
}

/** Pane-owned timeline; measured virtualization above 40 messages, host-owned data and copy. */
export function LumenConversation({
  title,
  messages: sourceMessages,
  empty,
  composer,
  header,
  beforeMessages,
  afterMessages,
  scrollKey = 'conversation',
  contentRevision,
  latestLabel,
  scrollTarget,
  onScrollTargetResult,
  followLatest,
}: LumenConversationProps) {
  const horizontalScrollMemory = React.useMemo(() => new ConversationHorizontalScrollMemory(), [])
  React.useEffect(() => () => horizontalScrollMemory.dispose(), [horizontalScrollMemory])
  const {
    viewport,
    messages,
    virtualized,
    visible,
    leading,
    trailing,
    measureElement,
    hasNewContent,
    onScroll,
    showLatest,
  } = useConversationViewport({
    messages: sourceMessages,
    scrollKey,
    contentRevision,
    scrollTarget,
    onScrollTargetResult,
    followLatest,
  })
  let messageContent: React.ReactNode = empty
  if (messages.length > 0) {
    if (virtualized) {
      messageContent = (
        <div
          className="lumen-conversation-virtual"
          role="list"
          data-hbar-app-ui-list-strategy="virtualized"
          data-hbar-app-ui-message-count={messages.length}
        >
          <div aria-hidden="true" style={{ blockSize: leading }} />
          {visible.map((item) => {
            const message = messages[item.index]
            return message ? (
              <ConversationVirtualMessageRow
                key={message.id}
                messageId={message.id}
                index={item.index}
                count={messages.length}
                measureElement={measureElement}
                scrollKey={scrollKey}
                horizontalScrollMemory={horizontalScrollMemory}
              >
                <LumenMessage {...message} />
              </ConversationVirtualMessageRow>
            ) : null
          })}
          <div aria-hidden="true" style={{ blockSize: trailing }} />
        </div>
      )
    } else {
      messageContent = messages.map((message) => <LumenMessage {...message} key={message.id} />)
    }
  }
  return (
    <section {...lumenPartProps("conversation.root")} className="lumen-conversation" aria-label={title}>
      {header === undefined ? (
        <header {...lumenPartProps("conversation.header")}>
          <LumenText as="h2" variant="heading">
            {title}
          </LumenText>
        </header>
      ) : (
        header
      )}
      <div
        ref={viewport}
        onScroll={onScroll}
        {...lumenPartProps("conversation.messages")} className="lumen-conversation-messages"
        data-follow-latest={followLatest ?? true}
      >
        <div {...lumenPartProps("conversation.content")} className="lumen-conversation-content">
          {beforeMessages}
          {messageContent}
          {afterMessages}
        </div>
        <div className="lumen-conversation-end-anchor" aria-hidden="true" />
      </div>
      {hasNewContent && latestLabel && messages.length > 0 ? (
        <LumenButton className="lumen-conversation-latest" variant="outlined" size="s" onClick={showLatest}>
          <SessionGlyph name="down" />
          {latestLabel}
        </LumenButton>
      ) : null}
      {composer}
    </section>
  )
}

export interface LumenComposerAttachment {
  id: string
  kind: 'image' | 'file'
  name: string
  previewUrl?: string | undefined
}

export interface LumenPromptLabels {
  input: string
  placeholder: string
  send: string
  submitTitle: string
  stop: string
  uploading: string
  addAttachment: string
  removeAttachment: (attachment: LumenComposerAttachment) => string
}

export interface LumenPromptComposerProps {
  readonly className?: string | undefined
  value: string
  labels: LumenPromptLabels
  attachments: readonly LumenComposerAttachment[]
  /** Host-owned attachments; undefined preserves legacy chips, null explicitly hides them. */
  attachmentContent?: React.ReactNode
  /** Opt out of the decorative surface lamps without changing form behavior. Defaults to horizontal. */
  boundary?: LumenSurfaceProps['boundary'] | undefined
  disabled?: boolean | undefined
  submitting: boolean
  uploading: boolean
  canSubmit: boolean
  canStop: boolean
  canAddAttachments?: boolean | undefined
  stopping?: boolean | undefined
  /** Opt in to a stable Stop action during a run, with an explicit queued submission. */
  runningActions?:
    | {
        submit: 'hidden' | 'queue'
        queueLabel: string
        queueTitle: string
      }
    | undefined
  error?: string | undefined
  context?: React.ReactNode
  /** Host-owned rich editor; omitted to preserve the built-in textarea and Enter behavior. */
  editor?:
    | ((controls: {
        value: string
        inputLabel: string
        placeholder: string
        disabled: boolean
        onChange: (value: string) => void
        /** Same submission gate as the Send button; the editor owns IME/newline handling. */
        onSubmit: () => void
      }) => React.ReactNode)
    | undefined
  controls?: React.ReactNode
  modelPicker?: React.ReactNode
  /** Complete host-owned controls; lower priorities move into the shared More surface. */
  toolbar?:
    | {
        readonly moreLabel: string
        readonly items: readonly LumenToolbarItem[]
        readonly revealRequest?: { readonly id: string; readonly revision: number } | undefined
      }
    | undefined
  /** Host-owned action rendered with the primary running actions (for example background agent stop). */
  backgroundAction?: React.ReactNode
  onChange: (value: string) => void
  onAddAttachments?: ((files: readonly File[]) => void) | undefined
  onRemoveAttachment: (id: string, kind: 'image' | 'file') => void
  onSubmit: () => void
  onStop: () => void
}

export function LumenPromptComposer(props: LumenPromptComposerProps) {
  const runningActions = props.canStop ? props.runningActions : undefined
  const attachments = uniqueById(
    props.attachments.map((attachment) => ({
      ...attachment,
      id: `${attachment.kind}:${attachment.id}`,
    })),
  )
  const blocked = Boolean(
    props.disabled || props.submitting || props.uploading || !props.canSubmit || runningActions?.submit === 'hidden',
  )
  const submit = () => {
    if (!blocked) {
      props.onSubmit()
    }
  }
  let surfaceState: NonNullable<LumenSurfaceProps['state']> = 'idle'
  if (props.error) {
    surfaceState = 'failed'
  } else if (props.submitting || props.uploading) {
    surfaceState = 'running'
  } else if (props.disabled) {
    surfaceState = 'disabled'
  } else if (props.value.trim()) {
    surfaceState = 'selected'
  }
  return (
    <LumenSurface
      as="form"
      surfaceRole="raised"
      boundary={props.boundary ?? 'horizontal'}
      {...lumenPartProps("composer.surface")} className="lumen-prompt-composer-surface"
      contentPart="composer.root" contentClassName={['lumen-prompt-composer', props.className].filter(Boolean).join(' ')}
      interactive
      material="frost"
      state={surfaceState}
      tone={props.error ? 'danger' : 'neutral'}
      aria-busy={props.submitting || props.uploading || undefined}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {props.context}
      {props.attachmentContent}
      {props.attachmentContent === undefined && attachments.length > 0 ? (
        <div className="lumen-attachment-strip">
          {attachments.map((attachment) => {
            const originalId = attachment.id.slice(attachment.kind.length + 1)
            return (
              <LumenChip
                className="lumen-attachment-chip"
                label={attachment.name}
                key={attachment.id}
                startAdornment={
                  attachment.kind === 'image' && attachment.previewUrl ? (
                    <img src={attachment.previewUrl} alt="" />
                  ) : (
                    <SessionGlyph name="file" />
                  )
                }
                disabled={props.submitting}
                removeAction={{
                  label: props.labels.removeAttachment({ ...attachment, id: originalId }),
                  onRemove: () => props.onRemoveAttachment(originalId, attachment.kind),
                }}
              />
            )
          })}
        </div>
      ) : null}
      {props.editor ? (
        props.editor({
          value: props.value,
          inputLabel: props.labels.input,
          placeholder: props.labels.placeholder,
          disabled: Boolean(props.disabled),
          onChange: props.onChange,
          onSubmit: submit,
        })
      ) : (
        <LumenTextarea
          variant="plain"
          aria-label={props.labels.input}
          placeholder={props.labels.placeholder}
          disabled={props.disabled}
          rows={3}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (!blocked) {
                props.onSubmit()
              }
            }
          }}
        />
      )}
      {props.error ? (
        <LumenText as="p" tone="danger" role="alert">
          {props.error}
        </LumenText>
      ) : null}
      {props.toolbar ? (
        <LumenAdaptiveToolbar
          label={props.labels.input}
          moreLabel={props.toolbar.moreLabel}
          placement="above"
          revealRequest={props.toolbar.revealRequest}
          {...lumenPartProps("composer.toolbar")} className="lumen-composer-toolbar"
          items={[
            ...(props.onAddAttachments
              ? [
                  {
                    id: 'attachment',
                    label: props.labels.addAttachment,
                    priority: 200,
                    content: (
                      <LumenFilePicker
                        label={props.labels.addAttachment}
                        disabled={!props.canAddAttachments}
                        multiple
                        onFiles={props.onAddAttachments}
                      >
                        <SessionGlyph name="add" />
                      </LumenFilePicker>
                    ),
                  },
                ]
              : []),
            ...props.toolbar.items,
          ]}
          trailing={
            <>
              {props.backgroundAction}
              {props.uploading ? (
                <span className="lumen-uploading" role="status" aria-label={props.labels.uploading}>
                  <SessionGlyph name="loading" />
                </span>
              ) : null}
              {runningActions?.submit === 'queue' ? (
                <div
                  className="lumen-composer-control-rail lumen-composer-queue-rail"
                  role="group"
                  aria-label={runningActions.queueTitle}
                  tabIndex={0}
                >
                  <LumenButton
                    type="submit"
                    {...lumenPartProps('composer.queue-action')}
                    className="lumen-composer-queue-action"
                    title={runningActions.queueTitle}
                    tone="primary"
                    variant="text"
                    loading={props.submitting}
                    disabled={blocked}
                  >
                    {runningActions.queueLabel}
                  </LumenButton>
                </div>
              ) : null}
              {props.canStop ? (
                <LumenIconButton
                  label={props.labels.stop}
                  indicator="none"
                  className="lumen-composer-primary-action"
                  variant="contained"
                  tone={runningActions ? 'danger' : undefined}
                  disabled={props.stopping || Boolean(runningActions && props.disabled)}
                  onClick={props.onStop}
                >
                  <LumenIcon icon={Square} tier="sm" />
                </LumenIconButton>
              ) : null}
              {!runningActions ? (
                <LumenIconButton
                  type="submit"
                  indicator="none"
                  className="lumen-composer-primary-action"
                  label={props.labels.send}
                  title={props.labels.submitTitle}
                  tone="primary"
                  variant="contained"
                  loading={props.submitting}
                  disabled={blocked}
                >
                  <LumenIcon icon={ArrowUp} tier="sm" />
                </LumenIconButton>
              ) : null}
            </>
          }
        />
      ) : (
        <div {...lumenPartProps("composer.toolbar")} className="lumen-composer-toolbar">
          <div className="lumen-composer-control-rail" role="group" aria-label={props.labels.input} tabIndex={0}>
            <div className="lumen-composer-leading-controls">
              {props.onAddAttachments ? (
                <LumenFilePicker
                  label={props.labels.addAttachment}
                  disabled={!props.canAddAttachments}
                  multiple
                  onFiles={props.onAddAttachments}
                >
                  <SessionGlyph name="add" />
                </LumenFilePicker>
              ) : null}
              {props.controls}
              {props.uploading ? (
                <span className="lumen-uploading" role="status" aria-label={props.labels.uploading}>
                  <SessionGlyph name="loading" />
                </span>
              ) : null}
            </div>
            <div className="lumen-composer-trailing-controls">
              {props.modelPicker}
              {runningActions?.submit === 'queue' ? (
                <LumenButton
                  type="submit"
                  {...lumenPartProps("composer.queue-action")} className="lumen-composer-queue-action"
                  title={runningActions.queueTitle}
                  tone="primary"
                  variant="text"
                  loading={props.submitting}
                  disabled={blocked}
                >
                  {runningActions.queueLabel}
                </LumenButton>
              ) : null}
            </div>
          </div>
          <div className="lumen-composer-primary-actions">
            {props.backgroundAction}
            {props.canStop ? (
              <LumenIconButton
                label={props.labels.stop}
                indicator="none"
                className="lumen-composer-primary-action"
                variant="contained"
                tone={runningActions ? 'danger' : undefined}
                disabled={props.stopping || Boolean(runningActions && props.disabled)}
                onClick={props.onStop}
              >
                <LumenIcon icon={Square} tier="sm" />
              </LumenIconButton>
            ) : null}
            {!runningActions ? (
              <LumenIconButton
                type="submit"
                indicator="none"
                className="lumen-composer-primary-action"
                label={props.labels.send}
                title={props.labels.submitTitle}
                tone="primary"
                variant="contained"
                loading={props.submitting}
                disabled={blocked}
              >
                <LumenIcon icon={ArrowUp} tier="sm" />
              </LumenIconButton>
            ) : null}
          </div>
        </div>
      )}
    </LumenSurface>
  )
}

export type LumenRunActivityStatus =
  'queued' | 'running' | 'waiting_approval' | 'completed' | 'cancelled' | 'failed' | 'interrupted'

export type LumenRunPlanStepStatus = 'pending' | 'in_progress' | 'completed'

export interface LumenRunPlan {
  runId: string | null
  explanation?: string | undefined
  steps: readonly { id: string; title: string; status: LumenRunPlanStepStatus }[]
}

export interface LumenRunActivityItem {
  id: string
  label: string
  status: LumenRunActivityStatus
  statusLabel?: string | undefined
  detail?: string | undefined
  duration?: string | undefined
}

export interface LumenRunActivityLabels {
  title: string
  emptyTitle: string
  emptyDescription: string
  cancelLabel: string
  cancellingLabel: string
  retryLabel: string
  retryingLabel: string
  planTitle: string
  planProgress: (completed: number, total: number) => string
  planStatusLabel: (status: LumenRunPlanStepStatus) => string
  countLabel: (count: number) => string
  statusLabel: (status: LumenRunActivityStatus) => string
}

export interface LumenRunActivityProps {
  runs: readonly LumenRunActivityItem[]
  labels: LumenRunActivityLabels
  listStrategy: 'content-grown' | 'virtual'
  selectedRunId?: string | undefined
  cancellingRunIds?: readonly string[] | undefined
  retryingRunIds?: readonly string[] | undefined
  plan?: LumenRunPlan | null | undefined
  feedback?: string | undefined
  onSelectRun?: ((runId: string) => void) | undefined
  onCancelRun?: ((runId: string) => void) | undefined
  onRetryRun?: ((runId: string) => void) | undefined
}

function runTone(status: LumenRunActivityStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'failed' || status === 'interrupted') {
    return 'danger'
  }
  if (status === 'queued' || status === 'running' || status === 'waiting_approval') {
    return 'warning'
  }
  return 'neutral'
}

export function LumenRunActivity({
  runs: sourceRuns,
  labels,
  listStrategy,
  selectedRunId,
  cancellingRunIds = [],
  retryingRunIds = [],
  plan,
  feedback,
  onSelectRun,
  onCancelRun,
  onRetryRun,
}: LumenRunActivityProps) {
  const runs = uniqueById(sourceRuns)
  const renderPlan = (value: LumenRunPlan) => {
    const steps = uniqueById(value.steps)
    const completed = steps.filter((step) => step.status === 'completed').length
    return (
      <LumenDisclosure
        className="lumen-run-plan hbar-app-ui-run-activity-plan"
        summary={
          <React.Fragment>
            <strong>{labels.planTitle}</strong>
            <span>{labels.planProgress(completed, steps.length)}</span>
          </React.Fragment>
        }
      >
        {value.explanation ? <p>{value.explanation}</p> : null}
        {steps.length > 0 ? (
          <ol>
            {steps.map((step) => (
              <li key={step.id} data-status={step.status}>
                <span aria-hidden="true" />
                <span>{step.title}</span>
                <small>{labels.planStatusLabel(step.status)}</small>
              </li>
            ))}
          </ol>
        ) : null}
      </LumenDisclosure>
    )
  }
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-run-activity-surface"
      contentClassName={`lumen-run-activity hbar-app-ui-run-activity is-${listStrategy}`}
      data-list-strategy={listStrategy}
      aria-label={labels.title}
    >
      <header className="hbar-app-ui-run-activity-heading">
        <LumenText as="strong" variant="heading">
          {labels.title}
        </LumenText>
        <LumenStatus value={labels.countLabel(runs.length)} />
      </header>
      {feedback ? (
        <LumenText className="hbar-app-ui-run-activity-feedback" as="p" tone="danger" role="alert">
          {feedback}
        </LumenText>
      ) : null}
      {runs.length > 0 ? (
        <ol className="hbar-app-ui-run-activity-list">
          {runs.map((run) => {
            const cancelling = cancellingRunIds.includes(run.id)
            const retrying = retryingRunIds.includes(run.id)
            const active = run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval'
            const retryable = run.status === 'failed' || run.status === 'interrupted'
            return (
              <li key={run.id}>
                <article
                  className={`lumen-run-item hbar-app-ui-run-activity-item hbar-app-ui-run-status-${run.status}`}
                  data-status={run.status}
                >
                  <LumenButton
                    variant="text"
                    className="lumen-run-summary"
                    aria-current={selectedRunId === run.id ? 'true' : undefined}
                    disabled={!onSelectRun}
                    onClick={() => onSelectRun?.(run.id)}
                  >
                    <span className="lumen-run-marker hbar-app-ui-run-activity-marker" aria-hidden="true" />
                    <span className="lumen-run-copy hbar-app-ui-run-activity-copy">
                      <strong>{run.label}</strong>
                      {run.detail ? <small>{run.detail}</small> : null}
                    </span>
                    <span className="lumen-run-status hbar-app-ui-run-activity-status">
                      <LumenStatus
                        value={
                          cancelling ? labels.cancellingLabel : (run.statusLabel ?? labels.statusLabel(run.status))
                        }
                        tone={cancelling ? 'warning' : runTone(run.status)}
                      />
                      {run.duration ? <small>{run.duration}</small> : null}
                    </span>
                  </LumenButton>
                  <div className="lumen-run-actions hbar-app-ui-run-activity-actions">
                    {active && onCancelRun ? (
                      <LumenIconButton
                        className="hbar-app-ui-run-activity-cancel"
                        label={cancelling ? labels.cancellingLabel : labels.cancelLabel}
                        disabled={cancelling}
                        onClick={() => onCancelRun(run.id)}
                      >
                        <SessionGlyph name="stop" />
                      </LumenIconButton>
                    ) : null}
                    {retryable && onRetryRun ? (
                      <LumenButton
                        className="hbar-app-ui-run-activity-retry"
                        variant="outlined"
                        disabled={retrying}
                        onClick={() => onRetryRun(run.id)}
                      >
                        <SessionGlyph name="retry" />
                        {retrying ? labels.retryingLabel : labels.retryLabel}
                      </LumenButton>
                    ) : null}
                  </div>
                  {plan?.runId === run.id ? renderPlan(plan) : null}
                </article>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="lumen-run-empty">
          <SessionGlyph name="stop" />
          <LumenText as="strong" variant="label">
            {labels.emptyTitle}
          </LumenText>
          <LumenText as="p" tone="muted">
            {labels.emptyDescription}
          </LumenText>
        </div>
      )}
      {plan && plan.runId !== null && !runs.some((run) => run.id === plan.runId) ? renderPlan(plan) : null}
      {plan?.runId === null ? renderPlan(plan) : null}
    </LumenSurface>
  )
}

export type LumenFailureMessage = string | ((cause: unknown) => string)

export interface LumenDecisionState {
  status: 'idle' | 'pending' | 'complete'
  error?: string | undefined
}

export type LumenApprovalDecision = 'deny' | 'allow' | 'allow_always'

export interface LumenApprovalRequestLabels {
  title: string
  detailsLabel: string
  statusLabel: string
  denyLabel: string
  allowLabel: string
  allowAlwaysLabel?: string | undefined
  savingLabel: string
  completeLabel: string
  failureMessage: LumenFailureMessage
}

export interface LumenApprovalRequestProps {
  id: string
  tool: string
  summary: string
  details?: string | undefined
  labels: LumenApprovalRequestLabels
  state: LumenDecisionState
  onDecision: (id: string, decision: LumenApprovalDecision) => void
}

export function LumenApprovalRequest({
  id,
  tool,
  summary,
  details,
  labels,
  state,
  onDecision,
}: LumenApprovalRequestProps) {
  const disabled = state.status !== 'idle'
  let statusLabel = labels.statusLabel
  if (state.status === 'complete') {
    statusLabel = labels.completeLabel
  }
  if (state.status === 'pending') {
    statusLabel = labels.savingLabel
  }
  let surfaceState: 'idle' | 'running' | 'failed' = 'idle'
  if (state.error) {
    surfaceState = 'failed'
  } else if (state.status === 'pending') {
    surfaceState = 'running'
  }
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-decision-surface"
      contentClassName="lumen-decision hbar-app-ui-approval-request"
      aria-label={labels.title}
      aria-busy={state.status === 'pending' || undefined}
      material="frost"
      state={surfaceState}
      tone={state.error ? 'danger' : 'warning'}
    >
      <header className="hbar-app-ui-approval-request-heading">
        <SessionGlyph name="shield" />
        <div>
          <LumenText as="strong" variant="label">
            {labels.title}
          </LumenText>
          <code>{tool}</code>
        </div>
        <LumenStatus value={statusLabel} tone={state.status === 'complete' ? 'success' : 'warning'} />
      </header>
      <div className="lumen-decision-target hbar-app-ui-approval-request-target">
        <strong>{summary}</strong>
        {details ? (
          <LumenDisclosure summary={labels.detailsLabel}>
            <pre>{details}</pre>
          </LumenDisclosure>
        ) : null}
      </div>
      {state.error ? (
        <LumenText className="hbar-app-ui-approval-request-feedback" as="p" tone="danger" role="alert">
          {state.error}
        </LumenText>
      ) : null}
      <LumenDivider tone={state.error ? 'danger' : 'warning'} />
      <footer className="hbar-app-ui-approval-request-actions">
        <LumenButton variant="outlined" disabled={disabled} onClick={() => onDecision(id, 'deny')}>
          <SessionGlyph name="remove" />
          {labels.denyLabel}
        </LumenButton>
        <LumenButton variant="contained" tone="primary" disabled={disabled} onClick={() => onDecision(id, 'allow')}>
          <SessionGlyph name="check" />
          {labels.allowLabel}
        </LumenButton>
        {labels.allowAlwaysLabel ? (
          <LumenButton
            tone="success"
            variant="outlined"
            disabled={disabled}
            onClick={() => onDecision(id, 'allow_always')}
          >
            <SessionGlyph name="shield" />
            {labels.allowAlwaysLabel}
          </LumenButton>
        ) : null}
      </footer>
    </LumenSurface>
  )
}

export interface LumenQuestionnaireOption {
  value: string
  label: string
  description?: string | undefined
}

export interface LumenQuestionnaireQuestion {
  id: string
  header: string
  prompt: string
  options?: readonly LumenQuestionnaireOption[] | undefined
  acceptsCustomAnswer?: boolean | undefined
  secret?: boolean | undefined
}

export interface LumenQuestionAnswer {
  kind: 'option' | 'custom'
  value: string
}

export interface LumenQuestionnaireLabels {
  title: string
  countLabel: (count: number) => string
  customAnswerLabel: string
  customAnswerPlaceholder: string
  freeformLabel: string
  submitLabel: string
  submittingLabel: string
  submittedLabel: string
  incompleteMessage: string
  rejectedMessage: string
  failureMessage: LumenFailureMessage
}

export interface LumenQuestionnaireProps {
  requestId: string
  questions: readonly LumenQuestionnaireQuestion[]
  answers: Readonly<Record<string, LumenQuestionAnswer>>
  labels: LumenQuestionnaireLabels
  state: LumenDecisionState
  onAnswer: (requestId: string, questionId: string, answer: LumenQuestionAnswer) => void
  onSubmit: (requestId: string) => void
}

export function LumenQuestionnaire({
  requestId,
  questions: sourceQuestions,
  answers,
  labels,
  state,
  onAnswer,
  onSubmit,
}: LumenQuestionnaireProps) {
  const questions = uniqueById(sourceQuestions)
  const disabled = state.status !== 'idle'
  let submitLabel = labels.submitLabel
  if (state.status === 'complete') {
    submitLabel = labels.submittedLabel
  }
  if (state.status === 'pending') {
    submitLabel = labels.submittingLabel
  }
  let surfaceState: 'idle' | 'running' | 'failed' = 'idle'
  if (state.error) {
    surfaceState = 'failed'
  } else if (state.status === 'pending') {
    surfaceState = 'running'
  }
  return (
    <LumenSurface
      as="section"
      boundary="horizontal"
      className="lumen-questionnaire-surface"
      contentClassName="lumen-questionnaire hbar-app-ui-questionnaire"
      aria-label={labels.title}
      aria-busy={state.status === 'pending' || undefined}
      material="frost"
      state={surfaceState}
      tone={state.error ? 'danger' : 'neutral'}
    >
      <header className="hbar-app-ui-questionnaire-heading">
        <LumenText as="strong" variant="heading">
          {labels.title}
        </LumenText>
        <LumenStatus
          value={state.status === 'complete' ? labels.submittedLabel : labels.countLabel(questions.length)}
          tone={state.status === 'complete' ? 'success' : 'neutral'}
        />
      </header>
      <div className="lumen-questionnaire-questions hbar-app-ui-questionnaire-questions">
        {questions.map((question) => {
          const answer = answers[question.id]
          const options = uniqueById((question.options ?? []).map((option) => ({ ...option, id: option.value })))
          const hasOptions = options.length > 0
          return (
            <fieldset key={question.id} disabled={disabled}>
              <legend>
                <strong>{question.header}</strong>
                <span>{question.prompt}</span>
              </legend>
              <LumenDivider tone={state.error ? 'danger' : 'neutral'} />
              <div className="hbar-app-ui-questionnaire-options">
                {options.map((option) => (
                  <label className="lumen-question-option hbar-app-ui-questionnaire-option" key={option.value}>
                    <LumenInput
                      type="radio"
                      name={`${requestId}:${question.id}`}
                      value={option.value}
                      checked={answer?.kind === 'option' && answer.value === option.value}
                      onChange={() => onAnswer(requestId, question.id, { kind: 'option', value: option.value })}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      {option.description ? <small>{option.description}</small> : null}
                    </span>
                  </label>
                ))}
                {hasOptions && question.acceptsCustomAnswer ? (
                  <label className="lumen-question-option hbar-app-ui-questionnaire-option">
                    <LumenInput
                      type="radio"
                      name={`${requestId}:${question.id}`}
                      checked={answer?.kind === 'custom'}
                      onChange={() => onAnswer(requestId, question.id, { kind: 'custom', value: '' })}
                    />
                    <span>
                      <strong>{labels.customAnswerLabel}</strong>
                      {answer?.kind === 'custom' ? (
                        <LumenInput
                          aria-label={`${question.header} ${labels.customAnswerLabel}`}
                          type={question.secret ? 'password' : 'text'}
                          value={answer.value}
                          placeholder={labels.customAnswerPlaceholder}
                          onChange={(event) =>
                            onAnswer(requestId, question.id, {
                              kind: 'custom',
                              value: event.currentTarget.value,
                            })
                          }
                        />
                      ) : null}
                    </span>
                  </label>
                ) : null}
                {!hasOptions ? (
                  <div className="lumen-question-option lumen-question-freeform hbar-app-ui-questionnaire-option hbar-app-ui-questionnaire-freeform">
                    <span>
                      <strong>{labels.freeformLabel}</strong>
                      <LumenInput
                        aria-label={`${question.header} ${labels.freeformLabel}`}
                        type={question.secret ? 'password' : 'text'}
                        value={answer?.value ?? ''}
                        onChange={(event) =>
                          onAnswer(requestId, question.id, {
                            kind: 'custom',
                            value: event.currentTarget.value,
                          })
                        }
                      />
                    </span>
                  </div>
                ) : null}
              </div>
            </fieldset>
          )
        })}
      </div>
      {state.error ? (
        <LumenText className="hbar-app-ui-questionnaire-feedback" as="p" tone="danger" role="alert">
          {state.error}
        </LumenText>
      ) : null}
      <LumenDivider tone={state.error ? 'danger' : 'neutral'} />
      <footer className="hbar-app-ui-questionnaire-actions">
        <LumenButton tone="primary" disabled={disabled || questions.length === 0} onClick={() => onSubmit(requestId)}>
          <SessionGlyph name={state.status === 'pending' ? 'loading' : 'check'} />
          {submitLabel}
        </LumenButton>
      </footer>
    </LumenSurface>
  )
}

export interface LumenCompactUsageMetric {
  id: string
  label: string
  value: string
  detail?: string | undefined
}

export interface LumenCompactUsageProps {
  density?: 'default' | 'inline' | undefined
  title: string
  description: string
  value: string
  detail: string
  progress: number
  progressLabel: string
  tone: 'neutral' | 'accent' | 'positive' | 'warning' | 'danger'
  sparkline: readonly { id: string; value: number }[]
  sparklineLabel: string
  metrics: readonly LumenCompactUsageMetric[]
}

export function LumenCompactUsage({
  density = 'default',
  title,
  description,
  value,
  detail,
  progress,
  progressLabel,
  tone,
  sparkline,
  sparklineLabel,
  metrics,
}: LumenCompactUsageProps) {
  const normalized = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
  let mappedTone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | undefined
  switch (tone) {
    case 'accent':
      mappedTone = 'primary'
      break
    case 'positive':
      mappedTone = 'success'
      break
    case 'neutral':
    case 'warning':
    case 'danger':
      mappedTone = tone
      break
    default:
      mappedTone = undefined
  }
  if (density === 'inline') {
    let surfaceTone: NonNullable<LumenSurfaceProps['tone']> = 'neutral'
    if (mappedTone === 'primary') {
      surfaceTone = 'info'
    } else if (mappedTone === 'success' || mappedTone === 'warning' || mappedTone === 'danger') {
      surfaceTone = mappedTone
    }
    return (
      <LumenSurface
        as="section"
        boundary="horizontal"
        className="lumen-inline-usage-surface"
        contentPart="usage.inline" contentClassName="lumen-inline-usage"
        aria-label={title}
        title={description}
        data-tone={mappedTone}
        material="frost"
        tone={surfaceTone}
      >
        <div>
          <strong>{value}</strong>
          <span>{detail}</span>
        </div>
        <LumenCompactMetrics label={title} metrics={metrics} />
        <progress value={normalized} max={1} aria-label={progressLabel} />
      </LumenSurface>
    )
  }
  const points = uniqueById(sparkline)
  const maximum = Math.max(1, ...points.map((point) => (Number.isFinite(point.value) ? point.value : 0)))
  return (
    <section className="lumen-compact-usage" aria-label={title} title={description} data-tone={mappedTone}>
      <div className="lumen-usage-sparkline" role="img" aria-label={sparklineLabel}>
        {points.map((point) => (
          <i key={point.id} style={{ blockSize: `${Math.max(0, point.value / maximum) * 100}%` }} />
        ))}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
      <progress value={normalized} max={1} aria-label={progressLabel} />
      <LumenCompactMetrics label={title} metrics={metrics} />
    </section>
  )
}
