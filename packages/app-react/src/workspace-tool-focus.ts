import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { hasOpenModalSurface, type LumenToolPresentation } from '@lumen/app-ui'
import type { NavigationState, PresentationState, SurfaceState, WorkspaceTabsState } from '@hbar/app-runtime'
import { useHbarRuntimeState, type HbarRuntimeView } from './runtime'

export interface WorkspaceToolFocusTarget {
  readonly key: string
  readonly contextKey: string
  readonly instanceId: string
}

export interface WorkspaceToolFocusSnapshot {
  readonly page: PresentationState['page']['kind']
  readonly contextKey: string
  readonly target: WorkspaceToolFocusTarget | null
  readonly presentation: LumenToolPresentation
}

/** A reused follow-active panel ID is not a reused focus owner. */
export function getWorkspaceToolFocusSnapshot(
  navigation: NavigationState,
  presentation: PresentationState,
  surfaces: SurfaceState,
  tabs: WorkspaceTabsState,
  toolPresent: boolean,
  mode: LumenToolPresentation,
): WorkspaceToolFocusSnapshot {
  const tab = tabs.items.find((item) => item.id === tabs.activeId)
  const contextKey = JSON.stringify([
    navigation.workspaceId,
    navigation.sessionId,
    tabs.activeId,
    tab?.instanceKey ?? null,
    navigation.status,
  ])
  const panel = presentation.toolInstanceId ? surfaces.panels[presentation.toolInstanceId] : undefined
  const target =
    toolPresent &&
    presentation.page.kind === 'session' &&
    navigation.status === 'idle' &&
    panel &&
    (!tabs.activeId || tab)
      ? {
          instanceId: panel.instanceId,
          contextKey,
          key: JSON.stringify([
            contextKey,
            panel.instanceId,
            panel.panelId,
            panel.workspaceId,
            panel.sessionId,
            panel.binding,
          ]),
        }
      : null
  return { page: presentation.page.kind, contextKey, target, presentation: mode }
}

export interface WorkspaceToolFocusPort<Node> {
  readonly read: () => WorkspaceToolFocusSnapshot
  readonly active: () => Node | null
  readonly usable: (node: Node) => boolean
  readonly inMain: (node: Node) => boolean
  readonly inTool: (node: Node) => boolean
  readonly main: () => Node | null
  readonly tool: () => Node | null
  readonly selectedTab: () => Node | null
  readonly sidebar: () => Node | null
  readonly modalOpen: () => boolean
  readonly focus: (node: Node) => boolean
  readonly close: (target: WorkspaceToolFocusTarget) => Promise<void>
  readonly onError: (target: WorkspaceToolFocusTarget, code: string) => void
}

function failureCode(reason: unknown): string {
  if (reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string')
    if (/^[A-Z][A-Z0-9_]{0,79}$/.test(reason.code)) return reason.code
  return 'EXECUTION_FAILED'
}

/** Only ephemeral DOM focus is owned here; runtime remains the navigation authority. */
export function createWorkspaceToolFocusOwner<Node>(port: WorkspaceToolFocusPort<Node>) {
  let previous: WorkspaceToolFocusSnapshot = { ...port.read(), target: null }
  let lastFocus: { node: Node; region: 'main' | 'tool' | 'outside'; contextKey: string } | null = null
  let origin: { key: string; node: Node | null } | null = null
  let modalSeen = false
  let modalReturn: { targetKey: string; contextKey: string; node: Node } | null = null
  let pending: {
    kind: 'entry' | 'return' | 'modal-return'
    contextKey: string
    targetKey: string | null
    captured: Node | null
    restoreNode?: Node
  } | null = null
  let closing = false
  let disposed = false

  function remember(node: Node) {
    if (disposed) return
    captureModal(port.read())
    lastFocus = {
      node,
      region: port.inTool(node) ? 'tool' : port.inMain(node) ? 'main' : 'outside',
      contextKey: port.read().contextKey,
    }
  }
  function captureModal(current: WorkspaceToolFocusSnapshot) {
    if (!port.modalOpen() || modalSeen) return
    modalSeen = true
    if (current.target && lastFocus?.region === 'tool' && lastFocus.contextKey === current.contextKey)
      modalReturn = { targetKey: current.target.key, contextKey: current.contextKey, node: lastFocus.node }
  }
  function needsRelocation(): boolean {
    const active = port.active()
    return active === null || port.inTool(active) || !port.usable(active)
  }
  function managedFocusBecameInactive(): boolean {
    const active = port.active()
    return (
      (active !== null && (port.inMain(active) || port.inTool(active)) && !port.usable(active)) ||
      (active === null &&
        lastFocus !== null &&
        lastFocus.region !== 'outside' &&
        lastFocus.contextKey === port.read().contextKey &&
        !port.usable(lastFocus.node))
    )
  }
  function flush() {
    if (disposed) return
    const current = port.read()
    if (port.modalOpen()) {
      captureModal(current)
      return
    }
    if (modalSeen) {
      modalSeen = false
      const captured = modalReturn
      modalReturn = null
      const active = port.active()
      if (
        !pending &&
        captured &&
        current.page === 'session' &&
        current.contextKey === captured.contextKey &&
        current.target?.key === captured.targetKey &&
        (active === null || !port.usable(active))
      )
        pending = {
          kind: 'modal-return',
          contextKey: captured.contextKey,
          targetKey: captured.targetKey,
          captured: active,
          restoreNode: captured.node,
        }
    }
    if (!pending) return
    if (
      current.page !== 'session' ||
      current.contextKey !== pending.contextKey ||
      (current.target?.key ?? null) !== pending.targetKey
    ) {
      pending = null
      return
    }
    const active = port.active()
    // A later deliberate sidebar/header selection wins over a queued autofocus.
    if (active !== null && active !== pending.captured && port.usable(active) && !port.inTool(active)) {
      pending = null
      return
    }
    const destinations =
      pending.kind === 'entry'
        ? [port.tool()]
        : pending.kind === 'modal-return'
          ? [pending.restoreNode ?? null, port.tool()]
          : [origin?.node ?? null, port.main(), port.selectedTab()]
    for (const node of destinations) {
      if (node === null || !port.usable(node)) continue
      const request = pending
      pending = null
      if (!port.focus(node)) pending = request
      else if (request.kind === 'return') origin = null
      return
    }
    // A narrow sidebar can temporarily hide the entire frame after a modal
    // closes. Keep the pending tool return, but never strand focus on BODY.
    const sidebar = port.sidebar()
    if (sidebar !== null && port.usable(sidebar) && (active === null || !port.usable(active))) {
      pending.captured = sidebar
      port.focus(sidebar)
    }
  }
  function update() {
    if (disposed) return
    const current = port.read()
    const previousTarget = previous.target
    if (current.page !== 'session') pending = null
    else if (current.target?.key !== previousTarget?.key) {
      pending = null
      if (current.target) {
        const active = port.active()
        if (origin?.key !== current.target.key) {
          const source =
            active !== null && !port.inTool(active)
              ? active
              : lastFocus?.contextKey === current.contextKey && lastFocus.region !== 'tool'
                ? lastFocus.node
                : null
          origin = { key: current.target.key, node: source }
        }
        // Settings/Status owns its page return. Only repair an inactive main there.
        if (
          (previous.page === 'session' &&
            ((previousTarget === null && (active === null || !port.inTool(active))) ||
              (previousTarget !== null && needsRelocation()))) ||
          managedFocusBecameInactive()
        )
          pending = { kind: 'entry', contextKey: current.contextKey, targetKey: current.target.key, captured: active }
      } else if (previousTarget && previousTarget.contextKey === current.contextKey && needsRelocation()) {
        pending = { kind: 'return', contextKey: current.contextKey, targetKey: null, captured: port.active() }
      }
    } else if (
      current.target &&
      current.presentation === 'page' &&
      previous.presentation !== 'page' &&
      managedFocusBecameInactive()
    ) {
      pending = {
        kind: 'entry',
        contextKey: current.contextKey,
        targetKey: current.target.key,
        captured: port.active(),
      }
    }
    previous = current
    if (current.target && current.presentation === 'none') return
    flush()
  }
  async function dismiss(): Promise<boolean> {
    if (disposed || closing) return false
    const target = port.read().target
    const active = port.active()
    if (!target || !active || !port.inTool(active) || port.modalOpen()) return false
    closing = true
    try {
      // The callback receives the captured identity, never a late global tool ID.
      await port.close(target)
      if (!disposed) update()
      return true
    } catch (reason) {
      if (!disposed && port.read().target?.key === target.key) port.onError(target, failureCode(reason))
      return false
    } finally {
      closing = false
    }
  }
  return {
    remember,
    update,
    flush,
    dismiss,
    dispose() {
      disposed = true
      pending = null
      origin = null
      modalSeen = false
      modalReturn = null
      lastFocus = null
    },
  }
}

export interface WorkspaceToolEscapeContext {
  readonly key: string
  readonly defaultPrevented: boolean
  readonly isComposing: boolean
  readonly keyCode: number
  readonly repeat: boolean
  readonly modified: boolean
  readonly inTool: boolean
  readonly modalOpen: boolean
  readonly menuOpen: boolean
  readonly inCombobox: boolean
  readonly inOpenDetails: boolean
}

export function shouldDismissWorkspaceTool(context: WorkspaceToolEscapeContext): boolean {
  return (
    context.key === 'Escape' &&
    !context.defaultPrevented &&
    !context.isComposing &&
    context.keyCode !== 229 &&
    !context.repeat &&
    !context.modified &&
    context.inTool &&
    !context.modalOpen &&
    !context.menuOpen &&
    !context.inCombobox &&
    !context.inOpenDetails
  )
}

export function shouldCollapseWorkspaceSidebar(
  narrow: boolean,
  sidebarOpen: boolean,
  nativeModalOpen: boolean,
): boolean {
  return narrow && sidebarOpen && !nativeModalOpen
}

export function canFocusWorkspaceElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return (
    element.isConnected &&
    rect.width > 0 &&
    rect.height > 0 &&
    style?.display !== 'none' &&
    style?.visibility !== 'hidden' &&
    style?.visibility !== 'collapse' &&
    !element.matches(':disabled, [aria-disabled="true"]') &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]')
  )
}

function inManagedTool(
  node: HTMLElement,
  tool: RefObject<HTMLElement | null>,
  resize: RefObject<HTMLElement | null>,
): boolean {
  return (tool.current?.contains(node) ?? false) || (resize.current?.contains(node) ?? false)
}

export function useWorkspaceToolFocus(
  runtime: HbarRuntimeView,
  options: {
    readonly enabled: boolean
    readonly mainRef: RefObject<HTMLElement | null>
    readonly toolRef: RefObject<HTMLElement | null>
    readonly sidebarRef: RefObject<HTMLElement | null>
    readonly resizeRef: RefObject<HTMLElement | null>
    readonly presentation: LumenToolPresentation
    readonly onError: (target: WorkspaceToolFocusTarget, code: string) => void
  },
) {
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const current = useRef(options)
  current.current = options
  const ownerRef = useRef<ReturnType<typeof createWorkspaceToolFocusOwner<HTMLElement>> | null>(null)
  const createOwner = useMemo(
    () => () => {
      const read = () =>
        getWorkspaceToolFocusSnapshot(
          runtime.state.navigation.getSnapshot(),
          runtime.state.presentation.getSnapshot(),
          runtime.state.surfaces.getSnapshot(),
          runtime.state.workspaceTabs.getSnapshot(),
          current.current.enabled,
          current.current.presentation,
        )
      return createWorkspaceToolFocusOwner<HTMLElement>({
        read,
        active: () =>
          document.activeElement instanceof HTMLElement && document.activeElement !== document.body
            ? document.activeElement
            : null,
        usable: canFocusWorkspaceElement,
        inMain: (node) => current.current.mainRef.current?.contains(node) ?? false,
        inTool: (node) => inManagedTool(node, current.current.toolRef, current.current.resizeRef),
        main: () => current.current.mainRef.current,
        tool: () => current.current.toolRef.current,
        selectedTab: () =>
          current.current.mainRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null,
        sidebar: () => current.current.sidebarRef.current,
        modalOpen: () => hasOpenModalSurface(document),
        focus: (node) => {
          node.focus({ preventScroll: true })
          return document.activeElement === node
        },
        close: async (target) => {
          if (read().target?.key !== target.key) return
          await runtime.commands.execute('app.closePanel', { instanceId: target.instanceId })
        },
        onError: (target, code) => current.current.onError(target, code),
      })
    },
    [runtime],
  )

  useLayoutEffect(() => {
    const owner = createOwner()
    ownerRef.current = owner
    let disposed = false
    const flush = () =>
      queueMicrotask(() => {
        if (!disposed) owner.flush()
      })
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body) owner.remember(event.target)
      flush()
    }
    const escape = (event: KeyboardEvent) => {
      if (!current.current.enabled) return
      const target = event.target instanceof HTMLElement ? event.target : null
      const menuOpen =
        document.querySelector('[popover]:popover-open') !== null ||
        document.querySelector('[data-hbar-mobile-header-menu][data-open="true"]') !== null ||
        [...document.querySelectorAll<HTMLElement>('[role="menu"]')].some(canFocusWorkspaceElement)
      if (
        !shouldDismissWorkspaceTool({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
          repeat: event.repeat,
          modified: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey,
          inTool: target !== null && inManagedTool(target, current.current.toolRef, current.current.resizeRef),
          modalOpen: hasOpenModalSurface(document),
          menuOpen,
          inCombobox: target?.closest('[role="combobox"]') !== null && target !== null,
          inOpenDetails: target?.closest('details[open]') !== null && target !== null,
        })
      )
        return
      event.preventDefault()
      event.stopPropagation()
      void owner.dismiss()
    }
    const observer = new MutationObserver((records) => {
      const touchesDialog = (node: Node) =>
        node instanceof Element && (node.matches('dialog') || node.querySelector('dialog') !== null)
      if (
        records.some(
          (record) =>
            record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(touchesDialog),
        )
      )
        flush()
    })
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    })
    document.addEventListener('focusin', remember)
    document.addEventListener('keydown', escape)
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      owner.remember(document.activeElement)
    return () => {
      disposed = true
      observer.disconnect()
      document.removeEventListener('focusin', remember)
      document.removeEventListener('keydown', escape)
      owner.dispose()
      if (ownerRef.current === owner) ownerRef.current = null
    }
  }, [createOwner])
  useLayoutEffect(() => {
    ownerRef.current?.update()
  }, [createOwner, navigation, presentation, surfaces, tabs, options.enabled, options.presentation])
}
