'use client'

import * as React from 'react'
import { LumenInput, LumenTextarea } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenStatus, LumenText } from './primitives'
import './chat.css'
import './chat-reference.css'
import { LumenChatDirectReference } from './chat-direct-reference'
import { LumenChatSocialReference } from './chat-social-reference'
import { LumenChatSupportReference } from './chat-support-reference'
import { LumenChatGroupReference } from './chat-group-reference'
import { LumenChatLiveReference } from './chat-live-reference'
import {
  type LumenChatDirectReferenceLayout,
  type LumenChatSocialReferenceLayout,
  type LumenChatSupportReferenceLayout,
  type LumenChatGroupReferenceLayout,
  type LumenChatLiveReferenceLayout,
} from './chat/reference-content'
import { LumenBadge, LumenChip } from './ui-controls'

export interface LumenChatListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenChatChoice {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
}

export interface LumenChatMessage {
  readonly id: string
  readonly author: string
  readonly initials: string
  readonly body: string
  readonly meta: string
  readonly outgoing?: boolean | undefined
  readonly reactionCount?: number | undefined
  readonly replyCount?: number | undefined
  readonly attachment?: string | undefined
  readonly status?: string | undefined
  readonly read?: boolean | undefined
}

export interface LumenChatComposerFlow {
  readonly draft: string
  readonly pending: boolean
  readonly error: string | null
  readonly feedback: string | null
  readonly onDraftChange: (draft: string) => void
  readonly onSubmit: () => void
}

export interface LumenChatTeamReferenceFlow {
  readonly channelId: string
  readonly onChannelChange: (channelId: string) => void
  readonly composer: LumenChatComposerFlow
}

export interface LumenChatDirectReferenceFlow {
  readonly contactId: string
  readonly onContactChange: (contactId: string) => void
  readonly composer: LumenChatComposerFlow
  readonly query?: string | undefined
  readonly onQueryChange?: ((query: string) => void) | undefined
}

export interface LumenChatSocialReferenceFlow {
  readonly composer: LumenChatComposerFlow
  readonly sortOrder?: 'relevant' | 'recent' | undefined
  readonly likedIds?: readonly string[] | undefined
  readonly onSortChange?: ((order: 'relevant' | 'recent') => void) | undefined
  readonly onToggleLike?: ((messageId: string) => void) | undefined
}

export interface LumenChatGroupReferenceFlow {
  readonly composer: LumenChatComposerFlow
  readonly selectedReactionIds?: readonly string[] | undefined
  readonly onToggleReaction?: ((reactionId: string) => void) | undefined
}

export interface LumenChatLiveReferenceFlow {
  readonly tabId: string
  readonly onTabChange: (tabId: string) => void
  readonly composer: LumenChatComposerFlow
  readonly followed?: boolean | undefined
  readonly onFollowChange?: ((followed: boolean) => void) | undefined
}

export interface LumenChatSupportReferenceFlow {
  readonly composer: LumenChatComposerFlow
  readonly messages: readonly LumenChatMessage[]
  readonly rating: number
  readonly onRatingChange: (rating: number) => void
  readonly onQuickReply: (id: string) => void
}

export interface LumenChatTeamReferenceLayout {
  readonly labels: {
    readonly pin: string
    readonly members: string
    readonly day: string
    readonly typing: string
    readonly attach: string
    readonly emoji: string
  }
  readonly memberCount: string
}

export interface LumenChatTeamContent {
  readonly labels: {
    readonly channels: string
    readonly direct: string
    readonly channelPrefix: string
    readonly detail: string
    readonly reaction: (author: string) => string
    readonly reply: string
    readonly send: string
    readonly placeholder: (channel: string) => string
    readonly empty: string
  }
  readonly channels: readonly LumenChatChoice[]
  readonly initialChannelId: string
  readonly directChoice: LumenChatChoice
  readonly messages: readonly (LumenChatMessage & { readonly channelId: string })[]
  readonly listStrategy: LumenChatListStrategy
  readonly referenceFlow?: LumenChatTeamReferenceFlow | undefined
  readonly referenceLayout?: LumenChatTeamReferenceLayout | undefined
}

export interface LumenChatContact {
  readonly id: string
  readonly name: string
  readonly initials: string
  readonly meta: string
  readonly status?: string | undefined
  readonly time?: string | undefined
  readonly unreadCount?: string | undefined
}

export interface LumenChatDirectContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly conversationDetail: string
    readonly send: string
    readonly placeholder: (contact: string) => string
    readonly emptyContacts: string
    readonly emptyMessages: string
  }
  readonly contacts: readonly LumenChatContact[]
  readonly initialContactId: string
  readonly messages: readonly (LumenChatMessage & { readonly contactId: string })[]
  readonly listStrategy: LumenChatListStrategy
  readonly referenceFlow?: LumenChatDirectReferenceFlow | undefined
  readonly referenceLayout?: LumenChatDirectReferenceLayout | undefined
}

export interface LumenChatSocialContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly reaction: (author: string) => string
    readonly replies: string
    readonly send: string
    readonly placeholder: string
    readonly empty: string
  }
  readonly post: LumenChatMessage
  readonly replies: readonly LumenChatMessage[]
  readonly listStrategy: LumenChatListStrategy
  readonly referenceFlow?: LumenChatSocialReferenceFlow | undefined
  readonly referenceLayout?: LumenChatSocialReferenceLayout | undefined
}

export interface LumenChatAttachment {
  readonly id: string
  readonly label: string
}

export interface LumenChatSupportContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly quickReplies: string
    readonly attach: string
    readonly rating: string
    readonly ratingValue: (value: number) => string
    readonly send: string
    readonly placeholder: string
  }
  readonly assistant: LumenChatMessage
  readonly quickReplies: readonly LumenChatChoice[]
  readonly attachment?: LumenChatAttachment | undefined
  readonly maximumRating: number
  readonly initialRating: number
  readonly referenceFlow?: LumenChatSupportReferenceFlow | undefined
  readonly referenceLayout?: LumenChatSupportReferenceLayout | undefined
}

export interface LumenChatParticipant {
  readonly id: string
  readonly name: string
  readonly initials: string
}

export interface LumenChatGroupContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly participants: string
    readonly overflowParticipants: (count: number) => string
    readonly invite: string
    readonly reaction: (author: string) => string
    readonly replies: (count: number) => string
    readonly send: string
    readonly placeholder: string
    readonly empty: string
  }
  readonly participants: readonly LumenChatParticipant[]
  readonly maximumVisibleParticipants: number
  readonly messages: readonly LumenChatMessage[]
  readonly listStrategy: LumenChatListStrategy
  readonly referenceFlow?: LumenChatGroupReferenceFlow | undefined
  readonly referenceLayout?: LumenChatGroupReferenceLayout | undefined
}

export interface LumenChatLiveMessage extends LumenChatMessage {
  readonly role?: string | undefined
}

export interface LumenChatLiveContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly tabs: string
    readonly pinned: string
    readonly viewers: (count: number) => string
    readonly send: string
    readonly placeholder: string
    readonly emptyChat: string
    readonly emptyViewers: string
  }
  readonly tabs: readonly LumenChatChoice[]
  readonly chatTabId: string
  readonly viewersTabId: string
  readonly initialTabId: string
  readonly pinnedNotice: string
  readonly messages: readonly LumenChatLiveMessage[]
  readonly viewers: readonly LumenChatParticipant[]
  readonly viewerCount: number
  readonly listStrategy: LumenChatListStrategy
  readonly referenceFlow?: LumenChatLiveReferenceFlow | undefined
  readonly referenceLayout?: LumenChatLiveReferenceLayout | undefined
}

export interface LumenChatContent {
  readonly team?: LumenChatTeamContent | undefined
  readonly direct?: LumenChatDirectContent | undefined
  readonly social?: LumenChatSocialContent | undefined
  readonly support?: LumenChatSupportContent | undefined
  readonly group?: LumenChatGroupContent | undefined
  readonly live?: LumenChatLiveContent | undefined
}

export interface LumenChatProviderProps {
  readonly content: LumenChatContent
  readonly children: React.ReactNode
}

export interface LumenChatAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenChatProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenChatContent | undefined
  readonly onAction?: ((event: LumenChatAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenChatVariantProps = Omit<LumenChatProps, 'variant' | 'variantId'>

const ChatContext = React.createContext<LumenChatContent | undefined>(undefined)

export function LumenChatProvider({ content, children }: LumenChatProviderProps) {
  return <ChatContext.Provider value={content}>{children}</ChatContext.Provider>
}

export function useLumenChatContent() {
  return React.useContext(ChatContext)
}

export function uniqueLumenChatItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenChatItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenChatProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

interface GlyphProps {
  readonly name: 'heart' | 'paperclip' | 'image' | 'users' | 'bell' | 'send' | 'pin' | 'smile' | 'star'
  readonly size?: 'xs' | 'sm' | 'md' | undefined
}

const glyphPaths: Record<GlyphProps['name'], string> = {
  heart: 'M8 13S2 9.5 2 5.5A3 3 0 0 1 8 4a3 3 0 0 1 6 1.5C14 9.5 8 13 8 13Z',
  paperclip: 'm5 8 4.5-4.5a2 2 0 0 1 3 3L7 12a3 3 0 0 1-4-4l5-5',
  image: 'M2 3h12v10H2Zm2 8 3-3 2 2 2-3 3 4M5 6h.01',
  users: 'M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5-1a2.5 2.5 0 0 0 0-5M1 14c0-2.4 2.2-4 5-4s5 1.6 5 4m1-4c1.8.3 3 1.7 3 4',
  bell: 'M4 7a4 4 0 0 1 8 0v3l1.5 2h-11L4 10Zm2.5 7h3',
  pin: 'M5 2h6l-.5 4 2 2v1H9v5l-1 1-1-1V9H3V8l2-2-.5-4Z',
  smile: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12ZM5.5 9.5s.8 1.5 2.5 1.5 2.5-1.5 2.5-1.5M5.5 6.5h.01M10.5 6.5h.01',
  star: 'm8 1.5 2 4 4.5.7-3.25 3.2L12 14l-4-2.1L4 14l.75-4.6L1.5 6.2 6 5.5Z',
  send: 'm3 8 10-5-3 10-2-4Z',
}

function Glyph({ name, size = 'md' }: GlyphProps) {
  return (
    <svg className={`lumen-chat-glyph lumen-chat-glyph-${size}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={glyphPaths[name]} />
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
}: Omit<LumenChatProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-chat',
    `hbar-app-ui-chat-variant-${variant}`,
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
      boundary="horizontal"
      className="lumen-chat-surface"
      contentClassName={contentClassName}
      data-lumen-component="chat"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return (
    <header className="lumen-chat-header">
      <div>
        <LumenText as="h2" variant="heading">
          {title}
        </LumenText>
        <LumenText as="p" tone="muted" variant="supporting">
          {detail}
        </LumenText>
      </div>
      {actions}
    </header>
  )
}

function Avatar({ initials, large = false }: { initials: string; large?: boolean | undefined }) {
  return (
    <span className={large ? 'lumen-chat-avatar is-large' : 'lumen-chat-avatar'} aria-hidden="true">
      {initials}
    </span>
  )
}

interface ComposerProps {
  readonly placeholder: string
  readonly label?: string | undefined
  readonly disabled?: boolean | undefined
  readonly send: string
  readonly actionId: string
  readonly onAction: LumenChatProps['onAction']
  readonly flow?: LumenChatComposerFlow | undefined
  readonly leadingActions?: React.ReactNode
  readonly singleLine?: boolean | undefined
}

interface LegacyComposerProps extends Omit<ComposerProps, 'flow' | 'singleLine'> {}

interface ReferenceComposerProps extends ComposerProps {
  readonly flow: LumenChatComposerFlow
}

const unavailableReferenceComposer: LumenChatComposerFlow = {
  draft: '',
  pending: false,
  error: null,
  feedback: null,
  onDraftChange() {},
  onSubmit() {},
}

function Composer(props: ComposerProps) {
  if (props.flow) {
    return <ReferenceComposer {...props} flow={props.flow} />
  }
  if (props.singleLine || props.label !== undefined) {
    return <ReferenceComposer {...props} disabled flow={unavailableReferenceComposer} />
  }
  return <LegacyComposer {...props} />
}

function LegacyComposer({ placeholder, send, actionId, onAction, leadingActions }: LegacyComposerProps) {
  const [draft, setDraft] = React.useState('')
  const submit = () => {
    const value = draft.trim()
    if (!value) {
      return
    }
    report(onAction, actionId, value)
    setDraft('')
  }
  return (
    <div className="lumen-chat-composer">
      <LumenTextarea
        rows={2}
        value={draft}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      {leadingActions ? (
        <div className="lumen-chat-composer-actions">
          {leadingActions}
          <LumenButton tone="primary" disabled={!draft.trim()} onClick={submit}>
            <Glyph name="send" />
            {send}
          </LumenButton>
        </div>
      ) : (
        <LumenButton tone="primary" disabled={!draft.trim()} onClick={submit}>
          <Glyph name="send" />
          {send}
        </LumenButton>
      )}
    </div>
  )
}

function ReferenceComposer({
  placeholder,
  label,
  disabled = false,
  send,
  flow,
  leadingActions,
  singleLine = false,
}: ReferenceComposerProps) {
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!disabled && !flow.pending && flow.draft.trim()) {
      flow.onSubmit()
    }
  }
  const fieldProps = {
    'aria-label': label ?? placeholder,
    className: 'lumen-chat-reference-input',
    'data-hbar-app-ui-field': 'draft',
    disabled: disabled || flow.pending,
    placeholder,
    value: flow.draft,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      flow.onDraftChange(event.currentTarget.value),
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && (singleLine || !event.shiftKey)) {
        event.preventDefault()
        if (!disabled && !flow.pending && flow.draft.trim()) {
          flow.onSubmit()
        }
      }
    },
  }
  return (
    <div className="lumen-chat-composer-stack" aria-busy={flow.pending || undefined}>
      <form className="lumen-chat-composer lumen-chat-composer-reference" onSubmit={submit}>
        {singleLine ? <LumenInput {...fieldProps} type="text" /> : <LumenTextarea {...fieldProps} rows={2} />}
        <div className="lumen-chat-composer-actions">
          {leadingActions}
          <LumenButton
            type="submit"
            tone="primary"
            loading={flow.pending}
            disabled={disabled || !flow.draft.trim()}
            data-hbar-app-ui-action="send"
          >
            <Glyph name="send" />
            {send}
          </LumenButton>
        </div>
      </form>
      {flow.error || flow.feedback ? (
        <LumenText
          as="p"
          className="lumen-chat-composer-feedback"
          tone={flow.error ? 'danger' : 'muted'}
          role={flow.error ? 'alert' : 'status'}
          aria-live={flow.error ? 'assertive' : 'polite'}
        >
          {flow.error ?? flow.feedback}
        </LumenText>
      ) : null}
    </div>
  )
}

function Message({
  message,
  reactionLabel,
  replyLabel,
  onAction,
}: {
  message: LumenChatMessage
  reactionLabel?: string | undefined
  replyLabel?: string | undefined
  onAction?: LumenChatProps['onAction'] | undefined
}) {
  const [reactions, setReactions] = React.useState(message.reactionCount ?? 0)
  return (
    <article className={message.outgoing ? 'lumen-chat-message is-outgoing' : 'lumen-chat-message'}>
      <Avatar initials={message.initials} />
      <div>
        <header>
          <LumenText as="strong" variant="label">
            {message.author}
          </LumenText>
          {message.status ? <LumenStatus value={message.status} /> : null}
        </header>
        <LumenText as="p">{message.body}</LumenText>
        {message.attachment ? (
          <LumenChip
            className="lumen-chat-attachment"
            startAdornment={<Glyph name="image" />}
            label={message.attachment}
          />
        ) : null}
        <footer>
          <LumenText as="small" tone="muted" variant="supporting">
            {message.meta}
          </LumenText>
          {reactionLabel ? (
            <LumenButton
              variant="text"
              aria-label={reactionLabel}
              onClick={() => {
                setReactions((value) => value + 1)
                report(onAction, 'react', message.id)
              }}
            >
              <Glyph name="heart" />
              {reactions}
            </LumenButton>
          ) : null}
          {replyLabel ? (
            <LumenButton variant="text" onClick={() => report(onAction, 'reply-to', message.id)}>
              {replyLabel}
            </LumenButton>
          ) : null}
        </footer>
      </div>
    </article>
  )
}

function TeamReferenceMessage({ message }: { readonly message: LumenChatMessage }) {
  return (
    <article className="lumen-chat-reference-message">
      <Avatar initials={message.initials} />
      <div className="lumen-chat-reference-message-copy">
        <header>
          <LumenText as="strong" variant="label">
            {message.author}
          </LumenText>
          <LumenText as="small" tone="muted" variant="supporting">
            {message.meta}
          </LumenText>
        </header>
        <LumenText as="p">{message.body}</LumenText>
      </div>
    </article>
  )
}

function Team(props: Omit<LumenChatProps, 'content'> & { content: LumenChatTeamContent }) {
  const channels = uniqueLumenChatItems(props.content.channels)
  const messages = uniqueLumenChatItems(props.content.messages)
  const [channelId, setChannelId] = React.useState(props.content.initialChannelId)
  const referenceFlow = props.content.referenceFlow
  const channel = selectLumenChatItem(channels, referenceFlow?.channelId ?? channelId)
  const visible = channel ? messages.filter((message) => message.channelId === channel.id) : []
  if (props.content.referenceLayout) {
    return (
      <TeamReference
        {...props}
        content={props.content}
        channel={channel}
        messages={visible}
        referenceFlow={referenceFlow}
        layout={props.content.referenceLayout}
      />
    )
  }
  return (
    <Root {...props}>
      <div className="lumen-chat-split">
        <aside className="lumen-chat-navigation">
          <LumenText as="strong" variant="label">
            {props.content.labels.channels}
          </LumenText>
          {channels.map((item) => (
            <LumenButton
              key={item.id}
              variant={channel?.id === item.id ? 'solid' : 'text'}
              aria-pressed={channel?.id === item.id}
              disabled={item.disabled}
              onClick={() => {
                if (referenceFlow) {
                  referenceFlow.onChannelChange(item.id)
                } else {
                  setChannelId(item.id)
                }
              }}
            >
              {props.content.labels.channelPrefix}
              {item.label}
            </LumenButton>
          ))}
          <LumenText as="strong" variant="label">
            {props.content.labels.direct}
          </LumenText>
          <LumenButton
            variant="text"
            disabled={props.content.directChoice.disabled}
            onClick={() => report(props.onAction, 'open-direct', props.content.directChoice.id)}
          >
            {props.content.directChoice.label}
          </LumenButton>
        </aside>
        <main>
          <Header
            title={`${props.content.labels.channelPrefix}${channel?.label ?? ''}`}
            detail={props.content.labels.detail}
          />
          <div className="lumen-chat-message-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {visible.length ? (
              visible.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  reactionLabel={props.content.labels.reaction(message.author)}
                  replyLabel={props.content.labels.reply}
                  onAction={props.onAction}
                />
              ))
            ) : (
              <LumenText as="p" tone="muted">
                {props.content.labels.empty}
              </LumenText>
            )}
          </div>
          <Composer
            placeholder={props.content.labels.placeholder(channel?.label ?? '')}
            send={props.content.labels.send}
            actionId="send"
            onAction={props.onAction}
            flow={referenceFlow?.composer}
          />
        </main>
      </div>
    </Root>
  )
}

function TeamReference({
  content,
  channel,
  messages,
  referenceFlow,
  layout,
  ...props
}: Omit<LumenChatProps, 'content'> & {
  readonly content: LumenChatTeamContent
  readonly channel: LumenChatChoice | undefined
  readonly messages: readonly (LumenChatMessage & { readonly channelId: string })[]
  readonly referenceFlow: LumenChatTeamReferenceFlow | undefined
  readonly layout: LumenChatTeamReferenceLayout
}) {
  return (
    <Root {...props} className={['lumen-chat-reference-team', props.className].filter(Boolean).join(' ')}>
      <Header
        title={channel ? `${content.labels.channelPrefix}${channel.label}` : content.labels.channels}
        detail={content.labels.detail}
        actions={
          <div className="lumen-chat-reference-toolbar" data-hbar-app-ui-region="conversation-actions">
            <LumenButton
              variant="text"
              aria-label={layout.labels.pin}
              data-hbar-app-ui-action="open-pinned-messages"
              onClick={() => report(props.onAction, 'open-pinned-messages')}
            >
              <Glyph name="pin" size="sm" />
            </LumenButton>
            <LumenButton
              variant="text"
              aria-label={layout.labels.members}
              data-hbar-app-ui-action="open-members"
              onClick={() => report(props.onAction, 'open-members', layout.memberCount)}
            >
              <Glyph name="users" size="sm" />
              {layout.memberCount}
            </LumenButton>
          </div>
        }
      />
      <div className="lumen-chat-reference-pane" data-hbar-app-ui-region="conversation">
        <LumenText as="p" className="lumen-chat-reference-day" variant="supporting">
          {layout.labels.day}
        </LumenText>
        <div
          className="lumen-chat-reference-messages"
          data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.length ? (
            messages.map((message) => <TeamReferenceMessage key={message.id} message={message} />)
          ) : (
            <LumenText as="p" tone="muted">
              {content.labels.empty}
            </LumenText>
          )}
        </div>
        <LumenText as="p" className="lumen-chat-reference-typing" role="status" aria-live="polite">
          {layout.labels.typing}
        </LumenText>
      </div>
      <Composer
        placeholder={content.labels.placeholder(channel?.label ?? '')}
        send={content.labels.send}
        actionId="send"
        onAction={props.onAction}
        flow={referenceFlow?.composer}
        singleLine
        leadingActions={
          <React.Fragment>
            <LumenButton
              variant="text"
              aria-label={layout.labels.attach}
              data-hbar-app-ui-action="attach"
              disabled={referenceFlow?.composer.pending}
              onClick={() => report(props.onAction, 'attach')}
            >
              <Glyph name="paperclip" size="sm" />
            </LumenButton>
            <LumenButton
              variant="text"
              aria-label={layout.labels.emoji}
              data-hbar-app-ui-action="add-emoji"
              disabled={referenceFlow?.composer.pending}
              onClick={() => report(props.onAction, 'add-emoji')}
            >
              <Glyph name="smile" size="sm" />
            </LumenButton>
          </React.Fragment>
        }
      />
    </Root>
  )
}

function Direct(props: Omit<LumenChatProps, 'content'> & { content: LumenChatDirectContent }) {
  const contacts = uniqueLumenChatItems(props.content.contacts)
  const messages = uniqueLumenChatItems(props.content.messages)
  const [contactId, setContactId] = React.useState(props.content.initialContactId)
  const referenceFlow = props.content.referenceFlow
  const contact = selectLumenChatItem(contacts, referenceFlow?.contactId ?? contactId)
  const visible = contact ? messages.filter((message) => message.contactId === contact.id) : []
  const layout = props.content.referenceLayout
  if (layout) {
    return (
      <Root {...props} className={['lumen-chat-direct-reference-root', props.className].filter(Boolean).join(' ')}>
        <LumenChatDirectReference
          content={props.content}
          layout={layout}
          onAction={props.onAction}
          composer={
            <Composer
              placeholder={layout.labels.inputPlaceholder}
              label={layout.labels.inputLabel(contact?.name ?? '')}
              disabled={!contact}
              send={props.content.labels.send}
              actionId="send"
              onAction={props.onAction}
              flow={referenceFlow?.composer}
              singleLine
              leadingActions={
                <LumenButton
                  variant="text"
                  aria-label={layout.labels.attachImage}
                  disabled={!contact}
                  onClick={() => report(props.onAction, 'attach-image', contact?.id)}
                >
                  <Glyph name="image" size="sm" />
                </LumenButton>
              }
            />
          }
        />
      </Root>
    )
  }
  return (
    <Root {...props}>
      <div className="lumen-chat-split lumen-chat-direct">
        <aside>
          <Header title={props.content.labels.title} detail={props.content.labels.detail} />
          <div className="lumen-chat-contact-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {contacts.length ? (
              contacts.map((item) => (
                <LumenButton
                  key={item.id}
                  variant={contact?.id === item.id ? 'solid' : 'text'}
                  aria-pressed={contact?.id === item.id}
                  onClick={() => {
                    if (referenceFlow) {
                      referenceFlow.onContactChange(item.id)
                    } else {
                      setContactId(item.id)
                    }
                  }}
                >
                  <Avatar initials={item.initials} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.meta}</small>
                  </span>
                  {item.status ? <LumenStatus value={item.status} /> : null}
                </LumenButton>
              ))
            ) : (
              <LumenText as="p" tone="muted">
                {props.content.labels.emptyContacts}
              </LumenText>
            )}
          </div>
        </aside>
        <main>
          <Header
            title={contact?.name ?? props.content.labels.emptyContacts}
            detail={props.content.labels.conversationDetail}
          />
          <div className="lumen-chat-message-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {visible.length ? (
              visible.map((message) => <Message key={message.id} message={message} />)
            ) : (
              <LumenText as="p" tone="muted">
                {props.content.labels.emptyMessages}
              </LumenText>
            )}
          </div>
          <Composer
            placeholder={props.content.labels.placeholder(contact?.name ?? '')}
            send={props.content.labels.send}
            actionId="send"
            onAction={props.onAction}
            flow={referenceFlow?.composer}
          />
        </main>
      </div>
    </Root>
  )
}

function Social(props: Omit<LumenChatProps, 'content'> & { content: LumenChatSocialContent }) {
  const replies = uniqueLumenChatItems(props.content.replies)
  const referenceFlow = props.content.referenceFlow
  const layout = props.content.referenceLayout
  if (layout) {
    return (
      <Root {...props} className={['lumen-chat-social-reference-root', props.className].filter(Boolean).join(' ')}>
        <LumenChatSocialReference
          content={props.content}
          layout={layout}
          onAction={props.onAction}
          composer={
            <Composer
              placeholder={props.content.labels.placeholder}
              label={layout.labels.inputLabel}
              send={props.content.labels.send}
              actionId="reply"
              onAction={props.onAction}
              flow={referenceFlow?.composer}
            />
          }
        />
      </Root>
    )
  }
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-chat-lead-post">
        <Message
          message={props.content.post}
          reactionLabel={props.content.labels.reaction(props.content.post.author)}
          onAction={props.onAction}
        />
      </div>
      <LumenText as="h3" variant="label">
        {props.content.labels.replies}
      </LumenText>
      <div className="lumen-chat-nested-replies" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {replies.length ? (
          replies.map((message) => (
            <Message
              key={message.id}
              message={message}
              reactionLabel={props.content.labels.reaction(message.author)}
              onAction={props.onAction}
            />
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <Composer
        placeholder={props.content.labels.placeholder}
        send={props.content.labels.send}
        actionId="reply"
        onAction={props.onAction}
        flow={referenceFlow?.composer}
      />
    </Root>
  )
}

function Support(props: Omit<LumenChatProps, 'content'> & { content: LumenChatSupportContent }) {
  const quickReplies = uniqueLumenChatItems(props.content.quickReplies)
  const referenceFlow = props.content.referenceFlow
  const maximum = Math.max(0, Math.floor(props.content.maximumRating))
  const [localRating, setLocalRating] = React.useState(Math.max(0, Math.min(maximum, props.content.initialRating)))
  const rating = Math.max(0, Math.min(maximum, referenceFlow?.rating ?? localRating))
  const messages = uniqueLumenChatItems(referenceFlow?.messages ?? [props.content.assistant])
  const layout = props.content.referenceLayout
  if (layout) {
    return (
      <Root {...props} className={['lumen-chat-support-reference-root', props.className].filter(Boolean).join(' ')}>
        <LumenChatSupportReference
          content={props.content}
          layout={layout}
          onAction={props.onAction}
          composer={
            <Composer
              placeholder={props.content.labels.placeholder}
              label={layout.labels.inputLabel}
              send={props.content.labels.send}
              actionId="send"
              onAction={props.onAction}
              flow={referenceFlow?.composer}
              singleLine
              leadingActions={
                <LumenButton
                  variant="text"
                  aria-label={props.content.labels.attach}
                  onClick={() => report(props.onAction, 'attach', props.content.assistant.id)}
                >
                  <Glyph name="paperclip" size="sm" />
                </LumenButton>
              }
            />
          }
        />
      </Root>
    )
  }
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div className="lumen-chat-quick-replies" role="group" aria-label={props.content.labels.quickReplies}>
        {quickReplies.map((item) => (
          <LumenButton
            key={item.id}
            variant="outlined"
            disabled={item.disabled}
            onClick={() => {
              if (referenceFlow) {
                referenceFlow.onQuickReply(item.id)
              } else {
                report(props.onAction, 'quick-reply', item.id)
              }
            }}
          >
            {item.label}
          </LumenButton>
        ))}
      </div>
      {props.content.attachment ? (
        <div className="lumen-chat-support-attachment">
          <LumenButton
            variant="outlined"
            onClick={() => report(props.onAction, 'attach', props.content.attachment?.id)}
          >
            <Glyph name="paperclip" />
            {props.content.labels.attach}
          </LumenButton>
          <LumenText as="span" tone="muted">
            {props.content.attachment.label}
          </LumenText>
        </div>
      ) : null}
      <div className="lumen-chat-rating" role="group" aria-label={props.content.labels.rating}>
        {Array.from({ length: maximum }, (_, index) => index + 1).map((value) => (
          <LumenButton
            key={value}
            variant={rating >= value ? 'solid' : 'text'}
            aria-label={props.content.labels.ratingValue(value)}
            aria-pressed={rating >= value}
            onClick={() => {
              if (referenceFlow) {
                referenceFlow.onRatingChange(value)
              } else {
                setLocalRating(value)
                report(props.onAction, 'rate', String(value))
              }
            }}
          >
            <Glyph name="star" size="sm" />
          </LumenButton>
        ))}
      </div>
      <Composer
        placeholder={props.content.labels.placeholder}
        send={props.content.labels.send}
        actionId="send"
        onAction={props.onAction}
        flow={referenceFlow?.composer}
      />
    </Root>
  )
}

function Group(props: Omit<LumenChatProps, 'content'> & { content: LumenChatGroupContent }) {
  const participants = uniqueLumenChatItems(props.content.participants)
  const messages = uniqueLumenChatItems(props.content.messages)
  const referenceFlow = props.content.referenceFlow
  const visibleLimit = Math.max(0, Math.floor(props.content.maximumVisibleParticipants))
  const visibleParticipants = participants.slice(0, visibleLimit)
  const overflow = Math.max(0, participants.length - visibleParticipants.length)
  const layout = props.content.referenceLayout
  if (layout) {
    return (
      <Root {...props} className={['lumen-chat-group-reference-root', props.className].filter(Boolean).join(' ')}>
        <LumenChatGroupReference content={props.content} layout={layout} onAction={props.onAction} />
      </Root>
    )
  }
  return (
    <Root {...props}>
      <Header
        title={props.content.labels.title}
        detail={props.content.labels.detail}
        actions={
          <LumenButton variant="outlined" onClick={() => report(props.onAction, 'invite')}>
            <Glyph name="users" />
            {props.content.labels.invite}
          </LumenButton>
        }
      />
      <div className="lumen-chat-participants" aria-label={props.content.labels.participants}>
        {visibleParticipants.map((participant) => (
          <Avatar key={participant.id} initials={participant.initials} />
        ))}
        {overflow ? <LumenBadge value={props.content.labels.overflowParticipants(overflow)} /> : null}
      </div>
      <div className="lumen-chat-message-list" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {messages.length ? (
          messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              reactionLabel={props.content.labels.reaction(message.author)}
              replyLabel={props.content.labels.replies(message.replyCount ?? 0)}
              onAction={props.onAction}
            />
          ))
        ) : (
          <LumenText as="p" tone="muted">
            {props.content.labels.empty}
          </LumenText>
        )}
      </div>
      <Composer
        placeholder={props.content.labels.placeholder}
        send={props.content.labels.send}
        actionId="send"
        onAction={props.onAction}
        flow={referenceFlow?.composer}
      />
    </Root>
  )
}

function Live(props: Omit<LumenChatProps, 'content'> & { content: LumenChatLiveContent }) {
  const tabs = uniqueLumenChatItems(props.content.tabs)
  const messages = uniqueLumenChatItems(props.content.messages)
  const viewers = uniqueLumenChatItems(props.content.viewers)
  const [tabId, setTabId] = React.useState(props.content.initialTabId)
  const referenceFlow = props.content.referenceFlow
  const selected = selectLumenChatItem(tabs, referenceFlow?.tabId ?? tabId)
  const showingChat = selected?.id !== props.content.viewersTabId
  const layout = props.content.referenceLayout
  if (layout) {
    return (
      <Root {...props} className={['lumen-chat-live-reference-root', props.className].filter(Boolean).join(' ')}>
        <LumenChatLiveReference
          content={props.content}
          layout={layout}
          onAction={props.onAction}
          composer={
            <Composer
              placeholder={props.content.labels.placeholder}
              label={layout.labels.inputLabel}
              send={props.content.labels.send}
              actionId="send"
              onAction={props.onAction}
              flow={referenceFlow?.composer}
              singleLine
              leadingActions={
                <LumenButton
                  variant="text"
                  aria-label={layout.labels.emoji}
                  onClick={() => report(props.onAction, 'add-emoji', props.content.chatTabId)}
                >
                  <Glyph name="smile" size="sm" />
                </LumenButton>
              }
            />
          }
        />
      </Root>
    )
  }
  return (
    <Root {...props}>
      <Header title={props.content.labels.title} detail={props.content.labels.detail} />
      <div className="lumen-chat-tabs" role="tablist" aria-label={props.content.labels.tabs}>
        {tabs.map((tab) => (
          <LumenButton
            key={tab.id}
            role="tab"
            variant="text"
            aria-selected={selected?.id === tab.id}
            disabled={tab.disabled}
            onClick={() => {
              if (referenceFlow) {
                referenceFlow.onTabChange(tab.id)
              } else {
                setTabId(tab.id)
              }
            }}
          >
            {tab.label}
          </LumenButton>
        ))}
      </div>
      {showingChat ? (
        <div className="lumen-chat-live">
          <aside>
            <Glyph name="bell" />
            <LumenText as="strong" variant="label">
              {props.content.labels.pinned}
            </LumenText>
            <LumenText as="span">{props.content.pinnedNotice}</LumenText>
          </aside>
          <div className="lumen-chat-live-messages" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {messages.length ? (
              messages.map((message) => (
                <article key={message.id}>
                  <Avatar initials={message.initials} />
                  <div>
                    <LumenText as="strong" variant="label">
                      {message.author}
                    </LumenText>
                    {message.role ? <LumenStatus value={message.role} /> : null}
                    <LumenText as="p">{message.body}</LumenText>
                  </div>
                </article>
              ))
            ) : (
              <LumenText as="p" tone="muted">
                {props.content.labels.emptyChat}
              </LumenText>
            )}
          </div>
          <Composer
            placeholder={props.content.labels.placeholder}
            send={props.content.labels.send}
            actionId="send"
            onAction={props.onAction}
            flow={referenceFlow?.composer}
          />
        </div>
      ) : (
        <div className="lumen-chat-viewers" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
          <LumenText as="strong" variant="heading">
            {props.content.labels.viewers(props.content.viewerCount)}
          </LumenText>
          {viewers.length ? (
            viewers.map((viewer) => (
              <span key={viewer.id}>
                <Avatar initials={viewer.initials} />
                {viewer.name}
              </span>
            ))
          ) : (
            <LumenText as="p" tone="muted">
              {props.content.labels.emptyViewers}
            </LumenText>
          )}
        </div>
      )}
    </Root>
  )
}

function empty(props: LumenChatProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenChat(props: LumenChatProps) {
  const inheritedContent = useLumenChatContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) {
    return content?.team ? <Team {...props} content={content.team} /> : empty(props)
  }
  if (props.variant === 2) {
    return content?.direct ? <Direct {...props} content={content.direct} /> : empty(props)
  }
  if (props.variant === 3) {
    return content?.social ? <Social {...props} content={content.social} /> : empty(props)
  }
  if (props.variant === 4) {
    return content?.support ? <Support {...props} content={content.support} /> : empty(props)
  }
  if (props.variant === 5) {
    return content?.group ? <Group {...props} content={content.group} /> : empty(props)
  }
  if (props.variant === 6) {
    return content?.live ? <Live {...props} content={content.live} /> : empty(props)
  }
  return empty(props)
}

function variant(value: number, props: LumenChatVariantProps) {
  return <LumenChat {...props} variant={value} variantId={`hbar-app-ui-chat-${value}`} />
}

export const LumenChat01 = (props: LumenChatVariantProps) => variant(1, props)

export const LumenChat02 = (props: LumenChatVariantProps) => variant(2, props)

export const LumenChat03 = (props: LumenChatVariantProps) => variant(3, props)

export const LumenChat04 = (props: LumenChatVariantProps) => variant(4, props)

export const LumenChat05 = (props: LumenChatVariantProps) => variant(5, props)

export const LumenChat06 = (props: LumenChatVariantProps) => variant(6, props)
