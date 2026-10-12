'use client'

import * as React from 'react'

interface LumenAnchoredPopupProps extends React.HTMLAttributes<HTMLDivElement> {
  anchorRef: React.RefObject<HTMLElement | null>
  onDismiss: () => void
}

/** Keeps popup ownership/theme inheritance in the DOM while escaping clipping via the top layer. */
export default function LumenAnchoredPopup({
  anchorRef,
  onDismiss,
  className,
  children,
  ...other
}: LumenAnchoredPopupProps) {
  const popupRef = React.useRef<HTMLDivElement>(null)
  const dismissRef = React.useRef(onDismiss)
  React.useLayoutEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  React.useLayoutEffect(() => {
    const popup = popupRef.current
    const anchor = anchorRef.current
    if (!popup || !anchor) {
      return undefined
    }
    const document = anchor.ownerDocument
    const view = document.defaultView
    if (!view) {
      return undefined
    }
    let frame = 0
    const position = () => {
      const bounds = anchor.getBoundingClientRect()
      const viewport = view.visualViewport
      const viewportLeft = viewport?.offsetLeft ?? 0
      const viewportTop = viewport?.offsetTop ?? 0
      const width = viewport?.width ?? document.documentElement.clientWidth
      const height = viewport?.height ?? document.documentElement.clientHeight
      if (bounds.bottom <= viewportTop || bounds.top >= viewportTop + height) {
        dismissRef.current()
        return
      }
      const rem = Number.parseFloat(view.getComputedStyle(document.documentElement).fontSize)
      const gutter = rem * 0.5
      const gap = rem * 0.25
      const inlineSize = Math.min(bounds.width, Math.max(0, width - gutter * 2))
      popup.style.inlineSize = `${inlineSize}px`
      // Reset the available height before measuring, including after a resize or option update.
      popup.style.setProperty('--lumen-popup-available-height', `${height}px`)
      const naturalHeight = popup.getBoundingClientRect().height
      const below = Math.max(0, viewportTop + height - bounds.bottom - gap - gutter)
      const above = Math.max(0, bounds.top - viewportTop - gap - gutter)
      const flip = below < naturalHeight && above > below
      const available = flip ? above : below
      popup.style.setProperty('--lumen-popup-available-height', `${available}px`)
      const popupHeight = popup.getBoundingClientRect().height
      popup.style.left = `${Math.max(viewportLeft + gutter, Math.min(bounds.left, viewportLeft + width - inlineSize - gutter))}px`
      popup.style.top = `${Math.max(viewportTop + gutter, flip ? bounds.top - gap - popupHeight : bounds.bottom + gap)}px`
      popup.dataset.placement = flip ? 'top' : 'bottom'
    }
    const schedulePosition = () => {
      view.cancelAnimationFrame(frame)
      frame = view.requestAnimationFrame(position)
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.contains(event.target) && !popup.contains(event.target)) {
        dismissRef.current()
      }
    }
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        if (popup.contains(document.activeElement)) {
          ;(anchor.querySelector<HTMLElement>('[role="combobox"]') ?? anchor).focus()
        }
        dismissRef.current()
      }
    }
    popup.showPopover()
    position()
    const observer = new ResizeObserver(schedulePosition)
    observer.observe(anchor)
    observer.observe(popup)
    document.addEventListener('scroll', schedulePosition, true)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    view.addEventListener('resize', schedulePosition)
    view.visualViewport?.addEventListener('resize', schedulePosition)
    view.visualViewport?.addEventListener('scroll', schedulePosition)
    return () => {
      observer.disconnect()
      view.cancelAnimationFrame(frame)
      document.removeEventListener('scroll', schedulePosition, true)
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
      view.removeEventListener('resize', schedulePosition)
      view.visualViewport?.removeEventListener('resize', schedulePosition)
      view.visualViewport?.removeEventListener('scroll', schedulePosition)
      if (popup.matches(':popover-open')) {
        popup.hidePopover()
      }
    }
  }, [anchorRef])

  return (
    <div
      {...other}
      ref={popupRef}
      popover="manual"
      className={['lumen-anchored-popup', 'hbar-app-ui-dialog-menu', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
