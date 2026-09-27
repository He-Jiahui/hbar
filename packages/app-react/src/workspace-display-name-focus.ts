import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { HbarRuntimeView } from './runtime'
import { canFocusWorkspaceElement } from './workspace-tool-focus'

const editorSelector = '.hbar-workspace-display-name-dialog'

function contextKey(runtime: HbarRuntimeView): string {
  const navigation = runtime.state.navigation.getSnapshot()
  const presentation = runtime.state.presentation.getSnapshot()
  const tabs = runtime.state.workspaceTabs.getSnapshot()
  const tab = tabs.items.find((item) => item.id === tabs.activeId)
  return JSON.stringify([
    navigation.workspaceId,
    navigation.sessionId,
    navigation.status,
    presentation.page,
    tabs.activeId,
    tab?.instanceKey,
  ])
}

/** Local modal return ownership; a renamed/reordered row is still the same project. */
export function useWorkspaceDisplayNameFocus(
  runtime: HbarRuntimeView,
  open: boolean,
  header: RefObject<HTMLDivElement | null>,
  sidebar: RefObject<HTMLButtonElement | null>,
  main: RefObject<HTMLElement | null>,
): (workspaceId: string) => void {
  const lease = useRef<{
    owner: HbarRuntimeView
    workspaceId: string
    source: HTMLElement | null
    context: string
  } | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    const outside = (event: Event) => {
      const pending = lease.current
      const target = event.target
      if (!pending || !(target instanceof HTMLElement) || target === document.body) return
      if (target === pending.source || target.closest(editorSelector)) return
      lease.current = null
    }
    document.addEventListener('focusin', outside, true)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', outside, true)
    return () => {
      lease.current = null
      document.removeEventListener('focusin', outside, true)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', outside, true)
    }
  }, [runtime])
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    const pending = lease.current
    if (!closed || !pending) return
    queueMicrotask(() => {
      if (lease.current !== pending) return
      lease.current = null
      if (
        pending.owner !== runtime ||
        pending.context !== contextKey(runtime) ||
        document.querySelector('dialog:modal')
      )
        return
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && canFocusWorkspaceElement(active)) return
      const row = [...document.querySelectorAll<HTMLElement>('[data-workspace-id]')].find(
        (node) => node.dataset.workspaceId === pending.workspaceId,
      )
      const summary = row?.querySelector<HTMLElement>('.hbar-app-react-project-menu summary')
      for (const target of [
        summary,
        pending.source,
        header.current?.querySelector('summary'),
        sidebar.current,
        main.current,
      ]) {
        if (!target || !canFocusWorkspaceElement(target)) continue
        target.focus({ preventScroll: true })
        if (document.activeElement === target) return
      }
    })
  }, [open, runtime, header, sidebar, main])
  return useCallback(
    (workspaceId: string) => {
      const active = document.activeElement
      const source =
        active instanceof HTMLElement
          ? (active
              .closest('[data-workspace-id]')
              ?.querySelector<HTMLElement>('.hbar-app-react-project-menu summary') ?? active)
          : null
      lease.current = { owner: runtime, workspaceId, source, context: contextKey(runtime) }
    },
    [runtime],
  )
}
