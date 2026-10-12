'use client'

import * as React from 'react'
import { LumenTextarea } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import './comments.css'
import './comments-discussion.css'
import {
  LumenCommentsAnnotationReference,
  type LumenCommentsAnnotationReferenceContent,
} from './comments-annotation-reference'
import {
  LumenCommentsCodeReviewReference,
  type LumenCommentsCodeReviewReferenceContent,
} from './comments-code-review-reference'
import {
  LumenCommentsComposerReference,
  type LumenCommentsComposerReferenceContent,
} from './comments-composer-reference'
import { LumenCommentsInboxReference, type LumenCommentsInboxReferenceContent } from './comments-inbox-reference'
import { LumenCommentsCanvasReference, type LumenCommentsCanvasReferenceContent } from './comments-canvas-reference'

export interface LumenCommentsListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenCommentsChoice {
  readonly id: string
  readonly label: string
}

export interface LumenCommentsMessage {
  readonly id: string
  readonly initials: string
  readonly author: string
  readonly body: string
  readonly meta: string
  readonly role?: string | undefined
  readonly reacted?: boolean | undefined
  readonly reaction?: string | undefined
  readonly reactionCount?: number | undefined
  readonly replies?: readonly LumenCommentsMessage[] | undefined
}

export interface LumenCommentsDiscussionContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sortLabel: string
    readonly resolve: string
    readonly resolved: string
    readonly replyPlaceholder: string
  }
  readonly sortOptions: readonly LumenCommentsChoice[]
  readonly initialSortId: string
  readonly initiallyResolved: boolean
  readonly messages: readonly LumenCommentsMessage[]
  readonly listStrategy: LumenCommentsListStrategy
}

export interface LumenCommentsDiscussionReferenceContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly sortLabel: string
    readonly replyPlaceholder: string
    readonly helper: string
    readonly comment: string
    readonly reply: string
    readonly moreActions: (author: string) => string
  }
  readonly sortOptions: readonly (LumenCommentsChoice & {
    readonly direction: 'newest' | 'oldest'
  })[]
  readonly sortId: string
  readonly draft: string
  readonly messages: readonly LumenCommentsMessage[]
  readonly listStrategy: LumenCommentsListStrategy
  readonly onSortChange?: ((id: string) => void) | undefined
  readonly onDraftChange?: ((value: string) => void) | undefined
  readonly onReactionToggle?: ((id: string) => void) | undefined
}

export interface LumenCommentsAnnotation {
  readonly id: string
  readonly before: string
  readonly text: string
  readonly after: string
  readonly initials: string
  readonly author: string
  readonly comment: string
}

export interface LumenCommentsAnnotationContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly reply: string
    readonly empty: string
  }
  readonly annotations: readonly LumenCommentsAnnotation[]
  readonly initialAnnotationId: string
  readonly listStrategy: LumenCommentsListStrategy
}

export interface LumenCommentsCodeLine {
  readonly id: string
  readonly value: string
  readonly tone: 'neutral' | 'added' | 'removed'
}

export interface LumenCommentsReviewContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly status: string
    readonly suggestion: string
    readonly accept: string
    readonly dismiss: string
  }
  readonly lines: readonly LumenCommentsCodeLine[]
  readonly suggestion: string
}

export interface LumenCommentsMention {
  readonly id: string
  readonly label: string
}

export interface LumenCommentsComposerContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly bold: string
    readonly boldMark?: string | undefined
    readonly italic: string
    readonly italicMark?: string | undefined
    readonly mention: string
    readonly mentionMark?: string | undefined
    readonly attach: string
    readonly attachMark?: string | undefined
    readonly placeholder: string
    readonly markdown: string
    readonly comment: string
  }
  readonly mentions: readonly LumenCommentsMention[]
  readonly listStrategy: LumenCommentsListStrategy
}

export interface LumenCommentsInboxItem {
  readonly id: string
  readonly title: string
  readonly meta: string
  readonly status: string
  readonly resolved: boolean
}

export interface LumenCommentsInboxContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly filterLabel: string
    readonly resolve: string
    readonly resolved: string
    readonly empty: string
  }
  readonly filters: readonly LumenCommentsChoice[]
  readonly initialFilterId: string
  readonly items: readonly LumenCommentsInboxItem[]
  readonly listStrategy: LumenCommentsListStrategy
}

export interface LumenCommentsCanvasPin {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
  readonly initials: string
  readonly title: string
  readonly body: string
}

export interface LumenCommentsCanvasContent {
  readonly labels: {
    readonly canvas: string
    readonly comments: string
    readonly selected: (label: string) => string
    readonly reply: string
    readonly empty: string
  }
  readonly pins: readonly LumenCommentsCanvasPin[]
  readonly initialPinId: string
  readonly listStrategy: LumenCommentsListStrategy
}

export interface LumenCommentsContent {
  readonly referenceCanvas?: LumenCommentsCanvasReferenceContent | undefined
  readonly referenceInbox?: LumenCommentsInboxReferenceContent | undefined
  readonly referenceComposer?: LumenCommentsComposerReferenceContent | undefined
  readonly referenceReview?: LumenCommentsCodeReviewReferenceContent | undefined
  readonly referenceAnnotation?: LumenCommentsAnnotationReferenceContent | undefined
  readonly referenceDiscussion?: LumenCommentsDiscussionReferenceContent | undefined
  readonly discussion?: LumenCommentsDiscussionContent | undefined
  readonly annotation?: LumenCommentsAnnotationContent | undefined
  readonly review?: LumenCommentsReviewContent | undefined
  readonly composer?: LumenCommentsComposerContent | undefined
  readonly inbox?: LumenCommentsInboxContent | undefined
  readonly canvas?: LumenCommentsCanvasContent | undefined
}

export interface LumenCommentsProviderProps {
  readonly content: LumenCommentsContent
  readonly children: React.ReactNode
}

export interface LumenCommentsAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenCommentsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenCommentsContent | undefined
  readonly onAction?: ((event: LumenCommentsAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenCommentsVariantProps = Omit<LumenCommentsProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenCommentsContent | undefined>(undefined)

export function LumenCommentsProvider({ content, children }: LumenCommentsProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenCommentsContent() {
  return React.useContext(Context)
}

export function uniqueLumenCommentsItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenCommentsItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenCommentsProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { readonly name: string }) {
  const paths: Readonly<Record<string, string>> = {
    check: 'm3 8 3 3 7-7',
    heart: 'M8 13S2 9 2 5a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8Z',
    close: 'm3 3 10 10m0-10L3 13',
    code: 'm6 4-4 4 4 4m4-8 4 4-4 4',
    bold: 'M5 2h4a3 3 0 0 1 0 6H5V2Zm0 6h5a3 3 0 0 1 0 6H5V8Z',
    italic: 'M7 2h6M3 14h6M10 2 6 14',
    mention: 'M11 5v5a2 2 0 0 0 4 0V8a7 7 0 1 0-4 6M11 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
    attach: 'M8 2v12M2 8h12',
  }
  const d = paths[name] ?? 'M2 3h12v8H7l-3 3v-3H2Z'
  return (
    <svg className="lumen-comments-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenCommentsProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-comments',
    `hbar-app-ui-comments-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      boundary={
        className?.includes('comments-canvas-reference') ||
        className?.includes('comments-inbox-reference') ||
        className?.includes('comments-composer-reference') ||
        className?.includes('comments-code-review-reference') ||
        className?.includes('comments-annotation-reference') ||
        className?.includes('comments-discussion-reference')
          ? 'none'
          : 'horizontal'
      }
      className="lumen-comments-surface"
      contentClassName={contentClassName}
      data-lumen-component="comments"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail }: { readonly title: string; readonly detail: string }) {
  return (
    <header className="lumen-comments-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {detail}
        </LumenText>
      </div>
    </header>
  )
}

function Message({
  message,
  onAction,
}: {
  readonly message: LumenCommentsMessage
  readonly onAction: LumenCommentsProps['onAction']
}) {
  return (
    <article className="lumen-comments-message">
      <span className="lumen-comments-avatar">{message.initials}</span>
      <div>
        <strong>{message.author}</strong>
        <p>{message.body}</p>
        <small>{message.meta}</small>
        {message.reaction ? (
          <LumenButton variant="text" onClick={() => report(onAction, 'reaction', message.id)}>
            <Glyph name="heart" />
            {message.reaction} {message.reactionCount ?? 0}
          </LumenButton>
        ) : null}
      </div>
      {message.replies?.length ? (
        <div className="lumen-comments-replies">
          {uniqueLumenCommentsItems(message.replies).map((reply) => (
            <Message key={reply.id} message={reply} onAction={onAction} />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function LegacyDiscussion(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsDiscussionContent }) {
  const { content, onAction } = props
  const [sort, setSort] = React.useState(content.initialSortId)
  const [resolved, setResolved] = React.useState(content.initiallyResolved)
  return (
    <Root {...props}>
      <Header title={content.labels.title} detail={content.labels.detail} />
      <div className="lumen-comments-toolbar" role="group" aria-label={content.labels.sortLabel}>
        {content.sortOptions.map((o) => (
          <LumenButton
            variant={sort === o.id ? 'solid' : 'text'}
            aria-pressed={sort === o.id}
            key={o.id}
            onClick={() => setSort(o.id)}
          >
            {o.label}
          </LumenButton>
        ))}
        <LumenButton
          variant="outlined"
          tone={resolved ? 'success' : 'neutral'}
          onClick={() => {
            const next = !resolved
            setResolved(next)
            report(onAction, 'resolve', String(next))
          }}
        >
          {resolved ? <Glyph name="check" /> : null}
          {resolved ? content.labels.resolved : content.labels.resolve}
        </LumenButton>
      </div>
      <div className="lumen-comments-thread" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        {uniqueLumenCommentsItems(content.messages).map((m) => (
          <Message key={m.id} message={m} onAction={onAction} />
        ))}
      </div>
      <LumenTextarea
        aria-label={content.labels.replyPlaceholder}
        placeholder={content.labels.replyPlaceholder}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            report(onAction, 'reply', event.currentTarget.value)
            event.currentTarget.value = ''
          }
        }}
      />
    </Root>
  )
}

function Discussion(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsDiscussionReferenceContent }) {
  const { content, onAction } = props
  const composerId = React.useId()
  const sort = selectLumenCommentsItem(content.sortOptions, content.sortId)
  const draft = content.draft
  const messages = uniqueLumenCommentsItems(content.messages)
  const ordered = sort?.direction === 'newest' ? [...messages].reverse() : messages
  return (
    <Root {...props} className={['lumen-comments-discussion-reference', props.className].filter(Boolean).join(' ')}>
      <div className="lumen-comments-discussion">
        <header className="lumen-comments-discussion-header">
          <div>
            <h2>{content.labels.title}</h2>
            <p>{content.labels.detail}</p>
          </div>
          <div className="lumen-comments-discussion-sort" role="tablist" aria-label={content.labels.sortLabel}>
            {content.sortOptions.map((option) => (
              <LumenButton
                type="button"
                role="tab"
                aria-selected={sort?.id === option.id}
                key={option.id}
                onClick={() => {
                  content.onSortChange?.(option.id)
                  report(onAction, 'sort', option.id)
                }}
              >
                {option.label}
              </LumenButton>
            ))}
          </div>
        </header>
        <div className="lumen-comments-discussion-thread" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {ordered.map((message) => {
            const pressed = message.reacted ?? false
            return (
              <article className="lumen-comments-discussion-message" key={message.id}>
                <span className="lumen-comments-discussion-avatar" aria-hidden="true">
                  {message.initials}
                </span>
                <div className="lumen-comments-discussion-message-body">
                  <div className="lumen-comments-discussion-byline">
                    <p>
                      <span className="lumen-comments-discussion-author">{message.author}</span>
                      <span>{message.role ? `${message.role} · ${message.meta}` : message.meta}</span>
                    </p>
                    <LumenButton
                      type="button"
                      className="lumen-comments-discussion-more"
                      aria-label={content.labels.moreActions(message.author)}
                      onClick={() => report(onAction, 'more', message.id)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="3" cy="8" r="1" />
                        <circle cx="8" cy="8" r="1" />
                        <circle cx="13" cy="8" r="1" />
                      </svg>
                    </LumenButton>
                  </div>
                  <p>{message.body}</p>
                  <div className="lumen-comments-discussion-actions">
                    {message.reactionCount !== undefined ? (
                      <LumenButton
                        type="button"
                        className="lumen-comments-discussion-reaction"
                        aria-pressed={pressed}
                        onClick={() => {
                          content.onReactionToggle?.(message.id)
                          report(onAction, 'reaction', message.id)
                        }}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <circle cx="8" cy="8" r="6" />
                          <path d="M5 9.5c1.5 2 4.5 2 6 0M5.8 6.5h.1m4.2 0h.1" />
                        </svg>
                        {message.reactionCount}
                      </LumenButton>
                    ) : null}
                    <LumenButton
                      type="button"
                      className="lumen-comments-discussion-reply"
                      onClick={() => report(onAction, 'reply', message.id)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="m6 4-4 4 4 4M2 8h7c3 0 5 1 5 4" />
                      </svg>
                      {content.labels.reply}
                    </LumenButton>
                  </div>
                  {message.replies?.length ? (
                    <div className="lumen-comments-discussion-replies">
                      {uniqueLumenCommentsItems(message.replies).map((reply) => (
                        <div className="lumen-comments-discussion-message" key={reply.id}>
                          <span className="lumen-comments-discussion-avatar" aria-hidden="true">
                            {reply.initials}
                          </span>
                          <div className="lumen-comments-discussion-message-body">
                            <div className="lumen-comments-discussion-byline">
                              <p>
                                <span className="lumen-comments-discussion-author">{reply.author}</span>
                                <span>{reply.meta}</span>
                              </p>
                            </div>
                            <p>{reply.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
        <div className="lumen-comments-discussion-composer">
          <div className="lumen-comments-discussion-editor">
            <label className="lumen-comments-discussion-label" htmlFor={composerId}>
              {content.labels.replyPlaceholder}
            </label>
            <LumenTextarea
              variant="plain"
              id={composerId}
              placeholder={content.labels.replyPlaceholder}
              value={draft}
              onChange={(event) => content.onDraftChange?.(event.currentTarget.value)}
            />
          </div>
          <div className="lumen-comments-discussion-footer">
            <p>{content.labels.helper}</p>
            <LumenButton type="button" disabled={!draft.trim()} onClick={() => report(onAction, 'comment', draft)}>
              {content.labels.comment}
            </LumenButton>
          </div>
        </div>
      </div>
    </Root>
  )
}

function Annotation(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsAnnotationContent }) {
  const items = uniqueLumenCommentsItems(props.content.annotations)
  const [id, setId] = React.useState(props.content.initialAnnotationId)
  const selected = selectLumenCommentsItem(items, id)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      {selected ? (
        <div className="lumen-comments-annotation">
          <article>
            {items.map((a) => (
              <p key={a.id}>
                {a.before}
                <LumenButton variant="text" aria-pressed={selected.id === a.id} onClick={() => setId(a.id)}>
                  {a.text}
                </LumenButton>
                {a.after}
              </p>
            ))}
          </article>
          <aside>
            <span className="lumen-comments-avatar">{selected.initials}</span>
            <strong>{selected.author}</strong>
            <p>{selected.comment}</p>
            <LumenButton variant="outlined" onClick={() => report(props.onAction, 'reply', selected.id)}>
              {props.content.labels.reply}
            </LumenButton>
          </aside>
        </div>
      ) : (
        <p>{props.content.labels.empty}</p>
      )}
    </Root>
  )
}

function Review(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsReviewContent }) {
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <LumenStatus value={props.content.labels.status} tone="warning" />
      <div className="lumen-comments-review">
        <pre>
          {uniqueLumenCommentsItems(props.content.lines).map((line) => (
            <code data-tone={line.tone} key={line.id}>
              {line.value}
            </code>
          ))}
        </pre>
        <aside>
          <Glyph name="code" />
          <strong>{props.content.labels.suggestion}</strong>
          <p>{props.content.suggestion}</p>
          <div>
            <LumenButton tone="primary" onClick={() => report(props.onAction, 'accept')}>
              {props.content.labels.accept}
            </LumenButton>
            <LumenButton variant="outlined" onClick={() => report(props.onAction, 'dismiss')}>
              {props.content.labels.dismiss}
            </LumenButton>
          </div>
        </aside>
      </div>
    </Root>
  )
}

function Composer(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsComposerContent }) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-comments-format">
        <LumenIconButton label={props.content.labels.bold}>
          {props.content.labels.boldMark ? <strong>{props.content.labels.boldMark}</strong> : <Glyph name="bold" />}
        </LumenIconButton>
        <LumenIconButton label={props.content.labels.italic}>
          {props.content.labels.italicMark ? <em>{props.content.labels.italicMark}</em> : <Glyph name="italic" />}
        </LumenIconButton>
        <LumenIconButton label={props.content.labels.mention} onClick={() => setOpen((v) => !v)}>
          {props.content.labels.mentionMark ?? <Glyph name="mention" />}
        </LumenIconButton>
        <LumenIconButton label={props.content.labels.attach}>
          {props.content.labels.attachMark ?? <Glyph name="attach" />}
        </LumenIconButton>
      </div>
      {open ? (
        <div className="lumen-comments-mentions" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          {uniqueLumenCommentsItems(props.content.mentions).map((m) => (
            <LumenButton
              variant="text"
              key={m.id}
              onClick={() => {
                setDraft((v) => `${v}@${m.label} `)
                setOpen(false)
              }}
            >
              {m.label}
            </LumenButton>
          ))}
        </div>
      ) : null}
      <LumenTextarea
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        placeholder={props.content.labels.placeholder}
      />
      <footer>
        <span>{props.content.labels.markdown}</span>
        <LumenButton
          tone="primary"
          disabled={!draft.trim()}
          onClick={() => report(props.onAction, 'comment', draft.trim())}
        >
          {props.content.labels.comment}
        </LumenButton>
      </footer>
    </Root>
  )
}

function Inbox(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsInboxContent }) {
  const [filter, setFilter] = React.useState(props.content.initialFilterId)
  const items = uniqueLumenCommentsItems(props.content.items)
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-comments-toolbar" role="group" aria-label={props.content.labels.filterLabel}>
        {props.content.filters.map((f) => (
          <LumenButton variant={filter === f.id ? 'solid' : 'text'} key={f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </LumenButton>
        ))}
      </div>
      <div className="lumen-comments-inbox" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {items.length ? (
          items.map((item) => (
            <article key={item.id}>
              <Glyph name="message" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </div>
              <LumenStatus value={item.status} tone={item.resolved ? 'success' : 'warning'} />
              <LumenButton
                variant="outlined"
                disabled={item.resolved}
                onClick={() => report(props.onAction, 'resolve', item.id)}
              >
                {item.resolved ? props.content.labels.resolved : props.content.labels.resolve}
              </LumenButton>
            </article>
          ))
        ) : (
          <p>{props.content.labels.empty}</p>
        )}
      </div>
    </Root>
  )
}

function Canvas(props: Omit<LumenCommentsProps, 'content'> & { content: LumenCommentsCanvasContent }) {
  const pins = uniqueLumenCommentsItems(props.content.pins)
  const [id, setId] = React.useState(props.content.initialPinId)
  const selected = selectLumenCommentsItem(pins, id)
  return (
    <Root {...props}>
      <div className="lumen-comments-canvas">
        <main aria-label={props.content.labels.canvas}>
          {pins.map((pin) => (
            <LumenButton
              key={pin.id}
              aria-pressed={selected?.id === pin.id}
              style={{
                insetInlineStart: `${Math.max(0, Math.min(100, pin.x))}%`,
                insetBlockStart: `${Math.max(0, Math.min(100, pin.y))}%`,
              }}
              onClick={() => setId(pin.id)}
            >
              {pin.label}
            </LumenButton>
          ))}
        </main>
        <aside>
          <Header
            title={props.content.labels.comments}
            detail={selected ? props.content.labels.selected(selected.label) : props.content.labels.empty}
          />
          {selected ? (
            <article>
              <span className="lumen-comments-avatar">{selected.initials}</span>
              <strong>{selected.title}</strong>
              <p>{selected.body}</p>
              <LumenButton variant="outlined" onClick={() => report(props.onAction, 'reply', selected.id)}>
                {props.content.labels.reply}
              </LumenButton>
            </article>
          ) : null}
        </aside>
      </div>
    </Root>
  )
}

function empty(props: LumenCommentsProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenComments(props: LumenCommentsProps) {
  const inheritedContent = useLumenCommentsContent()
  const c = props.content ?? inheritedContent
  if (props.variant === 1) {
    if (c?.referenceDiscussion) {
      return <Discussion {...props} content={c.referenceDiscussion} />
    }
    return c?.discussion ? <LegacyDiscussion {...props} content={c.discussion} /> : empty(props)
  }
  if (props.variant === 2) {
    if (c?.referenceAnnotation) {
      return (
        <Root
          {...props}
          className={['lumen-comments-annotation-reference', 'hbar-app-ui-stage-padding-owner', props.className]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenCommentsAnnotationReference content={c.referenceAnnotation} onAction={props.onAction} />
        </Root>
      )
    }
    return c?.annotation ? <Annotation {...props} content={c.annotation} /> : empty(props)
  }
  if (props.variant === 3) {
    if (c?.referenceReview) {
      return (
        <Root
          {...props}
          className={[
            'lumen-comments-code-review-reference',
            'hbar-app-ui-stage-padding-owner',
            'hbar-app-ui-full-canvas-owner',
            props.className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenCommentsCodeReviewReference content={c.referenceReview} onAction={props.onAction} />
        </Root>
      )
    }
    return c?.review ? <Review {...props} content={c.review} /> : empty(props)
  }
  if (props.variant === 4) {
    if (c?.referenceComposer) {
      return (
        <Root
          {...props}
          className={[
            'lumen-comments-composer-reference',
            'hbar-app-ui-stage-padding-owner',
            'hbar-app-ui-full-canvas-owner',
            props.className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenCommentsComposerReference content={c.referenceComposer} onAction={props.onAction} />
        </Root>
      )
    }
    return c?.composer ? <Composer {...props} content={c.composer} /> : empty(props)
  }
  if (props.variant === 5) {
    if (c?.referenceInbox) {
      return (
        <Root
          {...props}
          className={[
            'lumen-comments-inbox-reference',
            'hbar-app-ui-stage-padding-owner',
            'hbar-app-ui-full-canvas-owner',
            props.className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenCommentsInboxReference content={c.referenceInbox} onAction={props.onAction} />
        </Root>
      )
    }
    return c?.inbox ? <Inbox {...props} content={c.inbox} /> : empty(props)
  }
  if (props.variant === 6) {
    if (c?.referenceCanvas) {
      return (
        <Root
          {...props}
          className={[
            'lumen-comments-canvas-reference',
            'hbar-app-ui-stage-padding-owner',
            'hbar-app-ui-full-canvas-owner',
            props.className,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenCommentsCanvasReference content={c.referenceCanvas} onAction={props.onAction} />
        </Root>
      )
    }
    return c?.canvas ? <Canvas {...props} content={c.canvas} /> : empty(props)
  }
  return empty(props)
}

const variant = (n: number, p: LumenCommentsVariantProps) => (
  <LumenComments {...p} variant={n} variantId={`hbar-app-ui-comments-${n}`} />
)

export const LumenComments01 = (p: LumenCommentsVariantProps) => variant(1, p),
  LumenComments02 = (p: LumenCommentsVariantProps) => variant(2, p),
  LumenComments03 = (p: LumenCommentsVariantProps) => variant(3, p),
  LumenComments04 = (p: LumenCommentsVariantProps) => variant(4, p),
  LumenComments05 = (p: LumenCommentsVariantProps) => variant(5, p),
  LumenComments06 = (p: LumenCommentsVariantProps) => variant(6, p)
