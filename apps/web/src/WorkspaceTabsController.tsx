import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Files } from 'lucide-react'
import { workspaceDisplayName, type createAppRuntime } from '@hbar/app-runtime'
import { createWorkspaceTabClose } from '@hbar/app-runtime/workspace-tab-close'
import type { HbarClient } from '@hbar/client'
import { createRunCommandClient } from '@hbar/client'
import {
  HbarWorkspaceTabs,
  HbarWorkspaceTabsCloseDialog,
  useHbarMobileHeaderMenuSection,
  useHbarRuntimeState,
  type HbarMobileHeaderMenuItem,
  type HbarWorkspaceTabCloseScope,
  type HbarWorkspaceTabItem,
} from '@hbar/app-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import { workspaceTabsCopy } from './workspace-tabs-copy'
import { getShellCopy, type ShellLocale } from './shell-copy'
import './workspace-tabs-controller.css'

type Runtime = ReturnType<typeof createAppRuntime>
function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

export function WorkspaceTabsController({
  runtime,
  client,
  locale,
  children,
}: {
  readonly runtime: Runtime
  readonly client: HbarClient
  readonly locale: ShellLocale
  readonly children: ReactNode
}) {
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const directory = useHbarRuntimeState(runtime.view.state.directory)
  const displayNames = useHbarRuntimeState(runtime.view.state.workspaceDisplayNameSnapshot)
  const timeline = useHbarRuntimeState(runtime.view.state.timeline)
  const navigation = useHbarRuntimeState(runtime.view.state.navigation)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.view.state.surfaces)
  const [localError, setLocalError] = useState<string | null>(null)
  const [sessionFilesError, setSessionFilesError] = useState<{
    sessionId: string
    workspaceId: string
    sourceTabInstanceKey: string
    code: string
  } | null>(null)
  const closeOrigin = useRef<'tab-bar' | 'mobile-menu' | null>(null)
  const intent = useRef(0)
  const action = (task: Promise<unknown>) => {
    const current = ++intent.current
    setLocalError(null)
    void task.catch((reason: unknown) => {
      if (intent.current === current) setLocalError(code(reason))
    })
  }
  const choose = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en)
  const copy = workspaceTabsCopy(choose)
  const sessionCopy = getShellCopy(locale).session
  const coordinator = useMemo(
    () =>
      createWorkspaceTabClose({
        run: createRunCommandClient(client),
        closeCaptured: runtime.workspaceTabs.closeCaptured,
        onSubscriberError: (reason) => setLocalError(code(reason)),
      }),
    [client, runtime],
  )
  useEffect(() => () => coordinator.dispose(), [coordinator])
  const closeState = useHbarRuntimeState(coordinator.reader).request
  const items: HbarWorkspaceTabItem[] = tabs.items.map((item) => {
    const workspace = directory.workspaces[item.workspaceId]
    return {
      id: item.id,
      kind: item.kind === 'session' && item.agentSource ? 'agent-run' : item.kind,
      title:
        item.kind === 'workbench'
          ? typeof surfaces.panels[item.panelInstanceId]?.params.title === 'string'
            ? String(surfaces.panels[item.panelInstanceId]?.params.title)
            : copy.workbenchTitle
          : (directory.sessions[item.sessionId]?.title ?? copy.unknownSession(item.sessionId)),
      detail: workspace ? workspaceDisplayName(workspace, displayNames) : copy.unknownWorkspace(item.workspaceId),
      activity:
        item.kind === 'session' &&
        timeline.sessionId === item.sessionId &&
        timeline.runs.some((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
          ? 'running'
          : 'unknown',
    }
  })
  const busy = closeState !== null || navigation.status === 'loading'
  const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
  const sessionTab =
    presentation.page.kind === 'session' &&
    activeTab?.kind === 'session' &&
    activeTab.sessionId === navigation.sessionId &&
    activeTab.workspaceId === navigation.workspaceId
      ? activeTab
      : null
  const activeTool = presentation.toolInstanceId ? surfaces.panels[presentation.toolInstanceId] : undefined
  const filesSelected =
    Boolean(sessionTab) &&
    activeTool?.panelId === 'files' &&
    activeTool.workspaceId === sessionTab?.workspaceId &&
    activeTool.sessionId === sessionTab?.sessionId
  const toggleSessionFiles = () => {
    if (!sessionTab) return
    const target = {
      panelId: 'files' as const,
      workspaceId: sessionTab.workspaceId,
      sessionId: sessionTab.sessionId,
      sourceTabInstanceKey: sessionTab.instanceKey,
    }
    setSessionFilesError(null)
    void runtime.view.commands.execute('sessionTools.toggle', target).catch((reason: unknown) => {
      const current = runtime.view.state.navigation.getSnapshot()
      const currentTab = runtime.view.state.workspaceTabs
        .getSnapshot()
        .items.find((item) => item.kind === 'session' && item.sessionId === target.sessionId)
      if (
        current.workspaceId !== target.workspaceId ||
        current.sessionId !== target.sessionId ||
        currentTab?.instanceKey !== target.sourceTabInstanceKey
      )
        return
      setSessionFilesError({ ...target, code: code(reason) })
    })
  }
  const mobileSessionFilesItem: HbarMobileHeaderMenuItem | null = sessionTab
    ? {
        id: 'files',
        order: 1,
        label: sessionCopy.tools.files,
        icon: Files,
        disabled: busy,
        pressed: filesSelected,
        onActivate: toggleSessionFiles,
      }
    : null
  const focusAfterClose = () => {
    if (coordinator.reader.getSnapshot().request !== null) return
    const origin = closeOrigin.current
    requestAnimationFrame(() => {
      const selectedTab = [...document.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]')].find(
        (element) => element.getClientRects().length > 0,
      )
      const firstVisibleFocusable = (root: HTMLElement | null) =>
        [
          ...(root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? []),
        ].find(
          (element) =>
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility === 'visible' &&
            !element.closest('[hidden], [inert], [aria-hidden="true"]'),
        )
      const sidebar = document.querySelector<HTMLElement>('.hbar-app-ui-app-sidebar-drawer[data-open="true"]')
      const tool = document.querySelector<HTMLElement>('.lumen-app-tool-drawer')
      const mobileTrigger = document.querySelector<HTMLElement>('.hbar-mobile-header-menu-trigger')
      const fallback =
        origin === 'mobile-menu' ? mobileTrigger : (firstVisibleFocusable(sidebar) ?? firstVisibleFocusable(tool))
      ;(selectedTab ?? fallback)?.focus({ preventScroll: true })
      closeOrigin.current = null
    })
  }
  const requestClose = (
    id: string,
    scope: HbarWorkspaceTabCloseScope,
    origin: 'tab-bar' | 'mobile-menu' = 'tab-bar',
  ) => {
    const index = tabs.items.findIndex((item) => item.id === id)
    if (index < 0) return
    const ids = tabs.items
      .filter((item, position) => {
        if (scope === 'all') return true
        if (scope === 'one') return item.id === id
        if (scope === 'others') return item.id !== id
        if (scope === 'left') return position < index
        return position > index
      })
      .map((item) => item.id)
    if (!ids.length) return
    const original = runtime.workspaceTabs.capture(ids)
    closeOrigin.current = origin
    action(coordinator.request(original).then(focusAfterClose))
  }
  const resolveClose = (choice: 'cancel' | 'keepRunning' | 'stop' | 'recheck') => {
    if (!closeState) return
    action(coordinator.resolve(closeState.id, choice).then(focusAfterClose))
  }
  const counts = new Map<string, number>()
  for (const operation of closeState?.operations ?? [])
    counts.set(operation.sessionId, (counts.get(operation.sessionId) ?? 0) + 1)
  const targets = (closeState?.targets ?? []).map((target) => ({
    id: target.id,
    title:
      target.sessionId === null
        ? copy.workbenchTitle
        : (directory.sessions[target.sessionId]?.title ?? copy.unknownSession(target.sessionId)),
    runCount: target.sessionId === null ? 0 : (counts.get(target.sessionId) ?? 0),
  }))
  const restoreError = tabs.restoreError ?? tabs.persistError
  const error = localError ?? restoreError
  const mobileTabItems: readonly HbarMobileHeaderMenuItem[] = tabs.items.map((item, index) => {
    const label = items[index]?.detail
      ? `${items[index]?.title} — ${items[index]?.detail}`
      : (items[index]?.title ?? item.id)
    return {
      id: `tab-${item.id}`,
      order: index,
      label,
      disabled: busy,
      current: presentation.page.kind === 'session' && tabs.activeId === item.id,
      onActivate: () => action(runtime.view.commands.execute('workspaceTabs.select', { id: item.id })),
      close: {
        label: copy.tabs.close(items[index]?.title ?? label),
        disabled: busy,
        onActivate: () => requestClose(item.id, 'one', 'mobile-menu'),
      },
    }
  })
  useHbarMobileHeaderMenuSection(
    tabs.items.length > 0 ? { id: 'workspace-tabs', order: 1, label: copy.tabs.tabs, items: mobileTabItems } : null,
  )
  useHbarMobileHeaderMenuSection(
    mobileSessionFilesItem
      ? { id: 'session-tools', order: 2, label: sessionCopy.tools.label, items: [mobileSessionFilesItem] }
      : null,
  )
  return (
    <LumenFrame className="hbar-workspace-tabs-controller">
      {(tabs.items.length > 0 || tabs.restoreStatus === 'loading' || error) && (
        <LumenFrame className="hbar-workspace-tabs-region">
          {tabs.items.length > 0 ? (
            <LumenFrame className="hbar-workspace-tabs-bar">
              <HbarWorkspaceTabs
                items={items}
                activeId={presentation.page.kind === 'session' ? tabs.activeId : null}
                busy={busy}
                labels={copy.tabs}
                onSelect={(id) => {
                  action(runtime.view.commands.execute('workspaceTabs.select', { id }))
                }}
                onMove={(id, beforeId) => {
                  action(runtime.view.commands.execute('workspaceTabs.move', { id, beforeId }))
                }}
                onRequestClose={requestClose}
              />
              {sessionTab && (
                <LumenFrame role="toolbar" aria-label={sessionCopy.tools.label} className="hbar-workspace-tabs-tools">
                  <LumenButton
                    variant="text"
                    indicator="none"
                    size="s"
                    aria-label={sessionCopy.tools.files}
                    title={sessionCopy.tools.files}
                    aria-pressed={filesSelected}
                    disabled={busy}
                    onClick={mobileSessionFilesItem?.onActivate}
                  >
                    <LumenIcon icon={Files} tier="sm" />
                  </LumenButton>
                </LumenFrame>
              )}
            </LumenFrame>
          ) : tabs.restoreStatus === 'loading' ? (
            <LumenText as="p" role="status">
              {copy.restoring}
            </LumenText>
          ) : null}
          {error && (
            <LumenFrame className="hbar-workspace-tabs-feedback">
              <LumenText as="p" role="alert">
                {copy.error(error)}
              </LumenText>
              {restoreError && (
                <LumenButton
                  variant="text"
                  onClick={() => {
                    action(
                      tabs.restoreError
                        ? runtime.view.commands.execute('workspaceTabs.retryRestore', {})
                        : runtime.view.commands.execute('workspaceTabs.retryPersist', {}),
                    )
                  }}
                >
                  {copy.retry}
                </LumenButton>
              )}
            </LumenFrame>
          )}
          {sessionTab &&
            sessionFilesError?.sessionId === sessionTab.sessionId &&
            sessionFilesError.workspaceId === sessionTab.workspaceId &&
            sessionFilesError.sourceTabInstanceKey === sessionTab.instanceKey && (
              <LumenText as="p" role="alert" className="hbar-workspace-tabs-files-error">
                {sessionCopy.tools.error(sessionFilesError.code)}
              </LumenText>
            )}
        </LumenFrame>
      )}
      <LumenFrame className="hbar-workspace-tabs-content">{children}</LumenFrame>
      <HbarWorkspaceTabsCloseDialog
        open={closeState !== null}
        status={closeState?.status ?? 'checking'}
        targets={targets}
        error={closeState?.error ? copy.error(closeState.error) : null}
        labels={copy.close}
        onCancel={() => resolveClose('cancel')}
        onKeepRunning={() => resolveClose('keepRunning')}
        onStopAndClose={() => resolveClose('stop')}
        onRecheck={() => resolveClose('recheck')}
      />
    </LumenFrame>
  )
}
