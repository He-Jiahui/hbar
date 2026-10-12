'use client'

import * as React from 'react'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import './notifications.css'
import './notifications-center-reference.css'
import './notifications-toast-reference.css'
import './notifications-preferences-reference.css'
import './notifications-activity-reference.css'
import './notifications-system-reference.css'
import './notifications-bell-reference.css'

export interface LumenNotificationsListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenNotificationsChoice {
  readonly id: string
  readonly label: string
  readonly count?: string | undefined
  readonly disabled?: boolean | undefined
}

export interface LumenNotificationEntry {
  readonly id: string
  readonly groupId: string
  readonly kind: string
  readonly title: string
  readonly detail?: string | undefined
  readonly time: string
  readonly unread: boolean
  readonly mention?: boolean | undefined
  readonly icon?: 'mention' | 'review' | 'reply' | 'member' | 'security' | 'resolved' | 'approved' | undefined
  readonly titleParts?: readonly { readonly text: string; readonly strong?: boolean | undefined }[] | undefined
}

export interface LumenNotificationGroup {
  readonly id: string
  readonly label: string
}

export interface LumenNotificationCenterContent {
  readonly labels: {
    readonly title: string
    readonly unread: (count: number) => string
    readonly markAll: string
    readonly filters: string
    readonly all: string
    readonly unreadFilter: string
    readonly mentions: string
    readonly markRead: (title: string) => string
    readonly markUnread: (title: string) => string
    readonly dismiss: (title: string) => string
    readonly empty: string
    readonly count?: ((count: number) => string) | undefined
  }
  readonly groups: readonly LumenNotificationGroup[]
  readonly entries: readonly LumenNotificationEntry[]
  readonly listStrategy: LumenNotificationsListStrategy
  readonly controlledReadState?: {
    readonly readIds: ReadonlySet<string>
    readonly pendingIds?: ReadonlySet<string>
  }
  readonly unreadCount?: number
  readonly showDismiss?: boolean
  readonly showMentions?: boolean
  readonly openLabel?: (title: string) => string
}

export interface LumenNotificationToastChoice {
  readonly id: string
  readonly label: string
  readonly title?: string | undefined
  readonly detail: string
  readonly tone: 'success' | 'danger' | 'info' | 'warning'
  readonly action?: string | undefined
}

export interface LumenNotificationToastsContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly dismiss: (label: string) => string
    readonly paused: string
    readonly automatic: string
    readonly empty: string
    readonly clear: string
    readonly active?: ((count: number) => string) | undefined
  }
  readonly choices: readonly LumenNotificationToastChoice[]
  readonly maximum: number
}

export interface LumenNotificationChannel {
  readonly id: string
  readonly label: string
}

export interface LumenNotificationPreference {
  readonly id: string
  readonly groupId: string
  readonly label: string
  readonly detail: string
  readonly enabledChannelIds: readonly string[]
}

export interface LumenNotificationPreferenceGroup {
  readonly id: string
  readonly label: string
}

export interface LumenNotificationPreferencesDraft {
  readonly deliveries: readonly {
    readonly preferenceId: string
    readonly channelId: string
    readonly enabled: boolean
  }[]
  readonly quiet: boolean
  readonly dayIds: readonly string[]
}

export interface LumenNotificationPreferencesContent {
  readonly labels: {
    readonly title: string
    readonly detail: (enabled: number, total: number) => string
    readonly event: string
    readonly toggle: (event: string, channel: string) => string
    readonly all: string
    readonly none: string
    readonly quietTitle: string
    readonly quietDetail: string
    readonly quietToggle: string
    readonly days: string
    readonly saved: string
    readonly unsaved: string
    readonly saving: string
    readonly saveFailed: string
    readonly saveUnavailable: string
    readonly reset: string
    readonly save: string
    readonly empty: string
  }
  readonly channels: readonly LumenNotificationChannel[]
  readonly groups: readonly LumenNotificationPreferenceGroup[]
  readonly preferences: readonly LumenNotificationPreference[]
  readonly days: readonly LumenNotificationsChoice[]
  readonly initialDayIds: readonly string[]
  readonly initialQuiet: boolean
  readonly quietHoursVisible?: boolean | undefined
  readonly listStrategy: LumenNotificationsListStrategy
  /** The owning host confirms persistence; an absent handler cannot claim a successful save. */
  readonly savePreferences?:
    ((draft: LumenNotificationPreferencesDraft, signal: AbortSignal) => Promise<void>) | undefined
}

export interface LumenNotificationFact {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenNotificationActivityEntry {
  readonly id: string
  readonly viewId: string
  readonly icon: 'access' | 'review' | 'alert' | 'comment' | 'member'
  readonly person: string
  readonly time: string
  readonly summary: string
  readonly introduction: string
  readonly title: string
  readonly detail: string
  readonly primaryAction: { readonly id: string; readonly label: string }
  readonly facts: readonly LumenNotificationFact[]
  readonly link: { readonly label: string; readonly href: string }
}

export interface LumenNotificationActivityContent {
  readonly labels: {
    readonly title: string
    readonly views: string
    readonly back: string
    readonly snooze: string
    readonly archive: string
    readonly emptyList: string
    readonly emptyTitle: string
    readonly emptyDetail: string
    readonly emptyFacts: string
    readonly unavailable: string
    readonly moving: string
    readonly moveFailed: string
    readonly count: (count: number) => string
  }
  readonly views: readonly LumenNotificationsChoice[]
  readonly inboxViewId: string
  readonly snoozedViewId: string
  readonly archivedViewId: string
  readonly snoozeChoices: readonly LumenNotificationsChoice[]
  readonly initialViewId: string
  readonly initialEntryId: string
  readonly entries: readonly LumenNotificationActivityEntry[]
  readonly listStrategy: LumenNotificationsListStrategy
  /** Confirm the move in the owning host before changing the visible projection. */
  readonly moveEntry?:
    ((entryId: string, viewId: string, optionId: string | undefined, signal: AbortSignal) => Promise<void>) | undefined
}

export interface LumenNotificationSystemMessage {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly primary: {
    readonly id: string
    readonly label: string
    readonly variant: 'solid' | 'outlined'
  }
  readonly secondary?: { readonly id: string; readonly label: string } | undefined
  readonly tone: 'info' | 'warning' | 'danger' | 'success' | 'usage'
  readonly details?: readonly { readonly id: string; readonly text: string }[] | undefined
  readonly usage?: { readonly value: number; readonly label: string } | undefined
}

export interface LumenNotificationSystemContent {
  readonly labels: {
    readonly title: string
    readonly detail: string
    readonly restore: string
    readonly dismiss: (title: string) => string
    readonly show: string
    readonly hide: string
    readonly empty: string
    readonly emptyDetail: string
    readonly pending: string
    readonly actionFailed: string
    readonly restoreFailed: string
    readonly unavailable: string
  }
  readonly messages: readonly LumenNotificationSystemMessage[]
  readonly listStrategy: LumenNotificationsListStrategy
  /** The host confirms whether an action dismissed a message, restored all, or left it visible. */
  readonly performAction?:
    | ((messageId: string | null, actionId: string, signal: AbortSignal) => Promise<'dismiss' | 'restore' | 'retain'>)
    | undefined
}

export interface LumenNotificationBellMessage {
  readonly id: string
  readonly actor: string
  readonly summary: string
  readonly time: string
  readonly unread: boolean
  readonly icon: 'mention' | 'review' | 'security' | 'reply' | 'resolved'
}

export interface LumenNotificationBellContent {
  readonly presentation?: 'appbar' | 'trigger' | undefined
  readonly unreadCount?: number | undefined
  readonly labels: {
    readonly brandMark: string
    readonly brand: string
    readonly bell: (count: number) => string
    readonly dialog: string
    readonly filter: string
    readonly all: string
    readonly unread: string
    readonly markAll: string
    readonly openCenter: string
    readonly settings: string
    readonly hint: string
    readonly empty: string
    readonly unreadEmpty: string
    readonly pending: string
    readonly failed: string
    readonly unavailable: string
  }
  readonly navItems: readonly (LumenNotificationsChoice & { readonly href: string })[]
  readonly selectedNavId: string
  readonly messages: readonly LumenNotificationBellMessage[]
  readonly avatar: string
  readonly listStrategy: LumenNotificationsListStrategy
  /** The host confirms read state before the visible badge and rows change. */
  readonly markRead?:
    ((messageIds: readonly string[], signal: AbortSignal) => Promise<'confirmed' | 'unchanged'>) | undefined
}

export interface LumenNotificationsContent {
  readonly center?: LumenNotificationCenterContent | undefined
  readonly toasts?: LumenNotificationToastsContent | undefined
  readonly preferences?: LumenNotificationPreferencesContent | undefined
  readonly activity?: LumenNotificationActivityContent | undefined
  readonly system?: LumenNotificationSystemContent | undefined
  readonly bell?: LumenNotificationBellContent | undefined
}

export interface LumenNotificationsProviderProps {
  readonly content: LumenNotificationsContent
  readonly children: React.ReactNode
}

export interface LumenNotificationsAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenNotificationsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenNotificationsContent | undefined
  readonly onAction?: ((event: LumenNotificationsAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
}

export type LumenNotificationsVariantProps = Omit<LumenNotificationsProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenNotificationsContent | undefined>(undefined)

export function LumenNotificationsProvider({ content, children }: LumenNotificationsProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenNotificationsContent() {
  return React.useContext(Context)
}

export function uniqueLumenNotificationsItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenNotificationsItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
): T | undefined {
  return items.find((item) => item.id === id) ?? items[0]
}

const report = (fn: LumenNotificationsProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({
  name,
}: {
  name:
    | 'check'
    | 'close'
    | 'bell'
    | 'settings'
    | 'back'
    | 'clock'
    | 'archive'
    | 'external'
    | 'down'
    | 'restore'
    | 'chevron'
    | 'info'
}) {
  const d =
    name === 'check'
      ? 'm3 8 3 3 7-7'
      : name === 'close'
        ? 'M3 3l10 10M13 3 3 13'
        : name === 'bell'
          ? 'M4 11V7a4 4 0 0 1 8 0v4l1 2H3zm2 2a2 2 0 0 0 4 0'
          : name === 'settings'
            ? 'M8 5.5A2.5 2.5 0 1 0 8 10a2.5 2.5 0 0 0 0-5Zm0-4v2m0 9v2m6.5-6.5h-2m-9 0h-2m11.1-4.6-1.4 1.4m-6.4 6.4-1.4 1.4m9.2 0-1.4-1.4M4.8 4.8 3.4 3.4'
            : name === 'back'
              ? 'm7 3-5 5 5 5M2 8h12'
              : name === 'clock'
                ? 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3v3l2 2'
                : name === 'archive'
                  ? 'M2.5 5h11v8h-11zM2 3h12v2H2zm4 5h4'
                  : name === 'down'
                    ? 'm4 6 4 4 4-4'
                    : name === 'external'
                      ? 'M8 3h5v5m0-5L7 9M6 4H3v9h9v-3'
                      : name === 'restore'
                        ? 'M5 5H2l2.5-2.5M2.5 5A6 6 0 1 1 4 11'
                        : name === 'chevron'
                          ? 'm6 3 5 5-5 5'
                          : 'M8 7v5m0-8h.01M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z'
  return (
    <svg className="lumen-notifications-glyph" viewBox="0 0 16 16" aria-hidden="true">
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
}: Omit<LumenNotificationsProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-notifications',
    `hbar-app-ui-notifications-variant-${variant}`,
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
      boundary={variant <= 6 ? 'none' : 'horizontal'}
      shape={variant <= 6 ? 'square' : 'rounded'}
      className="lumen-notifications-surface"
      contentClassName={contentClassName}
      data-lumen-component="notifications"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Empty({ children }: { readonly children: string }) {
  return (
    <LumenText as="p" className="lumen-notifications-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Tabs({
  choices,
  selectedId,
  label,
  onChange,
  indicator,
}: {
  readonly choices: readonly LumenNotificationsChoice[]
  readonly selectedId: string | undefined
  readonly label: string
  readonly onChange: (id: string) => void
  readonly indicator?: 'none' | 'lamp' | undefined
}) {
  return (
    <div className="lumen-notifications-tabs" role="tablist" aria-label={label}>
      {choices.map((item) => (
        <LumenButton
          key={item.id}
          role="tab"
          variant="text"
          indicator={indicator}
          aria-selected={selectedId === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count === undefined ? null : <span className="lumen-notifications-tab-count">{item.count}</span>}
        </LumenButton>
      ))}
    </div>
  )
}

function Center(props: Omit<LumenNotificationsProps, 'content'> & { content: LumenNotificationCenterContent }) {
  const groups = uniqueLumenNotificationsItems(props.content.groups)
  const entries = uniqueLumenNotificationsItems(props.content.entries)
  const [filter, setFilter] = React.useState('all')
  const [localReadIds, setLocalReadIds] = React.useState<ReadonlySet<string>>(
    () => new Set(entries.filter((item) => !item.unread).map((item) => item.id)),
  )
  const readIds = props.content.controlledReadState?.readIds ?? localReadIds
  const pendingIds = props.content.controlledReadState?.pendingIds ?? new Set<string>()
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set())
  const unread =
    props.content.unreadCount ?? entries.filter((item) => !readIds.has(item.id) && !dismissed.has(item.id)).length
  const total = entries.length - dismissed.size
  const mentions = entries.filter((item) => item.mention && !dismissed.has(item.id)).length
  const count = props.content.labels.count ?? ((value: number) => `${value}`)
  const filters = [
    { id: 'all', label: props.content.labels.all, count: count(total) },
    { id: 'unread', label: props.content.labels.unreadFilter, count: count(unread) },
    ...(props.content.showMentions === false
      ? []
      : [{ id: 'mentions', label: props.content.labels.mentions, count: count(mentions) }]),
  ]
  const visible = entries.filter(
    (item) =>
      !dismissed.has(item.id) &&
      (filter === 'all' || (filter === 'unread' && !readIds.has(item.id)) || (filter === 'mentions' && item.mention)),
  )
  return (
    <Root {...props}>
      <header className="lumen-notifications-center-header" role="banner">
        <div className="lumen-notifications-center-heading">
          <h2>{props.content.labels.title}</h2>
          {unread ? <span className="lumen-notifications-center-badge">{count(unread)}</span> : null}
        </div>
        <LumenButton
          variant="outlined"
          indicator="none"
          disabled={!unread || pendingIds.size > 0}
          onClick={() => {
            if (!props.content.controlledReadState) setLocalReadIds(new Set(entries.map((item) => item.id)))
            report(props.onAction, 'read-all')
          }}
        >
          <Glyph name="check" />
          {props.content.labels.markAll}
        </LumenButton>
      </header>
      <Tabs
        choices={filters}
        selectedId={filter}
        label={props.content.labels.filters}
        indicator="none"
        onChange={(id) => {
          setFilter(id)
          report(props.onAction, 'filter', id)
        }}
      />
      <div className="lumen-notifications-feed" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
        {visible.length ? (
          groups.map((group) => {
            const children = visible.filter((item) => item.groupId === group.id)
            return children.length ? (
              <section key={group.id}>
                <h3>{group.label}</h3>
                <ul>
                  {children.map((item) => {
                    const read = readIds.has(item.id)
                    return (
                      <li key={item.id} data-unread={!read || undefined}>
                        <span className="lumen-notifications-center-icon" aria-hidden="true">
                          <NotificationIcon name={item.icon} />
                        </span>
                        <div className="lumen-notifications-center-copy">
                          <p>
                            {item.titleParts?.length
                              ? item.titleParts.map((part, index) => (
                                  <span className={part.strong ? 'is-emphasis' : undefined} key={index}>
                                    {part.text}
                                  </span>
                                ))
                              : item.title}
                          </p>
                          {item.detail ? <p>{item.detail}</p> : null}
                        </div>
                        <span className="lumen-notifications-center-time">{item.time}</span>
                        <div className="lumen-notifications-center-actions">
                          <LumenIconButton
                            label={
                              read
                                ? props.content.labels.markUnread(item.title)
                                : props.content.labels.markRead(item.title)
                            }
                            disabled={pendingIds.has(item.id)}
                            onClick={() => {
                              if (props.content.controlledReadState) {
                                report(props.onAction, read ? 'unread' : 'read', item.id)
                                return
                              }
                              setLocalReadIds((current) => {
                                const next = new Set(current)
                                if (read) {
                                  next.delete(item.id)
                                } else {
                                  next.add(item.id)
                                }
                                report(props.onAction, read ? 'unread' : 'read', item.id)
                                return next
                              })
                            }}
                          >
                            <span className="lumen-notifications-center-dot" aria-hidden="true" />
                          </LumenIconButton>
                          {props.content.showDismiss === false ? null : (
                            <LumenIconButton
                              label={props.content.labels.dismiss(item.title)}
                              onClick={() => {
                                setDismissed((current) => new Set([...current, item.id]))
                                report(props.onAction, 'dismiss', item.id)
                              }}
                            >
                              <Glyph name="close" />
                            </LumenIconButton>
                          )}
                          {props.content.openLabel ? (
                            <LumenIconButton
                              label={props.content.openLabel(item.title)}
                              onClick={() => report(props.onAction, 'open', item.id)}
                            >
                              <Glyph name="external" />
                            </LumenIconButton>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null
          })
        ) : (
          <Empty>{props.content.labels.empty}</Empty>
        )}
      </div>
    </Root>
  )
}

function NotificationIcon({ name }: { readonly name: LumenNotificationEntry['icon'] }) {
  const paths = {
    mention: (
      <>
        <circle cx="8" cy="8" r="5.2" />
        <path d="M10.5 6v4c0 1.7 2.4 1.4 2.4-.5M10.5 6C9.3 4.6 6 5 6 8c0 3 3.3 3.2 4.5 1" />
      </>
    ),
    review: (
      <>
        <circle cx="4" cy="3.5" r="1.6" />
        <circle cx="11.5" cy="12.5" r="1.6" />
        <path d="M4 5v5c0 1.5 1 2.5 2.5 2.5M9.5 3.5h2a2 2 0 0 1 2 2v3M8.5 1.5v4" />
      </>
    ),
    reply: <path d="M3 3.5h10v7H7l-3.5 2v-2H3z" />,
    member: (
      <>
        <circle cx="6" cy="5" r="2.3" />
        <path d="M2.5 13v-1.3a3.5 3.5 0 0 1 7 0V13m3-8v5m-2.5-2.5h5" />
      </>
    ),
    security: (
      <>
        <path d="M8 1.5 13 3.6V8c0 2.8-2 4.6-5 6-3-1.4-5-3.2-5-6V3.6z" />
        <path d="m6 8 1.4 1.4L10 6.5" />
      </>
    ),
    resolved: (
      <>
        <circle cx="8" cy="8" r="5.5" />
        <path d="m5.5 8 1.7 1.7 3.4-3.5" />
      </>
    ),
    approved: (
      <>
        <path d="M3 8.5 6.3 12 13 4" />
      </>
    ),
  } satisfies Record<NonNullable<LumenNotificationEntry['icon']>, React.ReactNode>
  return (
    <svg
      className="lumen-notifications-glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name ?? 'mention']}
    </svg>
  )
}

function Toasts(props: Omit<LumenNotificationsProps, 'content'> & { content: LumenNotificationToastsContent }) {
  type ToastInstance = {
    readonly key: number
    readonly choice: LumenNotificationToastChoice
    readonly remainingMs: number
    readonly startedAt: number | null
  }
  const choices = uniqueLumenNotificationsItems(props.content.choices)
  const [toasts, setToasts] = React.useState<readonly ToastInstance[]>([])
  const [expanded, setExpanded] = React.useState(false)
  const nextKey = React.useRef(0)
  React.useEffect(() => {
    if (expanded || !toasts.length) return
    const now = Date.now()
    const next = Math.min(
      ...toasts.map((toast) => toast.remainingMs - (toast.startedAt === null ? 0 : now - toast.startedAt)),
    )
    const timer = window.setTimeout(
      () => {
        const expiredAt = Date.now()
        toasts
          .filter((toast) => toast.remainingMs <= (toast.startedAt === null ? 0 : expiredAt - toast.startedAt))
          .forEach((toast) => report(props.onAction, 'expire', toast.choice.id))
        setToasts((current) =>
          current.filter((toast) => toast.remainingMs > (toast.startedAt === null ? 0 : expiredAt - toast.startedAt)),
        )
      },
      Math.max(0, next),
    )
    return () => window.clearTimeout(timer)
  }, [expanded, props.onAction, toasts])
  return (
    <Root {...props}>
      <div className="lumen-notifications-toast-frame">
        <div className="lumen-notifications-toast-card">
          <h2>{props.content.labels.title}</h2>
          <p>{props.content.labels.detail}</p>
          <div className="lumen-notifications-toast-choices">
            {choices.map((choice) => (
              <LumenButton
                key={choice.id}
                variant="outlined"
                indicator="none"
                data-toast-tone={choice.tone}
                onClick={() => {
                  const key = nextKey.current++
                  setToasts((current) =>
                    [{ key, choice, remainingMs: 5000, startedAt: Date.now() }, ...current].slice(
                      0,
                      props.content.maximum,
                    ),
                  )
                  report(props.onAction, 'show', choice.id)
                }}
              >
                <ToastGlyph tone={choice.tone} />
                {choice.label}
              </LumenButton>
            ))}
          </div>
          <div className="lumen-notifications-toast-summary" data-empty={!toasts.length || undefined}>
            <span>
              {toasts.length
                ? (props.content.labels.active?.(toasts.length) ?? `${toasts.length}`)
                : props.content.labels.empty}
            </span>
            <LumenButton
              variant="text"
              indicator="none"
              disabled={!toasts.length}
              onClick={() => {
                setToasts([])
                report(props.onAction, 'clear')
              }}
            >
              {props.content.labels.clear}
            </LumenButton>
          </div>
        </div>
      </div>
      {toasts.length ? (
        <section
          className="lumen-notifications-toast-stack"
          data-expanded={expanded || undefined}
          onPointerEnter={() => {
            const now = Date.now()
            setToasts((current) =>
              current.map((toast) =>
                toast.startedAt === null
                  ? toast
                  : {
                      ...toast,
                      remainingMs: Math.max(0, toast.remainingMs - (now - toast.startedAt)),
                      startedAt: null,
                    },
              ),
            )
            setExpanded(true)
          }}
          onPointerLeave={() => {
            const now = Date.now()
            setToasts((current) => current.map((toast) => ({ ...toast, startedAt: now })))
            setExpanded(false)
          }}
        >
          {toasts.map(({ key, choice }, index) => (
            <article
              key={key}
              data-toast-tone={choice.tone}
              style={{ '--lumen-toast-depth': Math.min(index, 3) } as React.CSSProperties}
            >
              <ToastGlyph tone={choice.tone} />
              <div className="lumen-notifications-toast-message">
                <p>{choice.title ?? choice.label}</p>
                <p>{choice.detail}</p>
              </div>
              {choice.action ? (
                <LumenButton
                  variant="outlined"
                  indicator="none"
                  onClick={() => {
                    setToasts((current) => current.filter((toast) => toast.key !== key))
                    report(props.onAction, 'action', choice.id)
                  }}
                >
                  <Glyph name="restore" />
                  {choice.action}
                </LumenButton>
              ) : null}
              <LumenIconButton
                label={props.content.labels.dismiss(choice.label)}
                onClick={() => {
                  setToasts((current) => current.filter((toast) => toast.key !== key))
                  report(props.onAction, 'dismiss', choice.id)
                }}
              >
                <Glyph name="close" />
              </LumenIconButton>
            </article>
          ))}
        </section>
      ) : null}
    </Root>
  )
}

function ToastGlyph({ tone }: { readonly tone: LumenNotificationToastChoice['tone'] }) {
  return tone === 'warning' ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 8a5 5 0 1 0-5 5" />
    </svg>
  ) : tone === 'success' ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="m5.7 8 1.5 1.5 3.3-3.5" />
    </svg>
  ) : tone === 'danger' ? (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 4.6v4.2m0 2.3h.01" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7v4m0-6h.01" />
    </svg>
  )
}

const deliveryKey = (preferenceId: string, channelId: string) => JSON.stringify([preferenceId, channelId])

function PreferenceSwitch({
  checked,
  label,
  disabled,
  action,
  onToggle,
}: {
  readonly checked: boolean
  readonly label: string
  readonly disabled: boolean
  readonly action: string
  readonly onToggle: () => void
}) {
  return (
    <LumenButton
      type="button"
      variant="text"
      indicator="none"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      data-hbar-app-ui-action={action}
      className="lumen-preferences-switch"
      onClick={onToggle}
    >
      <span aria-hidden="true" />
    </LumenButton>
  )
}

function ChannelGlyph({ id }: { readonly id: string }) {
  const path =
    id === 'in-app' ? (
      <path d="M4 11V7a4 4 0 0 1 8 0v4l1 2H3zm2 2a2 2 0 0 0 4 0" />
    ) : id === 'email' ? (
      <>
        <rect x="2" y="3.5" width="12" height="9" rx="1" />
        <path d="m2 4 6 5 6-5" />
      </>
    ) : (
      <>
        <rect x="4.5" y="1.5" width="7" height="13" rx="1" />
        <path d="M7 12h2" />
      </>
    )
  return (
    <svg
      className="lumen-preferences-channel-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

function Preferences(
  props: Omit<LumenNotificationsProps, 'content'> & {
    content: LumenNotificationPreferencesContent
  },
) {
  const { content } = props
  const channels = uniqueLumenNotificationsItems(content.channels)
  const groups = uniqueLumenNotificationsItems(content.groups)
  const preferences = uniqueLumenNotificationsItems(content.preferences)
  const daysOfWeek = uniqueLumenNotificationsItems(content.days)
  const defaults = React.useMemo(
    () =>
      Object.fromEntries(
        uniqueLumenNotificationsItems(content.preferences).flatMap((item) =>
          uniqueLumenNotificationsItems(content.channels).map((channel) => [
            deliveryKey(item.id, channel.id),
            item.enabledChannelIds.includes(channel.id),
          ]),
        ),
      ),
    [content.preferences, content.channels],
  )
  const [values, setValues] = React.useState<Readonly<Record<string, boolean>>>(defaults)
  const [quiet, setQuiet] = React.useState(content.initialQuiet)
  const [days, setDays] = React.useState<ReadonlySet<string>>(() => new Set(content.initialDayIds))
  const [saveStatus, setSaveStatus] = React.useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const pendingSave = React.useRef<AbortController | null>(null)
  const revision = React.useRef(0)
  React.useEffect(() => {
    pendingSave.current?.abort()
    revision.current += 1
    setValues(defaults)
    setQuiet(content.initialQuiet)
    setDays(new Set(content.initialDayIds))
    setSaveStatus('saved')
    return () => {
      pendingSave.current?.abort()
    }
  }, [defaults, content.initialDayIds, content.initialQuiet])
  const markDirty = () => {
    revision.current += 1
    setSaveStatus('dirty')
  }
  const busy = saveStatus === 'saving'
  const enabled = preferences.reduce(
    (count, item) => count + channels.filter((channel) => values[deliveryKey(item.id, channel.id)]).length,
    0,
  )
  const updateDelivery = (preferenceId: string, channelId: string) => {
    const key = deliveryKey(preferenceId, channelId)
    setValues((current) => ({ ...current, [key]: !current[key] }))
    markDirty()
    report(props.onAction, 'delivery', key)
  }
  const reset = () => {
    pendingSave.current?.abort()
    revision.current += 1
    setValues(defaults)
    setQuiet(content.initialQuiet)
    setDays(new Set(content.initialDayIds))
    setSaveStatus('saved')
    report(props.onAction, 'reset')
  }
  const save = async () => {
    if (!content.savePreferences || busy || saveStatus === 'saved') return
    const controller = new AbortController()
    pendingSave.current = controller
    const currentRevision = revision.current
    const draft: LumenNotificationPreferencesDraft = {
      deliveries: preferences.flatMap((item) =>
        channels.map((channel) => ({
          preferenceId: item.id,
          channelId: channel.id,
          enabled: values[deliveryKey(item.id, channel.id)] ?? false,
        })),
      ),
      quiet,
      dayIds: daysOfWeek.filter((day) => days.has(day.id)).map((day) => day.id),
    }
    setSaveStatus('saving')
    try {
      await content.savePreferences(draft, controller.signal)
      if (controller.signal.aborted || currentRevision !== revision.current) return
      setSaveStatus('saved')
      report(props.onAction, 'save')
    } catch {
      if (controller.signal.aborted || currentRevision !== revision.current) return
      setSaveStatus('error')
      report(props.onAction, 'save-failed')
    } finally {
      if (pendingSave.current === controller) pendingSave.current = null
    }
  }
  const statusLabel =
    saveStatus === 'saved'
      ? content.labels.saved
      : saveStatus === 'saving'
        ? content.labels.saving
        : saveStatus === 'error'
          ? content.labels.saveFailed
          : content.savePreferences
            ? content.labels.unsaved
            : content.labels.saveUnavailable

  return (
    <Root {...props}>
      <header className="lumen-preferences-header" role="banner">
        <h2>{content.labels.title}</h2>
        <p>{content.labels.detail(enabled, preferences.length * channels.length)}</p>
      </header>
      <div
        className="lumen-notifications-preferences"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-region="preferences"
        data-hbar-app-ui-state={saveStatus}
      >
        <div className="lumen-preferences-matrix-viewport">
          <div className="lumen-preferences-matrix">
            <div className="lumen-preferences-columns">
              <span>{content.labels.event}</span>
              {channels.map((channel) => (
                <span key={channel.id}>
                  <ChannelGlyph id={channel.id} />
                  {channel.label}
                </span>
              ))}
            </div>
            {preferences.length ? (
              groups.map((group) => {
                const entries = preferences.filter((item) => item.groupId === group.id)
                if (!entries.length) return null
                return (
                  <section key={group.id} data-hbar-app-ui-region={group.id}>
                    <div className="lumen-preferences-group">
                      <span>{group.label}</span>
                      {channels.map((channel) => {
                        const all = entries.every((item) => values[deliveryKey(item.id, channel.id)])
                        return (
                          <span key={channel.id}>
                            <LumenButton
                              type="button"
                              variant="text"
                              indicator="none"
                              disabled={busy}
                              data-hbar-app-ui-action={`group:${group.id}:${channel.id}`}
                              onClick={() => {
                                setValues((current) => {
                                  const next = { ...current }
                                  for (const item of entries) next[deliveryKey(item.id, channel.id)] = !all
                                  return next
                                })
                                markDirty()
                                report(props.onAction, 'group', deliveryKey(group.id, channel.id))
                              }}
                            >
                              {all ? content.labels.none : content.labels.all}
                            </LumenButton>
                          </span>
                        )
                      })}
                    </div>
                    <ul>
                      {entries.map((item) => (
                        <li key={item.id}>
                          <div className="lumen-preferences-event">
                            <p>{item.label}</p>
                            <p>{item.detail}</p>
                          </div>
                          {channels.map((channel) => (
                            <span className="lumen-preferences-cell" key={channel.id}>
                              <PreferenceSwitch
                                checked={values[deliveryKey(item.id, channel.id)] ?? false}
                                disabled={busy}
                                label={content.labels.toggle(item.label, channel.label)}
                                action={`delivery:${item.id}:${channel.id}`}
                                onToggle={() => updateDelivery(item.id, channel.id)}
                              />
                            </span>
                          ))}
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })
            ) : (
              <Empty>{content.labels.empty}</Empty>
            )}
          </div>
        </div>
        {content.quietHoursVisible !== false ? (
          <section className="lumen-notifications-quiet" data-hbar-app-ui-region="quiet-hours">
            <div className="lumen-preferences-quiet-card">
              <div className="lumen-preferences-quiet-heading">
                <span className="lumen-preferences-quiet-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
                    <path d="M12.9 10.8A5.5 5.5 0 0 1 5.2 3.1a5.5 5.5 0 1 0 7.7 7.7Z" />
                  </svg>
                </span>
                <div>
                  <p>{content.labels.quietTitle}</p>
                  <p>{content.labels.quietDetail}</p>
                </div>
                <PreferenceSwitch
                  checked={quiet}
                  disabled={busy}
                  label={content.labels.quietToggle}
                  action="quiet-hours"
                  onToggle={() => {
                    setQuiet(!quiet)
                    markDirty()
                    report(props.onAction, 'quiet-hours')
                  }}
                />
              </div>
              {quiet ? (
                <div className="lumen-notifications-days" aria-label={content.labels.days}>
                  {daysOfWeek.map((day) => (
                    <LumenButton
                      key={day.id}
                      type="button"
                      variant="text"
                      indicator="none"
                      aria-pressed={days.has(day.id)}
                      data-hbar-app-ui-action={`day:${day.id}`}
                      disabled={busy}
                      onClick={() => {
                        setDays((current) => {
                          const next = new Set(current)
                          if (next.has(day.id)) next.delete(day.id)
                          else next.add(day.id)
                          return next
                        })
                        markDirty()
                        report(props.onAction, 'day', day.id)
                      }}
                    >
                      {day.label}
                    </LumenButton>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
      <footer className="lumen-notifications-save" role="contentinfo">
        <span aria-live="polite">{statusLabel}</span>
        <div>
          <LumenButton
            type="button"
            variant="outlined"
            indicator="none"
            data-hbar-app-ui-action="reset"
            disabled={busy}
            onClick={reset}
          >
            {content.labels.reset}
          </LumenButton>
          <LumenButton
            type="button"
            tone="primary"
            indicator="none"
            data-hbar-app-ui-action="save"
            disabled={busy || saveStatus === 'saved' || !content.savePreferences}
            onClick={() => {
              void save()
            }}
          >
            {content.labels.save}
          </LumenButton>
        </div>
      </footer>
    </Root>
  )
}

function Activity(props: Omit<LumenNotificationsProps, 'content'> & { content: LumenNotificationActivityContent }) {
  const { content } = props
  const views = uniqueLumenNotificationsItems(content.views)
  const entries = uniqueLumenNotificationsItems(content.entries)
  const [viewId, setViewId] = React.useState(content.initialViewId)
  const [entryId, setEntryId] = React.useState<string | null>(content.initialEntryId)
  const [showDetail, setShowDetail] = React.useState(true)
  const [locations, setLocations] = React.useState<ReadonlyMap<string, string>>(() => new Map())
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [moveFailed, setMoveFailed] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const moveRef = React.useRef<AbortController | null>(null)
  React.useEffect(() => {
    setLocations(new Map())
  }, [content.entries])
  React.useEffect(() => () => moveRef.current?.abort(), [])
  React.useEffect(() => {
    if (!menuOpen) return undefined
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const visible = entries.filter((item) => (locations.get(item.id) ?? item.viewId) === viewId)
  const entry = visible.find((item) => item.id === entryId)
  const move = async (destination: string, optionId?: string) => {
    if (!entry || !content.moveEntry || busy) return
    const controller = new AbortController()
    moveRef.current = controller
    setBusy(true)
    setMoveFailed(false)
    setMenuOpen(false)
    try {
      await content.moveEntry(entry.id, destination, optionId, controller.signal)
      if (controller.signal.aborted) return
      setLocations((previous) => new Map(previous).set(entry.id, destination))
      setEntryId(null)
      setShowDetail(false)
      report(props.onAction, destination === content.archivedViewId ? 'archive' : 'snooze', entry.id)
    } catch {
      if (!controller.signal.aborted) setMoveFailed(true)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      if (moveRef.current === controller) moveRef.current = null
    }
  }
  return (
    <Root {...props}>
      <header className="lumen-activity-header" role="banner">
        <LumenText as="h2" variant="title">
          {content.labels.title}
        </LumenText>
        <div className="lumen-activity-tabs" role="tablist" aria-label={content.labels.views}>
          {views.map((view) => (
            <LumenButton
              key={view.id}
              role="tab"
              variant="text"
              indicator="none"
              aria-selected={viewId === view.id}
              disabled={view.disabled}
              onClick={() => {
                setViewId(view.id)
                setShowDetail(
                  entries.some((item) => item.id === entryId && (locations.get(item.id) ?? item.viewId) === view.id),
                )
                setMenuOpen(false)
                setMoveFailed(false)
                report(props.onAction, 'filter', view.id)
              }}
            >
              {view.label}
              <span className="lumen-activity-count">
                {content.labels.count(
                  entries.filter((item) => (locations.get(item.id) ?? item.viewId) === view.id).length,
                )}
              </span>
            </LumenButton>
          ))}
        </div>
      </header>
      <div className={showDetail ? 'lumen-activity-layout is-detail' : 'lumen-activity-layout'}>
        <div className="lumen-activity-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
          {visible.length ? (
            <ul>
              {visible.map((item) => (
                <li key={item.id}>
                  <LumenButton
                    variant="text"
                    indicator="none"
                    aria-current={entry?.id === item.id ? 'true' : undefined}
                    onClick={() => {
                      setEntryId(item.id)
                      setShowDetail(true)
                      setMoveFailed(false)
                      report(props.onAction, 'open', item.id)
                    }}
                  >
                    <ActivityGlyph name={item.icon} />
                    <span className="lumen-activity-row-copy">
                      <span className="lumen-activity-row-top">
                        <span>{item.person}</span>
                        <span className="lumen-activity-time">{item.time}</span>
                      </span>
                      <span className="lumen-activity-summary">{item.summary}</span>
                    </span>
                  </LumenButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lumen-activity-list-empty">{content.labels.emptyList}</p>
          )}
        </div>
        <article className="lumen-activity-detail">
          {entry && showDetail ? (
            <>
              <LumenButton
                className="lumen-activity-back"
                variant="outlined"
                indicator="none"
                onClick={() => setShowDetail(false)}
              >
                <Glyph name="back" />
                {content.labels.back}
              </LumenButton>
              <p className="lumen-activity-intro">
                <span>{entry.person}</span> {entry.introduction}
              </p>
              <h3>{entry.title}</h3>
              <div className="lumen-activity-actions">
                <LumenButton
                  tone="primary"
                  indicator="none"
                  onClick={() => report(props.onAction, entry.primaryAction.id, entry.id)}
                >
                  <Glyph name="check" />
                  {entry.primaryAction.label}
                </LumenButton>
                <div className="lumen-activity-snooze" ref={menuRef}>
                  <LumenButton
                    ref={triggerRef}
                    variant="outlined"
                    indicator="none"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={!content.moveEntry || busy}
                    onClick={() => setMenuOpen((open) => !open)}
                  >
                    <Glyph name="clock" />
                    {content.labels.snooze}
                    <Glyph name="down" />
                  </LumenButton>
                  {menuOpen ? (
                    <div className="lumen-activity-menu" role="menu">
                      {uniqueLumenNotificationsItems(content.snoozeChoices).map((choice) => (
                        <LumenButton
                          key={choice.id}
                          role="menuitem"
                          variant="text"
                          indicator="none"
                          disabled={choice.disabled}
                          onClick={() => {
                            void move(content.snoozedViewId, choice.id)
                          }}
                        >
                          {choice.label}
                        </LumenButton>
                      ))}
                    </div>
                  ) : null}
                </div>
                <LumenButton
                  variant="outlined"
                  indicator="none"
                  disabled={!content.moveEntry || busy}
                  onClick={() => {
                    void move(content.archivedViewId)
                  }}
                >
                  <Glyph name="archive" />
                  {content.labels.archive}
                </LumenButton>
              </div>
              <p className="lumen-activity-description">{entry.detail}</p>
              <dl className="lumen-activity-facts">
                {uniqueLumenNotificationsItems(entry.facts).length ? (
                  uniqueLumenNotificationsItems(entry.facts).map((fact) => (
                    <div key={fact.id}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))
                ) : (
                  <p>{content.labels.emptyFacts}</p>
                )}
              </dl>
              <a href={entry.link.href} onClick={() => report(props.onAction, 'link', entry.id)}>
                {entry.link.label}
                <Glyph name="external" />
              </a>
              <p className="lumen-activity-status" role="status" aria-live="polite">
                {busy
                  ? content.labels.moving
                  : moveFailed
                    ? content.labels.moveFailed
                    : !content.moveEntry
                      ? content.labels.unavailable
                      : null}
              </p>
            </>
          ) : (
            <div className="lumen-activity-empty">
              <h3>{content.labels.emptyTitle}</h3>
              <p>{content.labels.emptyDetail}</p>
            </div>
          )}
        </article>
      </div>
    </Root>
  )
}

function ActivityGlyph({ name }: { name: LumenNotificationActivityEntry['icon'] }) {
  const path =
    name === 'access'
      ? 'M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-4 5v-1a4 4 0 0 1 6-3.45M12 9v5m-2.5-2.5h5'
      : name === 'review'
        ? 'M6 3H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2m4-10h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2M8 5v6m0 0-2-2m2 2 2-2'
        : name === 'alert'
          ? 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3v4m0 2h.01'
          : name === 'comment'
            ? 'M2 3h12v8H7l-3 3v-3H2zM5 6h6m-6 2h4'
            : 'M6 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4 5v-1a4 4 0 0 1 8 0v1m1-8h3m-1.5-1.5v3'
  return (
    <span className={`lumen-activity-icon lumen-activity-icon-${name}`} aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path d={path} />
      </svg>
    </span>
  )
}

function SystemMessages(props: Omit<LumenNotificationsProps, 'content'> & { content: LumenNotificationSystemContent }) {
  const { content } = props
  const messages = uniqueLumenNotificationsItems(content.messages)
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set())
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set())
  const [pending, setPending] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const pendingRef = React.useRef<AbortController | null>(null)
  React.useEffect(() => () => pendingRef.current?.abort(), [])
  React.useEffect(() => {
    pendingRef.current?.abort()
    pendingRef.current = null
    setDismissed(new Set())
    setExpanded(new Set())
    setPending(null)
    setFailure(null)
  }, [content.messages])
  const visible = messages.filter((item) => !dismissed.has(item.id))
  const perform = async (messageId: string | null, actionId: string) => {
    if (!content.performAction || pendingRef.current) return
    const controller = new AbortController()
    pendingRef.current = controller
    setPending(messageId ?? 'restore-all')
    setFailure(null)
    try {
      const effect = await content.performAction(messageId, actionId, controller.signal)
      if (controller.signal.aborted) return
      if (effect === 'dismiss' && messageId) setDismissed((current) => new Set(current).add(messageId))
      if (effect === 'restore') setDismissed(new Set())
      report(props.onAction, actionId, messageId ?? undefined)
    } catch {
      if (!controller.signal.aborted) setFailure(messageId ?? 'restore-all')
    } finally {
      if (!controller.signal.aborted) setPending(null)
      if (pendingRef.current === controller) pendingRef.current = null
    }
  }
  return (
    <Root {...props}>
      <header className="lumen-system-header" role="banner">
        <div>
          <LumenText as="h2" variant="title">
            {content.labels.title}
          </LumenText>
          <LumenText as="p" tone="muted">
            {content.labels.detail}
          </LumenText>
        </div>
        <div className="lumen-system-restore">
          <LumenButton
            variant="outlined"
            indicator="none"
            data-hbar-app-ui-action="restore-all"
            disabled={!dismissed.size || !content.performAction || pending !== null}
            onClick={() => {
              void perform(null, 'restore-all')
            }}
          >
            <Glyph name="restore" />
            {content.labels.restore}
          </LumenButton>
          {failure === 'restore-all' ? <p role="alert">{content.labels.restoreFailed}</p> : null}
          {!content.performAction ? <p role="status">{content.labels.unavailable}</p> : null}
        </div>
      </header>
      <div className="lumen-system-scroll" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
        {visible.length ? (
          <ul className="lumen-system-list">
            {visible.map((message) => (
              <li key={message.id} className="lumen-system-message" data-tone={message.tone}>
                <SystemGlyph name={message.tone} />
                <div className="lumen-system-copy">
                  <p className="lumen-system-title">{message.title}</p>
                  <p className="lumen-system-description">{message.detail}</p>
                  {message.details?.length ? (
                    <>
                      <LumenButton
                        className="lumen-system-disclosure"
                        variant="text"
                        indicator="none"
                        data-hbar-app-ui-action="toggle-details"
                        aria-expanded={expanded.has(message.id)}
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current)
                            if (next.has(message.id)) next.delete(message.id)
                            else next.add(message.id)
                            return next
                          })
                        }
                      >
                        {expanded.has(message.id) ? content.labels.hide : content.labels.show}
                        <Glyph name="chevron" />
                      </LumenButton>
                      {expanded.has(message.id) ? (
                        <ul className="lumen-system-details">
                          {uniqueLumenNotificationsItems(message.details).map((detail) => (
                            <li key={detail.id}>{detail.text}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                  {message.usage ? (
                    <div className="lumen-system-usage">
                      <span aria-hidden="true">
                        <i
                          style={{
                            inlineSize: `${Math.max(0, Math.min(100, message.usage.value))}%`,
                          }}
                        />
                      </span>
                      <p>{message.usage.label}</p>
                    </div>
                  ) : null}
                  <div className="lumen-system-actions">
                    <LumenButton
                      variant={message.primary.variant}
                      indicator="none"
                      data-hbar-app-ui-action={message.primary.id}
                      disabled={!content.performAction || pending !== null}
                      onClick={() => {
                        void perform(message.id, message.primary.id)
                      }}
                    >
                      {message.primary.label}
                    </LumenButton>
                    {message.secondary ? (
                      <LumenButton
                        variant="outlined"
                        indicator="none"
                        data-hbar-app-ui-action={message.secondary.id}
                        disabled={!content.performAction || pending !== null}
                        onClick={() => {
                          if (message.secondary) void perform(message.id, message.secondary.id)
                        }}
                      >
                        {message.secondary.label}
                      </LumenButton>
                    ) : null}
                  </div>
                  {pending === message.id ? (
                    <p className="lumen-system-status" role="status">
                      {content.labels.pending}
                    </p>
                  ) : null}
                  {failure === message.id ? (
                    <p className="lumen-system-status" role="alert">
                      {content.labels.actionFailed}
                    </p>
                  ) : null}
                </div>
                <LumenButton
                  className="lumen-system-dismiss"
                  variant="text"
                  indicator="none"
                  aria-label={content.labels.dismiss(message.title)}
                  data-hbar-app-ui-action="dismiss"
                  disabled={!content.performAction || pending !== null}
                  onClick={() => {
                    void perform(message.id, 'dismiss')
                  }}
                >
                  <Glyph name="close" />
                </LumenButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="lumen-system-empty">
            <p>{content.labels.empty}</p>
            <p>{content.labels.emptyDetail}</p>
          </div>
        )}
      </div>
    </Root>
  )
}

function SystemGlyph({ name }: { name: LumenNotificationSystemMessage['tone'] }) {
  const path =
    name === 'warning'
      ? 'M8 2 15 14H1L8 2Zm0 4v3m0 2h.01'
      : name === 'danger'
        ? 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 3v4m0 2.5h.01'
        : name === 'success'
          ? 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM5 8l2 2 4-4'
          : name === 'usage'
            ? 'm9 1-6 8h4l-1 6 7-9H9l1-5Z'
            : 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 5v4m0-6h.01'
  return (
    <svg className="lumen-system-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function Bell(props: Omit<LumenNotificationsProps, 'content'> & { content: LumenNotificationBellContent }) {
  const { content } = props
  const navItems = uniqueLumenNotificationsItems(content.navItems)
  const messages = uniqueLumenNotificationsItems(content.messages)
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all')
  const [readState, setReadState] = React.useState<{
    source: typeof content.messages
    ids: ReadonlySet<string>
  }>(() => ({ source: content.messages, ids: new Set() }))
  const [pendingState, setPendingState] = React.useState<{
    source: typeof content.messages
    target: string
  } | null>(null)
  const [failureState, setFailureState] = React.useState<{
    source: typeof content.messages
    target: string
  } | null>(null)
  const readIds = readState.source === content.messages ? readState.ids : new Set<string>()
  const pending = pendingState?.source === content.messages ? pendingState.target : null
  const failure = failureState?.source === content.messages ? failureState.target : null
  const pendingRef = React.useRef<AbortController | null>(null)
  const bellRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const dialogId = React.useId()
  React.useEffect(() => () => pendingRef.current?.abort(), [])
  React.useEffect(() => {
    pendingRef.current?.abort()
    pendingRef.current = null
  }, [content.messages])
  React.useEffect(() => {
    if (!open) {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !bellRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])
  const unreadMessages = messages.filter((item) => item.unread && !readIds.has(item.id))
  const unreadCount = content.unreadCount ?? unreadMessages.length
  const visible = filter === 'unread' ? unreadMessages : messages
  const markRead = async (ids: readonly string[], target: string) => {
    if (!content.markRead || pendingRef.current || ids.length === 0) {
      return
    }
    const controller = new AbortController()
    pendingRef.current = controller
    setPendingState({ source: content.messages, target })
    setFailureState(null)
    try {
      const result = await content.markRead(ids, controller.signal)
      if (controller.signal.aborted) {
        return
      }
      if (result === 'confirmed') {
        setReadState((current) => ({
          source: content.messages,
          ids: new Set([...(current.source === content.messages ? current.ids : []), ...ids]),
        }))
        report(props.onAction, target === 'all' ? 'mark-all' : 'mark-read', target === 'all' ? undefined : target)
      }
    } catch {
      if (!controller.signal.aborted) {
        setFailureState({ source: content.messages, target })
      }
    } finally {
      if (!controller.signal.aborted) {
        setPendingState(null)
      }
      if (pendingRef.current === controller) {
        pendingRef.current = null
      }
    }
  }
  return (
    <Root
      {...props}
      className={[props.className, content.presentation === 'trigger' ? 'lumen-notifications-inline-bell' : undefined]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="lumen-notifications-appbar" role={content.presentation === 'trigger' ? undefined : 'banner'}>
        {content.presentation !== 'trigger' ? (
          <div className="lumen-bell-leading">
            <span className="lumen-bell-brand">
              <span className="lumen-bell-mark">{content.labels.brandMark}</span>
              <span>{content.labels.brand}</span>
            </span>
            <nav>
              {navItems.map((item) => (
                <a key={item.id} href={item.href} aria-current={item.id === content.selectedNavId ? 'page' : undefined}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
        <div className="lumen-bell-trailing">
          <div className="lumen-notifications-bell" ref={bellRef}>
            <LumenIconButton
              ref={triggerRef}
              label={content.labels.bell(unreadCount)}
              aria-expanded={open}
              aria-controls={open ? dialogId : undefined}
              onClick={() => {
                setOpen((value) => !value)
                report(props.onAction, 'toggle-bell')
              }}
            >
              <Glyph name="bell" />
              {unreadCount ? <span className="lumen-bell-badge">{unreadCount}</span> : null}
            </LumenIconButton>
            {open ? (
              <aside className="lumen-bell-popover" id={dialogId} role="dialog" aria-label={content.labels.dialog}>
                <div className="lumen-bell-toolbar">
                  <div className="lumen-bell-filters" role="tablist" aria-label={content.labels.filter}>
                    <LumenButton
                      variant="text"
                      indicator="none"
                      role="tab"
                      aria-selected={filter === 'all'}
                      onClick={() => setFilter('all')}
                    >
                      {content.labels.all}
                    </LumenButton>
                    <LumenButton
                      variant="text"
                      indicator="none"
                      role="tab"
                      aria-selected={filter === 'unread'}
                      onClick={() => setFilter('unread')}
                    >
                      {content.labels.unread}
                    </LumenButton>
                  </div>
                  <LumenButton
                    variant="text"
                    indicator="none"
                    className="lumen-bell-mark-all"
                    data-hbar-app-ui-action="mark-all"
                    disabled={unreadMessages.length === 0 || !content.markRead || pending !== null}
                    onClick={() => {
                      void markRead(
                        unreadMessages.map((item) => item.id),
                        'all',
                      )
                    }}
                  >
                    <Glyph name="check" />
                    {content.labels.markAll}
                  </LumenButton>
                </div>
                {pending === 'all' ? (
                  <p className="lumen-bell-status" role="status">
                    {content.labels.pending}
                  </p>
                ) : null}
                {failure === 'all' ? (
                  <p className="lumen-bell-status" role="alert">
                    {content.labels.failed}
                  </p>
                ) : null}
                {!content.markRead ? (
                  <p className="lumen-bell-status" role="status">
                    {content.labels.unavailable}
                  </p>
                ) : null}
                <ul className="lumen-bell-list" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
                  {visible.length ? (
                    visible.map((message) => (
                      <li key={message.id}>
                        <LumenButton
                          variant="text"
                          indicator="none"
                          className="lumen-bell-message"
                          data-unread={message.unread && !readIds.has(message.id)}
                          data-hbar-app-ui-action="mark-read"
                          disabled={!content.markRead || pending !== null}
                          onClick={() => {
                            void markRead(message.unread && !readIds.has(message.id) ? [message.id] : [], message.id)
                          }}
                        >
                          <BellMessageGlyph name={message.icon} unread={message.unread && !readIds.has(message.id)} />
                          <span className="lumen-bell-message-title">
                            <span>{message.actor}</span> {message.summary}
                          </span>
                          <span className="lumen-bell-time">{message.time}</span>
                        </LumenButton>
                        {pending === message.id ? (
                          <p className="lumen-bell-status" role="status">
                            {content.labels.pending}
                          </p>
                        ) : null}
                        {failure === message.id ? (
                          <p className="lumen-bell-status" role="alert">
                            {content.labels.failed}
                          </p>
                        ) : null}
                      </li>
                    ))
                  ) : (
                    <li className="lumen-bell-empty">
                      {filter === 'unread' ? content.labels.unreadEmpty : content.labels.empty}
                    </li>
                  )}
                </ul>
                <div className="lumen-bell-footer">
                  <LumenButton
                    variant="text"
                    indicator="none"
                    data-hbar-app-ui-action="open-center"
                    onClick={() => {
                      setOpen(false)
                      report(props.onAction, 'open-center')
                    }}
                  >
                    {content.labels.openCenter}
                  </LumenButton>
                </div>
              </aside>
            ) : null}
          </div>
          {content.presentation !== 'trigger' ? (
            <LumenIconButton label={content.labels.settings} onClick={() => report(props.onAction, 'settings')}>
              <Glyph name="settings" />
            </LumenIconButton>
          ) : null}
          {content.presentation !== 'trigger' ? (
            <span className="lumen-notifications-avatar">{content.avatar}</span>
          ) : null}
        </div>
      </header>
      {content.presentation !== 'trigger' ? (
        <div className="lumen-notifications-hint">
          <LumenText as="p" tone="muted">
            {content.labels.hint}
          </LumenText>
        </div>
      ) : null}
    </Root>
  )
}

const bellMessagePaths: Record<LumenNotificationBellMessage['icon'], string> = {
  mention: 'M11 11a5 5 0 1 1 2-4v2c0 2 2 2 2 0V8M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  review: 'M6 4H4a2 2 0 0 0-2 2v6h10V7M8 2h6v6M8 8l6-6',
  security: 'M8 1.5 13 3v4.5c0 3-2 5-5 7-3-2-5-4-5-7V3l5-1.5Zm-2 6 1.5 1.5L10.5 6',
  reply: 'M3 3h10v8H6l-3 2V3Z',
  resolved: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm-3 6 2 2 4-4',
}

function BellMessageGlyph({
  name,
  unread,
}: {
  readonly name: LumenNotificationBellMessage['icon']
  readonly unread: boolean
}) {
  return (
    <span className="lumen-bell-message-icon" data-unread={unread} aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path d={bellMessagePaths[name]} />
      </svg>
    </span>
  )
}

function empty(props: LumenNotificationsProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenNotifications(props: LumenNotificationsProps) {
  const inheritedContent = useLumenNotificationsContent()
  const content = props.content ?? inheritedContent
  if (props.variant === 1) return content?.center ? <Center {...props} content={content.center} /> : empty(props)
  if (props.variant === 2) return content?.toasts ? <Toasts {...props} content={content.toasts} /> : empty(props)
  if (props.variant === 3)
    return content?.preferences ? <Preferences {...props} content={content.preferences} /> : empty(props)
  if (props.variant === 4) return content?.activity ? <Activity {...props} content={content.activity} /> : empty(props)
  if (props.variant === 5)
    return content?.system ? <SystemMessages {...props} content={content.system} /> : empty(props)
  if (props.variant === 6) return content?.bell ? <Bell {...props} content={content.bell} /> : empty(props)
  return empty(props)
}

function variant(value: number, props: LumenNotificationsVariantProps) {
  return <LumenNotifications {...props} variant={value} variantId={`hbar-app-ui-notifications-${value}`} />
}

export const LumenNotifications01 = (props: LumenNotificationsVariantProps) => variant(1, props),
  LumenNotifications02 = (props: LumenNotificationsVariantProps) => variant(2, props),
  LumenNotifications03 = (props: LumenNotificationsVariantProps) => variant(3, props),
  LumenNotifications04 = (props: LumenNotificationsVariantProps) => variant(4, props),
  LumenNotifications05 = (props: LumenNotificationsVariantProps) => variant(5, props),
  LumenNotifications06 = (props: LumenNotificationsVariantProps) => variant(6, props)
