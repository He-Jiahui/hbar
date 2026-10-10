import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { LumenFrame } from '@lumen/app-ui'
import './persistent-pane.css'

interface PaneFocus {
  readonly element: HTMLElement
  readonly anchor: Node | null
  readonly anchorOffset: number
  readonly focus: Node | null
  readonly focusOffset: number
  readonly inputSelection: {
    readonly start: number
    readonly end: number
    readonly direction: 'forward' | 'backward' | 'none'
  } | null
}

function captureFocus(element: HTMLElement): PaneFocus {
  const selection = element.ownerDocument.getSelection()
  const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
  return {
    element,
    anchor: selection?.anchorNode ?? null,
    anchorOffset: selection?.anchorOffset ?? 0,
    focus: selection?.focusNode ?? null,
    focusOffset: selection?.focusOffset ?? 0,
    inputSelection:
      input && element.selectionStart !== null && element.selectionEnd !== null
        ? { start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection ?? 'none' }
        : null,
  }
}

function selectionOffset(node: Node, offset: number): number {
  const length = node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length
  return Math.min(length, Math.max(0, offset))
}

/** Keep the pane owner mounted while responsive shells replace its DOM outlet. */
export function usePersistentPane(content: ReactNode): { readonly outlet: ReactNode; readonly portal: ReactNode } {
  const [container] = useState(() => {
    if (typeof document === 'undefined') return null
    const element = document.createElement('div')
    element.className = 'hbar-persistent-pane-content'
    return element
  })
  const pendingFocus = useRef<PaneFocus | null>(null)
  const focusedElement = useRef<HTMLElement | null>(null)
  const scrollPositions = useRef(new WeakMap<Element, { readonly top: number; readonly left: number }>())
  const selectionPositions = useRef(new WeakMap<HTMLElement, PaneFocus>())
  useLayoutEffect(() => {
    if (!container) return
    const document = container.ownerDocument
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && container.contains(event.target)) focusedElement.current = event.target
    }
    const releaseFocus = (event: Event) => {
      if (event.target instanceof Node && !container.contains(event.target)) {
        focusedElement.current = null
        pendingFocus.current = null
      }
    }
    const rememberSelection = () => {
      const active = document.activeElement
      if (active instanceof HTMLElement && container.contains(active))
        selectionPositions.current.set(active, captureFocus(active))
    }
    const rememberScroll = (event: Event) => {
      const element = event.target
      if (
        element instanceof Element &&
        container.contains(element) &&
        element.isConnected &&
        element.getClientRects().length > 0
      )
        scrollPositions.current.set(element, { top: element.scrollTop, left: element.scrollLeft })
    }
    document.addEventListener('focusin', remember, true)
    document.addEventListener('pointerdown', releaseFocus, true)
    document.addEventListener('keydown', releaseFocus, true)
    document.addEventListener('selectionchange', rememberSelection)
    container.addEventListener('select', rememberSelection, true)
    container.addEventListener('scroll', rememberScroll, true)
    return () => {
      document.removeEventListener('focusin', remember, true)
      document.removeEventListener('pointerdown', releaseFocus, true)
      document.removeEventListener('keydown', releaseFocus, true)
      document.removeEventListener('selectionchange', rememberSelection)
      container.removeEventListener('select', rememberSelection, true)
      container.removeEventListener('scroll', rememberScroll, true)
    }
  }, [container])
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host || !container) return
      host.appendChild(container)
      const restoreScroll = () => {
        for (const element of container.querySelectorAll('*')) {
          const position = scrollPositions.current.get(element)
          if (!position) continue
          element.scrollTop = position.top
          element.scrollLeft = position.left
        }
      }
      restoreScroll()
      const previous = pendingFocus.current
      if (previous && !container.contains(previous.element)) pendingFocus.current = null
      if (
        previous &&
        container.contains(previous.element) &&
        !container.ownerDocument.querySelector('dialog:modal') &&
        !previous.element.closest('[inert]') &&
        previous.element.getClientRects().length > 0
      ) {
        previous.element.focus({ preventScroll: true })
        if (container.ownerDocument.activeElement === previous.element) {
          pendingFocus.current = null
          if (
            previous.inputSelection &&
            (previous.element instanceof HTMLInputElement || previous.element instanceof HTMLTextAreaElement) &&
            previous.element.selectionStart !== null
          ) {
            const { start, end, direction } = previous.inputSelection
            previous.element.setSelectionRange(start, end, direction)
          } else if (
            previous.anchor?.isConnected &&
            previous.focus?.isConnected &&
            container.contains(previous.anchor) &&
            container.contains(previous.focus)
          ) {
            container.ownerDocument
              .getSelection()
              ?.setBaseAndExtent(
                previous.anchor,
                selectionOffset(previous.anchor, previous.anchorOffset),
                previous.focus,
                selectionOffset(previous.focus, previous.focusOffset),
              )
          }
        }
      }
      restoreScroll()
      return () => {
        const active = container.ownerDocument.activeElement
        // Removing an ancestor can blur the editor before this outlet's ref is cleared.
        const previous = active instanceof HTMLElement && container.contains(active) ? active : focusedElement.current
        if (previous && container.contains(previous)) {
          pendingFocus.current = selectionPositions.current.get(previous) ?? captureFocus(previous)
        }
        for (const element of container.querySelectorAll('*'))
          if (element.scrollTop !== 0 || element.scrollLeft !== 0)
            scrollPositions.current.set(element, { top: element.scrollTop, left: element.scrollLeft })
        if (container.parentElement === host) container.remove()
      }
    },
    [container],
  )
  return container
    ? {
        outlet: <LumenFrame ref={attach} className="hbar-persistent-pane-outlet" />,
        portal: createPortal(content, container),
      }
    : { outlet: content, portal: null }
}
