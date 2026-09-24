import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { PresentationState } from '@hbar/app-runtime'
import './SettingsPageFocusBoundary.css'

function canRestoreFocus(element: HTMLElement): boolean {
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' &&
    !element.matches(':disabled') &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
}

/** Focus belongs to the view lifecycle, never to persisted runtime state. */
export function SettingsPageFocusBoundary({
  pageKind,
  sidebarOpen,
  label,
  children,
}: {
  readonly pageKind: PresentationState['page']['kind']
  readonly sidebarOpen: boolean
  readonly label: string
  readonly children: ReactNode
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const previousPage = useRef(pageKind)
  const lastOutsideFocus = useRef<HTMLElement | null>(null)
  const returnTarget = useRef<HTMLElement | null>(null)
  const pendingFocus = useRef<'entry' | 'return' | null>(null)

  useLayoutEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (previousPage.current !== 'settings' && event.target instanceof HTMLElement && event.target !== document.body)
        lastOutsideFocus.current = event.target
    }
    document.addEventListener('focusin', rememberFocus)
    return () => document.removeEventListener('focusin', rememberFocus)
  }, [])

  useLayoutEffect(() => {
    const previous = previousPage.current
    previousPage.current = pageKind
    if (pageKind === 'settings' && previous !== 'settings') {
      returnTarget.current = lastOutsideFocus.current
      pendingFocus.current = 'entry'
    } else if (previous === 'settings' && pageKind === 'session') {
      const active = document.activeElement
      // A deliberate sidebar session selection keeps its own focus target.
      if (active instanceof HTMLElement && active !== document.body && !boundary.current?.contains(active))
        returnTarget.current = active
      pendingFocus.current = 'return'
    } else if (previous === 'settings' && pageKind !== 'settings') {
      pendingFocus.current = null
      returnTarget.current = null
    }
    // On narrow windows the sidebar hides the main frame. Its close command
    // settles after page navigation, so wait for that visibility transition.
    if (pendingFocus.current && boundary.current && canRestoreFocus(boundary.current)) {
      const target = pendingFocus.current === 'return' ? returnTarget.current : null
      if (target && canRestoreFocus(target)) target.focus({ preventScroll: true })
      // Composer triggers are unmounted and narrow sidebar triggers may be
      // hidden. Return to the named, visible session region in those cases.
      if (!target || document.activeElement !== target) boundary.current.focus({ preventScroll: true })
      if (pendingFocus.current === 'return') returnTarget.current = null
      pendingFocus.current = null
    }
  }, [pageKind, sidebarOpen])

  return (
    <div ref={boundary} className="hbar-settings-page-focus" role="region" aria-label={label} tabIndex={-1}>
      {children}
    </div>
  )
}
