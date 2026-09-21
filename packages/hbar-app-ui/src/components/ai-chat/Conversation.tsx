import { LumenButton } from '@lumen/app-ui'
import { ChevronDown } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiMessage, type HbarAppUiMessageProps } from './Message'
import './Conversation.css'
import { uniqueItems } from '../../collection'

const VIRTUAL_THRESHOLD = 40
const MESSAGE_ESTIMATE_REM = 8
const SERVER_ROOT_FONT_PX = 16
const OVERSCAN_MESSAGES = 4
const END_THRESHOLD_REM = 2

interface ScrollAnchor {
  readonly top: number
  readonly atEnd: boolean
  readonly revision: string
  readonly messageId: string | undefined
  readonly messageOffset: number
}

function visibleMessageAnchor(element: HTMLDivElement) {
  const viewportTop = element.getBoundingClientRect().top
  for (const message of element.querySelectorAll<HTMLElement>('[data-message-id]')) {
    const rect = message.getBoundingClientRect()
    if (rect.bottom > viewportTop)
      return { messageId: message.dataset.messageId, messageOffset: rect.top - viewportTop }
  }
  return { messageId: undefined, messageOffset: 0 }
}

function restoreMessageAnchor(element: HTMLDivElement, messageId: string | undefined, offset: number) {
  if (!messageId) return false
  const viewportTop = element.getBoundingClientRect().top
  const message = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
    (candidate) => candidate.dataset.messageId === messageId,
  )
  if (!message) return false
  element.scrollTop += message.getBoundingClientRect().top - viewportTop - offset
  return true
}

export interface HbarAppUiConversationProps {
  readonly title: string
  readonly messages: readonly HbarAppUiMessageProps[]
  readonly empty: ReactNode
  readonly composer: ReactNode
  readonly header?: ReactNode | undefined
  readonly beforeMessages?: ReactNode | undefined
  readonly afterMessages?: ReactNode | undefined
  readonly scrollKey?: string | undefined
  readonly contentRevision?: string | number | undefined
  readonly latestLabel?: string | undefined
}
/** Embedded thread with per-key anchors and dynamic virtualization for long production history. */
export function HbarAppUiConversation(props: HbarAppUiConversationProps) {
  const viewport = useRef<HTMLDivElement>(null)
  const anchors = useRef(new Map<string, ScrollAnchor>())
  const previous = useRef<
    | {
        readonly key: string
        readonly firstId: string | undefined
        readonly lastId: string | undefined
        readonly count: number
        readonly top: number
        readonly height: number
        readonly atEnd: boolean
        readonly revision: string
        readonly messageId: string | undefined
        readonly messageOffset: number
      }
    | undefined
  >(undefined)
  const [hasNewContent, setHasNewContent] = useState(false)
  const messages = useMemo(() => uniqueItems(props.messages), [props.messages])
  const scrollKey = props.scrollKey ?? 'conversation'
  const revision = String(props.contentRevision ?? `${messages.length}:${messages.at(-1)?.id ?? ''}`)
  const virtualized = typeof document !== 'undefined' && messages.length > VIRTUAL_THRESHOLD
  const virtual = useVirtualizer({
    count: virtualized ? messages.length : 0,
    getScrollElement: () => viewport.current,
    getItemKey: (index) => messages[index]?.id ?? index,
    estimateSize: () =>
      MESSAGE_ESTIMATE_REM *
      (typeof document === 'undefined'
        ? SERVER_ROOT_FONT_PX
        : Number.parseFloat(getComputedStyle(document.documentElement).fontSize)),
    overscan: OVERSCAN_MESSAGES,
  })
  const visible = virtual.getVirtualItems()
  const leading = visible[0]?.start ?? 0
  const trailing = Math.max(0, virtual.getTotalSize() - (visible.at(-1)?.end ?? 0))
  const atEnd = useCallback((element: HTMLDivElement) => {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return element.scrollHeight - element.scrollTop - element.clientHeight <= END_THRESHOLD_REM * rootSize
  }, [])
  const saveAnchor = useCallback(
    (element: HTMLDivElement) => {
      const value = {
        top: element.scrollTop,
        atEnd: atEnd(element),
        revision,
        ...visibleMessageAnchor(element),
      }
      anchors.current.set(scrollKey, value)
      return value
    },
    [atEnd, revision, scrollKey],
  )

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const prior = previous.current
    let correctionFrame: number | undefined
    let correctionTimer: number | undefined
    let correctionObserver: ResizeObserver | undefined
    if (!prior || prior.key !== scrollKey) {
      const saved = anchors.current.get(scrollKey)
      if (!saved || saved.atEnd) element.scrollTop = element.scrollHeight
      else {
        element.scrollTop = Math.min(saved.top, Math.max(0, element.scrollHeight - element.clientHeight))
        correctionFrame = requestAnimationFrame(() => {
          const current = viewport.current
          if (current) restoreMessageAnchor(current, saved.messageId, saved.messageOffset)
        })
      }
      setHasNewContent(Boolean(saved && !saved.atEnd && saved.revision !== revision))
    } else {
      const prepended =
        prior.firstId !== messages[0]?.id && prior.lastId === messages.at(-1)?.id && messages.length > prior.count
      if (prepended && !prior.atEnd) {
        const correct = () => {
          const current = viewport.current
          if (!current) return
          const restored = restoreMessageAnchor(current, prior.messageId, prior.messageOffset)
          if (!restored) current.scrollTop = Math.max(0, prior.top + current.scrollHeight - prior.height)
          const anchor = saveAnchor(current)
          previous.current = previous.current
            ? {
                ...previous.current,
                top: anchor.top,
                height: current.scrollHeight,
                atEnd: anchor.atEnd,
                messageId: anchor.messageId,
                messageOffset: anchor.messageOffset,
              }
            : previous.current
        }
        correct()
        correctionFrame = requestAnimationFrame(correct)
        const virtualList = element.querySelector('.hbar-app-ui-conversation-virtual')
        if (virtualList && typeof ResizeObserver !== 'undefined') {
          correctionObserver = new ResizeObserver(correct)
          correctionObserver.observe(virtualList)
          correctionTimer = window.setTimeout(() => correctionObserver?.disconnect(), 250)
        }
      } else if (prior.atEnd) element.scrollTop = element.scrollHeight
      else if (prior.revision !== revision) setHasNewContent(true)
    }
    const current = saveAnchor(element)
    previous.current = {
      key: scrollKey,
      firstId: messages[0]?.id,
      lastId: messages.at(-1)?.id,
      count: messages.length,
      top: current.top,
      height: element.scrollHeight,
      atEnd: current.atEnd,
      revision,
      messageId: current.messageId,
      messageOffset: current.messageOffset,
    }
    return () => {
      if (correctionFrame !== undefined) cancelAnimationFrame(correctionFrame)
      if (correctionTimer !== undefined) clearTimeout(correctionTimer)
      correctionObserver?.disconnect()
    }
  }, [messages, revision, saveAnchor, scrollKey, virtualized])

  const onScroll = () => {
    const element = viewport.current
    if (!element) return
    const current = saveAnchor(element)
    if (current.atEnd) setHasNewContent(false)
    previous.current = previous.current
      ? {
          ...previous.current,
          top: current.top,
          height: element.scrollHeight,
          atEnd: current.atEnd,
          messageId: current.messageId,
          messageOffset: current.messageOffset,
        }
      : previous.current
  }
  const showLatest = () => {
    const element = viewport.current
    if (!element) return
    virtual.scrollToIndex(messages.length - 1, { align: 'end' })
    element.scrollTop = element.scrollHeight
    setHasNewContent(false)
    saveAnchor(element)
  }

  return (
    <section className="hbar-app-ui-conversation" aria-label={props.title}>
      {props.header === undefined ? (
        <header>
          <h2>{props.title}</h2>
        </header>
      ) : (
        props.header
      )}
      <div ref={viewport} className="hbar-app-ui-conversation-messages" onScroll={onScroll}>
        <div className="hbar-app-ui-conversation-content">
          {props.beforeMessages}
          {messages.length ? (
            virtualized ? (
              <div
                className="hbar-app-ui-conversation-virtual"
                role="list"
                data-hbar-app-ui-list-strategy="virtualized"
                data-hbar-app-ui-message-count={messages.length}
              >
                <div aria-hidden="true" style={{ blockSize: leading }} />
                {visible.map((item) => {
                  const message = messages[item.index]
                  return message ? (
                    <div
                      key={message.id}
                      data-index={item.index}
                      ref={virtual.measureElement}
                      className="hbar-app-ui-conversation-virtual-row"
                      role="listitem"
                      aria-posinset={item.index + 1}
                      aria-setsize={messages.length}
                    >
                      <HbarAppUiMessage {...message} />
                    </div>
                  ) : null
                })}
                <div aria-hidden="true" style={{ blockSize: trailing }} />
              </div>
            ) : (
              messages.map((message) => <HbarAppUiMessage {...message} key={message.id} />)
            )
          ) : (
            props.empty
          )}
          {props.afterMessages}
        </div>
      </div>
      {hasNewContent && props.latestLabel && (
        <LumenButton type="button" className="hbar-app-ui-conversation-latest" onClick={showLatest}>
          <HbarAppUiIcon icon={ChevronDown} tier="sm" />
          {props.latestLabel}
        </LumenButton>
      )}
      {props.composer}
    </section>
  )
}
const ConversationContext = createContext<HbarAppUiConversationProps | undefined>(undefined)
export function HbarAppUiConversationProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiConversationProps
  readonly children: ReactNode
}) {
  return <ConversationContext.Provider value={content}>{children}</ConversationContext.Provider>
}
export function useHbarAppUiConversationContent() {
  return useContext(ConversationContext)
}
