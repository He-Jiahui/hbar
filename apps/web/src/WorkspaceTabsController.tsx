import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { createAppRuntime } from '@hbar/app-runtime'
import { createWorkspaceTabClose } from '@hbar/app-runtime/workspace-tab-close'
import type { HbarClient } from '@hbar/client'
import { createRunCommandClient } from '@hbar/client'
import {
  HbarWorkspaceTabs,
  HbarWorkspaceTabsCloseDialog,
  useHbarRuntimeState,
  type HbarWorkspaceTabCloseScope,
  type HbarWorkspaceTabItem,
} from '@hbar/app-react'
import { LumenButton, LumenFrame, LumenText } from '@lumen/app-ui'
import { workspaceTabsCopy } from './workspace-tabs-copy'
import type { ShellLocale } from './shell-copy'
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
  const timeline = useHbarRuntimeState(runtime.view.state.timeline)
  const navigation = useHbarRuntimeState(runtime.view.state.navigation)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const [localError, setLocalError] = useState<string | null>(null)
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
  const items: HbarWorkspaceTabItem[] = tabs.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title:
      item.kind === 'workbench'
        ? copy.workbenchTitle
        : (directory.sessions[item.sessionId]?.title ?? copy.unknownSession(item.sessionId)),
    detail: directory.workspaces[item.workspaceId]?.name ?? copy.unknownWorkspace(item.workspaceId),
    activity:
      item.kind === 'session' &&
      timeline.sessionId === item.sessionId &&
      timeline.runs.some((run) => ['queued', 'running', 'waiting_approval'].includes(run.status))
        ? 'running'
        : 'unknown',
  }))
  const busy = closeState !== null || navigation.status === 'loading'
  const focusAfterClose = () => {
    if (coordinator.reader.getSnapshot().request !== null) return
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true })
    })
  }
  const requestClose = (id: string, scope: HbarWorkspaceTabCloseScope) => {
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
  return (
    <LumenFrame className="hbar-workspace-tabs-controller">
      {(tabs.items.length > 0 || tabs.restoreStatus === 'loading' || error) && (
        <LumenFrame className="hbar-workspace-tabs-region">
          {tabs.items.length > 0 ? (
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
