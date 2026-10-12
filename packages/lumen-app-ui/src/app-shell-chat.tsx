'use client'

import * as React from 'react'
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  Database,
  FileText,
  Globe,
  History,
  ListChecks,
  Mail,
  MapPin,
  Menu,
  Mic,
  PanelLeft,
  PanelLeftOpen,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import './app-shell-chat.css'

const icons = {
  spark: Sparkles,
  globe: Globe,
  database: Database,
  file: FileText,
  code: Code2,
  map: MapPin,
  checklist: ListChecks,
  search: Search,
  star: Star,
  history: History,
  trash: Trash2,
  mail: Mail,
}
export type LumenShellChatIcon = keyof typeof icons
export interface LumenShellChatModel {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly icon: LumenShellChatIcon
}
export interface LumenShellChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
}
export interface LumenShellChatThread {
  readonly id: string
  readonly label: string
  readonly icon: LumenShellChatIcon
  readonly messages: readonly LumenShellChatMessage[]
}
export interface LumenShellChatAction {
  readonly id: string
  readonly label: string
  readonly icon: LumenShellChatIcon
  readonly count?: string
}
export interface LumenAppShellChatContent {
  readonly labels: {
    readonly brand: string
    readonly brandMark: string
    readonly newChat: string
    readonly model: string
    readonly pinned: string
    readonly recent: string
    readonly quickActions: string
    readonly accountInitials: string
    readonly accountName: string
    readonly accountStatus: string
    readonly pinnedModel: string
    readonly pinnedCount: string
    readonly welcomeTitle: string
    readonly welcomeDetail: string
    readonly messagePlaceholder: string
    readonly disclaimer: string
    readonly collapseSidebar: string
    readonly expandSidebar: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly chooseModel: string
    readonly share: string
    readonly attach: string
    readonly search: string
    readonly dictate: string
    readonly send: string
  }
  readonly models: readonly LumenShellChatModel[]
  readonly selectedModelId: string
  readonly pinnedThreadId: string | null
  readonly threads: readonly LumenShellChatThread[]
  readonly selectedThreadId: string | null
  readonly quickActions: readonly LumenShellChatAction[]
  readonly suggestions: readonly LumenShellChatAction[]
  readonly draft: string
  /** The host pages long histories; this pane owns scroll for the supplied page (at most 100). */
  readonly onModel: (id: string) => void
  readonly onThread: (id: string | null) => void
  readonly onDraft: (value: string) => void
  readonly onAction: (action: 'share' | 'attach' | 'search' | 'dictate' | 'send' | 'quick', value?: string) => void
}
const unique = <T extends { readonly id: string }>(items: readonly T[]) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
]

export function AppShellChat({ content }: { readonly content: LumenAppShellChatContent }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [drawer, setDrawer] = React.useState(false)
  const [modelMenu, setModelMenu] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const modelTrigger = React.useRef<HTMLButtonElement>(null)
  const draftField = React.useRef<HTMLTextAreaElement>(null)
  const draftId = React.useId()
  const models = unique(content.models)
  const threads = unique(content.threads)
  const model = models.find((item) => item.id === content.selectedModelId) ?? models[0]
  const thread = threads.find((item) => item.id === content.selectedThreadId)
  const pinned = threads.find((item) => item.id === content.pinnedThreadId)
  const selectThread = (id: string | null) => {
    content.onThread(id)
    setDrawer(false)
  }
  const selectModel = (id: string) => {
    content.onModel(id)
    setModelMenu(false)
    modelTrigger.current?.focus()
  }
  React.useEffect(() => {
    if (!drawer && !modelMenu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (modelMenu) {
          setModelMenu(false)
          modelTrigger.current?.focus()
        } else setDrawer(false)
      }
    }
    const onOutside = (event: PointerEvent) => {
      if (modelMenu && event.target instanceof Node && !menuRef.current?.contains(event.target)) setModelMenu(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onOutside)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onOutside)
    }
  }, [drawer, modelMenu])
  const sidebar = (mobile: boolean) => (
    <>
      <div className="lumen-chat-side-heading">
        <span className="lumen-chat-brand-mark" aria-hidden="true">
          {content.labels.brandMark}
        </span>
        <p>{content.labels.brand}</p>
        <button
          type="button"
          aria-label={mobile ? content.labels.closeNavigation : content.labels.collapseSidebar}
          aria-expanded={mobile ? undefined : true}
          onClick={() => (mobile ? setDrawer(false) : setCollapsed(true))}
        >
          {mobile ? <X aria-hidden="true" /> : <PanelLeft aria-hidden="true" />}
        </button>
      </div>
      <button type="button" className="lumen-chat-new" onClick={() => selectThread(null)}>
        <Plus aria-hidden="true" />
        {content.labels.newChat}
        <Sparkles aria-hidden="true" />
      </button>
      <div className="lumen-chat-side-scroll">
        <section>
          <p className="lumen-chat-side-label">{content.labels.model}</p>
          <div className="lumen-chat-model-radios" role="radiogroup" aria-label={content.labels.model}>
            {models.map((item) => {
              const Icon = icons[item.icon]
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={item.id === model?.id}
                  key={item.id}
                  onClick={() => content.onModel(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </section>
        <section>
          <p className="lumen-chat-side-label">{content.labels.pinned}</p>
          {pinned && (
            <button type="button" className="lumen-chat-pinned" onClick={() => selectThread(pinned.id)}>
              <FileText aria-hidden="true" />
              <span>
                {pinned.label}
                <small>
                  <span>{content.labels.pinnedModel}</span>
                  {content.labels.pinnedCount}
                </small>
              </span>
            </button>
          )}
        </section>
        <section>
          <p className="lumen-chat-side-label">{content.labels.recent}</p>
          <ul>
            {threads.map((item) => {
              const Icon = icons[item.icon]
              return (
                <li key={item.id}>
                  <button type="button" className="lumen-chat-side-link" onClick={() => selectThread(item.id)}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <section>
          <p className="lumen-chat-side-label">{content.labels.quickActions}</p>
          <ul>
            {unique(content.quickActions).map((item) => {
              const Icon = icons[item.icon]
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="lumen-chat-side-link"
                    onClick={() => content.onAction('quick', item.id)}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.count && <span>{item.count}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
      <div className="lumen-chat-account">
        <span aria-hidden="true">{content.labels.accountInitials}</span>
        <div className="lumen-chat-account-copy">
          {content.labels.accountName}
          <small>
            <i aria-hidden="true" />
            {content.labels.accountStatus}
          </small>
        </div>
      </div>
    </>
  )
  return (
    <div className="lumen-chat-shell hbar-app-ui-full-canvas-owner">
      <aside className={`lumen-chat-sidebar${collapsed ? ' lumen-chat-sidebar-collapsed' : ''}`}>
        {sidebar(false)}
      </aside>
      <div className="lumen-chat-main">
        <header role="banner" className="lumen-shell-chat-header">
          <button
            type="button"
            className="lumen-chat-mobile-navigation"
            aria-label={content.labels.openNavigation}
            aria-expanded={drawer}
            onClick={() => setDrawer(true)}
          >
            <Menu aria-hidden="true" />
          </button>
          <button
            type="button"
            className="lumen-chat-expand"
            aria-label={content.labels.expandSidebar}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen aria-hidden="true" />
          </button>
          <div className="lumen-chat-model-anchor" ref={menuRef}>
            <button
              ref={modelTrigger}
              type="button"
              className="lumen-chat-model-trigger"
              aria-expanded={modelMenu}
              aria-haspopup="menu"
              onClick={() => setModelMenu(!modelMenu)}
            >
              <Sparkles aria-hidden="true" />
              {model?.label ?? content.labels.model}
              <ChevronDown aria-hidden="true" />
            </button>
            {modelMenu && (
              <div role="menu" aria-label={content.labels.chooseModel} className="lumen-chat-model-menu">
                {models.map((item) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    key={item.id}
                    aria-checked={item.id === model?.id}
                    onClick={() => selectModel(item.id)}
                  >
                    {React.createElement(icons[item.icon], { 'aria-hidden': true })}
                    <span>
                      {item.label}
                      <small>{item.description}</small>
                    </span>
                    {item.id === model?.id && <Check aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <h1>{thread?.label ?? content.labels.newChat}</h1>
          <button type="button" className="lumen-chat-share" onClick={() => content.onAction('share')}>
            <Share2 aria-hidden="true" />
            <span>{content.labels.share}</span>
          </button>
        </header>
        {thread ? (
          <div className="lumen-chat-conversation">
            <div className="lumen-shell-chat-message-scroll">
              {unique(thread.messages).map((item) => (
                <p key={item.id} className={`lumen-shell-chat-message lumen-shell-chat-message-${item.role}`}>
                  {item.text}
                </p>
              ))}
            </div>
            <div className="lumen-chat-thread-composer">{composer()}</div>
          </div>
        ) : (
          <div className="lumen-chat-welcome-flow">
            <div className="lumen-chat-welcome-content">
              <div className="lumen-chat-hero">
                <span className="lumen-chat-hero-mark" aria-hidden="true">
                  {content.labels.brandMark}
                </span>
                <h2>{content.labels.welcomeTitle}</h2>
                <p>{content.labels.welcomeDetail}</p>
              </div>
              {composer()}
              <div className="lumen-chat-suggestions">
                {unique(content.suggestions).map((item) => {
                  const Icon = icons[item.icon]
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        content.onDraft(item.label)
                        draftField.current?.focus()
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                      <ArrowUpRight aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        <p className="lumen-chat-disclaimer">{content.labels.disclaimer}</p>
      </div>
      {drawer && (
        <div className="lumen-chat-drawer-layer">
          <button
            type="button"
            className="lumen-chat-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={() => setDrawer(false)}
          />
          <div role="dialog" aria-modal="true" aria-label={content.labels.openNavigation} className="lumen-chat-drawer">
            {sidebar(true)}
          </div>
        </div>
      )}
    </div>
  )

  function composer() {
    return (
      <div className="lumen-shell-chat-composer">
        <label
          htmlFor={draftId}
          className={`lumen-chat-field-label${content.draft ? ' lumen-chat-field-label-filled' : ''}`}
        >
          {content.labels.messagePlaceholder}
        </label>
        <textarea
          id={draftId}
          ref={draftField}
          rows={1}
          value={content.draft}
          onChange={(event) => content.onDraft(event.target.value)}
        />
        <div className="lumen-shell-chat-composer-actions">
          <button type="button" aria-label={content.labels.attach} onClick={() => content.onAction('attach')}>
            <Plus aria-hidden="true" />
          </button>
          <button
            type="button"
            className="lumen-chat-search"
            aria-pressed="false"
            onClick={() => content.onAction('search')}
          >
            <Globe aria-hidden="true" />
            {content.labels.search}
          </button>
          <span className="lumen-shell-chat-composer-spacer" />
          <span className="lumen-shell-chat-composer-model">{model?.label}</span>
          <button type="button" aria-label={content.labels.dictate} onClick={() => content.onAction('dictate')}>
            <Mic aria-hidden="true" />
          </button>
          <button
            type="button"
            className="lumen-chat-send"
            aria-label={content.labels.send}
            disabled={!content.draft.trim()}
            onClick={() => content.onAction('send', content.draft.trim())}
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }
}
