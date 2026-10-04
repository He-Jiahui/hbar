import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { PresentationState } from '@hbar/app-runtime'
import { LumenFrame } from '@lumen/app-ui'
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
  workbench = false,
  viewKey,
  toolInstanceId,
  children,
}: {
  readonly pageKind: PresentationState['page']['kind']
  readonly sidebarOpen: boolean
  readonly label: string
  readonly workbench?: boolean
  readonly viewKey?: string | undefined
  readonly toolInstanceId?: string | null | undefined
  readonly children: ReactNode
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const previousPage = useRef(pageKind)
  const lastOutsideFocus = useRef<HTMLElement | null>(null)
  const returnTarget = useRef<HTMLElement | null>(null)
  const pendingFocus = useRef<'entry' | 'return' | null>(null)
  const previousWorkbench = useRef({ workbench, viewKey })
  const workbenchFocus = useRef<'entry' | 'return' | null>(null)

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

  // Workbench focus follows committed view transitions, not a late navigation
  // Promise callback that could steal focus from a subsequently selected tab.
  useLayoutEffect(() => {
    const previous = previousWorkbench.current
    previousWorkbench.current = { workbench, viewKey }
    if (workbench && (!previous.workbench || previous.viewKey !== viewKey)) workbenchFocus.current = 'entry'
    else if (previous.workbench && !workbench && pageKind === 'session') workbenchFocus.current = 'return'
    else if (pageKind !== 'session') workbenchFocus.current = null
    const flush = () => {
      const element = boundary.current
      if (!workbenchFocus.current || !element || !canRestoreFocus(element) || document.querySelector('dialog:modal'))
        return
      const active = document.activeElement
      if (workbenchFocus.current === 'entry') element.focus({ preventScroll: true })
      else if (active === document.body || (active instanceof Node && element.contains(active))) {
        const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        if (tab && canRestoreFocus(tab)) tab.focus({ preventScroll: true })
        else element.focus({ preventScroll: true })
      }
      workbenchFocus.current = null
    }
    flush()
    // A native confirmation can outlive the transition that queued this focus.
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(
              (node) => node instanceof Element && (node.matches('dialog') || node.querySelector('dialog') !== null),
            ),
        )
      )
        flush()
    })
    // React may remove a native dialog before its close cleanup runs; that
    // detached attribute mutation alone is no longer observable here.
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    })
    return () => observer.disconnect()
  }, [pageKind, sidebarOpen, toolInstanceId, viewKey, workbench])

  return (
    <LumenFrame ref={boundary} className="hbar-settings-page-focus" role="region" aria-label={label} tabIndex={-1}>
      {children}
    </LumenFrame>
  )
}
