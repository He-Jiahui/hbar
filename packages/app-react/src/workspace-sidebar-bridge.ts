import { useCallback, useMemo, useRef, useState } from 'react'

import { WORKSPACE_VIEWPORT_MEDIA } from './responsive-contract'

import { useHbarRuntime, useHbarRuntimeSelector } from './runtime'

import type { HbarWorkspaceShellProps } from './workspace-shell-contract'

export function useWorkspaceSidebarBridge(props: HbarWorkspaceShellProps) {
  const runtime = useHbarRuntime()
  const sidebarOpen = useHbarRuntimeSelector(runtime.state.presentation, (state) => state.sidebarOpen)
  const [sidebarViewportNarrow, setSidebarViewportNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.narrowShell).matches,
  )
  const sidebarChoiceRevision = useRef(0)
  const railCollapsed = props.sidebarRailWidthRem !== undefined && !sidebarViewportNarrow && !sidebarOpen
  const mainRef = useRef<HTMLElement | null>(null)
  const sidebarFocusRef = useRef<HTMLButtonElement | null>(null)
  const sidebarShowFocusRef = useRef<HTMLButtonElement | null>(null)
  const sidebarToggleFocus = useRef<HTMLElement | null>(null)
  const railSearchFocus = useRef<{
    owner: typeof runtime
    node: HTMLElement
    workspaceId: string | null
    sessionId: string | null
    opened: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const execute = runtime.commands.execute
  const recordError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason))
  }, [])
  const setSidebarVisible = useCallback(
    (visible: boolean) => {
      sidebarChoiceRevision.current += 1
      const trigger = [sidebarFocusRef.current, sidebarShowFocusRef.current].find(
        (node) => node !== null && node === document.activeElement,
      )
      if (trigger) sidebarToggleFocus.current = trigger
      void execute('app.setSidebarVisible', { visible }).catch((reason: unknown) => {
        sidebarToggleFocus.current = null
        recordError(reason)
      })
    },
    [execute, recordError],
  )
  return useMemo(
    () => ({
      sidebarViewportNarrow,
      setSidebarViewportNarrow,
      sidebarChoiceRevision,
      railCollapsed,
      mainRef,
      sidebarFocusRef,
      sidebarShowFocusRef,
      sidebarToggleFocus,
      railSearchFocus,
      error,
      setError,
      execute,
      recordError,
      setSidebarVisible,
    }),
    [
      sidebarViewportNarrow,
      setSidebarViewportNarrow,
      sidebarChoiceRevision,
      railCollapsed,
      mainRef,
      sidebarFocusRef,
      sidebarShowFocusRef,
      sidebarToggleFocus,
      railSearchFocus,
      error,
      setError,
      execute,
      recordError,
      setSidebarVisible,
    ],
  )
}
