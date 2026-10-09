import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from 'react'
import type { ConversationReadingPosition, ConversationReadingTarget } from '@hbar/app-runtime'
import type { HbarRuntimeView } from './runtime'
import { isConversationReadingOwner, measureConversationReading } from './session-reading-position'
import { createHistoryPageTrigger } from './session-history-scroll-model'

interface HistoryScrollOptions {
  readonly runtime: HbarRuntimeView
  readonly target: ConversationReadingTarget | null
  readonly connected: boolean
  readonly ready: boolean
  readonly restoring: boolean
  readonly findRequestId: string | null
}

interface PendingHistoryReader {
  readonly position: ConversationReadingPosition
  readonly navigationRevision: number
  readonly findRequestId: string | null
  moved: boolean
}

/** Capture only the message pane, excluding nested code, editable fields and the anchor rail. */
function messageViewport(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof HTMLElement ? target : target instanceof Element ? target.parentElement : null
  if (!element || element.closest('input,textarea,[contenteditable="true"]')) return null
  const viewport = element.closest<HTMLElement>('.lumen-conversation-messages')
  if (!viewport) return null
  for (let node: HTMLElement | null = element; node && node !== viewport; node = node.parentElement)
    if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return null
  return viewport
}

/** DOM gesture bookkeeping only; the runtime remains the owner of history and request state. */
export function useSessionHistoryScroll(options: HistoryScrollOptions) {
  const { runtime, target } = options
  const latest = useRef(options)
  latest.current = options
  const scope = target ? JSON.stringify([target.workspaceId, target.sessionId, target.sourceTabInstanceKey]) : null
  const gesture = useMemo(
    () => ({
      runtime,
      scope,
      trigger: createHistoryPageTrigger(),
      viewport: null as HTMLElement | null,
      top: 0,
      touchY: null as number | null,
      frame: null as number | null,
      pendingReader: null as PendingHistoryReader | null,
    }),
    [runtime, scope],
  )
  useEffect(() => {
    gesture.trigger.disarm()
    return () => {
      gesture.trigger.disarm()
      if (gesture.frame !== null) cancelAnimationFrame(gesture.frame)
      gesture.frame = null
    }
  }, [gesture, options.connected, options.ready, options.restoring, options.findRequestId])
  const ownsReader = () => {
    const current = latest.current
    if (!target || !isConversationReadingOwner(current, gesture.runtime, target)) return false
    const navigation = runtime.state.navigation.getSnapshot()
    const tabs = runtime.state.workspaceTabs.getSnapshot()
    const tab = tabs.items.find((item) => item.id === tabs.activeId)
    const timeline = runtime.state.timeline.getSnapshot()
    return (
      current.ready &&
      current.connected &&
      runtime.state.presentation.getSnapshot().page.kind === 'session' &&
      navigation.sessionId === target.sessionId &&
      navigation.workspaceId === target.workspaceId &&
      tab?.kind === 'session' &&
      tab.sessionId === target.sessionId &&
      tab.workspaceId === target.workspaceId &&
      tab.instanceKey === target.sourceTabInstanceKey &&
      timeline.sessionId === target.sessionId &&
      timeline.status === 'ready'
    )
  }
  const eligible = () => {
    const timeline = runtime.state.timeline.getSnapshot()
    return ownsReader() && !latest.current.restoring && timeline.hasOlder && timeline.olderStatus === 'idle'
  }
  const disarm = () => {
    gesture.trigger.disarm()
    if (gesture.pendingReader) gesture.pendingReader.moved = true
  }
  const checkTop = (viewport: HTMLElement) => {
    if (!viewport.isConnected || !eligible()) {
      gesture.trigger.disarm()
      return
    }
    if (!gesture.trigger.armed || gesture.frame !== null) return
    let frames = 0
    const inspect = () => {
      gesture.frame = null
      const timeline = runtime.state.timeline.getSnapshot()
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      if (!viewport.isConnected || !eligible() || viewport.scrollTop > 2 * rem || !gesture.trigger.armed || !target)
        return
      const box = viewport.getBoundingClientRect()
      const rowVisible = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].some((row) => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > box.top + viewport.clientTop && rect.top < box.bottom
      })
      // The scroll event precedes deferred virtual row rendering. Wait for an
      // actual visible row instead of capturing a tail row at a transient top.
      if (!rowVisible) {
        if (++frames < 16) gesture.frame = requestAnimationFrame(inspect)
        else gesture.trigger.disarm()
        return
      }
      if (
        !gesture.trigger.take({
          eligible: true,
          firstMessageId: timeline.messages[0]?.id ?? null,
          scrollTop: viewport.scrollTop,
          threshold: 2 * rem,
        })
      )
        return
      const reader: PendingHistoryReader = {
        position: { ...measureConversationReading(viewport), atEnd: false },
        navigationRevision: runtime.conversationReading.navigation.getSnapshot().revision,
        findRequestId: latest.current.findRequestId,
        moved: false,
      }
      gesture.pendingReader = reader
      const settle = () => {
        gesture.trigger.settle()
        if (gesture.pendingReader === reader) gesture.pendingReader = null
      }
      // Timeline owns request/error state and fences pages by selection generation.
      void runtime.commands.execute('timeline.loadOlder', { sessionId: target.sessionId }).then((result) => {
        settle()
        if (
          result.loaded > 0 &&
          !reader.moved &&
          ownsReader() &&
          viewport.isConnected &&
          gesture.viewport === viewport &&
          !latest.current.restoring &&
          reader.navigationRevision === runtime.conversationReading.navigation.getSnapshot().revision &&
          reader.findRequestId === latest.current.findRequestId &&
          runtime.state.timeline.getSnapshot().messages.some((message) => message.id === reader.position.messageId)
        )
          runtime.conversationReading.navigate(target, reader.position)
      }, settle)
    }
    gesture.frame = requestAnimationFrame(inspect)
  }
  const arm = (viewport: HTMLElement) => {
    gesture.viewport = viewport
    gesture.top = viewport.scrollTop
    gesture.trigger.arm(eligible())
    checkTop(viewport)
  }
  return {
    onScrollCapture(event: UIEvent<HTMLElement>): void {
      const viewport = event.target
      if (!(viewport instanceof HTMLElement) || !viewport.matches('.lumen-conversation-messages')) return
      if (gesture.viewport !== viewport) return
      if (viewport.scrollTop > gesture.top) gesture.trigger.disarm()
      gesture.top = viewport.scrollTop
      checkTop(viewport)
    },
    onWheelCapture(event: WheelEvent<HTMLElement>): void {
      const viewport = messageViewport(event.target)
      if (!viewport || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      if (event.deltaY < 0) arm(viewport)
      else if (event.deltaY > 0) disarm()
    },
    onPointerDownCapture(event: PointerEvent<HTMLElement>): void {
      // Native scrollbar dragging starts on the viewport itself.
      const viewport = messageViewport(event.target)
      if (viewport && viewport === event.target) {
        disarm()
        arm(viewport)
      }
    },
    onTouchStartCapture(event: TouchEvent<HTMLElement>): void {
      gesture.touchY = messageViewport(event.target) ? (event.touches[0]?.clientY ?? null) : null
    },
    onTouchMoveCapture(event: TouchEvent<HTMLElement>): void {
      const viewport = messageViewport(event.target)
      const y = event.touches[0]?.clientY
      if (viewport && y !== undefined && gesture.touchY !== null) {
        if (y > gesture.touchY) arm(viewport)
        else if (y < gesture.touchY) disarm()
      }
      gesture.touchY = y ?? null
    },
    onKeyDownCapture(event: KeyboardEvent<HTMLElement>): void {
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey)
        return
      const viewport = messageViewport(event.target)
      if (!viewport) return
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) arm(viewport)
      else if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) disarm()
    },
  }
}
