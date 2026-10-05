import { useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_THEME_PROFILE, type ThemeProfile } from '@hbar/contracts'
import './floating-surface.css'

const activeSurfaces = new Set<() => void>()
const touchSheet = () => matchMedia('(max-width: 40rem) and (pointer: coarse)').matches
/** Shared top-layer portal. Business menus supply content, never positioning or dismissal listeners. */
export function FloatingSurface({
  open,
  onClose,
  anchorRef,
  initialFocusRef,
  label,
  children,
  className,
  onKeyDown,
  material = DEFAULT_THEME_PROFILE.surface,
  ...attributes
}: HTMLAttributes<HTMLDivElement> & {
  readonly open: boolean
  readonly onClose: () => void
  readonly anchorRef: RefObject<HTMLElement | null>
  readonly initialFocusRef?: RefObject<HTMLElement | null>
  readonly label: string
  readonly material?: ThemeProfile['surface']
}) {
  const content = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useLayoutEffect(() => {
    if (!open) return
    const element = content.current
    const anchor = anchorRef.current
    if (!element || !anchor) return
    const close = () => closeRef.current()
    for (const dismiss of [...activeSurfaces]) dismiss()
    activeSurfaces.add(close)
    const position = () => {
      if (touchSheet()) {
        element.setAttribute('aria-modal', 'true')
        return
      }
      element.removeAttribute('aria-modal')
      const bounds = anchor.getBoundingClientRect()
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      const width = Math.min(element.getBoundingClientRect().width, innerWidth - rem * 2)
      const below = innerHeight - bounds.bottom - rem * 1.5
      const above = bounds.top - rem * 1.5
      const bottom = below < rem * 11.25 && above > below
      element.style.setProperty(
        '--floating-left',
        `${Math.min(Math.max(rem, bounds.left), Math.max(rem, innerWidth - width - rem))}px`,
      )
      element.style.setProperty('--floating-top', bottom ? 'auto' : `${bounds.bottom + rem / 2}px`)
      element.style.setProperty('--floating-bottom', bottom ? `${innerHeight - bounds.top + rem / 2}px` : 'auto')
      element.style.setProperty('--floating-limit', `${Math.max(0, bottom ? above : below)}px`)
    }
    element.showPopover()
    position()
    if (touchSheet()) element.focus()
    else (initialFocusRef?.current ?? element).focus()
    const pointer = (event: PointerEvent) => {
      if (!event.composedPath().includes(element)) close()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || !touchSheet()) return
      const controls = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ]
      const first = controls[0]
      const last = controls.at(-1)
      if (!first) {
        event.preventDefault()
        element.focus()
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      activeSurfaces.delete(close)
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      const restore = document.activeElement === document.body || element.contains(document.activeElement)
      if (element.matches(':popover-open')) element.hidePopover()
      if (restore && anchor.isConnected) anchor.focus()
    }
  }, [open, anchorRef, initialFocusRef])
  if (!open || typeof document === 'undefined') return null
  const style: CSSProperties & { '--floating-blur': string } = { '--floating-blur': `${material.blurAmount}px` }
  return createPortal(
    <div
      {...attributes}
      ref={content}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      popover="auto"
      className={`hbar-floating-surface ${className ?? ''}`}
      style={style}
      onToggle={(event) => {
        if (event.newState === 'closed') closeRef.current()
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Closing an open trigger on pointerdown must not reopen it on the subsequent click. */
export function useFloatingTrigger(open: boolean, setOpen: (value: boolean) => void) {
  const closedByPointer = useRef(false)
  return {
    onPointerDown() {
      closedByPointer.current = open
      if (open) setOpen(false)
    },
    onClick() {
      if (closedByPointer.current) {
        closedByPointer.current = false
        return
      }
      setOpen(!open)
    },
  }
}
