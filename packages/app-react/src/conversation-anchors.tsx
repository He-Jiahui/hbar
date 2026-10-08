import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'
import { ChevronDown, ChevronUp, History } from 'lucide-react'
import { LumenFloatingSurface, LumenIcon } from '@lumen/app-ui'
import type { ConversationReadingTarget, SessionTimelineState } from '@hbar/app-runtime'
import { useHbarRuntime, type HbarRuntimeView } from './runtime'
import {
  CONVERSATION_ANCHOR_PAGE_SIZE,
  conversationAnchorPage,
  currentConversationAnchor,
  projectConversationAnchors,
  type ConversationAnchor,
} from './conversation-anchor-model'
import './conversation-anchors.css'

export interface HbarConversationAnchorLabels {
  readonly navigation: (first: number, last: number, total: number) => string
  readonly jump: (index: number, title: string) => string
  readonly preview: string
  readonly attachments: (count: number) => string
  readonly previous: string
  readonly next: string
  readonly older: string
  readonly loadingOlder: string
  readonly retryOlder: string
  readonly historyLimit: string
}

export interface HbarConversationAnchorRailProps {
  readonly anchors: readonly ConversationAnchor[]
  readonly activeId: string | null
  readonly labels: HbarConversationAnchorLabels
  readonly hasOlder: boolean
  readonly olderStatus: SessionTimelineState['olderStatus']
  readonly canLoadOlder: boolean
  readonly navigating?: boolean
  readonly onNavigate: (messageId: string) => void
  readonly onLoadOlder: () => void
}

/** At most 24 markers; previous/next groups retain access to every loaded user turn. */
export function HbarConversationAnchorRail({
  anchors,
  activeId,
  labels,
  hasOlder,
  olderStatus,
  canLoadOlder,
  navigating,
  onNavigate,
  onLoadOlder,
}: HbarConversationAnchorRailProps) {
  const nav = useRef<HTMLElement>(null)
  const popupAnchor = useRef<HTMLElement | null>(null)
  const tooltipId = useId()
  const [firstId, setFirstId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const keyboardPreview = useRef(false)
  const pointerPosition = useRef<{ x: number; y: number } | null>(null)
  // Keep an explicitly browsed group stable while virtual history is measured.
  // A chosen message or a history load returns the rail to the current reader.
  const page = conversationAnchorPage(anchors, activeId, firstId)
  const preview = page.items.find((item) => item.messageId === previewId)
  const tabStop = page.items.some((item) => item.messageId === focusId)
    ? focusId
    : page.items.some((item) => item.messageId === activeId)
      ? activeId
      : page.items[0]?.messageId
  const titleOf = (anchor: ConversationAnchor) => anchor.title || labels.attachments(anchor.attachments)
  useLayoutEffect(() => {
    const id = pendingFocus.current
    if (!id) return
    const button = [...(nav.current?.querySelectorAll<HTMLButtonElement>('[data-conversation-anchor]') ?? [])].find(
      (item) => item.dataset.conversationAnchor === id,
    )
    if (button) {
      pendingFocus.current = null
      button.focus({ preventScroll: true })
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [anchors, page.start, focusId])
  if (!anchors.length && !hasOlder && olderStatus !== 'error') return null
  const reveal = (anchor: ConversationAnchor, element: HTMLButtonElement) => {
    popupAnchor.current = element
    setPreviewId(anchor.messageId)
  }
  const choosePage = (firstId: string | null) => {
    setPreviewId(null)
    setFirstId(firstId)
    if (firstId) {
      pendingFocus.current = firstId
      setFocusId(firstId)
    }
  }
  const move = (event: KeyboardEvent<HTMLElement>) => {
    const button =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-conversation-anchor]') : null
    if (!button) return
    const index = anchors.findIndex((anchor) => anchor.messageId === button.dataset.conversationAnchor)
    const next =
      event.key === 'ArrowUp'
        ? index - 1
        : event.key === 'ArrowDown'
          ? index + 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? anchors.length - 1
              : -1
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const anchor = anchors[Math.max(0, Math.min(anchors.length - 1, next))]
    if (!anchor) return
    if (anchor.messageId === button.dataset.conversationAnchor) return
    keyboardPreview.current = true
    setPreviewId(null)
    setFocusId(anchor.messageId)
    if (!page.items.some((item) => item.messageId === anchor.messageId)) {
      const start = Math.floor(Math.max(0, next) / CONVERSATION_ANCHOR_PAGE_SIZE) * CONVERSATION_ANCHOR_PAGE_SIZE
      setFirstId(anchors[start]?.messageId ?? null)
    }
    pendingFocus.current = anchor.messageId
  }
  const historyLabel =
    olderStatus === 'loading'
      ? labels.loadingOlder
      : olderStatus === 'error'
        ? labels.retryOlder
        : olderStatus === 'limit'
          ? labels.historyLimit
          : labels.older
  return (
    <aside className="hbar-conversation-anchor-lane">
      <nav
        ref={nav}
        className="hbar-conversation-anchor-rail"
        aria-label={labels.navigation(
          anchors.length ? page.start + 1 : 0,
          page.start + page.items.length,
          anchors.length,
        )}
        aria-busy={navigating || olderStatus === 'loading'}
        onKeyDown={move}
        onPointerMove={(event) => {
          if (event.pointerType === 'touch') return
          const previous = pointerPosition.current
          pointerPosition.current = { x: event.clientX, y: event.clientY }
          // Paging can move a marker under a stationary cursor. Keyboard focus
          // owns the preview until the user actually moves the pointer again.
          if (previous?.x === event.clientX && previous.y === event.clientY) return
          keyboardPreview.current = false
          const button =
            event.target instanceof HTMLElement
              ? event.target.closest<HTMLButtonElement>('[data-conversation-anchor]')
              : null
          const anchor = page.items.find((item) => item.messageId === button?.dataset.conversationAnchor)
          if (anchor && button) reveal(anchor, button)
        }}
      >
        {(hasOlder || olderStatus === 'error') && (
          <button
            type="button"
            className="hbar-conversation-anchor-control"
            aria-label={historyLabel}
            title={historyLabel}
            disabled={!canLoadOlder || olderStatus === 'loading' || olderStatus === 'limit'}
            onClick={() => {
              setPreviewId(null)
              setFirstId(null)
              onLoadOlder()
            }}
          >
            <LumenIcon icon={History} tier="sm" />
          </button>
        )}
        {page.hasPrevious && (
          <button
            type="button"
            className="hbar-conversation-anchor-control"
            aria-label={labels.previous}
            title={labels.previous}
            onClick={() => choosePage(page.previousId)}
          >
            <LumenIcon icon={ChevronUp} tier="sm" />
          </button>
        )}
        <div className="hbar-conversation-anchor-list">
          {page.items.map((anchor, index) => (
            <button
              key={anchor.messageId}
              type="button"
              className="hbar-conversation-anchor"
              data-conversation-anchor={anchor.messageId}
              aria-label={labels.jump(page.start + index + 1, titleOf(anchor))}
              aria-current={anchor.messageId === activeId ? 'location' : undefined}
              aria-describedby={preview?.messageId === anchor.messageId ? tooltipId : undefined}
              tabIndex={anchor.messageId === tabStop ? 0 : -1}
              onPointerEnter={(event) => {
                if (event.pointerType !== 'touch' && !keyboardPreview.current) reveal(anchor, event.currentTarget)
              }}
              onPointerLeave={() => {
                if (!keyboardPreview.current) setPreviewId(null)
              }}
              onFocus={(event) => {
                keyboardPreview.current = true
                setFocusId(anchor.messageId)
                reveal(anchor, event.currentTarget)
              }}
              onBlur={() => setPreviewId(null)}
              onClick={() => {
                setPreviewId(null)
                setFirstId(null)
                onNavigate(anchor.messageId)
              }}
            >
              <span aria-hidden="true" className="hbar-conversation-anchor-mark" />
            </button>
          ))}
        </div>
        {page.nextId && (
          <button
            type="button"
            className="hbar-conversation-anchor-control"
            aria-label={labels.next}
            title={labels.next}
            onClick={() => choosePage(page.nextId)}
          >
            <LumenIcon icon={ChevronDown} tier="sm" />
          </button>
        )}
      </nav>
      <LumenFloatingSurface
        key={preview?.messageId}
        id={tooltipId}
        role="tooltip"
        label={labels.preview}
        open={Boolean(preview && popupAnchor.current?.isConnected)}
        onClose={() => setPreviewId(null)}
        anchorRef={popupAnchor}
        placement="right"
        focusBehavior="preserve"
        trapFocus={false}
        restoreFocus={false}
        className="hbar-conversation-anchor-preview"
      >
        {preview && (
          <>
            <strong>{titleOf(preview)}</strong>
            {preview.preview && <p>{preview.preview}</p>}
          </>
        )}
      </LumenFloatingSurface>
    </aside>
  )
}

function ownsTarget(runtime: HbarRuntimeView, target: ConversationReadingTarget): boolean {
  const navigation = runtime.state.navigation.getSnapshot()
  const tabs = runtime.state.workspaceTabs.getSnapshot()
  const tab = tabs.items.find((item) => item.id === tabs.activeId)
  return (
    navigation.sessionId === target.sessionId &&
    navigation.workspaceId === target.workspaceId &&
    tab?.kind === 'session' &&
    tab.sessionId === target.sessionId &&
    tab.instanceKey === target.sourceTabInstanceKey &&
    runtime.state.presentation.getSnapshot().page.kind === 'session'
  )
}

export function HbarSessionMessageAnchors({
  timeline,
  target,
  labels,
  connected,
  navigating,
  onBeforeNavigate,
}: {
  readonly timeline: SessionTimelineState
  readonly target: ConversationReadingTarget
  readonly labels: HbarConversationAnchorLabels
  readonly connected: boolean
  readonly navigating: boolean
  readonly onBeforeNavigate: () => void
}) {
  const runtime = useHbarRuntime()
  const owner = useRef(runtime)
  owner.current = runtime
  const anchors = useMemo(
    () =>
      projectConversationAnchors({ sessionId: timeline.sessionId, messages: timeline.messages, runs: timeline.runs }),
    [timeline.sessionId, timeline.messages, timeline.runs],
  )
  const readActive = useCallback(
    () => currentConversationAnchor(anchors, timeline.messages, runtime.conversationReading.read(target)),
    [runtime, target, anchors, timeline.messages],
  )
  const activeId = useSyncExternalStore(runtime.conversationReading.reader.subscribe, readActive, readActive)
  return (
    <HbarConversationAnchorRail
      key={JSON.stringify([
        runtime.hostId,
        runtime.instanceId,
        target.workspaceId,
        target.sessionId,
        target.sourceTabInstanceKey,
      ])}
      anchors={anchors}
      activeId={activeId}
      labels={labels}
      hasOlder={timeline.hasOlder}
      olderStatus={timeline.olderStatus}
      canLoadOlder={connected && timeline.status === 'ready'}
      navigating={navigating}
      onNavigate={(messageId) => {
        if (
          owner.current !== runtime ||
          !ownsTarget(runtime, target) ||
          !runtime.state.timeline
            .getSnapshot()
            .messages.some((message) => message.sessionId === target.sessionId && message.id === messageId)
        )
          return
        onBeforeNavigate()
        runtime.conversationReading.navigate(target, { messageId, messageOffset: 0, atEnd: false })
      }}
      onLoadOlder={() => {
        if (owner.current !== runtime || !ownsTarget(runtime, target)) return
        void runtime.commands.execute('timeline.loadOlder', { sessionId: target.sessionId }).catch(() => undefined)
      }}
    />
  )
}
