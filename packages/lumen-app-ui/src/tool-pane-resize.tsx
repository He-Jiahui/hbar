import * as React from 'react'
import { nextLumenToolPaneWidth } from './tool-pane-layout'
import type { LumenToolPaneGeometry, LumenToolPaneLayout } from './tool-pane-layout'

export interface LumenToolResize {
  label: string
  valueText: (widthRem: number) => string
  disabled?: boolean | undefined
  /** Optional authoritative Host feedback, including retries outside this separator. */
  status?: 'idle' | 'saving' | 'failed' | undefined
  /** Change when the persistence owner changes; ordinary callback re-renders do not cancel a gesture. */
  ownerKey?: string | undefined
  /** The host owns durable persistence and localized error feedback before rejecting. */
  onCommit: (widthRem: number) => Promise<void>
}

interface LumenToolPaneResizerProps {
  resize: LumenToolResize
  geometry: LumenToolPaneGeometry | null
  layout: LumenToolPaneLayout
  onPreview: (widthRem: number | null) => void
  resizeRef?: React.Ref<HTMLElement> | undefined
  /** Start-edge panes grow rightward; the existing end-edge tool keeps its original direction. */
  edge?: 'start' | 'end' | undefined
  className?: string | undefined
  reset?: { readonly widthRem: number; readonly label: string } | undefined
  onFocusUnavailable?: (() => void) | undefined
}

interface PointerResize {
  pointerId: number
  startX: number
  startRem: number
  rootFontSizePx: number
  widthRem: number
  onCommit: LumenToolResize['onCommit']
  generation: number
}

/** A native separator, not a button; captures only one temporary visual gesture. */
export function LumenToolPaneResizer({
  resize,
  geometry,
  layout,
  onPreview,
  resizeRef,
  edge = 'end',
  className = 'lumen-app-tool-separator',
  reset,
  onFocusUnavailable,
}: LumenToolPaneResizerProps) {
  const elementRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<PointerResize | null>(null)
  const submitting = React.useRef(false)
  const mounted = React.useRef(true)
  const lifecycle = React.useRef(0)
  const ownerKey = React.useRef(resize.ownerKey)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'failed'>('idle')
  const focusOwner = React.useRef({ ownerKey: resize.ownerKey, owned: false })
  const focusConfig = React.useRef({ ownerKey: resize.ownerKey, onFocusUnavailable })
  focusConfig.current = { ownerKey: resize.ownerKey, onFocusUnavailable }
  const focusEnabled = onFocusUnavailable !== undefined
  const focusPresentation = React.useRef(layout.presentation)
  focusPresentation.current = layout.presentation
  const notifyFocusUnavailable = React.useCallback((element: HTMLElement, key: string | undefined) => {
    const remembered = focusOwner.current
    const current = focusConfig.current
    const active = element.ownerDocument.activeElement
    if (
      remembered.owned &&
      remembered.ownerKey === key &&
      current.ownerKey === key &&
      (active === element || active === element.ownerDocument.body || active === null)
    ) {
      remembered.owned = false
      current.onFocusUnavailable?.()
    }
  }, [])
  React.useLayoutEffect(() => {
    const element = elementRef.current
    if (!focusEnabled || !element) return undefined
    const document = element.ownerDocument
    const key = resize.ownerKey
    focusOwner.current = {
      ownerKey: key,
      owned: focusPresentation.current === 'split' && document.activeElement === element,
    }
    const focusIn = (event: FocusEvent) => {
      // CSS hiding can blur a focused separator to BODY without a user action.
      // A real focus destination, pointer action or Tab owns deliberate departure.
      if (event.target === document.body) return
      focusOwner.current = { ownerKey: key, owned: event.target === element }
    }
    const pointerDown = (event: PointerEvent) => {
      if (event.target !== element) focusOwner.current.owned = false
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && event.target === element && !event.defaultPrevented) focusOwner.current.owned = false
    }
    document.addEventListener('focusin', focusIn, true)
    document.addEventListener('pointerdown', pointerDown, true)
    document.addEventListener('keydown', keyDown, true)
    return () => {
      document.removeEventListener('focusin', focusIn, true)
      document.removeEventListener('pointerdown', pointerDown, true)
      document.removeEventListener('keydown', keyDown, true)
      notifyFocusUnavailable(element, key)
    }
  }, [focusEnabled, resize.ownerKey, notifyFocusUnavailable])
  React.useLayoutEffect(() => {
    const element = elementRef.current
    if (focusEnabled && element && layout.presentation !== 'split') notifyFocusUnavailable(element, resize.ownerKey)
  }, [focusEnabled, layout.presentation, resize.ownerKey, notifyFocusUnavailable])
  const visibleStatus = resize.status ?? status
  const disabled =
    resize.disabled || resize.status === 'saving' || submitting.current || layout.presentation !== 'split'
  const attach = React.useCallback(
    (element: HTMLDivElement | null) => {
      elementRef.current = element
      if (typeof resizeRef === 'function') {
        const cleanup = resizeRef(element)
        if (element) {
          return () => {
            elementRef.current = null
            if (typeof cleanup === 'function') {
              cleanup()
            } else {
              resizeRef(null)
            }
          }
        }
      } else if (resizeRef) {
        resizeRef.current = element
        if (element) {
          return () => {
            elementRef.current = null
            resizeRef.current = null
          }
        }
      }
      return undefined
    },
    [resizeRef],
  )

  const releasePointer = React.useCallback(() => {
    const gesture = drag.current
    drag.current = null
    if (gesture && elementRef.current?.hasPointerCapture(gesture.pointerId)) {
      elementRef.current.releasePointerCapture(gesture.pointerId)
    }
  }, [])

  React.useEffect(() => {
    mounted.current = true
    lifecycle.current += 1
    return () => {
      mounted.current = false
      lifecycle.current += 1
      releasePointer()
    }
  }, [releasePointer])

  React.useLayoutEffect(() => {
    if (ownerKey.current === resize.ownerKey) return
    ownerKey.current = resize.ownerKey
    lifecycle.current += 1
    submitting.current = false
    releasePointer()
    setStatus('idle')
    onPreview(null)
  }, [resize.ownerKey, onPreview, releasePointer])

  React.useEffect(() => {
    releasePointer()
    // A host may disable the separator while its width save is pending. Keep
    // that already-dispatched visual preview until the captured result settles.
    if (!submitting.current) {
      onPreview(null)
    }
  }, [
    geometry?.availableInlineSizePx,
    geometry?.rootFontSizePx,
    layout.presentation,
    layout.minWidthRem,
    layout.maxWidthRem,
    resize.disabled,
    resize.status,
    onPreview,
    releasePointer,
  ])

  const commit = async (widthRem: number, onCommit = resize.onCommit, generation = lifecycle.current) => {
    if (submitting.current || resize.disabled || resize.status === 'saving' || generation !== lifecycle.current) {
      return
    }
    submitting.current = true
    setStatus('saving')
    onPreview(widthRem)
    try {
      await onCommit(widthRem)
      if (mounted.current && lifecycle.current === generation) {
        setStatus('idle')
      }
    } catch {
      // The host publishes its localized persistence error. No raw exception
      // is rendered; releasing this transient preview reveals authoritative
      // host props (which may include a locally applied, non-persisted width).
      if (mounted.current && lifecycle.current === generation) {
        setStatus('failed')
      }
    } finally {
      if (lifecycle.current === generation) submitting.current = false
      if (mounted.current && lifecycle.current === generation) {
        onPreview(null)
      }
    }
  }

  const resetWidth = () => {
    if (
      !reset ||
      !Number.isFinite(reset.widthRem) ||
      disabled ||
      drag.current ||
      layout.widthRem === null ||
      layout.minWidthRem === null ||
      layout.maxWidthRem === null
    ) {
      return
    }
    const widthRem = Math.min(layout.maxWidthRem, Math.max(layout.minWidthRem, reset.widthRem))
    if (widthRem !== layout.widthRem) void commit(widthRem)
  }

  const pointerWidth = (event: React.PointerEvent<HTMLDivElement>): number | null => {
    const gesture = drag.current
    if (
      !gesture ||
      gesture.pointerId !== event.pointerId ||
      layout.minWidthRem === null ||
      layout.maxWidthRem === null
    ) {
      return null
    }
    return Math.min(
      layout.maxWidthRem,
      Math.max(
        layout.minWidthRem,
        gesture.startRem + ((edge === 'start' ? 1 : -1) * (event.clientX - gesture.startX)) / gesture.rootFontSizePx,
      ),
    )
  }

  return (
    <div
      ref={attach}
      className={className}
      role="separator"
      aria-label={resize.label}
      title={reset?.label}
      aria-keyshortcuts={reset ? 'ArrowLeft ArrowRight Home End Enter' : undefined}
      aria-orientation="vertical"
      aria-valuemin={layout.minWidthRem ?? undefined}
      aria-valuemax={layout.maxWidthRem ?? undefined}
      aria-valuenow={layout.widthRem ?? undefined}
      aria-valuetext={layout.widthRem === null ? undefined : resize.valueText(layout.widthRem)}
      aria-disabled={disabled || undefined}
      aria-busy={visibleStatus === 'saving' || undefined}
      data-resize-status={visibleStatus}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey
        )
          return
        if (event.key === 'Escape' && drag.current) {
          event.preventDefault()
          event.stopPropagation()
          releasePointer()
          onPreview(null)
          return
        }
        if (event.key === 'Enter' && reset) {
          event.preventDefault()
          if (!event.repeat) resetWidth()
          return
        }
        const command =
          event.key === 'ArrowLeft'
            ? edge === 'start'
              ? 'decrease'
              : 'increase'
            : event.key === 'ArrowRight'
              ? edge === 'start'
                ? 'increase'
                : 'decrease'
              : event.key === 'Home'
                ? 'min'
                : event.key === 'End'
                  ? 'max'
                  : null
        if (command === null) {
          return
        }
        event.preventDefault()
        if (disabled || !geometry || layout.widthRem === null || drag.current) {
          return
        }
        const next = nextLumenToolPaneWidth(layout.widthRem, command, geometry, layout)
        if (next !== null && next !== layout.widthRem) {
          void commit(next)
        }
      }}
      onDoubleClick={reset ? resetWidth : undefined}
      onPointerDown={(event) => {
        if (event.button !== 0 || disabled || !geometry || layout.widthRem === null || drag.current) {
          return
        }
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startRem: layout.widthRem,
          rootFontSizePx: geometry.rootFontSizePx,
          widthRem: layout.widthRem,
          onCommit: resize.onCommit,
          generation: lifecycle.current,
        }
        setStatus('idle')
      }}
      onPointerMove={(event) => {
        const next = pointerWidth(event)
        if (next !== null && drag.current) {
          drag.current.widthRem = next
          onPreview(next)
        }
      }}
      onPointerUp={(event) => {
        const gesture = drag.current
        if (!gesture || gesture.pointerId !== event.pointerId) {
          return
        }
        const widthRem = pointerWidth(event) ?? gesture.widthRem
        releasePointer()
        if (widthRem !== gesture.startRem) {
          void commit(widthRem, gesture.onCommit, gesture.generation)
        } else {
          onPreview(null)
        }
      }}
      onPointerCancel={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          releasePointer()
          onPreview(null)
        }
      }}
      onLostPointerCapture={() => {
        if (drag.current) {
          releasePointer()
          onPreview(null)
        }
      }}
    />
  )
}
