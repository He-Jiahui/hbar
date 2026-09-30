import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  HbarAgentWorkspace,
  HbarCommandPalette,
  HbarChatSearchView,
  HbarExtensionWorkspace,
  HbarFileWorkspace,
  HbarGoalPlanWorkspace,
  HbarProviderDialog,
  HbarProviderSettings,
  HbarRuntimeProvider,
  HbarSessionMonitoring,
  HbarSessionActivityWorkspace,
  HbarSessionWorkspace,
  HbarSettingsWorkspace,
  HbarSettingsUsage,
  HbarStatusWorkspace,
  HbarSystemDiagnostics,
  HbarWorkspaceShell,
  useHbarRuntime,
  useHbarRuntimeState,
} from '@hbar/app-react'
import { createAppRuntime, workspaceDisplayName } from '@hbar/app-runtime'
import type { GlobalSettingsStartup } from '@hbar/app-runtime'
import { useStore } from 'zustand'
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
  createSessionLaunchTargetReader,
  createSessionLaunchTargetPreparationManager,
  createSessionLaunchBranchesReader,
  createSessionSearchCommandClient,
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
import { WebGeneralSettings } from './GeneralSettings'
import { WebPreSessionLanding } from './PreSessionLanding'
import { preSessionLaunchCopy } from './pre-session-launch-copy'
import type { WebLanguageController } from './language'
import type { WebZoomController } from './app-zoom'
import { createWebSendBehaviorController, type WebSendBehaviorController } from './send-behavior'
import { createHostSendBehaviorPort } from './send-behavior-settings'
import { createWebRuntimeCopy, type WebRuntimeCopyPort } from './runtime-copy'
import { createBrowserImageResources } from './browser-image-resources'
import { sessionImageCopy } from './session-image-copy'
import type { HbarSessionImagesOptions } from '@hbar/app-react'
import {
  createWebLumenAppearance,
  readAppearanceBootstrap,
  resetWebAppearancePreferences,
  resolveWebAppearanceDimensions,
  sameWebAppearanceDimensions,
  saveWebAppearancePreferences,
  writeAppearanceBootstrap,
} from './appearance'
import type { AppearanceEditor, AppearanceEditorPort } from './appearance-editor'
import { createWebStartupRuntime } from './startup-runtime'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { SettingsPageFocusBoundary } from './SettingsPageFocusBoundary'
import { WEB_SETTINGS_GROUP_PRESENTATION } from './settings-group-presentation'
import { WorkspaceTabsController } from './WorkspaceTabsController'
import { workspaceTabsCopy } from './workspace-tabs-copy'
import { sessionContextCopy } from './session-context-copy'
import { chatSearchCopy, chatSearchErrorCopy } from './chat-search-copy'
import { createWebChatSearchController, type WebChatSearchController } from './chat-search-controller'
import { createHostChatSearchPort } from './chat-search-port'
import { createSessionToolPresenter } from './session-tool-presentation'
import { normalizeShellLayout, shellLayout, shellLayoutModule } from './shell-layout'
import { useSidebarLayout, useToolPaneLayout } from './tool-pane-layout'
import { ToolPaneLayoutFeedback } from './ToolPaneLayoutFeedback'
import { createBrowserClientPersistence } from './client-persistence'
import { createBrowserClientExport } from './client-export'
import { canRenderWebSurface } from './surface-manifest'
import type { HbarNativeConnection } from './native-connection'
import type { HbarNativeWindowContext } from './native-window'
import { applyWebTheme, readThemeBootstrap, readThemePreference, resolveWebTheme, writeThemeBootstrap } from './theme'
import './App.css'

const lastGlobalSettingsGroupKey = 'hbar:web:last-global-settings-group'
const knownSettingsGroup = (value: string | null): value is string =>
  value !== null && WEB_SETTINGS_GROUP_PRESENTATION.some((group) => group.id === value)
const settingsLanding = {
  globalGroupId: 'providers',
  isKnownGlobalGroup: knownSettingsGroup,
  readLastGlobalGroup: () => {
    try {
      const value = window.localStorage.getItem(lastGlobalSettingsGroupKey)
      return knownSettingsGroup(value) ? value : null
    } catch {
      return null
    }
  },
  saveLastGlobalGroup: (groupId: string) => {
    if (!knownSettingsGroup(groupId)) return
    try {
      window.localStorage.setItem(lastGlobalSettingsGroupKey, groupId)
    } catch {
      // A disabled storage backend does not make the Settings entry unusable.
    }
  },
}

function createRuntime(
  client: HbarClient,
  hostId: string | null,
  copy: WebRuntimeCopyPort,
  attachments: ReturnType<typeof createBrowserAttachmentController>['commands'],
  resourcePicker: ReturnType<typeof createBrowserResourcePicker>,
  initialGlobalSettings?: GlobalSettingsStartup,
) {
  const goals = createGoalPlanCommandClient(client)
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: hostId ?? 'pending:identity',
    initialGlobalSettings,
    directory: createDirectoryQueryAdapter(client),
    workspaces: createWorkspaceSessionCommandClient(client),
    ...(hostId === null
      ? {}
      : {
          workspaceOrganization: {
            commands: createWorkspaceSessionCommandClient(client),
            events: {
              subscribe(listener: () => void) {
                const off = client.onEvent((event) => {
                  if (
                    event.method === 'host.changed' &&
                    ['workspace-organization', 'resync'].includes(event.params.kind)
                  )
                    listener()
                })
                const onVisible = () => {
                  if (document.visibilityState === 'visible') listener()
                }
                document.addEventListener('visibilitychange', onVisible)
                return () => {
                  off()
                  document.removeEventListener('visibilitychange', onVisible)
                }
              },
              onConnection(listener: (connected: boolean) => void) {
                return client.onStatus((status) => listener(status === 'connected'))
              },
            },
          },
          workspaceDisplayNames: {
            commands: createWorkspaceSessionCommandClient(client),
            events: {
              subscribe(listener: () => void) {
                const off = client.onEvent((event) => {
                  if (
                    event.method === 'host.changed' &&
                    ['workspace-display-names', 'resync'].includes(event.params.kind)
                  )
                    listener()
                })
                const onVisible = () => {
                  if (document.visibilityState === 'visible') listener()
                }
                document.addEventListener('visibilitychange', onVisible)
                return () => {
                  off()
                  document.removeEventListener('visibilitychange', onVisible)
                }
              },
              onConnection(listener: (connected: boolean) => void) {
                const off = client.onStatus((status) => listener(status === 'connected'))
                listener(client.connectionStatus() === 'connected')
                return off
              },
            },
          },
        }),
    timeline: createSessionTimelineClient(client),
    run: createRunCommandClient(client),
    attachments,
    resourcePicker,
    interactions: createInteractionCommandClient(client),
    interactionRecovery: createInteractionRecoveryClient(client),
    models: createModelCommandClient(client),
    modelEvents: {
      subscribe(listener) {
        return client.onEvent((event) => {
          if (event.method === 'host.changed' && ['models', 'resync'].includes(event.params.kind)) listener()
        })
      },
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
    usage: createUsageCommandClient(client),
    budget: createBudgetCommandClient(client),
    settings: createSettingsCommandClient(client),
    permissionEvents: {
      subscribe(listener) {
        return client.onEvent((event) => {
          if (event.method === 'host.changed' && ['settings', 'permissions', 'resync'].includes(event.params.kind))
            listener()
        })
      },
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
    settingsLanding,
    configuration: createConfigurationCommandClient(client),
    planMode: createConfigurationCommandClient(client),
    planModeEvents: {
      subscribe(listener) {
        return client.onEvent((event) => {
          if (event.method === 'mode.changed') listener(event.params.sessionId)
        })
      },
      onConnection(listener) {
        return client.onStatus((status) => listener(status === 'connected'))
      },
    },
    files: createFileCommandClient(client),
    sessionLaunchTargets: createSessionLaunchTargetReader(client),
    sessionLaunchTargetPreparation: createSessionLaunchTargetPreparationManager(client),
    sessionLaunchBranches: createSessionLaunchBranchesReader(client),
    agents: createAgentCommandClient(client),
    goals,
    goalEvents: {
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
    goalHistory: goals,
    planProposal: copy.planProposal,
    workflows: createWorkflowCommandClient(client),
    extensions: createExtensionCommandClient(client),
    system: createSystemCommandClient(client),
    metrics: createMetricsCommandClient(client),
    git: createGitCommandClient(client),
    commandCatalog: createCommandCatalogClient(client),
    commandText: copy.commandText,
    schemaContent: createSchemaCallbackClient(client),
    surfaces: { canRender: canRenderWebSurface },
    defaultLayout: shellLayout,
    layoutDescription: { normalize: normalizeShellLayout },
    ...(hostId === null ? {} : { persistence: createBrowserClientPersistence(window.localStorage, 'hbar:web') }),
    exporter: createBrowserClientExport(),
  })
}

function createAppearancePortForRuntime(runtime: ReturnType<typeof createAppRuntime>): AppearanceEditorPort {
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
  return {
    save: (target, expectedRevision) =>
      saveWebAppearancePreferences(mutations, current(expectedRevision).values, target, expectedRevision),
    reset: (expectedRevision) =>
      resetWebAppearancePreferences(mutations, current(expectedRevision).values, expectedRevision),
    refresh: runtime.clientPreferences.refresh,
  }
}

type WorkspaceBodyProps = {
  readonly appRuntime: ReturnType<typeof createAppRuntime>
  readonly appearanceEditor: AppearanceEditor
  readonly locale: ShellLocale
  readonly language?: WebLanguageController | undefined
  readonly sendBehavior: WebSendBehaviorController
  readonly zoom: WebZoomController
  readonly nativeDesktop: boolean
  readonly connected: boolean
  readonly prepareAttachment: (file: File) => Promise<BrowserAttachmentSelection>
  readonly images: HbarSessionImagesOptions
  readonly files: ReturnType<typeof createFileCommandClient>
  readonly systemPrefersDark: boolean
  readonly showSessionFilesInHeader: boolean
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

/** Generic expanded views release their surface; session tools keep the owner's cached surface on return. */
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
      if (!panel.sessionTool && !current.has(instanceId) && surfaces.panels[instanceId] === panel)
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
          : ((navigation.sessionId ? directory.sessions[navigation.sessionId]?.title : null) ??
            copy.preSession.hero.title)
  return (
    <SettingsPageFocusBoundary
      pageKind={presentation.page.kind}
      sidebarOpen={presentation.sidebarOpen}
      label={label}
      workbench={presentation.page.kind === 'session' && activeTab?.kind === 'workbench'}
      viewKey={JSON.stringify([activeTab?.id, activeTab?.instanceKey])}
      toolInstanceId={presentation.toolInstanceId}
    >
      <WorkspaceBodyContent {...props} />
    </SettingsPageFocusBoundary>
  )
}

function WorkspaceBodyContent({
  appRuntime,
  appearanceEditor,
  locale,
  language,
  sendBehavior,
  zoom,
  nativeDesktop,
  connected,
  prepareAttachment,
  images,
  files,
  systemPrefersDark,
  showSessionFilesInHeader,
}: WorkspaceBodyProps) {
  const copy = getShellCopy(locale)
  const selectedSendBehavior = useStore(sendBehavior.store, (state) => state.behavior)
  const tabCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const tabs = useHbarRuntimeState(runtime.state.workspaceTabs)
  const extensionCommandTrigger = useRef<HTMLButtonElement>(null)
  const commandReturn = useRef<{
    readonly opener: HTMLButtonElement
    readonly settingsInstanceId: string
    opened: boolean
  } | null>(null)
  const commandReturnFrame = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (commandReturnFrame.current !== null) cancelAnimationFrame(commandReturnFrame.current)
      commandReturnFrame.current = null
      commandReturn.current = null
    },
    [runtime],
  )
  useLayoutEffect(() => {
    const lease = commandReturn.current
    if (!lease) return
    if (presentation.page.kind !== 'settings' || presentation.page.instanceId !== lease.settingsInstanceId) {
      commandReturn.current = null
      return
    }
    if (presentation.modalInstanceId === 'commands') {
      lease.opened = true
      return
    }
    if (presentation.modalInstanceId !== null) {
      commandReturn.current = null
      return
    }
    if (!lease.opened) return
    commandReturn.current = null
    // Native dialog teardown may reset focus after layout effects. The Settings
    // group can remount on Host updates, so the ref tracks its semantic replacement.
    commandReturnFrame.current = requestAnimationFrame(() => {
      commandReturnFrame.current = null
      const current = runtime.state.presentation.getSnapshot()
      if (
        current.page.kind !== 'settings' ||
        current.page.instanceId !== lease.settingsInstanceId ||
        current.modalInstanceId !== null ||
        document.querySelector('dialog:modal')
      )
        return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active.isConnected &&
        active.getClientRects().length
      )
        return
      if (lease.opener.disabled) return
      const opener = lease.opener.isConnected ? lease.opener : extensionCommandTrigger.current
      if (
        opener?.isConnected &&
        !opener.disabled &&
        opener.getClientRects().length &&
        getComputedStyle(opener).visibility !== 'hidden' &&
        !opener.closest('[hidden], [inert], [aria-hidden="true"]')
      )
        opener.focus({ preventScroll: true })
    })
  }, [presentation.modalInstanceId, presentation.page, runtime])
  const captureCommandReturn = (opener: HTMLButtonElement) => {
    const current = runtime.state.presentation.getSnapshot()
    if (current.page.kind !== 'settings' || current.modalInstanceId !== null) return () => {}
    if (commandReturnFrame.current !== null) cancelAnimationFrame(commandReturnFrame.current)
    commandReturnFrame.current = null
    const lease = { opener, settingsInstanceId: current.page.instanceId, opened: false }
    commandReturn.current = lease
    return () => {
      if (commandReturn.current === lease) commandReturn.current = null
    }
  }
  const [workbenchError, setWorkbenchError] = useState<string | null>(null)
  const [agentReturn, setAgentReturn] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  })
  const landingDraftId = useRef<string | null>(null)
  const firstSendDrafts = useHbarRuntimeState(runtime.state.preSessionDrafts)
  useEffect(() => {
    for (const draft of Object.values(firstSendDrafts)) {
      if (draft.phase === 'accepted')
        void runtime.commands.execute('preSessionDraft.close', { draftId: draft.draftId }).catch(() => undefined)
    }
  }, [firstSendDrafts, runtime])
  const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
  useEffect(() => setAgentReturn({ busy: false, error: null }), [activeTab?.id, activeTab?.instanceKey])
  useEffect(() => setWorkbenchError(null), [activeTab?.id, activeTab?.instanceKey])
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  const sessionWorkspace = session ? directory.workspaces[session.workspaceId] : undefined
  useEffect(() => {
    if (!session || !landingDraftId.current) return
    const draftId = landingDraftId.current
    landingDraftId.current = null
    const firstSend = runtime.state.preSessionDrafts.getSnapshot()[draftId]
    if (firstSend?.sessionId === session.id && firstSend.phase !== 'accepted') return
    void runtime.commands.execute('preSessionDraft.close', { draftId }).catch(() => undefined)
  }, [runtime, session])
  if (presentation.page.kind === 'status')
    return <HbarStatusWorkspace labels={copy.status} instanceId={presentation.page.instanceId} />
  if (presentation.page.kind === 'settings')
    return (
      <HbarSettingsWorkspace
        labels={copy.settings}
        connected={connected}
        groupPresentation={WEB_SETTINGS_GROUP_PRESENTATION}
        pendingGroups={[
          { id: 'providers', label: copy.settings.resolve('i18n:settings.groups.providers'), order: 0 },
          { id: 'model', label: copy.settings.resolve('i18n:settings.groups.model'), order: 20 },
          { id: 'session', label: copy.settings.resolve('i18n:settings.groups.session'), order: 30 },
          { id: 'extensions', label: copy.settings.resolve('i18n:settings.groups.extensions'), order: 40 },
        ]}
        additionalGroups={[
          ...(language ? [{ id: 'general', label: copy.general.group, order: 5 }] : []),
          { id: 'appearance', label: copy.appearance.group, order: 0 },
          { id: 'skills', label: copy.settings.resolve('i18n:settings.groups.skills'), order: 39 },
          { id: 'usage', label: copy.settingsUsage.title, order: 85 },
          { id: 'diagnostics', label: copy.diagnostics.title, order: 90 },
        ]}
        renderGroup={(groupId) => {
          if (groupId === 'general' && language)
            return (
              <WebGeneralSettings
                labels={copy.general}
                language={language}
                sendBehavior={sendBehavior}
                zoom={zoom}
                nativeZoom={nativeDesktop}
                connected={connected}
              />
            )
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
          if ((groupId === 'extensions' || groupId === 'skills') && presentation.page.kind === 'settings')
            return (
              <HbarExtensionWorkspace
                collection={groupId === 'skills' ? 'skills' : 'plugins'}
                labels={copy.extensions}
                connected={connected}
                instanceId={presentation.page.instanceId}
                onCommandPaletteOpen={captureCommandReturn}
                commandPaletteTriggerRef={extensionCommandTrigger}
              />
            )
          if (groupId === 'usage' && presentation.page.kind === 'settings')
            return (
              <HbarSettingsUsage
                labels={copy.settingsUsage}
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
    const workspace = directory.workspaces[activeTab.workspaceId]
    const targetLabel = workspace ? workspaceDisplayName(workspace, displayNames) : activeTab.workspaceId
    const reportWorkbenchError = (reason: unknown) => {
      const current = runtime.state.workspaceTabs.getSnapshot()
      if (
        current.activeId === activeTab.id &&
        current.items.some((item) => item.id === activeTab.id && item.instanceKey === activeTab.instanceKey)
      )
        setWorkbenchError(errorCode(reason))
    }
    const close = () => {
      setWorkbenchError(null)
      const captured = appRuntime.workspaceTabs.capture([activeTab.id])
      void appRuntime.workspaceTabs.closeCaptured(captured, new AbortController().signal).catch(reportWorkbenchError)
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
            .catch(reportWorkbenchError)
        }}
        onCloseWorkbench={close}
      />
    )
  }
  if (session)
    return (
      <HbarSessionWorkspace
        sessionTitle={session.title}
        workspaceName={sessionWorkspace ? workspaceDisplayName(sessionWorkspace, displayNames) : session.workspaceId}
        workspacePath={sessionWorkspace?.path}
        sessionWorkspaceId={session.workspaceId}
        projectContextLabels={sessionContextCopy(locale)}
        firstSendLabels={preSessionLaunchCopy(locale).status}
        labels={copy.session}
        describeTool={createSessionToolPresenter(locale)}
        sendBehavior={selectedSendBehavior}
        connected={connected}
        prepareAttachment={prepareAttachment}
        images={images}
        files={files}
        showFilesInHeader={showSessionFilesInHeader}
        modelMenuPresentation={nativeDesktop ? 'native' : 'web'}
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
  if (!landingDraftId.current) landingDraftId.current = crypto.randomUUID()
  return (
    <WebPreSessionLanding
      draftId={landingDraftId.current}
      locale={locale}
      connected={connected}
      sendBehavior={selectedSendBehavior}
    />
  )
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
  const displayNames = useHbarRuntimeState(runtime.state.workspaceDisplayNameSnapshot)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const [expandError, setExpandError] = useState<string | null>(null)
  const expanding = useRef(false)
  const instanceId = presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  useEffect(() => setExpandError(null), [instanceId, panel?.workspaceId, panel?.sessionId, panel?.panelId])
  if (!instanceId || !panel) return null
  const workspace = panel.workspaceId ? directory.workspaces[panel.workspaceId] : undefined
  const workspaceLabel = workspace ? workspaceDisplayName(workspace, displayNames) : (panel.workspaceId ?? undefined)
  const targetLabel =
    panel.panelId === 'files' && panel.workspaceId
      ? workspaceLabel
      : panel.sessionId
        ? (directory.sessions[panel.sessionId]?.title ?? panel.sessionId)
        : panel.workspaceId
          ? workspaceLabel
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
                const workspaceId = panel.workspaceId
                const navigation = runtime.state.navigation.getSnapshot()
                const tabs = runtime.state.workspaceTabs.getSnapshot()
                const activeTab = tabs.items.find((item) => item.id === tabs.activeId)
                let ownedPanel = panel
                const ownsExpansion = () => {
                  const currentNavigation = runtime.state.navigation.getSnapshot()
                  const currentTabs = runtime.state.workspaceTabs.getSnapshot()
                  return (
                    runtime.state.presentation.getSnapshot().page.kind === 'session' &&
                    runtime.state.presentation.getSnapshot().toolInstanceId === instanceId &&
                    runtime.state.surfaces.getSnapshot().panels[instanceId] === ownedPanel &&
                    currentNavigation.workspaceId === navigation.workspaceId &&
                    currentNavigation.sessionId === navigation.sessionId &&
                    currentTabs.activeId === tabs.activeId &&
                    currentTabs.items.find((item) => item.id === currentTabs.activeId)?.instanceKey ===
                      activeTab?.instanceKey
                  )
                }
                void (async () => {
                  try {
                    if (originalBinding !== 'pinned') {
                      const pin = runtime.commands.execute('app.openPanel', {
                        panelId: 'files',
                        instanceId,
                        workspaceId,
                        ...(panel.sessionId ? { sessionId: panel.sessionId } : {}),
                        binding: 'pinned',
                      })
                      // openPanel publishes synchronously; remember that exact instance
                      // before yielding, so a later context cannot become this owner.
                      ownedPanel = runtime.state.surfaces.getSnapshot().panels[instanceId] ?? panel
                      await pin
                    }
                    if (!ownsExpansion()) return
                    await runtime.commands.execute('workspaceTabs.openWorkbench', {
                      panelInstanceId: instanceId,
                      sourceSessionId: panel.sessionId,
                      workspaceId,
                    })
                  } catch (reason) {
                    if (!ownsExpansion()) return
                    if (originalBinding === 'followActive') {
                      const restore = runtime.commands.execute('app.openPanel', {
                        panelId: 'files',
                        instanceId,
                        workspaceId,
                        ...(panel.sessionId ? { sessionId: panel.sessionId } : {}),
                        binding: 'followActive',
                      })
                      ownedPanel = runtime.state.surfaces.getSnapshot().panels[instanceId] ?? ownedPanel
                      await restore.catch(() => undefined)
                    }
                    if (ownsExpansion()) setExpandError(errorCode(reason))
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
  if (panel.panelId === 'activity')
    return (
      <HbarSessionActivityWorkspace
        labels={copy.activity}
        connected={connected}
        instanceId={instanceId}
        targetLabel={targetLabel}
      />
    )
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

function WorkspaceModal({
  locale,
  connected,
  chatSearch,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly chatSearch: WebChatSearchController
}) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const commandSearch = useRef<HTMLInputElement>(null)
  const chatSearchInput = useRef<HTMLInputElement>(null)
  const chatSearchState = useStore(chatSearch.store)
  const modalInstanceId = presentation.modalInstanceId
  const modal = modalInstanceId ? surfaces.panels[modalInstanceId] : undefined
  const searchOpen = Boolean(modalInstanceId && modal?.panelId === 'chat-search')
  useEffect(() => {
    if (searchOpen) chatSearch.open()
    else chatSearch.close()
    return () => chatSearch.close()
  }, [chatSearch, searchOpen])
  const close = (instanceId: string) => {
    void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  if (modalInstanceId && searchOpen) {
    const labels = chatSearchCopy(locale)
    const selectedInstanceId = modalInstanceId
    return (
      <LumenDialog
        open
        chromeless
        appearance="panel"
        title={labels.search}
        closeLabel={labels.close}
        className="hbar-app-react-workspace-modal hbar-app-react-chat-search-dialog"
        initialFocus={chatSearchInput}
        onClose={() => close(selectedInstanceId)}
      >
        <HbarChatSearchView
          inputRef={chatSearchInput}
          query={chatSearchState.query}
          status={chatSearchState.status === 'closed' ? 'loading' : chatSearchState.status}
          rows={chatSearchState.rows}
          selectedSessionId={chatSearchState.selectedSessionId}
          truncated={chatSearchState.truncated}
          error={chatSearchState.error ? chatSearchErrorCopy(locale, chatSearchState.error) : null}
          openingSessionId={chatSearchState.openingSessionId}
          openError={
            chatSearchState.openError
              ? {
                  sessionId: chatSearchState.openError.sessionId,
                  message: chatSearchErrorCopy(locale, chatSearchState.openError.message),
                }
              : null
          }
          labels={labels}
          onQueryChange={chatSearch.setQuery}
          onMove={chatSearch.move}
          onSelect={chatSearch.select}
          onOpen={(sessionId, workspaceId) => {
            void chatSearch
              .openRow(sessionId, workspaceId, async (row) => {
                await runtime.commands.execute('app.setSession', {
                  sessionId: row.sessionId,
                  workspaceId: row.workspaceId,
                })
                // A global hit may belong to a hidden project. Reveal it only after the
                // exact session navigation succeeds; reveal failure does not undo the tab.
                void runtime.commands
                  .execute('workspaceSidebar.reveal', { workspaceId: row.workspaceId })
                  .catch(() => undefined)
              })
              .then((opened) => {
                if (opened && runtime.state.presentation.getSnapshot().modalInstanceId === selectedInstanceId)
                  close(selectedInstanceId)
              })
          }}
          onClose={() => close(selectedInstanceId)}
          onCompositionStart={chatSearch.compositionStart}
          onCompositionEnd={chatSearch.compositionEnd}
          onRetry={chatSearch.retry}
        />
      </LumenDialog>
    )
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
  language,
  zoom,
  nativeConnection,
  nativeWindow,
}: {
  readonly locale: ShellLocale
  readonly language?: WebLanguageController | undefined
  readonly zoom: WebZoomController
  readonly nativeConnection?: HbarNativeConnection | undefined
  readonly nativeWindow?: HbarNativeWindowContext | undefined
}) {
  const copy = getShellCopy(locale)
  const localeRef = useRef(locale)
  const runtimeCopy = useMemo(() => createWebRuntimeCopy(() => localeRef.current), [])
  useLayoutEffect(() => {
    localeRef.current = locale
    document.documentElement.lang = locale
    runtimeCopy.refresh()
  }, [locale, runtimeCopy])
  const clientUrl = nativeConnection?.url ?? window.location.origin
  const clientToken = nativeConnection?.token
  const client = useMemo(() => new HbarClient(clientUrl, clientToken), [clientToken, clientUrl])
  const sendBehavior = useMemo(
    () => createWebSendBehaviorController(createHostSendBehaviorPort(createSettingsCommandClient(client))),
    [client],
  )
  const attachmentController = useMemo(() => createBrowserAttachmentController(client), [client])
  const resourcePicker = useMemo(() => createBrowserResourcePicker(client), [client])
  const composerFiles = useMemo(() => createFileCommandClient(client), [client])
  const chatSearch = useMemo(
    () => createWebChatSearchController(createHostChatSearchPort(createSessionSearchCommandClient(client))),
    [client],
  )
  const [bootstrapTheme, setBootstrapTheme] = useState(() => readThemeBootstrap(window.localStorage))
  const [bootstrapAppearance, setBootstrapAppearance] = useState(() => readAppearanceBootstrap(window.localStorage))
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const startup = useMemo(
    () =>
      createWebStartupRuntime({
        endpointId: clientUrl,
        isKnownSettingsGroup: knownSettingsGroup,
        bootstrap: () => {
          const dimensions = readAppearanceBootstrap(window.localStorage)
          return {
            status: 'ready',
            revision: 0,
            persisted: false,
            restoreError: null,
            values: {
              theme: readThemeBootstrap(window.localStorage),
              'appearance.controlSize': dimensions.controlSize,
              'appearance.textSize': dimensions.textSize,
              'appearance.cornerSize': dimensions.cornerSize,
            },
          }
        },
        createRuntime: (hostId, initialGlobalSettings) =>
          createRuntime(
            client,
            hostId,
            runtimeCopy,
            attachmentController.commands,
            resourcePicker,
            initialGlobalSettings,
          ),
        appearancePort: createAppearancePortForRuntime,
        disposeConnection: () => {
          attachmentController.dispose()
          resourcePicker.dispose()
          client.disconnect()
        },
      }),
    [attachmentController, client, clientUrl, runtimeCopy, resourcePicker],
  )
  const { runtime, appearanceEditor, binding, connection } = useStore(startup.store)
  useEffect(() => {
    sendBehavior.bind(binding.hostId, connection === 'connected')
  }, [binding.hostId, connection, sendBehavior])
  useEffect(() => {
    chatSearch.bind(binding.hostId, connection === 'connected')
  }, [binding.hostId, chatSearch, connection])
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void sendBehavior.refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [sendBehavior])
  // Allocation performs no I/O. Each runtime/Host generation owns a distinct resource adapter.
  const imageResources = useMemo(
    () => ({ port: createBrowserImageResources(client), references: 0, hostIdentity: runtime.view.hostId }),
    [client, runtime],
  )
  const images = useMemo<HbarSessionImagesOptions>(
    () => ({
      resources: imageResources.port,
      hostIdentity:
        connection === 'connected' && binding.hostId === imageResources.hostIdentity ? binding.hostId : null,
      labels: sessionImageCopy(locale),
    }),
    [imageResources, binding.hostId, connection, locale],
  )
  useEffect(() => {
    imageResources.references++
    const off = client.onStatus((status) => {
      if (status === 'pairing' || status === 'disconnected') imageResources.port.invalidate()
    })
    return () => {
      off()
      imageResources.references--
      imageResources.port.invalidate()
      // StrictMode's same-owner effect replay re-retains before this microtask.
      queueMicrotask(() => {
        if (imageResources.references === 0) imageResources.port.dispose()
      })
    }
  }, [client, imageResources])
  const layout = useHbarRuntimeState(runtime.view.state.layout)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const tabs = useHbarRuntimeState(runtime.view.state.workspaceTabs)
  const surfaces = useHbarRuntimeState(runtime.view.state.surfaces)
  const preferences = useHbarRuntimeState(runtime.view.state.preferences)
  const persistedTheme = readThemePreference(preferences.values.theme) ?? 'system'
  const preferencesAvailable = binding.hostId !== null && preferences.status === 'ready' && !preferences.restoreError
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
  const toolPanel = presentation.toolInstanceId ? surfaces.panels[presentation.toolInstanceId] : undefined
  const sidebarLayoutController = useSidebarLayout(runtime, binding.hostId ?? 'pending', preferencesAvailable, layout)
  const toolLayoutController = useToolPaneLayout(
    runtime,
    JSON.stringify([binding.hostId, presentation.toolInstanceId, toolPanel?.workspaceId, toolPanel?.sessionId]),
    preferencesAvailable,
    layout,
  )

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
    const release = startup.retain()
    let active = true
    const update = (status: ConnectionStatus) => {
      if (!active) return
      const host = client.connectionHost()
      if (status === 'connected' && (!host || !startup.confirmHost(host.instanceId))) {
        startup.setConnection('connecting')
        return
      }
      startup.setConnection(status)
    }
    const offStatus = client.onStatus(update)
    update(client.connectionStatus())
    void client
      .connect()
      .then(() => update(client.connectionStatus()))
      .catch(() => {
        if (!active) return
        const status = client.connectionStatus()
        if (status === 'pairing') startup.setConnection(status)
        else {
          client.disconnect()
          startup.setConnection('disconnected')
        }
      })
    return () => {
      active = false
      offStatus()
      release()
    }
  }, [client, startup])

  const reconnect = () => {
    void createConnectionCommands(client)
      .execute('connection.connect', {})
      .catch(() => {
        const status = client.connectionStatus()
        if (status === 'pairing') startup.setConnection(status)
        else {
          client.disconnect()
          startup.setConnection('disconnected')
        }
      })
  }

  return (
    <LumenProvider appearance={lumenAppearance}>
      <HbarRuntimeProvider view={runtime.view}>
        <WorkbenchSurfaceCleanup key={binding.hostId ?? 'pending'} runtime={runtime} />
        <HbarWorkspaceShell
          labels={copy.shell}
          titlebar={
            nativeWindow ? (
              <NativeWindowTitlebar context={nativeWindow} labels={copy.windowControls} title={copy.shell.brand} />
            ) : undefined
          }
          sidebarWidthRem={sidebarLayout.size.preferredRem}
          sidebarLayout={{
            minWidthRem: sidebarLayout.size.minRem,
            maxWidthRem: sidebarLayout.size.maxRem,
            mainMinWidthRem: workspaceLayout.size.minRem,
            defaultWidthRem: shellLayoutModule(shellLayout, 'projects').size.preferredRem,
          }}
          sidebarResize={{
            ownerKey: binding.hostId ?? 'pending',
            label: copy.sidebarLayout.resize,
            resetLabel: copy.sidebarLayout.reset,
            valueText: copy.sidebarLayout.width,
            status: sidebarLayoutController.receipt.status,
            disabled: sidebarLayoutController.disabled,
            onCommit: sidebarLayoutController.commit,
          }}
          sidebarFeedback={
            <ToolPaneLayoutFeedback
              surface="sidebar"
              controller={sidebarLayoutController}
              labels={copy.sidebarLayout}
            />
          }
          toolWidthRem={toolLayout.size.preferredRem}
          toolLayout={{
            mainMinWidthRem: workspaceLayout.size.minRem,
            minWidthRem: toolLayout.size.minRem,
            maxWidthRem: toolLayout.size.maxRem,
          }}
          toolResize={
            toolLayout.config.resizable
              ? {
                  ownerKey: JSON.stringify([
                    binding.hostId,
                    presentation.toolInstanceId,
                    toolPanel?.workspaceId,
                    toolPanel?.sessionId,
                  ]),
                  label: copy.toolLayout.resize,
                  valueText: copy.toolLayout.width,
                  status: toolLayoutController.receipt.status,
                  disabled: toolLayoutController.disabled,
                  onCommit: toolLayoutController.commit,
                }
              : undefined
          }
          connection={connection}
          onReconnect={reconnect}
          toolLabel={
            toolPanel?.panelId === 'files'
              ? copy.files.title
              : toolPanel?.panelId === 'monitoring'
                ? copy.monitoring.title
                : toolPanel?.panelId === 'activity'
                  ? copy.activity.title
                  : toolPanel?.panelId === 'agents'
                    ? copy.agents.title
                    : toolPanel?.panelId === 'goals'
                      ? copy.goals.title
                      : copy.session.tools.label
          }
          tool={
            presentation.toolInstanceId &&
            !tabs.items.some(
              (item) => item.kind === 'workbench' && item.panelInstanceId === presentation.toolInstanceId,
            ) ? (
              <LumenFrame className="hbar-web-tool-outlet">
                <ToolPaneLayoutFeedback controller={toolLayoutController} labels={copy.toolLayout} />
                <WorkspaceTool
                  locale={locale}
                  connected={connection === 'connected'}
                  canExpand={workspaceLayout.config.tabs.visible}
                />
              </LumenFrame>
            ) : undefined
          }
          overlay={<WorkspaceModal locale={locale} connected={connection === 'connected'} chatSearch={chatSearch} />}
        >
          {workspaceLayout.config.tabs.visible && workspaceLayout.config.tabs.placement === 'before-content' ? (
            <WorkspaceTabsController runtime={runtime} client={client} locale={locale}>
              <WorkspaceBody
                appRuntime={runtime}
                appearanceEditor={appearanceEditor}
                locale={locale}
                language={language}
                sendBehavior={sendBehavior}
                zoom={zoom}
                nativeDesktop={Boolean(nativeWindow)}
                connected={connection === 'connected'}
                prepareAttachment={attachmentController.prepare}
                images={images}
                files={composerFiles}
                systemPrefersDark={systemPrefersDark}
                showSessionFilesInHeader={false}
              />
            </WorkspaceTabsController>
          ) : (
            <WorkspaceBody
              appRuntime={runtime}
              appearanceEditor={appearanceEditor}
              locale={locale}
              language={language}
              sendBehavior={sendBehavior}
              zoom={zoom}
              nativeDesktop={Boolean(nativeWindow)}
              connected={connection === 'connected'}
              prepareAttachment={attachmentController.prepare}
              images={images}
              files={composerFiles}
              systemPrefersDark={systemPrefersDark}
              showSessionFilesInHeader={true}
            />
          )}
        </HbarWorkspaceShell>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
