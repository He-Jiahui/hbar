import { hasOpenModalSurface } from '@lumen/app-ui'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { canFocusWorkspaceElement } from './workspace-tool-focus'

/** A local focus lease, not a navigation action. External visibility changes never create one. */
export function useWorkspaceOrganizationFocus(
  owner: object,
  hiddenIds: readonly string[],
  actionFailed: boolean,
  menuRef: RefObject<HTMLDivElement | null>,
): (workspaceId: string) => void {
  const lease = useRef<{ owner: object; workspaceId: string; source: HTMLElement } | null>(null)
  useEffect(() => {
    const cancel = () => {
      lease.current = null
    }
    const focusChanged = (event: FocusEvent) => {
      if (lease.current && event.target !== lease.current.source && event.target !== document.body) cancel()
    }
    document.addEventListener('pointerdown', cancel, true)
    document.addEventListener('keydown', cancel, true)
    document.addEventListener('focusin', focusChanged, true)
    return () => {
      lease.current = null
      document.removeEventListener('pointerdown', cancel, true)
      document.removeEventListener('keydown', cancel, true)
      document.removeEventListener('focusin', focusChanged, true)
    }
  }, [owner])
  useEffect(() => {
    const pending = lease.current
    if (!pending) return
    if (pending.owner !== owner || actionFailed) {
      lease.current = null
      return
    }
    if (!hiddenIds.includes(pending.workspaceId)) return
    lease.current = null
    if (pending.source.isConnected || hasOpenModalSurface(document)) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && canFocusWorkspaceElement(active)) return
    const target = menuRef.current?.querySelector<HTMLElement>('summary, [data-workspace-menu-trigger]')
    if (target && canFocusWorkspaceElement(target)) target.focus({ preventScroll: true })
  }, [actionFailed, hiddenIds, menuRef, owner])
  return useCallback(
    (workspaceId: string) => {
      const source = document.activeElement
      if (
        !(source instanceof HTMLElement) ||
        source.closest('[data-workspace-id]')?.getAttribute('data-workspace-id') !== workspaceId
      )
        return
      lease.current = { owner, workspaceId, source }
    },
    [owner],
  )
}
