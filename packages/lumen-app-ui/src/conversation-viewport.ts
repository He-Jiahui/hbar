'use client'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

const VIRTUAL_THRESHOLD = 40
const MESSAGE_ESTIMATE_REM = 8
const SERVER_ROOT_FONT_PX = 16
const OVERSCAN_MESSAGES = 4
const END_THRESHOLD_REM = 2
const TARGET_SETTLE_MS = 250

/** One explicit navigation intent. Reuse requestId for content refreshes, not for a new jump. */
export interface LumenConversationScrollTarget {
  readonly requestId: string
  readonly scrollKey: string
  readonly messageId: string
  readonly align?: 'start' | 'center' | 'end' | undefined
}

export type LumenConversationScrollTargetResult =
  | {
      readonly status: 'ready'
      readonly target: LumenConversationScrollTarget
      readonly viewport: HTMLDivElement
      readonly row: HTMLElement
    }
  | { readonly status: 'unavailable'; readonly target: LumenConversationScrollTarget }

function uniqueMessages<Item extends { id: string }>(items: readonly Item[]): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

interface ScrollAnchor {
  readonly top: number
  readonly atEnd: boolean
  readonly followPaused: boolean
  readonly revision: string
  readonly messageId: string | undefined
  readonly messageOffset: number
}

function visibleMessageAnchor(element: HTMLDivElement) {
  const viewportTop = element.getBoundingClientRect().top
  for (const message of element.querySelectorAll<HTMLElement>('[data-message-id]')) {
    const rect = message.getBoundingClientRect()
    if (rect.bottom > viewportTop) {
      return { messageId: message.dataset.messageId, messageOffset: rect.top - viewportTop }
    }
  }
  return { messageId: undefined, messageOffset: 0 }
}

function restoreMessageAnchor(element: HTMLDivElement, messageId: string | undefined, offset: number) {
  if (!messageId) {
    return false
  }
  const viewportTop = element.getBoundingClientRect().top
  const message = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
    (candidate) => candidate.dataset.messageId === messageId,
  )
  if (!message) {
    return false
  }
  element.scrollTop += message.getBoundingClientRect().top - viewportTop - offset
  return true
}

/** Pane-owned scroll, measured rows above 40 messages, and at most 128 per-session reading anchors. */
export function useConversationViewport<Item extends { id: string }>(options: {
  messages: readonly Item[]
  scrollKey?: string | undefined
  contentRevision?: string | number | undefined
  scrollTarget?: LumenConversationScrollTarget | null | undefined
  onScrollTargetResult?: ((result: LumenConversationScrollTargetResult) => void) | undefined
  followLatest?: boolean | undefined
}) {
  const viewport = React.useRef<HTMLDivElement>(null)
  const anchors = React.useRef(new Map<string, ScrollAnchor>())
  const previous = React.useRef<
    | {
        readonly key: string
        readonly firstId: string | undefined
        readonly lastId: string | undefined
        readonly count: number
        readonly top: number
        readonly height: number
        readonly atEnd: boolean
        readonly followPaused: boolean
        readonly revision: string
        readonly messageId: string | undefined
        readonly messageOffset: number
      }
    | undefined
  >(undefined)
  const [hasNewContent, setHasNewContent] = React.useState(false)
  const userPausedFollow = React.useRef(false)
  const userResumeRequested = React.useRef(false)
  const readerIntentAt = React.useRef(Number.NEGATIVE_INFINITY)
  const previousTouchY = React.useRef<number | null>(null)
  const seekGeneration = React.useRef(0)
  const seeking = React.useRef(false)
  const cancelSeek = React.useRef<(() => void) | undefined>(undefined)
  const cancelCorrection = React.useRef<(() => void) | undefined>(undefined)
  const messages = React.useMemo(() => uniqueMessages(options.messages), [options.messages])
  const scrollKey = options.scrollKey ?? 'conversation'
  const followLatest = options.followLatest ?? true
  const targetRequestId = options.scrollTarget?.requestId
  const targetScrollKey = options.scrollTarget?.scrollKey
  const targetMessageId = options.scrollTarget?.messageId
  const targetAlign = options.scrollTarget?.align ?? 'start'
  const revision = String(options.contentRevision ?? `${messages.length}:${messages.at(-1)?.id ?? ''}`)
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
    // Measured rows attach during a React commit. Avoid nested flushSync and
    // defer ResizeObserver measurements outside its notification delivery loop.
    useFlushSync: false,
    useAnimationFrameWithResizeObserver: true,
  })
  const visible = virtual.getVirtualItems()
  const leading = visible[0]?.start ?? 0
  const trailing = Math.max(0, virtual.getTotalSize() - (visible.at(-1)?.end ?? 0))
  const isAtEnd = React.useCallback((element: HTMLDivElement) => {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    return element.scrollHeight - element.scrollTop - element.clientHeight <= END_THRESHOLD_REM * rootSize
  }, [])
  const atEnd = React.useCallback((element: HTMLDivElement) => followLatest && isAtEnd(element), [followLatest, isAtEnd])
  const saveAnchor = React.useCallback(
    (element: HTMLDivElement) => {
      const value = {
        top: element.scrollTop,
        atEnd: followLatest && !userPausedFollow.current && atEnd(element),
        followPaused: userPausedFollow.current,
        revision,
        ...visibleMessageAnchor(element),
      }
      anchors.current.delete(scrollKey)
      anchors.current.set(scrollKey, value)
      if (anchors.current.size > 128) {
        const oldest = anchors.current.keys().next().value
        if (oldest !== undefined) {
          anchors.current.delete(oldest)
        }
      }
      return value
    },
    [atEnd, followLatest, revision, scrollKey],
  )

  const recordPosition = (element: HTMLDivElement) => {
    const current = saveAnchor(element)
    previous.current = {
      key: scrollKey,
      firstId: messages[0]?.id,
      lastId: messages.at(-1)?.id,
      count: messages.length,
      top: current.top,
      height: element.scrollHeight,
      atEnd: current.atEnd,
      followPaused: current.followPaused,
      revision,
      messageId: current.messageId,
      messageOffset: current.messageOffset,
    }
  }
  const latest = React.useRef({
    messages,
    scrollKey,
    virtualized,
    virtual,
    followLatest,
    recordPosition,
    onResult: options.onScrollTargetResult,
  })
  React.useLayoutEffect(() => {
    latest.current = {
      messages,
      scrollKey,
      virtualized,
      virtual,
      followLatest,
      recordPosition,
      onResult: options.onScrollTargetResult,
    }
  })

  React.useLayoutEffect(() => {
    seekGeneration.current += 1
    const generation = seekGeneration.current
    const candidateElement = viewport.current
    if (
      !candidateElement ||
      targetRequestId === undefined ||
      targetMessageId === undefined ||
      targetScrollKey !== scrollKey
    ) {
      return undefined
    }
    const element: HTMLDivElement = candidateElement
    const target: LumenConversationScrollTarget = Object.freeze({
      requestId: targetRequestId,
      scrollKey,
      messageId: targetMessageId,
      align: targetAlign,
    })
    let disposed = false
    let frame: number | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let stable = 0
    let geometry: string | undefined
    const isCurrent = () =>
      !disposed &&
      seekGeneration.current === generation &&
      latest.current.scrollKey === scrollKey &&
      viewport.current === element &&
      element.isConnected
    function cleanup() {
      disposed = true
      if (frame !== undefined) {
        cancelAnimationFrame(frame)
      }
      if (timeout !== undefined) {
        clearTimeout(timeout)
      }
      element.removeEventListener('wheel', interrupt)
      element.removeEventListener('touchstart', interrupt)
      element.removeEventListener('pointerdown', interrupt)
      element.removeEventListener('keydown', interruptKey)
      if (cancelSeek.current === cleanup) {
        cancelSeek.current = undefined
      }
      if (seekGeneration.current === generation) {
        seeking.current = false
      }
    }
    function interrupt() {
      if (!isCurrent()) {
        return
      }
      latest.current.recordPosition(element)
      cleanup()
    }
    function interruptKey(event: KeyboardEvent) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        interrupt()
      }
    }
    const unavailable = () => {
      if (!isCurrent()) {
        return
      }
      cleanup()
      latest.current.recordPosition(element)
      latest.current.onResult?.({ status: 'unavailable', target })
    }
    const locate = () => {
      if (!isCurrent()) {
        return
      }
      const current = latest.current
      const index = current.messages.findIndex((message) => message.id === target.messageId)
      if (index < 0) {
        unavailable()
        return
      }
      const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
        (candidate) => candidate.dataset.messageId === target.messageId,
      )
      const measurable = element.clientHeight > 0 && element.clientWidth > 0 && !element.closest('[inert],[hidden]')
      if (row && measurable && row.getBoundingClientRect().height > 0) {
        const box = row.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        const extra = Math.max(0, element.clientHeight - box.height)
        let alignmentOffset = 0
        if (targetAlign === 'end') {
          alignmentOffset = extra
        } else if (targetAlign === 'center') {
          alignmentOffset = extra / 2
        }
        const delta = box.top - bounds.top - element.clientTop - alignmentOffset
        const desired = Math.max(0, Math.min(element.scrollTop + delta, element.scrollHeight - element.clientHeight))
        const measuredGeometry = `${box.height}:${element.scrollHeight}:${current.virtual.getTotalSize()}`
        if (Math.abs(desired - element.scrollTop) > 0.5) {
          element.scrollTop = desired
          stable = 0
        } else if (geometry === measuredGeometry) {
          stable += 1
        } else {
          stable = 0
        }
        geometry = measuredGeometry
        // Deferred observer measurements and their React commit must settle
        // before publishing a row that the host will use for range alignment.
        if (stable >= 3) {
          cleanup()
          current.recordPosition(element)
          current.onResult?.({ status: 'ready', target, viewport: element, row })
          // A synchronous host range correction belongs to this same reading anchor.
          if (seekGeneration.current === generation && latest.current.scrollKey === scrollKey) {
            latest.current.recordPosition(element)
          }
          return
        }
      } else if (current.virtualized && measurable) {
        // scrollToIndex owns an internal, uncancellable reconciliation loop. Use
        // its public measurement query with our own bounded/cancellable writes.
        const offset = current.virtual.getOffsetForIndex(index, targetAlign)?.[0]
        const list = element.querySelector('.lumen-conversation-virtual')
        if (offset !== undefined && list) {
          const origin = list.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop
          element.scrollTop = origin + offset
        }
        stable = 0
        geometry = undefined
      }
      frame = requestAnimationFrame(locate)
    }
    seeking.current = true
    cancelCorrection.current?.()
    cancelSeek.current = cleanup
    element.addEventListener('wheel', interrupt, { passive: true })
    element.addEventListener('touchstart', interrupt, { passive: true })
    element.addEventListener('pointerdown', interrupt, { passive: true })
    element.addEventListener('keydown', interruptKey)
    timeout = setTimeout(unavailable, TARGET_SETTLE_MS)
    frame = requestAnimationFrame(locate)
    return cleanup
  }, [scrollKey, targetRequestId, targetScrollKey, targetMessageId, targetAlign])

  React.useLayoutEffect(() => {
    const element = viewport.current
    if (!element || seeking.current) {
      return undefined
    }
    const prior = previous.current
    let correctionFrame: number | undefined
    let correctionTimer: ReturnType<typeof setTimeout> | undefined
    let correctionObserver: ResizeObserver | undefined
    let correctionCancelled = false
    const cancelPositionCorrection = () => {
      correctionCancelled = true
      if (correctionFrame !== undefined) {
        cancelAnimationFrame(correctionFrame)
      }
      correctionObserver?.disconnect()
    }
    const hasRecentReaderIntent = () => performance.now() - readerIntentAt.current < TARGET_SETTLE_MS
    const cancelPositionKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        cancelPositionCorrection()
      }
    }
    const correctMeasuredPosition = (correct: () => void) => {
      const run = () => {
        if (
          correctionCancelled ||
          hasRecentReaderIntent() ||
          viewport.current !== element ||
          latest.current.scrollKey !== scrollKey ||
          seeking.current
        ) {
          return
        }
        correct()
        // A virtualizer may apply a measured offset correction without changing
        // total size. Keep this intent bounded by the same deadline as RO.
        correctionFrame = requestAnimationFrame(run)
      }
      const schedule = () => {
        if (correctionFrame !== undefined) {
          cancelAnimationFrame(correctionFrame)
        }
        if (!correctionCancelled) {
          correctionFrame = requestAnimationFrame(run)
        }
      }
      schedule()
      const virtualList = element.querySelector('.lumen-conversation-virtual')
      if (virtualList && typeof ResizeObserver !== 'undefined') {
        // Schedule only; never write layout during observer delivery.
        correctionObserver = new ResizeObserver(schedule)
        correctionObserver.observe(virtualList)
      }
      correctionTimer = setTimeout(cancelPositionCorrection, TARGET_SETTLE_MS)
      element.addEventListener('wheel', cancelPositionCorrection, { passive: true })
      element.addEventListener('touchstart', cancelPositionCorrection, { passive: true })
      element.addEventListener('pointerdown', cancelPositionCorrection, { passive: true })
      element.addEventListener('keydown', cancelPositionKey)
    }
    const followMeasuredEnd = () =>
      correctMeasuredPosition(() => {
        element.scrollTop = element.scrollHeight
        const anchor = saveAnchor(element)
        if (previous.current?.key === scrollKey) {
          previous.current = { ...previous.current, ...anchor, height: element.scrollHeight }
        }
      })
    if (!prior || prior.key !== scrollKey) {
      const saved = anchors.current.get(scrollKey)
      userPausedFollow.current = saved?.followPaused ?? false
      userResumeRequested.current = false
      previousTouchY.current = null
      readerIntentAt.current = Number.NEGATIVE_INFINITY
      if (!saved || saved.atEnd) {
        element.scrollTop = element.scrollHeight
        if (followLatest) {
          followMeasuredEnd()
        }
      } else {
        element.scrollTop = Math.min(saved.top, Math.max(0, element.scrollHeight - element.clientHeight))
        const correct = () => {
          const current = viewport.current
          if (current) {
            restoreMessageAnchor(current, saved.messageId, saved.messageOffset)
            const anchor = saveAnchor(current)
            if (previous.current?.key === scrollKey) {
              previous.current = { ...previous.current, ...anchor, height: current.scrollHeight }
            }
          }
        }
        correctMeasuredPosition(correct)
      }
      setHasNewContent(Boolean(saved && !saved.atEnd && saved.revision !== revision))
    } else {
      const prepended =
        prior.firstId !== messages[0]?.id && prior.lastId === messages.at(-1)?.id && messages.length > prior.count
      if (!prior.atEnd || !followLatest || userPausedFollow.current || hasRecentReaderIntent()) {
        const correct = () => {
          const current = viewport.current
          if (!current) {
            return
          }
          const restored = restoreMessageAnchor(current, prior.messageId, prior.messageOffset)
          if (!restored && prepended) {
            current.scrollTop = Math.max(0, prior.top + current.scrollHeight - prior.height)
          }
          const anchor = saveAnchor(current)
          previous.current = previous.current
            ? {
                ...previous.current,
                top: anchor.top,
                height: current.scrollHeight,
                atEnd: anchor.atEnd,
                followPaused: anchor.followPaused,
                messageId: anchor.messageId,
                messageOffset: anchor.messageOffset,
              }
            : previous.current
        }
        if (!hasRecentReaderIntent()) {
          correct()
          correctMeasuredPosition(correct)
        }
        if (!prepended && prior.revision !== revision) {
          setHasNewContent(true)
        }
      } else {
        element.scrollTop = element.scrollHeight
        followMeasuredEnd()
      }
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
      followPaused: current.followPaused,
      revision,
      messageId: current.messageId,
      messageOffset: current.messageOffset,
    }
    const cleanup = () => {
      correctionCancelled = true
      element.removeEventListener('wheel', cancelPositionCorrection)
      element.removeEventListener('touchstart', cancelPositionCorrection)
      element.removeEventListener('pointerdown', cancelPositionCorrection)
      element.removeEventListener('keydown', cancelPositionKey)
      if (correctionFrame !== undefined) {
        cancelAnimationFrame(correctionFrame)
      }
      if (correctionTimer !== undefined) {
        clearTimeout(correctionTimer)
      }
      correctionObserver?.disconnect()
    }
    cancelCorrection.current = cleanup
    return cleanup
  }, [
    messages,
    revision,
    saveAnchor,
    scrollKey,
    virtualized,
    followLatest,
    targetRequestId,
    targetScrollKey,
    targetMessageId,
    targetAlign,
  ])

  // Renderers can finish well after the bounded navigation/virtual measurement
  // window. Observe actual geometry for the lifetime of this pane, not on a
  // perpetual animation loop. One pending frame preserves either the latest
  // end or the same semantic message and offset while reading history.
  React.useLayoutEffect(() => {
    const element = viewport.current
    const content = element?.querySelector('.lumen-conversation-content')
    if (!element) {
      return undefined
    }
    let frame: number | undefined
    const cancelResizeFrame = () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame)
        frame = undefined
      }
    }
    const interruptKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
        userPausedFollow.current = true
        userResumeRequested.current = false
      } else if (['ArrowDown', 'PageDown', 'End'].includes(event.key) || (event.key === ' ' && !event.shiftKey)) {
        userResumeRequested.current = true
      }
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        cancelResizeFrame()
      }
    }
    const pauseForOlderContent = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        userPausedFollow.current = true
        userResumeRequested.current = false
        readerIntentAt.current = performance.now()
      } else if (event.deltaY > 0) {
        userResumeRequested.current = true
      }
    }
    const startTouchIntent = (event: TouchEvent) => {
      const nextY = event instanceof TouchEvent ? event.touches.item(0)?.clientY : undefined
      previousTouchY.current = nextY ?? null
    }
    const trackTouchIntent = (event: TouchEvent) => {
      const nextY = event instanceof TouchEvent ? event.touches.item(0)?.clientY : undefined
      if (nextY === undefined) return
      if (previousTouchY.current !== null && nextY !== previousTouchY.current) {
        if (nextY > previousTouchY.current) {
          userPausedFollow.current = true
          userResumeRequested.current = false
          readerIntentAt.current = performance.now()
        } else {
          userResumeRequested.current = true
        }
      }
      previousTouchY.current = nextY
    }
    const endTouchIntent = () => {
      previousTouchY.current = null
    }
    const resumeForScrollbar = (event: PointerEvent) => {
      if (event.target === element) {
        userResumeRequested.current = true
      } else if (
        event.target instanceof Element &&
        event.target.closest('[data-message-id]') &&
        !event.target.closest('button,a,input,textarea,[contenteditable="true"]')
      ) {
        userPausedFollow.current = true
        userResumeRequested.current = false
        readerIntentAt.current = performance.now()
      }
    }
    const observer =
      content && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (frame !== undefined) {
              return
            }
            frame = requestAnimationFrame(() => {
              frame = undefined
              const prior = previous.current
              const current = latest.current
              if (
                viewport.current !== element ||
                current.scrollKey !== scrollKey ||
                prior?.key !== scrollKey ||
                !element.isConnected ||
                seeking.current ||
                performance.now() - readerIntentAt.current < TARGET_SETTLE_MS
              ) {
                return
              }
              if (prior.atEnd && current.followLatest && !userPausedFollow.current) {
                element.scrollTop = element.scrollHeight
              } else {
                restoreMessageAnchor(element, prior.messageId, prior.messageOffset)
              }
              current.recordPosition(element)
            })
          })
        : undefined
    observer?.observe(element)
    if (content) {
      observer?.observe(content)
    }
    element.addEventListener('wheel', pauseForOlderContent, { passive: true })
    element.addEventListener('wheel', cancelResizeFrame, { passive: true })
    element.addEventListener('touchstart', startTouchIntent, { passive: true })
    element.addEventListener('touchmove', trackTouchIntent, { passive: true })
    element.addEventListener('touchend', endTouchIntent, { passive: true })
    element.addEventListener('touchcancel', endTouchIntent, { passive: true })
    element.addEventListener('pointerdown', resumeForScrollbar, { passive: true })
    element.addEventListener('touchstart', cancelResizeFrame, { passive: true })
    element.addEventListener('pointerdown', cancelResizeFrame, { passive: true })
    element.addEventListener('keydown', interruptKey)
    return () => {
      observer?.disconnect()
      cancelResizeFrame()
      element.removeEventListener('wheel', pauseForOlderContent)
      element.removeEventListener('wheel', cancelResizeFrame)
      element.removeEventListener('touchstart', startTouchIntent)
      element.removeEventListener('touchmove', trackTouchIntent)
      element.removeEventListener('touchend', endTouchIntent)
      element.removeEventListener('touchcancel', endTouchIntent)
      element.removeEventListener('pointerdown', resumeForScrollbar)
      element.removeEventListener('touchstart', cancelResizeFrame)
      element.removeEventListener('pointerdown', cancelResizeFrame)
      element.removeEventListener('keydown', interruptKey)
    }
  }, [scrollKey])

  const onScroll = () => {
    const element = viewport.current
    if (!element || seeking.current) {
      return
    }
    const priorTop = previous.current?.key === scrollKey ? previous.current.top : undefined
    const movedFromRecordedPosition = priorTop !== undefined && Math.abs(element.scrollTop - priorTop) > 1
    if (movedFromRecordedPosition) {
      cancelCorrection.current?.()
      cancelCorrection.current = undefined
    }
    if (isAtEnd(element) && (!userPausedFollow.current || userResumeRequested.current)) {
      userPausedFollow.current = false
      userResumeRequested.current = false
      readerIntentAt.current = Number.NEGATIVE_INFINITY
      setHasNewContent(false)
    } else if (!isAtEnd(element)) {
      userPausedFollow.current = true
      userResumeRequested.current = false
    }
    const current = saveAnchor(element)
    previous.current = previous.current
      ? {
          ...previous.current,
          top: current.top,
          height: element.scrollHeight,
          atEnd: current.atEnd,
          followPaused: current.followPaused,
          messageId: current.messageId,
          messageOffset: current.messageOffset,
        }
      : previous.current
  }
  const showLatest = () => {
    const element = viewport.current
    if (!element) {
      return
    }
    userPausedFollow.current = false
    userResumeRequested.current = false
    readerIntentAt.current = Number.NEGATIVE_INFINITY
    cancelSeek.current?.()
    cancelCorrection.current?.()
    if (virtualized) {
      virtual.scrollToIndex(messages.length - 1, { align: 'end' })
    }
    element.scrollTop = element.scrollHeight
    setHasNewContent(false)
    recordPosition(element)
  }

  return {
    viewport,
    messages,
    virtualized,
    visible,
    leading,
    trailing,
    measureElement: virtual.measureElement,
    hasNewContent,
    onScroll,
    showLatest,
  }
}
