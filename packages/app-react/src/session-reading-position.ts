import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
  type WheelEvent,
  type TouchEvent,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import type { LumenConversationScrollTarget, LumenConversationScrollTargetResult } from '@lumen/app-ui'
import type { ConversationReadingPosition, ConversationReadingTarget } from '@hbar/app-runtime'
import { useHbarRuntimeState, type HbarRuntimeView } from './runtime'
import { sessionSearchHitBox } from './session-search-hit'

const MAX_OLDER_PAGES = 17 // Existing timeline bound: 1,000 messages in 60-message pages.
const READ_TIMEOUT_MS = 12_000
const ALIGN_TIMEOUT_MS = 500

/** Geometry belongs to the reader, not to a second message/content cache. */
export function measureConversationReading(viewport: HTMLElement): ConversationReadingPosition {
  const top = viewport.getBoundingClientRect().top + viewport.clientTop
  const row = [...viewport.querySelectorAll<HTMLElement>('[data-message-id]')].find(
    (candidate) => candidate.getBoundingClientRect().bottom > top,
  )
  const rootRem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return {
    messageId: row?.dataset.messageId ?? null,
    messageOffset: row ? row.getBoundingClientRect().top - top : 0,
    atEnd: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2 * rootRem,
  }
}

/** Semantic success permits sub-line virtual measurement drift, not another message. */
export function isConversationReadingAtPosition(
  actual: ConversationReadingPosition,
  saved: ConversationReadingPosition,
  lineTolerance: number,
): boolean {
  return (
    Number.isFinite(lineTolerance) &&
    lineTolerance > 0 &&
    actual.messageId !== null &&
    actual.messageId === saved.messageId &&
    Math.abs(actual.messageOffset - saved.messageOffset) < lineTolerance
  )
}

interface ReadingOptions {
  readonly runtime: HbarRuntimeView
  readonly target: ConversationReadingTarget | null
  readonly ready: boolean
  readonly findOpen: boolean
  readonly messageIds: readonly string[]
  readonly hasOlder: boolean
  readonly olderStatus: string
}

/** A same tab identity on another Host/runtime is not the same reading owner. */
export function isConversationReadingOwner(
  current: Pick<ReadingOptions, 'runtime' | 'target'>,
  runtime: HbarRuntimeView,
  captured: ConversationReadingTarget,
): boolean {
  return (
    current.runtime === runtime &&
    current.target?.sessionId === captured.sessionId &&
    current.target.workspaceId === captured.workspaceId &&
    current.target.sourceTabInstanceKey === captured.sourceTabInstanceKey
  )
}

/** Restores through the public controlled-scroll seam, including measured virtual rows. */
export function useSessionReadingPosition(options: ReadingOptions) {
  const { runtime, target, ready, findOpen, messageIds, hasOlder, olderStatus } = options
  const scope = target ? JSON.stringify([target.workspaceId, target.sessionId, target.sourceTabInstanceKey]) : null
  const workspaceId = target?.workspaceId
  const sessionId = target?.sessionId
  const sourceTabInstanceKey = target?.sourceTabInstanceKey
  const requested = useHbarRuntimeState(runtime.conversationReading.navigation)
  const latest = useRef(options)
  latest.current = options
  const completedNavigation = useRef<{ scope: string | null; revision: number } | null>(null)
  const ticket = useMemo(() => {
    if (!workspaceId || !sessionId || !sourceTabInstanceKey) return null
    const source = { workspaceId, sessionId, sourceTabInstanceKey }
    const intent =
      requested.request && isConversationReadingOwner(latest.current, runtime, requested.request.target)
        ? requested.request
        : null
    if (
      !intent &&
      completedNavigation.current?.scope === scope &&
      completedNavigation.current.revision === requested.revision
    )
      return null
    const position = intent?.position ?? runtime.conversationReading.read(source)
    const messages = runtime.state.timeline.getSnapshot().messages
    const latestAssistant = messages.findLast((message) => message.role === 'assistant')
    const messageId =
      intent?.position.atEnd && ready
        ? (latestAssistant?.id ?? position?.messageId ?? messages.findLast((message) => message.role === 'user')?.id)
        : position?.messageId
    const saved = position && messageId ? { ...position, messageId } : null
    return saved && (intent || !saved.atEnd)
      ? {
          scope,
          source,
          saved,
          intent,
          revision: requested.revision,
          scroll: {
            requestId: crypto.randomUUID(),
            scrollKey: sessionId,
            messageId: saved.messageId,
            align: saved.atEnd ? ('end' as const) : ('start' as const),
          },
        }
      : null
    // A snapshot is captured once per reader identity; its own scroll writes must not restart restoration.
  }, [runtime, scope, workspaceId, sessionId, sourceTabInstanceKey, requested, ready])
  const [finished, setFinished] = useState<string | null>(null)
  const finishedRequest = useRef<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const pendingRead = useRef<{
    readonly scope: string
    readonly timer: ReturnType<typeof setTimeout>
    cancelled: boolean
  } | null>(null)
  const pendingAlignment = useRef<{ frame: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const readBudget = useRef<{ scope: string | null; attempts: number }>({ scope: null, attempts: 0 })
  const mounted = useRef(true)
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLElement | null>(null)
  const restoring = Boolean(ticket && ticket.scroll.requestId !== finished && ready && !findOpen)
  const messageKey = messageIds.join('\u0000')
  const available = ticket ? messageIds.includes(ticket.scroll.messageId) : false

  const finish = useCallback(
    (unavailable = false) => {
      if (!scope) return
      const read = pendingRead.current
      if (read) {
        read.cancelled = true
        clearTimeout(read.timer)
        pendingRead.current = null
      }
      const alignment = pendingAlignment.current
      if (alignment) {
        cancelAnimationFrame(alignment.frame)
        clearTimeout(alignment.timer)
        pendingAlignment.current = null
      }
      finishedRequest.current = ticket?.scroll.requestId ?? null
      setFinished(finishedRequest.current)
      setFailed(unavailable ? (ticket?.scroll.requestId ?? null) : null)
      if (ticket?.intent && isConversationReadingOwner(latest.current, runtime, ticket.source)) {
        const element = viewport.current
        if (element?.isConnected)
          runtime.conversationReading.remember(ticket.source, measureConversationReading(element))
        completedNavigation.current = { scope, revision: ticket.revision }
        runtime.conversationReading.acknowledge(ticket.source, ticket.revision)
      }
    },
    [scope, ticket, runtime],
  )
  const isCurrent = useCallback(
    (captured: ConversationReadingTarget) =>
      mounted.current && isConversationReadingOwner(latest.current, runtime, captured),
    [runtime],
  )

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const read = pendingRead.current
      if (read) {
        read.cancelled = true
        clearTimeout(read.timer)
      }
      pendingRead.current = null
      const alignment = pendingAlignment.current
      if (alignment) {
        cancelAnimationFrame(alignment.frame)
        clearTimeout(alignment.timer)
      }
      pendingAlignment.current = null
      readBudget.current = { scope: null, attempts: 0 }
    }
  }, [runtime, scope])

  useEffect(() => {
    if (readBudget.current.scope !== scope) readBudget.current = { scope, attempts: 0 }
    if (findOpen && ticket) {
      finish()
      return
    }
    if (!restoring || !scope || !target || available || pendingRead.current) return
    if (olderStatus === 'loading') return
    if (
      !hasOlder ||
      olderStatus === 'error' ||
      olderStatus === 'limit' ||
      readBudget.current.attempts >= MAX_OLDER_PAGES
    ) {
      finish(true)
      return
    }
    readBudget.current.attempts++
    const captured = target
    const read = {
      scope,
      cancelled: false,
      timer: setTimeout(() => {
        read.cancelled = true
        if (pendingRead.current === read) pendingRead.current = null
        if (isCurrent(captured)) finish(true)
      }, READ_TIMEOUT_MS),
    }
    pendingRead.current = read
    void runtime.commands.execute('timeline.loadOlder', { sessionId: captured.sessionId }).then(
      (result) => {
        clearTimeout(read.timer)
        if (pendingRead.current === read) pendingRead.current = null
        if (read.cancelled || !isCurrent(captured)) return
        if (!result.loaded) finish(true)
        else setRetry((value) => value + 1)
      },
      () => {
        clearTimeout(read.timer)
        if (pendingRead.current === read) pendingRead.current = null
        if (!read.cancelled && isCurrent(captured)) finish(true)
      },
    )
  }, [
    runtime,
    scope,
    target,
    ticket,
    ready,
    findOpen,
    restoring,
    available,
    messageKey,
    hasOlder,
    olderStatus,
    retry,
    finish,
    isCurrent,
  ])

  const remember = useCallback(
    (element: HTMLElement) => {
      const current = latest.current
      if (
        !current.target ||
        current.runtime !== runtime ||
        !current.ready ||
        root.current?.dataset.readingScope !== scope ||
        (ticket && finishedRequest.current !== ticket.scroll.requestId)
      )
        return
      const sourceStillOpen = runtime.state.workspaceTabs
        .getSnapshot()
        .items.some(
          (tab) =>
            tab.kind === 'session' &&
            tab.sessionId === current.target?.sessionId &&
            tab.workspaceId === current.target.workspaceId &&
            tab.instanceKey === current.target.sourceTabInstanceKey,
        )
      if (!sourceStillOpen) return
      const position = measureConversationReading(element)
      if (position.messageId) runtime.conversationReading.remember(current.target, position)
    },
    [runtime, scope, ticket],
  )
  useEffect(() => {
    // Capture the still-owned DOM before navigation replaces the React subtree.
    // Virtual row measurement may have changed an offset after the last scroll
    // event; cleanup is too late because React may already have reused the node.
    const captureLeavingReader = () => {
      const element = viewport.current
      if (element?.isConnected) remember(element)
    }
    const offPresentation = runtime.state.presentation.subscribe(captureLeavingReader)
    const offNavigation = runtime.state.navigation.subscribe(captureLeavingReader)
    const offTabs = runtime.state.workspaceTabs.subscribe(captureLeavingReader)
    return () => {
      offPresentation()
      offNavigation()
      offTabs()
    }
  }, [runtime, remember])
  const onScrollCapture = (event: UIEvent<HTMLElement>) => {
    const element = event.target
    // Nested code/field scrolling is not conversation scrolling. Message IDs are
    // the same public identity seam consumed by controlled scrollTarget/result.
    if (!(element instanceof HTMLElement) || !element.querySelector('[data-message-id]')) return
    viewport.current = element
    remember(element)
  }
  const cancelForIntent = (
    event: WheelEvent<HTMLElement> | TouchEvent<HTMLElement> | PointerEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  ) => {
    const element = event.target
    if (
      !(element instanceof HTMLElement) ||
      !(element.closest('[data-message-id]') || element.querySelector('[data-message-id]'))
    )
      return
    if ('key' in event && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
      return
    if (restoring) finish()
  }
  const onScrollTargetResult = (result: LumenConversationScrollTargetResult): boolean => {
    if (!ticket || result.target.requestId !== ticket.scroll.requestId) return false
    if (finishedRequest.current === ticket.scroll.requestId || !isCurrent(ticket.source) || findOpen) return true
    const atSavedPosition = (element: HTMLElement | null) => {
      if (element?.isConnected && ticket.intent) {
        const call = [...element.querySelectorAll<HTMLElement>('[data-tool-call-id]')].find(
          (node) => node.dataset.toolCallId === ticket.intent?.callId,
        )
        const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
          (node) => node.dataset.messageId === ticket.saved.messageId,
        )
        if (ticket.intent.callId && !call) return false
        const anchor = call ?? row
        if (anchor)
          return (
            Math.abs(
              (sessionSearchHitBox(anchor, ticket.intent.query) ?? anchor.getBoundingClientRect()).top -
                element.getBoundingClientRect().top -
                element.clientTop,
            ) < (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
          )
      }
      return Boolean(
        element?.isConnected &&
        isConversationReadingAtPosition(
          measureConversationReading(element),
          ticket.saved,
          Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
        ),
      )
    }
    if (result.status === 'unavailable') finish(!atSavedPosition(viewport.current))
    else {
      const element = result.viewport
      viewport.current = element
      if (ticket.saved.atEnd) {
        finish()
        remember(element)
        return true
      }
      const callId = ticket.intent?.callId
      let stable = 0
      let geometry: string | null = null
      const align = () => {
        // A replaced runtime's callback must never finish/cancel the new
        // runtime's read or alignment stored in these reusable hook refs.
        if (!isCurrent(ticket.source)) return
        if (!element.isConnected || latest.current.findOpen) {
          finish()
          return
        }
        const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
          (candidate) => candidate.dataset.messageId === ticket.saved.messageId,
        )
        if (!row) {
          finish(true)
          return
        }
        const call = callId
          ? [...row.querySelectorAll<HTMLElement>('[data-tool-call-id]')].find(
              (node) => node.dataset.toolCallId === callId,
            )
          : undefined
        if (callId && !call) {
          // Completed activity groups defer their call DOM until expanded. Open
          // the existing disclosure action, then seek its exact call next frame.
          row.querySelector<HTMLButtonElement>('.hbar-session-activity-summary[aria-expanded="false"]')?.click()
          const alignment = pendingAlignment.current
          if (alignment) alignment.frame = requestAnimationFrame(align)
          return
        }
        call?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click()
        const box =
          sessionSearchHitBox(call ?? row, ticket.intent?.query ?? null) ?? (call ?? row).getBoundingClientRect()
        const delta = box.top - element.getBoundingClientRect().top - element.clientTop - ticket.saved.messageOffset
        const measured = `${box.height}:${element.scrollHeight}:${element.clientWidth}:${element.clientHeight}`
        if (Math.abs(delta) > 0.5) {
          element.scrollTop += delta
          stable = 0
        } else stable = geometry === measured ? stable + 1 : 0
        geometry = measured
        if (stable >= 3) {
          finish()
          remember(element)
          return
        }
        const alignment = pendingAlignment.current
        if (alignment) alignment.frame = requestAnimationFrame(align)
      }
      // Public seek locates the row. A clipped reading anchor can expose more
      // virtual rows than start alignment, so settle their measurements before
      // ending our intent. Keep this bounded, source-owned and user-cancellable.
      pendingAlignment.current = {
        frame: 0,
        timer: setTimeout(() => {
          if (isCurrent(ticket.source)) {
            // A virtualizer can keep applying tiny measurement corrections
            // beyond the settle deadline. Report failure only if the actual
            // reading range is still wrong, not solely because frames moved.
            finish(!atSavedPosition(element))
            remember(element)
          }
        }, ALIGN_TIMEOUT_MS),
      }
      align()
    }
    return true
  }
  return {
    rootRef: root,
    cancelNavigation: () => finish(),
    scope,
    scrollTarget: restoring && available && ticket ? (ticket.scroll satisfies LumenConversationScrollTarget) : null,
    restoring,
    unavailable:
      failed !== null &&
      (failed === ticket?.scroll.requestId ||
        (!ticket &&
          completedNavigation.current?.scope === scope &&
          completedNavigation.current.revision === requested.revision)),
    onScrollCapture,
    onWheelCapture: cancelForIntent,
    onTouchStartCapture: cancelForIntent,
    onPointerDownCapture: cancelForIntent,
    onKeyDownCapture: cancelForIntent,
    onScrollTargetResult,
  }
}
