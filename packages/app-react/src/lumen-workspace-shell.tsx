import type { HbarWorkspaceShellProps } from './workspace-shell-contract'
export type {
  HbarWorkspaceShellProps,
  HbarWorkspaceShellLabels,
  HbarWorkspaceShellContentControls,
  HbarSidebarTimeLabels,
  HbarWorkspaceShellSlots,
} from './workspace-shell-contract'
export { workspaceShellShortcut } from './workspace-shell-shortcut'
import { WorkspaceShellIcon } from './workspace-shell-icons'
import { WorkspaceSidebar } from './workspace-sidebar'
import { useWorkspaceSidebarBridge } from './workspace-sidebar-bridge'
import { WorkspaceToolRegion } from './workspace-tool-region'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LumenContentText,
  LumenAppShell09,
  LumenNavbar01,
  LumenFrame,
  LumenFloatingSurface,
  type LumenAppShellProps,
  type LumenToolPresentation,
} from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import { usePersistentPane } from './persistent-pane'
import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
import { HbarSessionStopProvider } from './session-stop'

import './lumen-workspace-shell.css'
import './sidebar-entry-layout.css'
import './workspace-session-entry.css'
import './sidebar-navigation.css'
import { canFocusWorkspaceElement, getWorkspaceToolFocusSnapshot, useWorkspaceToolFocus } from './workspace-tool-focus'
import { HbarMobileHeaderMenu, HbarMobileHeaderMenuProvider } from './mobile-header-menu'
import { HbarHostConnectionNotice } from './host-connection-notice'
import { HbarRuntimeStatusNotice } from './host-runtime-status'
import { WorkspaceShellMessagesProvider, useWorkspaceShellChromeMessages } from './workspace-shell-messages'
import { WORKSPACE_VIEWPORT_MEDIA } from './responsive-contract'

function forwardShellRef(ref: LumenAppShellProps['mainRef'], node: HTMLElement | null): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(node)
    if (typeof cleanup === 'function')
      return () => {
        cleanup()
      }
    return undefined
  }
  if (ref) ref.current = node
  return undefined
}

export function HbarWorkspaceShell(props: HbarWorkspaceShellProps) {
  return (
    <WorkspaceShellMessagesProvider labels={props.labels} mobileNavigationLabel={props.mobileNavigationLabel}>
      <HbarWorkspaceShellContent props={props} />
    </WorkspaceShellMessagesProvider>
  )
}

function HbarWorkspaceShellContent({ props }: { readonly props: HbarWorkspaceShellProps }) {
  const { t } = useWorkspaceShellChromeMessages()
  const runtime = useHbarRuntime()
  const bridge = useWorkspaceSidebarBridge(props)
  const sidebarWidthRem = bridge.railCollapsed ? props.sidebarRailWidthRem : props.sidebarWidthRem
  const {
    railCollapsed,
    mainRef,
    sidebarFocusRef,
    sidebarShowFocusRef,
    sidebarToggleFocus,
    railSearchFocus,
    setSidebarVisible,
  } = bridge

  const navigation = useHbarRuntimeState(runtime.state.navigation)

  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const [workspaceTabsViewport, setWorkspaceTabsViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.tabletAndUp).matches,
  )
  useEffect(() => {
    const viewport = window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.tabletAndUp)
    const update = () => setWorkspaceTabsViewport(viewport.matches)
    update()
    viewport.addEventListener('change', update)
    return () => viewport.removeEventListener('change', update)
  }, [])
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const workspaceTabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const toolRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const request = railSearchFocus.current
    if (!request) return
    if (request.owner !== runtime) {
      railSearchFocus.current = null
      return
    }
    if (presentation.modalInstanceId === 'chat-search') {
      request.opened = true
      return
    }
    if (!request.opened) return
    railSearchFocus.current = null
    queueMicrotask(() => {
      const current = runtime.state.navigation.getSnapshot()
      if (
        sidebarFocusOwner.current !== runtime ||
        !request.node.isConnected ||
        current.workspaceId !== request.workspaceId ||
        current.sessionId !== request.sessionId ||
        runtime.state.presentation.getSnapshot().modalInstanceId ||
        document.querySelector('dialog:modal')
      )
        return
      const active = document.activeElement
      if (active === document.body || active === mainRef.current || !active?.isConnected)
        request.node.focus({ preventScroll: true })
    })
  }, [presentation.modalInstanceId, runtime, mainRef, railSearchFocus])
  useEffect(() => {
    const original = sidebarToggleFocus.current
    if (!original) return
    sidebarToggleFocus.current = null
    const active = document.activeElement
    if (
      active !== original &&
      active !== document.body &&
      active instanceof HTMLElement &&
      canFocusWorkspaceElement(active)
    )
      return
    const destination = [sidebarFocusRef.current, sidebarShowFocusRef.current].find(
      (node) => node !== null && canFocusWorkspaceElement(node),
    )
    destination?.focus({ preventScroll: true })
  }, [presentation.sidebarOpen, railCollapsed, sidebarFocusRef, sidebarShowFocusRef, sidebarToggleFocus])
  const sidebarFocusOwner = useRef(runtime)
  sidebarFocusOwner.current = runtime
  const reportSidebarFocusUnavailable = props.sidebarResize?.onFocusUnavailable
  const onSidebarFocusUnavailable = useCallback(() => {
    reportSidebarFocusUnavailable?.()
    // The shared control reports only its own lost focus. Wait for the sidebar
    // visibility commit, then keep any newer deliberate focus or native modal.
    queueMicrotask(() => {
      if (sidebarFocusOwner.current !== runtime || document.querySelector('dialog:modal')) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && canFocusWorkspaceElement(active)) return
      for (const node of [sidebarFocusRef.current, sidebarShowFocusRef.current, toolRef.current, mainRef.current]) {
        if (!node || !canFocusWorkspaceElement(node)) continue
        node.focus({ preventScroll: true })
        return
      }
    })
  }, [runtime, reportSidebarFocusUnavailable, mainRef, sidebarFocusRef, sidebarShowFocusRef])
  const resizeRef = useRef<HTMLElement | null>(null)
  const [toolPresentation, setToolPresentation] = useState<LumenToolPresentation>('none')
  const [narrowHeader, setNarrowHeader] = useState(false)
  useEffect(() => {
    const viewport = window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.tabletAndUp)
    const update = () => setNarrowHeader(!viewport.matches)
    update()
    viewport.addEventListener('change', update)
    return () => viewport.removeEventListener('change', update)
  }, [])
  const resolvedToolPresentation = props.renderLayout
    ? props.tool
      ? (props.desktopToolPresentation ?? 'split')
      : 'none'
    : toolPresentation
  const [toolFocusError, setToolFocusError] = useState<{ key: string; code: string } | null>(null)
  const focusSnapshot = getWorkspaceToolFocusSnapshot(
    navigation,
    presentation,
    surfaces,
    workspaceTabs,
    Boolean(props.tool && props.toolLayout),
    resolvedToolPresentation,
  )
  useWorkspaceToolFocus(runtime, {
    enabled: Boolean(props.tool && props.toolLayout),
    mainRef,
    toolRef,
    sidebarRef: sidebarFocusRef,
    resizeRef,
    presentation: resolvedToolPresentation,
    onError: (target, code) => setToolFocusError({ key: target.key, code }),
  })
  const attachMain = useCallback(
    (node: HTMLElement | null) => {
      mainRef.current = node
      const cleanup = forwardShellRef(props.mainRef, node)
      return () => {
        mainRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.mainRef, null)
      }
    },
    [props.mainRef, mainRef],
  )
  const attachTool = useCallback(
    (node: HTMLElement | null) => {
      toolRef.current = node
      const cleanup = forwardShellRef(props.toolRef, node)
      return () => {
        toolRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.toolRef, null)
      }
    },
    [props.toolRef],
  )
  const attachResize = useCallback(
    (node: HTMLElement | null) => {
      resizeRef.current = node
      const cleanup = forwardShellRef(props.resizeRef, node)
      return () => {
        resizeRef.current = null
        if (typeof cleanup === 'function') cleanup()
        else forwardShellRef(props.resizeRef, null)
      }
    },
    [props.resizeRef],
  )
  const reportToolPresentation = props.onToolPresentationChange
  const onToolPresentationChange = useCallback(
    (mode: LumenToolPresentation) => {
      setToolPresentation(mode)
      reportToolPresentation?.(mode)
    },
    [reportToolPresentation],
  )
  useEffect(() => setToolFocusError(null), [focusSnapshot.target?.key])
  const connected = props.connection === 'connected'
  const activeWorkspaceTab = workspaceTabs.items.find((item) => item.id === workspaceTabs.activeId)
  const mobileHeaderTitle = useHbarRuntimeSelector(
    runtime.state.directory,
    (directory) =>
      props.pageTitle ??
      (presentation.page.kind === 'settings'
        ? t('settings')
        : presentation.page.kind === 'status'
          ? t('status')
          : presentation.page.kind === 'session'
            ? activeWorkspaceTab?.kind === 'workbench'
              ? t('workspaceFiles')
              : activeWorkspaceTab?.kind === 'session'
                ? (directory.sessions[activeWorkspaceTab.sessionId]?.title ?? t('newSession'))
                : navigation.sessionId
                  ? (directory.sessions[navigation.sessionId]?.title ?? t('newSession'))
                  : t('newSession')
            : t('newSession')),
  )

  const { labels: _labels, ...sidebarProps } = props
  const sidebarPane = <WorkspaceSidebar {...sidebarProps} bridge={bridge} />
  const projectPane = usePersistentPane(sidebarPane)
  const overlayRegion = props.overlay
  const shellSlots = props.slots
  const headerRegion = shellSlots?.header ?? (
    <LumenFrame className="hbar-app-react-shell-header" data-hbar-app-ui-component="app-shell-09-header">
      <HbarActionIconButton
        ref={sidebarShowFocusRef}
        label={t('showSidebar')}
        onClick={() => setSidebarVisible(true)}
      >
        <WorkspaceShellIcon name="menu" />
      </HbarActionIconButton>
      <LumenContentText context="record.title" title={t('brand')}>
        {t('brand')}
      </LumenContentText>
      <LumenContentText
        context="page.title"
        className="hbar-app-react-shell-header-active-title"
        title={mobileHeaderTitle}
      >
        {mobileHeaderTitle}
      </LumenContentText>
      <HbarMobileHeaderMenu label={t('mobileNavigation')} />
    </LumenFrame>
  )
  const contentOwnsNavigation =
    typeof props.children === 'function' &&
    shellSlots?.content == null &&
    (props.renderLayout !== undefined || workspaceTabsViewport)
  const leadingNavigation =
    contentOwnsNavigation && !presentation.sidebarOpen && (props.renderLayout || !railCollapsed) ? (
      <HbarActionIconButton
        ref={sidebarShowFocusRef}
        label={t('showSidebar')}
        data-hbar-sidebar-reveal="tabs"
        onClick={() => setSidebarVisible(true)}
      >
        <WorkspaceShellIcon name="menu" />
      </HbarActionIconButton>
    ) : null
  const desktopHeader = contentOwnsNavigation
    ? (shellSlots?.header ?? (narrowHeader ? headerRegion : undefined))
    : props.renderLayout
      ? (shellSlots?.header ??
        (!presentation.sidebarOpen ? (
          <LumenFrame className="hbar-app-react-desktop-reveal-header">
            <LumenNavbar01
              slots={{
                leading: (
                  <HbarActionIconButton
                    ref={sidebarShowFocusRef}
                    label={t('showSidebar')}
                    onClick={() => setSidebarVisible(true)}
                  >
                    <WorkspaceShellIcon name="menu" />
                  </HbarActionIconButton>
                ),
              }}
            />
          </LumenFrame>
        ) : undefined))
      : headerRegion
  const toolRegion =
    props.slots?.context || props.tool ? (
      <WorkspaceToolRegion
        props={props}
        toolFocusError={toolFocusError?.key === focusSnapshot.target?.key ? toolFocusError : null}
      />
    ) : null
  const contentRegion = (
    <LumenFrame
      className="hbar-app-react-shell-content"
      data-hbar-sidebar-expanded={presentation.sidebarOpen}
      data-hbar-app-ui-component="app-shell-09-content"
    >
      {shellSlots?.content ??
        (typeof props.children === 'function' ? props.children({ leadingNavigation }) : props.children)}
      {shellSlots?.composer ? (
        <LumenFrame data-hbar-app-ui-component="prompt-input-04-composer">{shellSlots.composer}</LumenFrame>
      ) : null}
    </LumenFrame>
  )
  const connectionNotice = (
    <>
      <HbarHostConnectionNotice
        connection={props.connection}
        labels={props.labels.connectionNotice}
        onReconnect={props.onReconnect}
      />
      {props.runtimeStatusLabels && (
        <HbarRuntimeStatusNotice connected={connected} labels={props.runtimeStatusLabels} />
      )}
    </>
  )
  const connectionInDrawer = Boolean(toolRegion) && resolvedToolPresentation === 'drawer'
  const workspacePane = usePersistentPane(contentRegion)
  const sessionToolPane = usePersistentPane(
    <>
      {connectionInDrawer ? connectionNotice : null}
      {toolRegion}
    </>,
  )
  const shell = (
    <LumenAppShell09
      label={t('main')}
      titlebar={
        <>
          {props.titlebar}
          {connectionInDrawer ? null : connectionNotice}
        </>
      }
      {...(sidebarWidthRem === undefined ? {} : { sidebarWidthRem })}
      sidebarLayout={railCollapsed ? undefined : props.sidebarLayout}
      sidebarResize={
        !railCollapsed && props.sidebarResize
          ? { ...props.sidebarResize, onFocusUnavailable: onSidebarFocusUnavailable }
          : undefined
      }
      {...(props.toolWidthRem === undefined ? {} : { toolWidthRem: props.toolWidthRem })}
      toolLayout={props.toolLayout}
      onCloseTool={props.onCloseTool}
      toolResize={props.toolResize}
      mainRef={attachMain}
      toolRef={attachTool}
      resizeRef={attachResize}
      onToolPresentationChange={onToolPresentationChange}
      sidebarOpen={railCollapsed || presentation.sidebarOpen}
      closeSidebarLabel={t('hideSidebar')}
      onCloseSidebar={() => setSidebarVisible(false)}
      header={desktopHeader}
      tool={props.renderLayout || !toolRegion ? null : sessionToolPane.outlet}
      toolLabel={props.toolLabel}
      overlay={
        <>
          {overlayRegion}
          {props.renderLayout && toolRegion && resolvedToolPresentation === 'drawer' ? (
            <LumenFloatingSurface
              mode="modal"
              open={resolvedToolPresentation === 'drawer'}
              keepMounted
              label={props.toolLabel}
              onClose={props.onCloseTool ?? (() => {})}
              className="lumen-tool-drawer-surface"
              backdropClassName="lumen-tool-drawer-root"
              style={{ '--lumen-tool-size': `${props.toolWidthRem ?? 24}rem` } as React.CSSProperties}
            >
              <LumenFrame
                as="aside"
                ref={attachTool}
                tabIndex={-1}
                className="hbar-desktop-tool-pane"
                aria-label={props.toolLabel}
              >
                {sessionToolPane.outlet}
              </LumenFrame>
            </LumenFloatingSurface>
          ) : null}
        </>
      }
      sidebar={projectPane.outlet}
      slots={
        props.renderLayout
          ? {
              desktopLayout: props.renderLayout(
                {
                  projects: projectPane.outlet,
                  workspace: (
                    <LumenFrame
                      as="main"
                      ref={attachMain}
                      tabIndex={-1}
                      className="hbar-desktop-workspace-pane"
                      aria-label={t('main')}
                    >
                      {workspacePane.outlet}
                    </LumenFrame>
                  ),
                  'session-tool': toolRegion ? (
                    <LumenFrame
                      as="aside"
                      ref={resolvedToolPresentation === 'split' ? attachTool : undefined}
                      tabIndex={-1}
                      className="hbar-desktop-tool-pane"
                      aria-label={props.toolLabel}
                    >
                      {resolvedToolPresentation === 'split' ? sessionToolPane.outlet : null}
                    </LumenFrame>
                  ) : null,
                },
                null,
              ),
            }
          : undefined
      }
    >
      {workspacePane.outlet}
    </LumenAppShell09>
  )
  return (
    <HbarMobileHeaderMenuProvider>
      <HbarSessionStopProvider
        labels={props.labels.stop}
        connected={props.connection === 'connected'}
        mainRef={mainRef}
        toolRef={toolRef}
        toolPresentation={resolvedToolPresentation}
      >
        {shell}
        {projectPane.portal}
        {workspacePane.portal}
        {sessionToolPane.portal}
      </HbarSessionStopProvider>
    </HbarMobileHeaderMenuProvider>
  )
}
