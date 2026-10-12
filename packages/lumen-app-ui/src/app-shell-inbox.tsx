'use client'

import * as React from 'react'
import {
  Archive,
  ArrowLeft,
  AtSign,
  Bell,
  Clock,
  Download,
  FileText,
  Inbox,
  Menu,
  MoreHorizontal,
  Reply,
  Search,
  Send,
  SlidersHorizontal,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-inbox.css'

const menuIcons = { unread: Inbox, snooze: Clock, assign: UserPlus, mute: Bell }
const mailboxIcons = {
  inbox: Inbox,
  mentions: AtSign,
  snoozed: Clock,
  sent: Send,
  archive: Archive,
}
export interface LumenInboxMailbox {
  readonly id: string
  readonly label: string
  readonly icon: keyof typeof mailboxIcons
  readonly unread?: boolean | undefined
}
export interface LumenInboxConversation {
  readonly id: string
  readonly sender: string
  readonly subject: string
  readonly preview: string
  readonly time: string
  readonly email: string
  readonly date: string
  readonly recipient: string
  readonly paragraphs: readonly string[]
  readonly unread: boolean
  readonly starred: boolean
  readonly attachments: readonly {
    readonly id: string
    readonly name: string
    readonly size: string
    readonly downloadLabel: string
  }[]
}
export interface LumenAppShellInboxContent {
  readonly brand: { readonly mark: string; readonly name: string }
  readonly account: {
    readonly initials: string
    readonly name: string
    readonly role: string
    readonly label: string
  }
  readonly labels: {
    readonly mailboxes: string
    readonly openMailboxes: string
    readonly closeMailboxes: string
    readonly closeOverlay: string
    readonly title: string
    readonly sort: string
    readonly compose: string
    readonly search: string
    readonly filters: string
    readonly conversations: string
    readonly unread: string
    readonly back: string
    readonly reply: string
    readonly star: string
    readonly unstar: string
    readonly archive: string
    readonly delete: string
    readonly more: string
    readonly attachment: string
    readonly emptyTitle: string
    readonly emptyDetail: string
    readonly clear: string
    readonly emptyReader: string
    readonly emptyMailboxes: string
  }
  /** Icon rail / drawer owns scrolling; hosts group inventories above 20 mailboxes. */
  readonly mailboxes: readonly LumenInboxMailbox[]
  readonly mailboxId: string | null
  readonly filters: readonly { readonly id: string; readonly label: string }[]
  readonly filterId: string | null
  readonly query: string
  readonly count: string
  /** Independently scrolling list; host pages inventories above 100 conversations. */
  readonly conversations: readonly LumenInboxConversation[]
  /** Selection is independent of filtering; a selected record can remain outside the list. */
  readonly selected: LumenInboxConversation | null
  readonly menu: readonly {
    readonly id: string
    readonly label: string
    readonly icon: keyof typeof menuIcons
  }[]
  readonly onFilter: (id: string) => void
  readonly onQuery: (query: string) => void
  readonly onClear: () => void
  readonly onSelect: (id: string) => void
  readonly onStar: (id: string) => void
  readonly onMailbox: (id: string) => void
  readonly onAction: (
    action: 'account' | 'sort' | 'compose' | 'reply' | 'archive' | 'delete' | 'download' | 'menu',
    id?: string,
    childId?: string,
  ) => void
}
const stable = <T extends { readonly id: string }>(items: readonly T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]
function ScrollPane({ children, className = '' }: { readonly children: React.ReactNode; readonly className?: string }) {
  const pane = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })
  const measure = React.useCallback(() => {
    const e = pane.current
    if (e)
      setEdges((old) => {
        const top = e.scrollTop > 1,
          bottom = e.scrollHeight - e.clientHeight - e.scrollTop > 1
        return old.top === top && old.bottom === bottom ? old : { top, bottom }
      })
  }, [])
  React.useEffect(() => {
    const e = pane.current
    if (!e) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(e)
    if (e.firstElementChild) observer.observe(e.firstElementChild)
    return () => observer.disconnect()
  }, [children, measure])
  return (
    <div className={`lumen-inbox-scroll-frame ${className}`} data-top={edges.top} data-bottom={edges.bottom}>
      <div ref={pane} className="lumen-inbox-scroll" onScroll={measure} data-lumen-list-strategy="pane-scroll">
        {children}
      </div>
    </div>
  )
}
function MoreActions({
  content,
  record,
}: {
  readonly content: LumenAppShellInboxContent
  readonly record: LumenInboxConversation
}) {
  const [open, setOpen] = React.useState(false)
  const anchor = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  React.useEffect(() => {
    if (!open) return
    const document = anchor.current?.ownerDocument
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !anchor.current?.contains(e.target)) setOpen(false)
    }
    document?.addEventListener('pointerdown', outside)
    return () => document?.removeEventListener('pointerdown', outside)
  }, [open])
  return (
    <div
      ref={anchor}
      className="lumen-inbox-more"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          close()
        }
      }}
    >
      <LumenIconButton
        ref={trigger}
        size="s"
        label={content.labels.more}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal className="lumen-inbox-icon" aria-hidden="true" />
      </LumenIconButton>
      {open ? (
        <div
          className="lumen-inbox-menu"
          role="menu"
          aria-label={content.labels.more}
          onKeyDown={(e) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
            e.preventDefault()
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button')),
              index = buttons.findIndex((b) => b === e.target)
            const next =
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? buttons.length - 1
                  : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          }}
        >
          {stable(content.menu).map((item) => {
            const Icon = menuIcons[item.icon]
            return (
              <LumenButton
                key={item.id}
                role="menuitem"
                size="s"
                variant="text"
                indicator="none"
                onClick={() => {
                  content.onAction('menu', record.id, item.id)
                  close()
                }}
              >
                <Icon className="lumen-inbox-icon" aria-hidden="true" />
                {item.label}
              </LumenButton>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
function ReadingPane({
  content,
  onBack,
}: {
  readonly content: LumenAppShellInboxContent
  readonly onBack: () => void
}) {
  const record = content.selected
  if (!record)
    return (
      <main className="lumen-inbox-reading lumen-inbox-empty-reader">
        <p>{content.labels.emptyReader}</p>
      </main>
    )
  return (
    <main className="lumen-inbox-reading">
      <header>
        <LumenIconButton size="s" className="lumen-inbox-back" label={content.labels.back} onClick={onBack}>
          <ArrowLeft className="lumen-inbox-icon" aria-hidden="true" />
        </LumenIconButton>
        <h1>{record.subject}</h1>
        <div className="lumen-inbox-actions">
          <LumenIconButton size="s" label={content.labels.reply} onClick={() => content.onAction('reply', record.id)}>
            <Reply className="lumen-inbox-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton
            size="s"
            className="lumen-inbox-secondary-action"
            label={record.starred ? content.labels.unstar : content.labels.star}
            aria-pressed={record.starred}
            onClick={() => content.onStar(record.id)}
          >
            <Star className="lumen-inbox-icon" fill={record.starred ? 'currentColor' : 'none'} aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton
            size="s"
            className="lumen-inbox-secondary-action"
            label={content.labels.archive}
            onClick={() => content.onAction('archive', record.id)}
          >
            <Archive className="lumen-inbox-icon" aria-hidden="true" />
          </LumenIconButton>
          <LumenIconButton
            size="s"
            className="lumen-inbox-secondary-action"
            label={content.labels.delete}
            onClick={() => content.onAction('delete', record.id)}
          >
            <Trash2 className="lumen-inbox-icon" aria-hidden="true" />
          </LumenIconButton>
          <MoreActions key={record.id} content={content} record={record} />
        </div>
      </header>
      <ScrollPane key={record.id} className="lumen-inbox-message">
        <div>
          <div className="lumen-inbox-sender">
            <div>
              <p>{record.sender}</p>
              <p>{record.email}</p>
            </div>
            <p>{record.date}</p>
          </div>
          <p className="lumen-inbox-recipient">{record.recipient}</p>
          <div className="lumen-inbox-body">
            {record.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          {record.attachments.length ? (
            <div className="lumen-inbox-attachments">
              <p>{content.labels.attachment}</p>
              {stable(record.attachments).map((file) => (
                <div key={file.id}>
                  <span className="lumen-inbox-file-icon">
                    <FileText className="lumen-inbox-icon" aria-hidden="true" />
                  </span>
                  <span className="lumen-inbox-file-name">
                    <span>{file.name}</span>
                    <span>{file.size}</span>
                  </span>
                  <LumenIconButton
                    size="s"
                    label={file.downloadLabel}
                    onClick={() => content.onAction('download', record.id, file.id)}
                  >
                    <Download className="lumen-inbox-icon" aria-hidden="true" />
                  </LumenIconButton>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollPane>
    </main>
  )
}
export function AppShellInbox({ content }: { readonly content: LumenAppShellInboxContent }) {
  const root = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null),
    drawer = React.useRef<HTMLElement>(null)
  const [narrow, setNarrow] = React.useState(false),
    [mailboxesOpen, setMailboxesOpen] = React.useState(false),
    [readingOpen, setReadingOpen] = React.useState(false)
  const headingId = React.useId(),
    searchId = React.useId()
  const conversations = stable(content.conversations)
  React.useEffect(() => {
    const e = root.current
    if (!e) return
    const observe = () =>
      setNarrow(e.clientWidth < 64 * Number.parseFloat(getComputedStyle(e.ownerDocument.documentElement).fontSize))
    observe()
    const observer = new ResizeObserver(observe)
    observer.observe(e)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (mailboxesOpen && narrow) drawer.current?.querySelector('button')?.focus()
  }, [mailboxesOpen, narrow])
  const closeMailboxes = () => {
    setMailboxesOpen(false)
    trigger.current?.focus()
  }
  const select = (id: string) => {
    content.onSelect(id)
    setReadingOpen(true)
  }
  const mailboxes = stable(content.mailboxes)
  return (
    <div ref={root} className="lumen-inbox-shell" data-reading={readingOpen}>
      <div className="lumen-inbox-rail">
        <div className="lumen-inbox-brand">
          <span>{content.brand.mark}</span>
        </div>
        <nav aria-label={content.labels.mailboxes} data-large={mailboxes.length > 5}>
          <ul>
            {mailboxes.map((item) => {
              const Icon = mailboxIcons[item.icon]
              return (
                <li key={item.id} className="lumen-inbox-tooltip-anchor">
                  <LumenIconButton
                    size="s"
                    label={item.label}
                    aria-current={item.id === content.mailboxId ? 'page' : undefined}
                    onClick={() => content.onMailbox(item.id)}
                  >
                    <Icon className="lumen-inbox-icon" aria-hidden="true" />
                    {item.unread ? (
                      <>
                        <i className="lumen-inbox-rail-dot" aria-hidden="true" />
                        <span className="lumen-inbox-sr">{content.labels.unread}</span>
                      </>
                    ) : null}
                  </LumenIconButton>
                  <span role="tooltip" className="lumen-inbox-tooltip">
                    {item.label}
                  </span>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="lumen-inbox-tooltip-anchor lumen-inbox-account-anchor">
          <LumenButton
            size="s"
            className="lumen-inbox-avatar"
            indicator="none"
            aria-label={content.account.label}
            onClick={() => content.onAction('account')}
          >
            {content.account.initials}
          </LumenButton>
          <span role="tooltip" className="lumen-inbox-tooltip">
            {content.account.name}
          </span>
        </div>
      </div>
      <section className="lumen-inbox-list-pane" aria-labelledby={headingId}>
        <div className="lumen-inbox-list-heading">
          <LumenIconButton
            ref={trigger}
            size="s"
            className="lumen-inbox-open"
            label={content.labels.openMailboxes}
            aria-expanded={narrow && mailboxesOpen}
            onClick={() => setMailboxesOpen(true)}
          >
            <Menu className="lumen-inbox-icon" aria-hidden="true" />
          </LumenIconButton>
          <h2 id={headingId}>{content.labels.title}</h2>
          <span>{content.count}</span>
          <div>
            <LumenIconButton size="s" label={content.labels.sort} onClick={() => content.onAction('sort')}>
              <SlidersHorizontal className="lumen-inbox-icon" aria-hidden="true" />
            </LumenIconButton>
            <LumenIconButton size="s" label={content.labels.compose} onClick={() => content.onAction('compose')}>
              <Reply className="lumen-inbox-icon" aria-hidden="true" />
            </LumenIconButton>
          </div>
        </div>
        <div className="lumen-inbox-search">
          <label htmlFor={searchId} className="lumen-inbox-sr">
            {content.labels.search}
          </label>
          <Search className="lumen-inbox-search-icon lumen-inbox-icon" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            placeholder={content.labels.search}
            value={content.query}
            onChange={(e) => content.onQuery(e.target.value)}
          />
        </div>
        <div className="lumen-inbox-filters" role="radiogroup" aria-label={content.labels.filters}>
          {stable(content.filters).map((item) => (
            <LumenButton
              key={item.id}
              size="s"
              variant="text"
              indicator="none"
              role="radio"
              aria-checked={item.id === content.filterId}
              tabIndex={item.id === content.filterId ? 0 : -1}
              onClick={() => content.onFilter(item.id)}
            >
              {item.label}
            </LumenButton>
          ))}
        </div>
        <ScrollPane className="lumen-inbox-list">
          {conversations.length ? (
            <ul role="listbox" aria-label={content.labels.conversations}>
              {conversations.map((record, index) => (
                <li key={record.id} role="presentation">
                  <LumenButton
                    variant="text"
                    indicator="none"
                    role="option"
                    aria-selected={record.id === content.selected?.id}
                    tabIndex={record.id === content.selected?.id ? 0 : -1}
                    data-record-id={record.id}
                    data-unread={record.unread}
                    onClick={() => select(record.id)}
                    onKeyDown={(e) => {
                      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
                      e.preventDefault()
                      const nextIndex =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? conversations.length - 1
                            : Math.min(conversations.length - 1, Math.max(0, index + (e.key === 'ArrowDown' ? 1 : -1)))
                      const next = conversations[nextIndex]
                      if (next) {
                        select(next.id)
                        const options = e.currentTarget
                          .closest('ul')
                          ?.querySelectorAll<HTMLButtonElement>('[role=option]')
                        options?.[nextIndex]?.focus()
                      }
                    }}
                  >
                    <span className="lumen-inbox-summary">
                      <span>{record.sender}</span>
                      <span>{record.subject}</span>
                      <span>{record.preview}</span>
                    </span>
                    <span className="lumen-inbox-meta">
                      <span>{record.time}</span>
                      <i aria-hidden="true" data-unread={record.unread} />
                      {record.unread ? <span className="lumen-inbox-sr">{content.labels.unread}</span> : null}
                    </span>
                  </LumenButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="lumen-inbox-empty">
              <div className="lumen-inbox-empty-icon">
                <Inbox aria-hidden="true" />
              </div>
              <p>{content.labels.emptyTitle}</p>
              <p>{content.labels.emptyDetail}</p>
              <LumenButton size="s" variant="outlined" indicator="none" onClick={content.onClear}>
                {content.labels.clear}
              </LumenButton>
            </div>
          )}
        </ScrollPane>
      </section>
      <ReadingPane content={content} onBack={() => setReadingOpen(false)} />
      {narrow && mailboxesOpen ? (
        <div className="lumen-inbox-overlay">
          <button
            className="lumen-inbox-backdrop"
            type="button"
            aria-label={content.labels.closeOverlay}
            onClick={closeMailboxes}
          />
          <nav
            ref={drawer}
            className="lumen-inbox-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={content.labels.mailboxes}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                closeMailboxes()
              }
            }}
          >
            <div className="lumen-inbox-drawer-heading">
              <span>{content.brand.mark}</span>
              <p>{content.brand.name}</p>
              <LumenIconButton size="s" label={content.labels.closeMailboxes} onClick={closeMailboxes}>
                <X className="lumen-inbox-icon" aria-hidden="true" />
              </LumenIconButton>
            </div>
            <ScrollPane>
              <ul>
                {mailboxes.map((item) => {
                  const Icon = mailboxIcons[item.icon]
                  return (
                    <li key={item.id}>
                      <LumenButton
                        size="s"
                        variant="text"
                        indicator="none"
                        aria-current={item.id === content.mailboxId ? 'page' : undefined}
                        onClick={() => {
                          content.onMailbox(item.id)
                          closeMailboxes()
                        }}
                      >
                        <Icon className="lumen-inbox-icon" aria-hidden="true" />
                        <span>{item.label}</span>
                        {item.unread ? (
                          <>
                            <i className="lumen-inbox-dot" aria-hidden="true" />
                            <span className="lumen-inbox-sr">{content.labels.unread}</span>
                          </>
                        ) : null}
                      </LumenButton>
                    </li>
                  )
                })}
              </ul>
              {mailboxes.length ? null : <p>{content.labels.emptyMailboxes}</p>}
            </ScrollPane>
            <div className="lumen-inbox-drawer-account">
              <span>{content.account.initials}</span>
              <span>
                <span>{content.account.name}</span>
                <span>{content.account.role}</span>
              </span>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  )
}
