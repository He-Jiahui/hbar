import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  HbarAgentWorkspace,
  HbarCommandPalette,
  HbarExtensionWorkspace,
  HbarFileWorkspace,
  HbarGoalPlanWorkspace,
  HbarProviderDialog,
  HbarProviderSettings,
  HbarRuntimeProvider,
  HbarSessionMonitoring,
  HbarSessionWorkspace,
  HbarSettingsWorkspace,
  HbarStatusWorkspace,
  HbarSystemDiagnostics,
  HbarWorkspaceShell,
  useHbarRuntime,
  useHbarRuntimeState,
} from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import { CommandError } from '@hbar/commands'
import { ArrowLeft } from 'lucide-react'
import {
  applyLumenAppearance,
  LumenButton,
  LumenDialog,
  LumenFrame,
  LumenIcon,
  LumenProvider,
  LumenText,
  LumenWindowTitlebar,
  LumenWorkbenchNotice,
} from '@lumen/app-ui'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  HbarClient,
  createBrowserAttachmentController,
  createBrowserResourcePicker,
  createAgentCommandClient,
  createBudgetCommandClient,
  createCommandCatalogClient,
  createConnectionCommands,
  createConfigurationCommandClient,
  createDirectoryQueryAdapter,
  createExtensionCommandClient,
  createFileCommandClient,
  createGoalPlanCommandClient,
  createWorkflowCommandClient,
  createGitCommandClient,
  createRunCommandClient,
  createSessionTimelineClient,
  createInteractionCommandClient,
  createInteractionRecoveryClient,
  createMetricsCommandClient,
  createModelCommandClient,
  createSchemaCallbackClient,
  createSettingsCommandClient,
  createSystemCommandClient,
  createUsageCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import type { BrowserAttachmentSelection, ConnectionStatus } from '@hbar/client'
import { WebAppearanceSettings } from './AppearanceSettings'
import {
  createWebLumenAppearance,
  readAppearanceBootstrap,
  resetWebAppearancePreferences,
  resolveWebAppearanceDimensions,
  sameWebAppearanceDimensions,
  saveWebAppearancePreferences,
  writeAppearanceBootstrap,
} from './appearance'
import { createWebAppearanceEditor, type AppearanceEditor } from './appearance-editor'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { SettingsPageFocusBoundary } from './SettingsPageFocusBoundary'
import { WEB_SETTINGS_GROUP_PRESENTATION } from './settings-group-presentation'
import { WorkspaceTabsController } from './WorkspaceTabsController'
import { workspaceTabsCopy } from './workspace-tabs-copy'
import { sessionContextCopy } from './session-context-copy'
import { normalizeShellLayout, shellLayout, shellLayoutModule } from './shell-layout'
import { createBrowserClientPersistence } from './client-persistence'
import { createBrowserClientExport } from './client-export'
import { canRenderWebSurface } from './surface-manifest'
import type { HbarNativeConnection } from './native-connection'
import type { HbarNativeWindowContext } from './native-window'
import { applyWebTheme, readThemeBootstrap, readThemePreference, resolveWebTheme, writeThemeBootstrap } from './theme'
import './App.css'

function createRuntime(
  client: HbarClient,
  hostId: string,
  locale: ShellLocale,
  attachments: ReturnType<typeof createBrowserAttachmentController>['commands'],
  resourcePicker: ReturnType<typeof createBrowserResourcePicker>,
) {
  const copy = getShellCopy(locale)
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId,
    directory: createDirectoryQueryAdapter(client),
    workspaces: createWorkspaceSessionCommandClient(client),
    timeline: createSessionTimelineClient(client),
    run: createRunCommandClient(client),
    attachments,
    resourcePicker,
    interactions: createInteractionCommandClient(client),
    interactionRecovery: createInteractionRecoveryClient(client),
    models: createModelCommandClient(client),
    usage: createUsageCommandClient(client),
    budget: createBudgetCommandClient(client),
    settings: createSettingsCommandClient(client),
    configuration: createConfigurationCommandClient(client),
    files: createFileCommandClient(client),
    agents: createAgentCommandClient(client),
    goals: createGoalPlanCommandClient(client),
    planProposal: copy.planProposal,
    workflows: createWorkflowCommandClient(client),
    extensions: createExtensionCommandClient(client),
    system: createSystemCommandClient(client),
    metrics: createMetricsCommandClient(client),
    git: createGitCommandClient(client),
    commandCatalog: createCommandCatalogClient(client),
    commandText: { resolve: copy.commandPalette.resolve },
    schemaContent: createSchemaCallbackClient(client),
    surfaces: { canRender: canRenderWebSurface },
    defaultLayout: shellLayout,
    layoutDescription: { normalize: normalizeShellLayout },
    persistence: createBrowserClientPersistence(window.localStorage, 'hbar:web'),
    exporter: createBrowserClientExport(),
  })
}

function createAppearanceEditorForRuntime(runtime: ReturnType<typeof createAppRuntime>): AppearanceEditor {
  const state = runtime.view.state.preferences
  const commands = runtime.view.commands
  const mutations = {
    set: (input: { key: string; value: string; expectedRevision: number }) =>
      commands.execute('preferences.set', input),
    unset: (input: { key: string; expectedRevision: number }) => commands.execute('preferences.unset', input),
  }
  const current = (expectedRevision: number) => {
    const preferences = state.getSnapshot()
    if (preferences.restoreError)
      throw new CommandError('PERSISTENCE_RESTORE_FAILED', 'Read saved preferences before changing appearance')
    if (preferences.revision !== expectedRevision)
      throw new CommandError('COMMAND_CONFLICT', 'Appearance preference revision changed')
    return preferences
  }
  return createWebAppearanceEditor(state.getSnapshot(), {
    save: (target, expectedRevision) =>
      saveWebAppearancePreferences(mutations, current(expectedRevision).values, target, expectedRevision),
    reset: (expectedRevision) =>
      resetWebAppearancePreferences(mutations, current(expectedRevision).values, expectedRevision),
    refresh: runtime.clientPreferences.refresh,
  })
}

type WorkspaceBodyProps = {
  readonly appRuntime: ReturnType<typeof createAppRuntime>
  readonly appearanceEditor: AppearanceEditor
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly prepareAttachment: (file: File) => Promise<BrowserAttachmentSelection>
  readonly files: ReturnType<typeof createFileCommandClient>
  readonly systemPrefersDark: boolean
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function AgentChildReturn({
  title,
  labels,
  busy,
  error,
  onReturn,
}: {
  readonly title: string
  readonly labels: ReturnType<typeof getShellCopy>['agents']
  readonly busy: boolean
  readonly error: string | null
  readonly onReturn: () => void
}) {
  return (
    <LumenFrame className="hbar-web-agent-return">
      <LumenButton size="s" variant="text" indicator="none" disabled={busy} onClick={onReturn}>
        <LumenIcon icon={ArrowLeft} tier="sm" />
        <LumenText as="span">{busy ? labels.returningToParent : labels.returnToParent(title)}</LumenText>
      </LumenButton>
      {error && (
        <LumenText as="p" role="alert">
          {labels.returnError(error)}
        </LumenText>
      )}
    </LumenFrame>
  )
}

/** Expanded file views own the original surface only while their ephemeral tab exists. */
function WorkbenchSurfaceCleanup({ runtime }: { readonly runtime: ReturnType<typeof createAppRuntime> }) {
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const surfaces = useHbarRuntimeState(runtime.view.state.surfaces)
  const previous = useRef<ReadonlyMap<string, (typeof surfaces.panels)[string]>>(new Map())
  useLayoutEffect(() => {
    const current = new Map(
      tabs.items
        .filter((item) => item.kind === 'workbench')
        .map((item) => [item.panelInstanceId, surfaces.panels[item.panelInstanceId]] as const)
        .filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => entry[1] !== undefined),
    )
    for (const [instanceId, panel] of previous.current) {
      if (!current.has(instanceId) && surfaces.panels[instanceId] === panel)
        void runtime.view.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)
    }
    previous.current = current
  }, [runtime, surfaces.panels, tabs.items])
  return null
}

function WorkspaceBody(props: WorkspaceBodyProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const copy = getShellCopy(props.locale)
  const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
  const label =
    presentation.page.kind === 'settings'
      ? copy.settings.pageTitle
      : presentation.page.kind === 'status'
        ? copy.shell.status
        : activeTab?.kind === 'workbench'
          ? copy.files.title
          : ((navigation.sessionId ? directory.sessions[navigation.sessionId]?.title : null) ?? copy.empty.title)
  return (
    <SettingsPageFocusBoundary pageKind={presentation.page.kind} sidebarOpen={presentation.sidebarOpen} label={label}>
      <WorkspaceBodyContent {...props} />
    </SettingsPageFocusBoundary>
  )
}

function WorkspaceBodyContent({
  appRuntime,
  appearanceEditor,
  locale,
  connected,
  prepareAttachment,
  files,
  systemPrefersDark,
}: WorkspaceBodyProps) {
  const copy = getShellCopy(locale)
  const tabCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const [workbenchError, setWorkbenchError] = useState<string | null>(null)
  const [agentReturn, setAgentReturn] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  })
  const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
  useEffect(() => setAgentReturn({ busy: false, error: null }), [activeTab?.id, activeTab?.instanceKey])
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  if (presentation.page.kind === 'status')
    return <HbarStatusWorkspace labels={copy.status} instanceId={presentation.page.instanceId} />
  if (presentation.page.kind === 'settings')
    return (
      <HbarSettingsWorkspace
        labels={copy.settings}
        connected={connected}
        groupPresentation={WEB_SETTINGS_GROUP_PRESENTATION}
        additionalGroups={[
          { id: 'appearance', label: copy.appearance.group, order: 0 },
          { id: 'diagnostics', label: copy.diagnostics.title, order: 90 },
        ]}
        renderGroup={(groupId) => {
          if (groupId === 'appearance')
            return (
              <WebAppearanceSettings
                labels={copy.appearance}
                editor={appearanceEditor}
                systemPrefersDark={systemPrefersDark}
              />
            )
          if (groupId === 'providers')
            return <HbarProviderSettings labels={copy.providers.list} connected={connected} />
          if (groupId === 'extensions' && presentation.page.kind === 'settings')
            return (
              <HbarExtensionWorkspace
                labels={copy.extensions}
                connected={connected}
                instanceId={presentation.page.instanceId}
              />
            )
          if (groupId === 'diagnostics' && presentation.page.kind === 'settings')
            return (
              <HbarSystemDiagnostics
                labels={copy.diagnostics}
                connected={connected}
                instanceId={presentation.page.instanceId}
              />
            )
          return null
        }}
      />
    )
  if (activeTab?.kind === 'workbench') {
    const panel = surfaces.panels[activeTab.panelInstanceId]
    if (!panel || panel.panelId !== 'files')
      return <LumenWorkbenchNotice title={copy.files.title} description={tabCopy.error('PANEL_NOT_FOUND')} />
    const targetLabel = directory.workspaces[activeTab.workspaceId]?.name ?? activeTab.workspaceId
    const focusReturnedView = () => {
      requestAnimationFrame(() => {
        const target =
          document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
          document.querySelector<HTMLElement>('.hbar-settings-page-focus')
        target?.focus({ preventScroll: true })
      })
    }
    const close = () => {
      setWorkbenchError(null)
      const captured = appRuntime.workspaceTabs.capture([activeTab.id])
      void appRuntime.workspaceTabs
        .closeCaptured(captured, new AbortController().signal)
        .then(focusReturnedView)
        .catch((reason: unknown) => {
          setWorkbenchError(errorCode(reason))
        })
    }
    return (
      <HbarFileWorkspace
        key={activeTab.panelInstanceId}
        labels={copy.files}
        connected={connected}
        instanceId={activeTab.panelInstanceId}
        targetLabel={targetLabel}
        mode="workbench"
        returnLabel={activeTab.sourceSessionId ? copy.files.returnToConversation : copy.files.returnToWorkspace}
        actionError={workbenchError ? tabCopy.error(workbenchError) : null}
        onReturnToSource={() => {
          setWorkbenchError(null)
          void runtime.commands
            .execute('workspaceTabs.returnToSource', { id: activeTab.id, instanceKey: activeTab.instanceKey })
            .then(focusReturnedView)
            .catch((reason: unknown) => setWorkbenchError(errorCode(reason)))
        }}
        onCloseWorkbench={close}
      />
    )
  }
  if (session)
    return (
      <HbarSessionWorkspace
        sessionTitle={session.title}
        workspaceName={directory.workspaces[session.workspaceId]?.name ?? session.workspaceId}
        sessionWorkspaceId={session.workspaceId}
        projectContextLabels={sessionContextCopy(locale)}
        labels={copy.session}
        connected={connected}
        prepareAttachment={prepareAttachment}
        files={files}
        navigationAccessory={
          activeTab?.kind === 'session' && activeTab.agentSource ? (
            <AgentChildReturn
              title={
                directory.sessions[activeTab.agentSource.parentSessionId]?.title ??
                tabCopy.unknownSession(activeTab.agentSource.parentSessionId)
              }
              labels={copy.agents}
              busy={agentReturn.busy}
              error={agentReturn.error}
              onReturn={() => {
                if (agentReturn.busy) return
                const childSessionId = activeTab.sessionId
                setAgentReturn({ busy: true, error: null })
                void runtime.commands
                  .execute('agentChild.return', {
                    childSessionId,
                    childTabInstanceKey: activeTab.instanceKey,
                  })
                  .then(() => {
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
                        ?.focus({ preventScroll: true }),
                    )
                  })
                  .catch((reason: unknown) => {
                    const currentTabs = runtime.state.workspaceTabs.getSnapshot()
                    if (
                      currentTabs.activeId !== childSessionId ||
                      currentTabs.items.find((item) => item.id === childSessionId)?.instanceKey !==
                        activeTab.instanceKey
                    )
                      return
                    setAgentReturn({ busy: false, error: errorCode(reason) })
                  })
              }}
            />
          ) : undefined
        }
      />
    )
  return <LumenWorkbenchNotice title={copy.empty.title} description={copy.empty.description} />
}

function WorkspaceTool({
  locale,
  connected,
  canExpand,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly canExpand: boolean
}) {
  const copy = getShellCopy(locale)
  const tabCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
  const runtime = useHbarRuntime()
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const [expandError, setExpandError] = useState<string | null>(null)
  const expanding = useRef(false)
  const instanceId = presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  if (!instanceId || !panel) return null
  const targetLabel =
    panel.panelId === 'files' && panel.workspaceId
      ? (directory.workspaces[panel.workspaceId]?.name ?? panel.workspaceId)
      : panel.sessionId
        ? (directory.sessions[panel.sessionId]?.title ?? panel.sessionId)
        : panel.workspaceId
          ? (directory.workspaces[panel.workspaceId]?.name ?? panel.workspaceId)
          : undefined
  if (panel.panelId === 'files')
    return (
      <HbarFileWorkspace
        labels={copy.files}
        connected={connected}
        instanceId={instanceId}
        targetLabel={targetLabel}
        actionError={expandError ? tabCopy.error(expandError) : null}
        onExpand={
          canExpand && panel.workspaceId
            ? () => {
                if (expanding.current || !panel.workspaceId) return
                expanding.current = true
                setExpandError(null)
                const originalBinding = panel.binding
                void (async () => {
                  try {
                    if (originalBinding !== 'pinned')
                      await runtime.commands.execute('app.openPanel', {
                        panelId: 'files',
                        instanceId,
                        workspaceId: panel.workspaceId!,
                        ...(panel.sessionId ? { sessionId: panel.sessionId } : {}),
                        binding: 'pinned',
                      })
                    await runtime.commands.execute('workspaceTabs.openWorkbench', {
                      panelInstanceId: instanceId,
                      sourceSessionId: panel.sessionId,
                      workspaceId: panel.workspaceId!,
                    })
                  } catch (reason) {
                    if (originalBinding === 'followActive')
                      await runtime.commands
                        .execute('app.openPanel', { panelId: 'files', instanceId, binding: 'followActive' })
                        .catch(() => undefined)
                    setExpandError(errorCode(reason))
                  } finally {
                    expanding.current = false
                  }
                })()
              }
            : undefined
        }
      />
    )
  if (panel.panelId === 'monitoring')
    return <HbarSessionMonitoring labels={copy.monitoring} instanceId={instanceId} targetLabel={targetLabel} />
  if (panel.panelId === 'agents')
    return (
      <HbarAgentWorkspace
        labels={copy.agents}
        connected={connected}
        instanceId={instanceId}
        targetLabel={targetLabel}
      />
    )
  if (panel.panelId === 'goals')
    return (
      <HbarGoalPlanWorkspace
        labels={copy.goals}
        connected={connected}
        instanceId={instanceId}
        targetLabel={targetLabel}
      />
    )
  return null
}

function WorkspaceModal({ locale, connected }: { readonly locale: ShellLocale; readonly connected: boolean }) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const commandSearch = useRef<HTMLInputElement>(null)
  const modalInstanceId = presentation.modalInstanceId
  const modal = modalInstanceId ? surfaces.panels[modalInstanceId] : undefined
  const close = (instanceId: string) => {
    void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  if (modalInstanceId && modal?.panelId === 'commands')
    return (
      <LumenDialog
        open
        chromeless
        title={copy.commandPalette.title}
        closeLabel={copy.commandPalette.close}
        className="hbar-app-react-workspace-modal hbar-app-react-command-modal"
        initialFocus={commandSearch}
        onClose={() => {
          if (runtime.state.commandPalette.getSnapshot().view !== 'search') {
            void runtime.commands.execute('commandPalette.back', {}).catch(() => {})
            return
          }
          close(modalInstanceId)
        }}
      >
        <HbarCommandPalette labels={copy.commandPalette} connected={connected} searchRef={commandSearch} />
      </LumenDialog>
    )
  if (modalInstanceId && modal?.panelId === 'settings-editor') {
    return (
      <HbarProviderDialog
        key={modalInstanceId}
        labels={copy.providers.dialog}
        connected={connected}
        modalClassName="hbar-app-react-workspace-modal hbar-app-react-provider-modal"
      />
    )
  }
  return null
}

function NativeWindowTitlebar({
  context,
  labels,
  title,
}: {
  readonly context: HbarNativeWindowContext
  readonly labels: {
    readonly minimize: string
    readonly maximize: string
    readonly restore: string
    readonly close: string
  }
  readonly title: string
}) {
  const nativeWindow = useMemo(() => getCurrentWindow(), [])
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let active = true
    let unlisten: (() => void) | undefined
    const syncMaximized = () => {
      void nativeWindow
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value)
        })
        .catch(() => undefined)
    }
    syncMaximized()
    void nativeWindow
      .onResized(syncMaximized)
      .then((dispose) => {
        if (active) unlisten = dispose
        else dispose()
      })
      .catch(() => undefined)
    return () => {
      active = false
      unlisten?.()
    }
  }, [nativeWindow])

  return (
    <LumenWindowTitlebar
      title={title}
      platform={context.platform}
      labels={labels}
      maximized={maximized}
      onMinimize={() => void nativeWindow.minimize().catch(() => undefined)}
      onToggleMaximize={() => void nativeWindow.toggleMaximize().catch(() => undefined)}
      onClose={() => void nativeWindow.close().catch(() => undefined)}
    />
  )
}

export default function App({
  locale,
  nativeConnection,
  nativeWindow,
}: {
  readonly locale: ShellLocale
  readonly nativeConnection?: HbarNativeConnection | undefined
  readonly nativeWindow?: HbarNativeWindowContext | undefined
}) {
  const copy = getShellCopy(locale)
  const clientUrl = nativeConnection?.url ?? window.location.origin
  const clientToken = nativeConnection?.token
  const client = useMemo(() => new HbarClient(clientUrl, clientToken), [clientToken, clientUrl])
  const attachmentController = useMemo(() => createBrowserAttachmentController(client), [client])
  const resourcePicker = useMemo(() => createBrowserResourcePicker(client), [client])
  const composerFiles = useMemo(() => createFileCommandClient(client), [client])
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [hostId, setHostId] = useState(() => `pending:${clientUrl}`)
  const [bootstrapTheme, setBootstrapTheme] = useState(() => readThemeBootstrap(window.localStorage))
  const [bootstrapAppearance, setBootstrapAppearance] = useState(() => readAppearanceBootstrap(window.localStorage))
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const runtime = useMemo(
    () => createRuntime(client, hostId, locale, attachmentController.commands, resourcePicker),
    [attachmentController, client, hostId, locale, resourcePicker],
  )
  const layout = useHbarRuntimeState(runtime.view.state.layout)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const preferences = useHbarRuntimeState(runtime.view.state.preferences)
  const appearanceEditor = useMemo(() => createAppearanceEditorForRuntime(runtime), [runtime])
  useEffect(() => appearanceEditor.sync(preferences), [appearanceEditor, preferences])
  const persistedTheme = readThemePreference(preferences.values.theme) ?? 'system'
  const preferencesAvailable = preferences.status === 'ready' && !preferences.restoreError
  const themePreference = preferencesAvailable ? persistedTheme : bootstrapTheme
  const resolvedTheme = resolveWebTheme(themePreference, systemPrefersDark)
  const persistedAppearance = useMemo(() => resolveWebAppearanceDimensions(preferences.values), [preferences.values])
  const appearance = preferencesAvailable ? persistedAppearance : bootstrapAppearance
  const lumenAppearance = useMemo(
    () => createWebLumenAppearance(resolvedTheme, appearance, !systemPrefersReducedMotion),
    [appearance, resolvedTheme, systemPrefersReducedMotion],
  )
  const resolvedLayout = useMemo(() => normalizeShellLayout(layout.description), [layout.description])
  const sidebarLayout = shellLayoutModule(resolvedLayout, 'projects')
  const toolLayout = shellLayoutModule(resolvedLayout, 'session-tool')
  const workspaceLayout = shellLayoutModule(resolvedLayout, 'workspace')

  useEffect(() => {
    if (layout.status === 'ready' && !sidebarLayout.visible)
      void runtime.view.commands.execute('app.setSidebarVisible', { visible: false }).catch(() => undefined)
  }, [layout.revision, layout.source, layout.status, runtime.view.commands, sidebarLayout.visible])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemPrefersDark(event.matches)
    update(media)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (event: MediaQueryListEvent | MediaQueryList) => setSystemPrefersReducedMotion(event.matches)
    update(media)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    applyWebTheme(document.documentElement, resolvedTheme)
    applyLumenAppearance(document.documentElement, lumenAppearance)
    if (preferencesAvailable) {
      writeThemeBootstrap(window.localStorage, themePreference)
      writeAppearanceBootstrap(window.localStorage, appearance)
    }
  }, [appearance, lumenAppearance, preferencesAvailable, resolvedTheme, themePreference])

  useEffect(() => {
    if (preferencesAvailable && persistedTheme !== bootstrapTheme) setBootstrapTheme(persistedTheme)
  }, [bootstrapTheme, persistedTheme, preferencesAvailable])

  useEffect(() => {
    if (preferencesAvailable && !sameWebAppearanceDimensions(bootstrapAppearance, persistedAppearance))
      setBootstrapAppearance(persistedAppearance)
  }, [bootstrapAppearance, persistedAppearance, preferencesAvailable])

  useEffect(() => {
    const offStatus = client.onStatus(setConnection)
    void client
      .connect()
      .then((host) => setHostId(host.instanceId))
      .catch(() => {
        const status = client.connectionStatus()
        if (status === 'pairing') setConnection(status)
        else {
          client.disconnect()
          setConnection('disconnected')
        }
      })
    return () => {
      offStatus()
      attachmentController.dispose()
      resourcePicker.dispose()
      client.disconnect()
    }
  }, [attachmentController, client, resourcePicker])

  useEffect(() => () => runtime.dispose(), [runtime])

  const reconnect = () => {
    void createConnectionCommands(client)
      .execute('connection.connect', {})
      .then((result) => {
        if (result.host) setHostId(result.host.instanceId)
      })
      .catch(() => {
        const status = client.connectionStatus()
        if (status === 'pairing') setConnection(status)
        else {
          client.disconnect()
          setConnection('disconnected')
        }
      })
  }

  return (
    <LumenProvider appearance={lumenAppearance}>
      <HbarRuntimeProvider view={runtime.view}>
        <WorkbenchSurfaceCleanup key={hostId} runtime={runtime} />
        <HbarWorkspaceShell
          labels={copy.shell}
          titlebar={
            nativeWindow ? (
              <NativeWindowTitlebar context={nativeWindow} labels={copy.windowControls} title={copy.shell.brand} />
            ) : undefined
          }
          sidebarWidthRem={sidebarLayout.size.preferredRem}
          toolWidthRem={toolLayout.size.preferredRem}
          connection={connection}
          onReconnect={reconnect}
          toolLabel={copy.session.tools.label}
          tool={
            presentation.toolInstanceId &&
            !tabs.items.some(
              (item) => item.kind === 'workbench' && item.panelInstanceId === presentation.toolInstanceId,
            ) ? (
              <WorkspaceTool
                locale={locale}
                connected={connection === 'connected'}
                canExpand={workspaceLayout.config.tabs.visible}
              />
            ) : undefined
          }
          overlay={<WorkspaceModal locale={locale} connected={connection === 'connected'} />}
        >
          {workspaceLayout.config.tabs.visible && workspaceLayout.config.tabs.placement === 'before-content' ? (
            <WorkspaceTabsController runtime={runtime} client={client} locale={locale}>
              <WorkspaceBody
                appRuntime={runtime}
                appearanceEditor={appearanceEditor}
                locale={locale}
                connected={connection === 'connected'}
                prepareAttachment={attachmentController.prepare}
                files={composerFiles}
                systemPrefersDark={systemPrefersDark}
              />
            </WorkspaceTabsController>
          ) : (
            <WorkspaceBody
              appRuntime={runtime}
              appearanceEditor={appearanceEditor}
              locale={locale}
              connected={connection === 'connected'}
              prepareAttachment={attachmentController.prepare}
              files={composerFiles}
              systemPrefersDark={systemPrefersDark}
            />
          )}
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
