import { SessionPanel, isSessionPanelSection } from './SessionPanel'
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from 'react'
import {
  HbarCommandPalette,
  HbarChatSearchView,
  HbarRuntimeProvider,
  HbarComposerFeedbackRegistryProvider,
  WORKSPACE_VIEWPORT_MEDIA,
  HbarSessionLaunchLocation,
  HbarSessionWorkspace,
  HbarWorkspaceShell,
  HbarDesktopLayoutProjection,
  type HbarFlexLayoutGeometry,
  type WorkspaceNodeFolderRegistry,
  useHbarRuntime,
  useHbarRuntimeState,
} from '@hbar/app-react'
import {
  createAppRuntime,
  restoreSessionDrafts,
  serializeSessionDrafts,
  workspaceDisplayName,
  type DraftsState,
} from '@hbar/app-runtime'
import type { GlobalSettingsStartup, PanelSurface } from '@hbar/app-runtime'
import { useStore } from 'zustand'
import { CommandError } from '@hbar/commands'
import { workspaceLocationOf } from '@hbar/contracts/node-address'
import { ArrowLeft } from 'lucide-react'
import { GlobalFeatureNavigation } from './GlobalFeatureNavigation'
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
  createRunBoardCommandClient,
  createSessionLaunchTargetReader,
  createSessionLaunchTargetPreparationManager,
  createSessionLaunchBranchesManager,
  createSessionBranchTargetCommandClient,
  createSessionSearchCommandClient,
  createSessionTimelineClient,
  createInteractionCommandClient,
  createInteractionRecoveryClient,
  createMetricsCommandClient,
  createModelCommandClient,
  createSchemaCallbackClient,
  createSettingsCommandClient,
  createChatDatabaseCommandClient,
  createSystemCommandClient,
  createUsageCommandClient,
  createWorkspaceSessionCommandClient,
  createNotificationCommandClient,
  createPromptTemplateCommandClient,
  createSandboxCommandClient,
  createScheduleCommandClient,
  createNodeCommandClient,
} from '@hbar/client'
import type { BrowserAttachmentSelection, ConnectionStatus } from '@hbar/client'
import { WebAppearanceSettings } from './AppearanceSettings'
import { WebGeneralSettings } from './GeneralSettings'
import { HbarStorageLocationSettings } from '@hbar/app-react/storage-locations'
import { WebWorkspaceLocationPicker } from './workspace-location-picker'
import { workspaceLocationPickerCopy } from './workspace-location-picker-copy'
import { approvalExecutionTargetCopy } from './approval-execution-target-copy'
import { createWorkspaceNodeRegistryModel } from './workspace-location-picker-model'
import { SystemTerminalPanel } from './SystemTerminalPanel'
import { systemTerminalCopy } from './system-terminal-copy'
import { createStorageLocationController, type StorageLocationController } from '@hbar/app-runtime/storage-locations'
import { storageLocationCopy } from './storage-location-copy'
import { chatDatabaseCopy } from './chat-database-copy'
import { webWindowId, claimWebWindowId, inheritedWebWindowId } from './client-window-id'
import { createSkillImportController } from '@hbar/app-runtime/skill-import'
import { WebSkillImportPanel } from './SkillImportPanel'
import { WebPreSessionLanding } from './PreSessionLanding'
import { preSessionLaunchCopy } from './pre-session-launch-copy'
import type { WebLanguageController } from './language'
import type { WebZoomController } from './app-zoom'
import { createWebSendBehaviorController, type WebSendBehaviorController } from './send-behavior'
import { createHostSendBehaviorPort } from './send-behavior-settings'
import { hostPersistenceId } from './host-identity'
import { createWebRuntimeCopy, type WebRuntimeCopyPort } from './runtime-copy'
import { createBrowserImageResources } from './browser-image-resources'
import { HbarMessageResourceLayer } from '@hbar/app-react'
import { createWebMessageResources } from './message-resource-controller'
import { resourceCopy } from './resource-copy'
import { ResourceBrowser, ResourceBrowserLayer, ResourceFile } from './ResourceBrowser'
import { createResourceBrowserController, type NativeResourceBridge } from './resource-browser-controller'
import { sessionImageCopy } from './session-image-copy'
import { mobileShellNavigationLabel } from './mobile-shell-navigation-copy'
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
import { GlobalFeaturePage } from './GlobalFeaturePage'
import { globalFeatureCopy, isGlobalFeaturePageId, type GlobalFeaturePageId } from './global-feature-copy'
import { WEB_SETTINGS_GROUP_PRESENTATION, WEB_SETTINGS_LAYOUT } from './settings-group-presentation'
import { WorkspaceTabsController } from './WorkspaceTabsController'
import { workspaceTabsCopy } from './workspace-tabs-copy'
import { sessionContextCopy } from './session-context-copy'
import { sessionWorkspaceMoveCopy } from './session-workspace-move-copy'
import { chatSearchCopy, chatSearchErrorCopy } from './chat-search-copy'
import { createWebChatSearchController, type WebChatSearchController } from './chat-search-controller'
import { createHostChatSearchPort } from './chat-search-port'
import { createSessionToolPresenter } from './session-tool-presentation'
import {
  flexModelToShellLayout,
  normalizeShellLayout,
  shellLayout,
  shellLayoutModule,
  shellLayoutToFlexModel,
} from './shell-layout'
import { useSidebarLayout, useToolPaneLayout } from './tool-pane-layout'
import { ToolPaneLayoutFeedback } from './ToolPaneLayoutFeedback'
import { createBrowserClientPersistence } from './client-persistence'
import { createBrowserClientExport } from './client-export'
import { canRenderWebSurface } from './surface-manifest'
import { loadNativeConnection, type HbarNativeConnection } from './native-connection'
import { startNativeConnectionRecovery } from './native-connection-recovery'
import type { HbarNativeWindowContext } from './native-window'
import { applyWebTheme, readThemeBootstrap, readThemePreference, resolveWebTheme, writeThemeBootstrap } from './theme'
import './App.css'
import { NotificationDesktopBridge } from './NotificationDesktopBridge'
import { lazySurface, LazySurfaceBoundary, lazySurfaceCopy } from './lazy-surface'
import { notificationNavigationCopy } from './notification-copy'
import { NotificationPageNavigation } from './NotificationPageButton'
import { navigateNotification } from './notification-navigation'
import { createDevelopmentDiagnostics } from './development-diagnostics'
import { WebNodeManagementSettings } from './node-management-settings'
const SchedulesPage = lazySurface<ComponentProps<typeof import('./schedules-page').SchedulesPage>>(() =>
  import('./schedules-page').then((module) => ({ default: module.SchedulesPage })),
)
const PromptTemplatesPage = lazySurface<ComponentProps<typeof import('./prompt-templates-page').PromptTemplatesPage>>(
  () => import('./prompt-templates-page').then((module) => ({ default: module.PromptTemplatesPage })),
)
const RunBoardPage = lazySurface<ComponentProps<typeof import('./run-board-page').RunBoardPage>>(() =>
  import('./run-board-page').then((module) => ({ default: module.RunBoardPage })),
)
const NotificationsLazyPage = lazySurface<ComponentProps<typeof import('./notifications-page').NotificationsPage>>(() =>
  import('./notifications-page').then((module) => ({ default: module.NotificationsPage })),
)
const OnboardingLazyPage = lazySurface<ComponentProps<typeof import('./onboarding-page').OnboardingPage>>(() =>
  import('./onboarding-page').then((module) => ({ default: module.OnboardingPage })),
)
const FileWorkspace = lazySurface<ComponentProps<typeof import('@hbar/app-react/file-workspace').HbarFileWorkspace>>(
  () => import('@hbar/app-react/file-workspace').then((m) => ({ default: m.HbarFileWorkspace })),
)
const GoalPlanWorkspace = lazySurface<ComponentProps<typeof import('@hbar/app-react/goal-plan').HbarGoalPlanWorkspace>>(
  () => import('@hbar/app-react/goal-plan').then((m) => ({ default: m.HbarGoalPlanWorkspace })),
)
const SettingsWorkspace = lazySurface<ComponentProps<typeof import('@hbar/app-react/settings').HbarSettingsWorkspace>>(
  () => import('@hbar/app-react/settings').then((m) => ({ default: m.HbarSettingsWorkspace })),
)
const ChatDatabaseSettings = lazySurface<
  ComponentProps<typeof import('@hbar/app-react/chat-database').HbarChatDatabaseSettings>
>(
  () => import('@hbar/app-react/chat-database').then((m) => ({ default: m.HbarChatDatabaseSettings })),
)
const SandboxProfileSettings = lazySurface<ComponentProps<typeof import('@hbar/app-react').HbarSandboxProfileSettings>>(
  () => import('@hbar/app-react').then((m) => ({ default: m.HbarSandboxProfileSettings })),
)
const ProviderSettings = lazySurface<ComponentProps<typeof import('@hbar/app-react/providers').HbarProviderSettings>>(
  () => import('@hbar/app-react/providers').then((m) => ({ default: m.HbarProviderSettings })),
)
const ProviderDialog = lazySurface<ComponentProps<typeof import('@hbar/app-react/providers').HbarProviderDialog>>(() =>
  import('@hbar/app-react/providers').then((m) => ({ default: m.HbarProviderDialog })),
)
const StatusWorkspace = lazySurface<ComponentProps<typeof import('./StatusCenter').StatusCenter>>(() =>
  import('./StatusCenter').then((m) => ({ default: m.StatusCenter })),
)
const UsageFeatures = lazySurface<ComponentProps<typeof import('./StatusUsageFeatures').StatusUsageFeatures>>(() =>
  import('./StatusUsageFeatures').then((m) => ({ default: m.StatusUsageFeatures })),
)
const AgentWorkspace = lazySurface<ComponentProps<typeof import('@hbar/app-react/agents').HbarAgentWorkspace>>(() =>
  import('@hbar/app-react/agents').then((m) => ({ default: m.HbarAgentWorkspace })),
)
const ExtensionWorkspace = lazySurface<
  ComponentProps<typeof import('@hbar/app-react/extensions').HbarExtensionWorkspace>
>(() => import('@hbar/app-react/extensions').then((m) => ({ default: m.HbarExtensionWorkspace })))
const SessionMonitoring = lazySurface<
  ComponentProps<typeof import('@hbar/app-react/monitoring').HbarSessionMonitoring>
>(() => import('@hbar/app-react/monitoring').then((m) => ({ default: m.HbarSessionMonitoring })))
const SessionActivityWorkspace = lazySurface<
  ComponentProps<typeof import('@hbar/app-react/activity').HbarSessionActivityWorkspace>
>(() => import('@hbar/app-react/activity').then((m) => ({ default: m.HbarSessionActivityWorkspace })))
const SettingsUsage = lazySurface<ComponentProps<typeof import('@hbar/app-react/settings-usage').HbarSettingsUsage>>(
  () => import('@hbar/app-react/settings-usage').then((m) => ({ default: m.HbarSettingsUsage })),
)
const SystemDiagnostics = lazySurface<
  ComponentProps<typeof import('@hbar/app-react/diagnostics').HbarSystemDiagnostics>
>(() => import('@hbar/app-react/diagnostics').then((m) => ({ default: m.HbarSystemDiagnostics })))

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
  initialDrafts?: DraftsState,
) {
  const goals = createGoalPlanCommandClient(client)
  const sessionLaunchBranches = createSessionLaunchBranchesManager(client)
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId: hostId ?? 'pending:identity',
    ...(hostId ? { hostRuntimeStatus: client.runtimeStatus } : {}),
    initialGlobalSettings,
    ...(initialDrafts ? { initialDrafts } : {}),
    directory: createDirectoryQueryAdapter(client),
    workspaces: createWorkspaceSessionCommandClient(client),
    chatDatabaseEvents: {
      subscribe: (listener) =>
        client.onEvent((event) => {
          if (event.method === 'chatDatabase.deleted') listener(event.params)
        }),
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
    sidebarActivityEvents: {
      subscribe(listener: () => void) {
        const off = client.onEvent((event) => {
          if (
            event.method === 'chatDatabase.deleted' ||
            (event.method === 'host.changed' &&
              [
                'sessions',
                'workspaces',
                'workspace-display-names',
                'workspace-organization',
                'session-activity',
                'agents',
                'resync',
              ].includes(event.params.kind))
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
    runBoard: createRunBoardCommandClient(client),
    notifications: createNotificationCommandClient(client),
    promptTemplates: createPromptTemplateCommandClient(client),
    schedules: createScheduleCommandClient(client),
    runBoardEvents: {
      subscribe(listener) {
        return client.onEvent((event) => {
          if (
            event.method === 'host.changed' &&
            ['runs', 'notifications', 'schedules', 'resync'].includes(event.params.kind)
          )
            listener()
        })
      },
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
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
    contextEvents: {
      subscribe(listener) {
        return client.onEvent((event) => {
          if (event.method === 'host.changed' && event.params.kind === 'settings') listener()
        })
      },
    },
    budget: createBudgetCommandClient(client),
    settings: createSettingsCommandClient(client),
    ...(hostId === null
      ? {}
      : {
          draftArtifactReferences: {
            commands: createChatDatabaseCommandClient(client),
            namespace: webWindowId(window.sessionStorage),
            journal: {
              read() {
                const key = `hbar:web:artifact-refs:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`
                const value = window.localStorage.getItem(key)
                return value ? (JSON.parse(value) as unknown) : null
              },
              write(value) {
                const key = `hbar:web:artifact-refs:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`
                window.localStorage.setItem(key, JSON.stringify(value))
              },
            },
            onConnection(listener) {
              const off = client.onStatus((status) => listener(status === 'connected'))
              listener(client.connectionStatus() === 'connected')
              return off
            },
          },
        }),
    chatDatabase: {
      commands: createChatDatabaseCommandClient(client),
      ...(hostId === null
        ? {}
        : {
            journal: {
              read() {
                const key = `hbar:web:chat-database:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`
                const value = window.localStorage.getItem(key)
                return value ? (JSON.parse(value) as unknown) : null
              },
              write(value) {
                const key = `hbar:web:chat-database:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`
                window.localStorage.setItem(key, JSON.stringify(value))
              },
            },
          }),
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
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
    sandbox: createSandboxCommandClient(client),
    sandboxEvents: {
      subscribe: (listener) =>
        client.onEvent((event) => {
          if (event.method === 'host.changed' && ['sandbox-profiles', 'resync'].includes(event.params.kind)) listener()
        }),
    },
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
    sessionLaunchBranches,
    sessionLaunchBranchCreation: sessionLaunchBranches,
    sessionBranchTargets: createSessionBranchTargetCommandClient(client),
    sessionBranchTargetEvents: {
      subscribe: (listener) => client.onEvent((event) => { if (event.method === 'host.changed' && ['session-launch-target', 'resync'].includes(event.params.kind)) listener() }),
      onConnection: (listener) => client.onStatus((status) => listener(status === 'connected')),
    },
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
    workflowEvents: {
      onConnection(listener) {
        const off = client.onStatus((status) => listener(status === 'connected'))
        listener(client.connectionStatus() === 'connected')
        return off
      },
    },
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
  readonly client: HbarClient
  readonly storageLocations: StorageLocationController
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
  readonly workspaceNodeNames: Readonly<Record<string, string>>
  readonly workspaceLocationLabels: ReturnType<typeof workspaceLocationPickerCopy>
}

const emptyWorkspaceNodeFolderRegistry: WorkspaceNodeFolderRegistry = {}

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
        : isGlobalFeaturePageId(presentation.page.kind)
          ? globalFeatureCopy(props.locale).titles[presentation.page.kind]
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
      <LazySurfaceBoundary labels={lazySurfaceCopy(props.locale)}>
        <WorkspaceBodyContent {...props} />
      </LazySurfaceBoundary>
    </SettingsPageFocusBoundary>
  )
}

function WorkspaceBodyContent({
  client,
  storageLocations,
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
  workspaceNodeNames,
  workspaceLocationLabels,
}: WorkspaceBodyProps) {
  const nodeCommands = useMemo(() => createNodeCommandClient(client), [client])
  const nodeAccess = client.connectionHost()?.deviceAccess
  const nodesWritable = connected && nodeAccess?.role === 'operator'
  const nodesAccessKnown = connected && nodeAccess !== undefined
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
  const conversation =
    session ??
    (navigation.sessionId && navigation.workspaceId && directory.deletedSessions?.[navigation.sessionId]
      ? {
          id: navigation.sessionId,
          workspaceId: navigation.workspaceId,
          title: tabCopy.unknownSession(navigation.sessionId),
        }
      : undefined)
  const sessionWorkspace = conversation ? directory.workspaces[conversation.workspaceId] : undefined
  const sessionWorkspaceLocation = sessionWorkspace ? workspaceLocationOf(sessionWorkspace) : undefined
  useEffect(() => {
    if (!session || !landingDraftId.current) return
    const draftId = landingDraftId.current
    landingDraftId.current = null
    const firstSend = runtime.state.preSessionDrafts.getSnapshot()[draftId]
    if (firstSend?.sessionId === session.id && firstSend.phase !== 'accepted') return
    void runtime.commands.execute('preSessionDraft.close', { draftId }).catch(() => undefined)
  }, [runtime, session])
  if (presentation.page.kind === 'status') {
    return (
      <StatusWorkspace
        locale={locale}
        connected={connected}
        labels={copy.status}
        instanceId={presentation.page.instanceId}
        usageDetails={<UsageFeatures locale={locale} instanceId={presentation.page.instanceId} />}
      />
    )
  }
  if (presentation.page.kind === 'settings')
    return (
      <SettingsWorkspace
        labels={copy.settings}
        connected={connected}
        groupPresentation={WEB_SETTINGS_GROUP_PRESENTATION}
        layout={WEB_SETTINGS_LAYOUT}
        pendingGroups={[
          { id: 'storage', label: storageLocationCopy(locale).title, order: 37 },
          { id: 'chatDatabase', label: chatDatabaseCopy(locale).title, order: 38 },
          { id: 'providers', label: copy.settings.resolve('i18n:settings.groups.providers'), order: 0 },
          { id: 'sandbox', label: copy.settings.resolve('i18n:settings.groups.sandbox'), order: 35 },
          { id: 'model', label: copy.settings.resolve('i18n:settings.groups.model'), order: 20 },
          { id: 'session', label: copy.settings.resolve('i18n:settings.groups.session'), order: 30 },
          { id: 'extensions', label: copy.settings.resolve('i18n:settings.groups.extensions'), order: 40 },
        ]}
        additionalGroups={[
          { id: 'storage', label: storageLocationCopy(locale).title, order: 37 },
          ...(language ? [{ id: 'general', label: copy.general.group, order: 5 }] : []),
          { id: 'appearance', label: copy.appearance.group, order: 0 },
          { id: 'sandbox', label: copy.settings.resolve('i18n:settings.groups.sandbox'), order: 35 },
          { id: 'skills', label: copy.settings.resolve('i18n:settings.groups.skills'), order: 39 },
          { id: 'usage', label: copy.settingsUsage.title, order: 85 },
          { id: 'nodes', label: copy.nodes.title, order: 60 },
        ]}
        renderGroup={(groupId, context) => {
          if (groupId === 'chatDatabase' && context.scope && context.instanceId)
            return {
              content: (
                <ChatDatabaseSettings
                  key={`${context.instanceId}:${JSON.stringify(context.scope)}`}
                  instanceId={context.instanceId}
                  scope={context.scope}
                  connected={connected}
                  labels={chatDatabaseCopy(locale)}
                  ruleForm={context.form}
                  savedRevision={context.entry?.receipt?.commitId ?? ''}
                />
              ),
              saveArea: context.saveArea,
            }
          if (groupId === 'storage')
            return (
              <HbarStorageLocationSettings
                controller={storageLocations}
                labels={storageLocationCopy(locale)}
                connected={connected}
              />
            )
          if (groupId === 'general' && language)
            return {
              content: (
                <>
                  <WebGeneralSettings
                    labels={copy.general}
                    language={language}
                    sendBehavior={sendBehavior}
                    zoom={zoom}
                    nativeZoom={nativeDesktop}
                    connected={connected}
                  />
                  {context.renderFields([
                    'f:client.resourceWebOpenMode',
                    'f:client.resourceFileOpenMode',
                    'f:desktop.startupMode',
                  ])}
                </>
              ),
              saveArea: context.saveArea,
            }
          if (groupId === 'appearance')
            return (
              <WebAppearanceSettings
                labels={copy.appearance}
                editor={appearanceEditor}
                systemPrefersDark={systemPrefersDark}
              />
            )
          if (groupId === 'providers') return <ProviderSettings labels={copy.providers.list} connected={connected} />
          if (groupId === 'nodes')
            return (
              <WebNodeManagementSettings
                commands={nodeCommands}
                hostId={appRuntime.view.hostId}
                connected={connected}
                writable={nodesWritable}
                accessKnown={nodesAccessKnown}
                labels={copy.nodes}
              />
            )
          if (groupId === 'sandbox') return <SandboxProfileSettings labels={copy.sandbox} connected={connected} />
          if ((groupId === 'extensions' || groupId === 'skills') && presentation.page.kind === 'settings')
            return (
              <ExtensionWorkspace
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
              <SettingsUsage
                labels={copy.settingsUsage}
                connected={connected}
                instanceId={presentation.page.instanceId}
              />
            )
          if (groupId === 'diagnostics' && presentation.page.kind === 'settings')
            return (
              <SystemDiagnostics
                labels={copy.diagnostics}
                connected={connected}
                instanceId={presentation.page.instanceId}
              />
            )
          return null
        }}
      />
    )
  if (presentation.page.kind !== 'session' && isGlobalFeaturePageId(presentation.page.kind))
    return (
      <WorkspaceGlobalFeaturePage
        key={presentation.page.instanceId}
        pageId={presentation.page.kind}
        instanceId={presentation.page.instanceId}
        locale={locale}
        connected={connected}
      />
    )
  if (activeTab?.kind === 'workbench') {
    const panel = surfaces.panels[activeTab.panelInstanceId]
    if (panel?.panelId === 'resource-file') return <ResourceFile key={panel.instanceId} instanceId={panel.instanceId} />
    if (panel?.panelId === 'browser' && typeof panel.params.id === 'string' && typeof panel.params.url === 'string') return <ResourceBrowser key={panel.instanceId} id={panel.params.id} url={panel.params.url} locale={locale} />
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
      <FileWorkspace
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
  if (conversation)
    return (
      <HbarSessionWorkspace
        sessionTitle={conversation.title}
        workspaceName={
          sessionWorkspace ? workspaceDisplayName(sessionWorkspace, displayNames) : conversation.workspaceId
        }
        workspacePath={sessionWorkspace?.path}
        workspaceNodeBadge={
          sessionWorkspaceLocation?.kind === 'node'
            ? {
                nodeName: workspaceNodeNames[sessionWorkspaceLocation.nodeId] ?? sessionWorkspaceLocation.nodeId,
                labels: workspaceLocationLabels,
              }
            : undefined
        }
        sessionWorkspaceId={conversation.workspaceId}
        projectContextLabels={sessionContextCopy(locale)}
        firstSendLabels={preSessionLaunchCopy(locale).status}
        renderLaunchControls={
          session
            ? () => (
                <HbarSessionLaunchLocation
                  sessionId={session.id}
                  workspaceId={session.workspaceId}
                  workspaceName={
                    sessionWorkspace ? workspaceDisplayName(sessionWorkspace, displayNames) : session.workspaceId
                  }
                  workspacePath={sessionWorkspace?.path}
                  connected={connected}
                  labels={preSessionLaunchCopy(locale).location}
                  statusLabels={preSessionLaunchCopy(locale).status}
                  moveLabels={sessionWorkspaceMoveCopy(locale)}
                />
              )
            : undefined
        }
        labels={{
          ...copy.session,
          decisions: {
            ...copy.session.decisions,
            executionTarget: approvalExecutionTargetCopy(locale),
          },
        }}
        describeTool={createSessionToolPresenter(locale)}
        sendBehavior={selectedSendBehavior}
        connected={connected}
        prepareAttachment={prepareAttachment}
        images={images}
        files={files}
        onOpenSystemTerminal={
          client.connectionHost()?.deviceAccess?.role === 'operator'
            ? () => {
                if (!connected) return
                void runtime.commands
                  .execute('app.openPanel', {
                    panelId: 'system-terminal',
                    workspaceId: conversation.workspaceId,
                    sessionId: conversation.id,
                    binding: 'pinned',
                  })
                  .catch(() => undefined)
              }
            : undefined
        }
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
      modelMenuPresentation={nativeDesktop ? 'native' : 'web'}
      prepareAttachment={prepareAttachment}
      images={images}
    />
  )
}

function WorkspaceTool({
  client,
  locale,
  connected,
  canExpand,
}: {
  readonly client: HbarClient
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly canExpand: boolean
}) {
  const copy = getShellCopy(locale)
  const terminalCopy = useMemo(() => systemTerminalCopy(locale), [locale])
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
      <FileWorkspace
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
  if (panel.panelId === 'system-terminal')
    return (
      <SystemTerminalPanel
        client={client}
        workspaceId={panel.workspaceId}
        sessionId={panel.sessionId}
        connected={connected}
        canOpen={client.connectionHost()?.deviceAccess?.role === 'operator'}
        labels={terminalCopy}
        onClose={() => void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)}
      />
    )
  if (isSessionPanelSection(panel.panelId)) {
    const content = (() => {
    if (panel.panelId === 'monitoring')
      return (
      <SessionMonitoring
        labels={copy.monitoring}
        instanceId={instanceId}
        targetLabel={targetLabel}
        connected={connected}
      />
    )
    if (panel.panelId === 'activity')
      return (
      <SessionActivityWorkspace
        labels={copy.activity}
        connected={connected}
        instanceId={instanceId}
        targetLabel={targetLabel}
      />
    )
    if (panel.panelId === 'agents')
      return (
      <AgentWorkspace labels={copy.agents} connected={connected} instanceId={instanceId} targetLabel={targetLabel} />
    )
    if (panel.panelId === 'goals')
      return (
      <GoalPlanWorkspace labels={copy.goals} connected={connected} instanceId={instanceId} targetLabel={targetLabel} />
    )
    return null
    })()
    return <SessionPanel panel={panel} labels={copy.session.tools}>{content}</SessionPanel>
  }

  return null
}

function WorkspaceGlobalFeaturePage({
  pageId,
  instanceId,
  locale,
  connected,
}: {
  readonly pageId: GlobalFeaturePageId
  readonly instanceId: string
  readonly locale: ShellLocale
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const panel = surfaces.panels[instanceId]
  const labels = globalFeatureCopy(locale)
  const needsWorkspace = pageId === 'run-board' || pageId === 'schedules' || pageId === 'prompt-templates'
  return (
    <GlobalFeaturePage
      pageId={pageId}
      title={labels.titles[pageId]}
      backLabel={labels.back}
      onBack={() => void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => undefined)}
    >
      {!panel || panel.panelId !== pageId ? (
        <LumenText role="alert">{labels.unavailable}</LumenText>
      ) : needsWorkspace && !panel.workspaceId ? (
        <LumenFrame className="hbar-web-global-page-empty">
          <LumenText as="p">{labels.workspaceRequired}</LumenText>
          <LumenButton
            onClick={() =>
              void runtime.commands.execute('app.openPanel', { panelId: 'onboarding' }).catch(() => undefined)
            }
          >
            {labels.configureWorkspace}
          </LumenButton>
        </LumenFrame>
      ) : (
        <GlobalFeatureContent panel={panel} locale={locale} connected={connected} />
      )}
    </GlobalFeaturePage>
  )
}

function GlobalFeatureContent({
  panel,
  locale,
  connected,
}: {
  readonly panel: PanelSurface
  readonly locale: ShellLocale
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const copy = getShellCopy(locale)
  const instanceId = panel.instanceId
  if (panel.panelId === 'run-board')
    return (
      <Suspense fallback={<LumenText role="status">{getShellCopy(locale).shell.loading}</LumenText>}>
        <RunBoardPage runtime={runtime} locale={locale} instanceId={instanceId} />
      </Suspense>
    )
  if (panel.panelId === 'schedules')
    return (
      <WorkspaceSchedulesPage
        locale={locale}
        {...(panel.workspaceId ? { workspaceId: panel.workspaceId } : {})}
        {...(typeof panel.params.scheduleId === 'string' ? { initialScheduleId: panel.params.scheduleId } : {})}
      />
    )
  if (panel.panelId === 'prompt-templates')
    return (
      <WorkspacePromptTemplatesPage
        locale={locale}
        {...(panel.workspaceId ? { workspaceId: panel.workspaceId } : {})}
        {...(panel.sessionId ? { sessionId: panel.sessionId } : {})}
        {...(typeof panel.params.preSessionDraftId === 'string'
          ? { preSessionDraftId: panel.params.preSessionDraftId }
          : {})}
      />
    )
  if (panel.panelId === 'onboarding')
    return (
      <Suspense fallback={<LumenText role="status">{copy.shell.loading}</LumenText>}>
        <OnboardingLazyPage
          locale={locale}
          connected={connected}
          onOpenWorkspace={() => void runtime.commands.execute('app.back', {}).catch(() => undefined)}
          onConfigure={(kind) =>
            void runtime.commands
              .execute(
                kind === 'model' ? 'app.openSettings' : 'app.openPanel',
                kind === 'model'
                  ? { scope: 'global', section: 'providers' }
                  : { panelId: 'onboarding', binding: 'followActive' },
              )
              .catch(() => undefined)
          }
        />
      </Suspense>
    )
  if (panel.panelId === 'notifications' && runtime.state.notifications)
    return (
      <Suspense fallback={<LumenText role="status">{getShellCopy(locale).shell.loading}</LumenText>}>
        <NotificationsLazyPage
          runtime={runtime}
          locale={locale}
          onNavigate={(target) =>
            navigateNotification(target, {
              commands: runtime.commands,
              sourceInstanceId: instanceId,
              getSchedule: (scheduleId) => runtime.state.schedules?.get(scheduleId) ?? Promise.resolve(null),
            })
          }
        />
      </Suspense>
    )
  return null
}

function WorkspaceSchedulesPage({
  locale,
  workspaceId,
  initialScheduleId,
}: {
  readonly locale: ShellLocale
  readonly workspaceId?: string
  readonly initialScheduleId?: string
}) {
  const runtime = useHbarRuntime()
  if (!workspaceId) return null
  return (
    <Suspense fallback={<LumenText role="status">{getShellCopy(locale).shell.loading}</LumenText>}>
      <SchedulesPage
        runtime={runtime}
        workspaceId={workspaceId}
        locale={locale}
        {...(initialScheduleId ? { initialScheduleId } : {})}
      />
    </Suspense>
  )
}

function WorkspacePromptTemplatesPage({
  locale,
  workspaceId,
  sessionId,
  preSessionDraftId,
}: {
  readonly locale: ShellLocale
  readonly workspaceId?: string
  readonly sessionId?: string
  readonly preSessionDraftId?: string
}) {
  const runtime = useHbarRuntime()
  if (!workspaceId) return null
  return (
    <Suspense fallback={<LumenText role="status">{getShellCopy(locale).shell.loading}</LumenText>}>
      <PromptTemplatesPage
        runtime={runtime}
        workspaceId={workspaceId}
        locale={locale}
        {...(sessionId ? { sessionId } : {})}
        {...(preSessionDraftId ? { preSessionDraftId } : {})}
      />
    </Suspense>
  )
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
          selectedResultId={chatSearchState.selectedResultId}
          source={chatSearchState.source}
          onSourceChange={chatSearch.setSource}
          truncated={chatSearchState.truncated}
          error={chatSearchState.error ? chatSearchErrorCopy(locale, chatSearchState.error) : null}
          openingResultId={chatSearchState.openingResultId}
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
                const navigation = runtime.state.navigation.getSnapshot()
                const tabs = runtime.state.workspaceTabs.getSnapshot()
                const tab = tabs.items.find((candidate) => candidate.id === tabs.activeId)
                if (
                  navigation.sessionId !== row.sessionId ||
                  navigation.workspaceId !== row.workspaceId ||
                  tab?.kind !== 'session' ||
                  tab.sessionId !== row.sessionId
                )
                  throw { code: 'CANCELLED' }
                runtime.conversationReading.navigate(
                  {
                    workspaceId: row.workspaceId,
                    sessionId: row.sessionId,
                    sourceTabInstanceKey: tab.instanceKey,
                  },
                  {
                    messageId: row.target?.messageId ?? null,
                    messageOffset: 0,
                    atEnd: row.source === 'title' || !row.target?.messageId,
                  },
                  row.target?.callId,
                  row.source !== 'title' && row.target?.messageId ? chatSearchState.query.trim() : null,
                )
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
      <ProviderDialog
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
  const developmentDiagnostics = useMemo(() => createDevelopmentDiagnostics(), [])
  const client = useMemo(() => new HbarClient(clientUrl, clientToken, developmentDiagnostics.options), [clientToken, clientUrl, developmentDiagnostics])
  useEffect(() => nativeConnection ? startNativeConnectionRecovery(client, () => loadNativeConnection(window, new URL(client.baseUrl).origin)) : undefined, [client, nativeConnection])
  const storageLocations = useMemo(() => {
    const commands = createSystemCommandClient(client)
    return createStorageLocationController({
      read: (signal) => commands.execute('system.storage.get', {}, { signal }),
      save: (input, signal) =>
        commands.execute('system.storage.apply', input, { signal, idempotencyKey: input.operationId }),
      restart: (signal) => commands.execute('system.restart', {}, { signal }),
    })
  }, [client])
  useEffect(() => storageLocations.acquire(), [storageLocations])
  const skillImport = useMemo(() => {
    const commands = createExtensionCommandClient(client)
    return createSkillImportController({
      preview: (input, signal) => commands.execute('skill.import.preview', input, { signal }),
      start: (input, signal) =>
        commands.execute('skill.import.start', input, { signal, idempotencyKey: input.operationId }),
      get: (operationId, signal) => commands.execute('skill.import.get', { operationId }, { signal }),
      latest: (signal) => commands.execute('skill.import.latest', {}, { signal }),
      cancel: (operationId, signal) =>
        commands.execute('skill.import.cancel', { operationId }, { signal, idempotencyKey: `cancel-${operationId}` }),
    })
  }, [client])
  useEffect(() => skillImport.acquire(), [skillImport])
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
  const [desktopViewport, setDesktopViewport] = useState(() => window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.wide).matches)
  useEffect(() => {
    const media = window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.wide)
    const update = (event: MediaQueryListEvent | MediaQueryList) => setDesktopViewport(event.matches)
    update(media)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
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
        createRuntime: (hostId, initialGlobalSettings, initialDrafts) =>
          createRuntime(
            client,
            hostId,
            runtimeCopy,
            attachmentController.commands,
            resourcePicker,
            initialGlobalSettings,
            initialDrafts,
          ),
        draftPersistence: {
          read(hostId) {
            try {
              const inherited = inheritedWebWindowId(window.sessionStorage)
              const raw =
                window.localStorage.getItem(`hbar:web:drafts:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`) ??
                (inherited ? window.localStorage.getItem(`hbar:web:drafts:${encodeURIComponent(hostId)}:${inherited}`) : null) ??
                window.localStorage.getItem(`hbar:web:drafts:${hostId}`)
              if (raw !== null && new TextEncoder().encode(raw).byteLength > 1_000_000) return undefined
              return raw === null ? undefined : restoreSessionDrafts(JSON.parse(raw))
            } catch {
              return undefined
            }
          },
          write(hostId, drafts) {
            try {
              const serialized = serializeSessionDrafts(drafts)
              if (serialized !== null)
                window.localStorage.setItem(
                  `hbar:web:drafts:${encodeURIComponent(hostId)}:${webWindowId(window.sessionStorage)}`,
                  serialized,
                )
            } catch {
              // Storage failures leave the in-memory draft usable.
            }
          },
        },
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
  const workspaceNodeRegistryModel = useMemo(() => {
    const commands = createNodeCommandClient(client)
    return createWorkspaceNodeRegistryModel({
      listNodes: (input, options) =>
        commands.execute('node.list', input, options?.signal ? { signal: options.signal } : undefined),
    })
  }, [client])
  const workspaceNodeRegistryState = useStore(workspaceNodeRegistryModel.store)
  const workspaceNodeRegistryPermission = client.connectionHost()?.deviceAccess?.role ?? 'unknown'
  const workspaceNodeRegistryConnected = connection === 'connected'
  const workspaceNodeRegistryMatches =
    workspaceNodeRegistryState.hostId === binding.hostId &&
    workspaceNodeRegistryState.connected === workspaceNodeRegistryConnected &&
    workspaceNodeRegistryState.permission === workspaceNodeRegistryPermission
  const workspaceNodeFolderRegistry: WorkspaceNodeFolderRegistry = workspaceNodeRegistryMatches
    ? workspaceNodeRegistryState.registry
    : emptyWorkspaceNodeFolderRegistry
  const workspaceNodeNames = useMemo(
    () => Object.fromEntries(Object.entries(workspaceNodeFolderRegistry).map(([nodeId, node]) => [nodeId, node.name])),
    [workspaceNodeFolderRegistry],
  )
  const workspaceLocationLabels = useMemo(() => workspaceLocationPickerCopy(locale), [locale])
  useEffect(() => {
    workspaceNodeRegistryModel.setIdentity(binding.hostId, workspaceNodeRegistryConnected, workspaceNodeRegistryPermission)
    if (workspaceNodeRegistryConnected) void workspaceNodeRegistryModel.refresh()
  }, [binding.hostId, workspaceNodeRegistryConnected, workspaceNodeRegistryModel, workspaceNodeRegistryPermission])
  useEffect(() => workspaceNodeRegistryModel.retain(), [workspaceNodeRegistryModel])
  const refreshWorkspaceNodeFolderRegistry = useCallback(
    () => workspaceNodeRegistryModel.refresh(),
    [workspaceNodeRegistryModel],
  )
  useEffect(() => {
    sendBehavior.bind(binding.hostId, connection === 'connected')
  }, [binding.hostId, connection, sendBehavior])
  useEffect(() => {
    chatSearch.bind(binding.hostId, connection === 'connected')
  }, [binding.hostId, chatSearch, connection])
  useEffect(
    () =>
      client.onEvent((event) => {
        if (event.method === 'chatDatabase.deleted') {
          const host = client.connectionHost()
          if (host && binding.hostId === hostPersistenceId(host)) chatSearch.deleted(event.params.sessionIds)
        }
      }),
    [binding.hostId, chatSearch, client],
  )
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
  const resourceBrowser = useMemo(() => {
    const native = (window as Window & { __TAURI_INTERNALS__?: NativeResourceBridge }).__TAURI_INTERNALS__
    const local = nativeConnection && new URL(client.baseUrl).origin === new URL(nativeConnection.url).origin
    return createResourceBrowserController(runtime.view, native && local ? native : null)
  }, [client, runtime, nativeConnection])
  useEffect(() => {
    const off = runtime.view.state.surfaces.subscribe(() => { void resourceBrowser.releaseRemoved().catch(() => undefined) })
    return () => { off(); void resourceBrowser.closeAll().catch(() => undefined) }
  }, [runtime, resourceBrowser])
  const messageResources = useMemo(() => createWebMessageResources(client, runtime.view, resourceBrowser), [client, runtime, resourceBrowser])
  useEffect(() => {
    const offNavigation = runtime.view.state.navigation.subscribe(messageResources.invalidate)
    const offTabs = runtime.view.state.workspaceTabs.subscribe(messageResources.invalidate)
    const offConnection = client.onStatus(() => messageResources.close())
    return () => { offNavigation(); offTabs(); offConnection(); messageResources.close() }
  }, [client, runtime, messageResources])
  const layout = useHbarRuntimeState(runtime.view.state.layout)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const activeNavigation = useHbarRuntimeState(runtime.view.state.navigation)
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
  const layoutVisibilitySync = useRef<string | null>(null)
  const [desktopViewportGeometry, setDesktopViewportGeometry] = useState<HbarFlexLayoutGeometry>(() => ({
    widthPx: document.documentElement.clientWidth,
    remPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    splitterSizePx: 8,
  }))
  const [desktopLayoutGeometry, setDesktopLayoutGeometry] = useState<HbarFlexLayoutGeometry>()
  const desktopGeometryObserver = useCallback(
    (geometry: HbarFlexLayoutGeometry) =>
      setDesktopLayoutGeometry((current) =>
        current?.widthPx === geometry.widthPx &&
        current.remPx === geometry.remPx &&
        current.splitterSizePx === geometry.splitterSizePx
          ? current
          : geometry,
      ),
    [],
  )
  useEffect(() => {
    const update = () =>
      setDesktopViewportGeometry({
        widthPx: document.documentElement.clientWidth,
        remPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        splitterSizePx: 8,
      })
    const observer = new ResizeObserver(update)
    observer.observe(document.documentElement)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  const desktopLayoutModel = useMemo(
    () =>
      shellLayoutToFlexModel(resolvedLayout, {
        geometry: desktopLayoutGeometry ?? desktopViewportGeometry,
        sidebarVisible: presentation.sidebarOpen,
        toolVisible:
          Boolean(toolPanel) &&
          desktopViewportGeometry.widthPx / desktopViewportGeometry.remPx >=
            workspaceLayout.size.minRem +
              toolLayout.size.minRem +
              (presentation.sidebarOpen ? sidebarLayout.size.minRem : 0) +
              1,
      }),
    [
      resolvedLayout,
      desktopViewportGeometry,
      desktopLayoutGeometry,
      presentation.sidebarOpen,
      toolPanel,
      workspaceLayout.size.minRem,
      toolLayout.size.minRem,
      sidebarLayout.size.minRem,
    ],
  )
  const openFeaturePanel = (
    panelId: 'run-board' | 'schedules' | 'prompt-templates' | 'notifications' | 'onboarding' | 'status' | 'commands',
  ) => {
    const current = runtime.view.state.navigation.getSnapshot()
    void runtime.view.commands
      .execute('app.openPanel', {
        panelId,
        ...(current.workspaceId
          ? { workspaceId: current.workspaceId, binding: 'pinned' }
          : { binding: 'followActive' }),
      })
      .then((opened) => {
        const currentPage = runtime.view.state.presentation.getSnapshot().page
        if (
          currentPage.kind !== 'session' &&
          currentPage.instanceId === opened.instanceId &&
          window.matchMedia(WORKSPACE_VIEWPORT_MEDIA.narrowShell).matches
        )
          return runtime.view.commands.execute('app.setSidebarVisible', { visible: false })
        return undefined
      })
      .catch(() => undefined)
  }
  const renderDesktopLayout =
    nativeWindow && desktopViewport
      ? (panes: Readonly<Record<'projects' | 'workspace' | 'session-tool', ReactNode>>, _shell: ReactNode) => (
          <HbarDesktopLayoutProjection
            model={desktopLayoutModel}
            panes={panes}
            onGeometryChange={desktopGeometryObserver}
            onModelChange={(model, geometry) => {
              const next = flexModelToShellLayout(resolvedLayout, model, geometry)
              if (JSON.stringify(next) !== JSON.stringify(resolvedLayout))
                void runtime.view.commands
                  .execute('layout.commit', { description: next, expectedRevision: layout.revision })
                  .catch(() => undefined)
            }}
          />
        )
      : undefined

  useLayoutEffect(() => {
    if (layout.status !== 'ready') return
    const syncKey = `sidebar:${layout.source}`
    if (layoutVisibilitySync.current === syncKey) return
    layoutVisibilitySync.current = syncKey
    void runtime.view.commands
      .execute('app.initializeSidebar', { visible: sidebarLayout.visible })
      .catch(() => undefined)
  }, [layout.source, layout.status, runtime.view.commands, sidebarLayout.visible])

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
      if (status === 'connected') {
        void claimWebWindowId(window.sessionStorage)
          .then(() => {
            if (!active || client.connectionStatus() !== 'connected') return
            const host = client.connectionHost()
            startup.setConnection(host && startup.confirmHost(hostPersistenceId(host)) ? 'connected' : 'connecting')
          })
          .catch(() => { if (active) startup.setConnection('disconnected') })
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
          startup.setConnection('disconnected')
        }
      })
  }

  return (
    <LumenProvider appearance={lumenAppearance} surfaceRole="reading" data-hbar-layout-state={layout.status}>
      <HbarRuntimeProvider
        view={runtime.view}
        renderSkillImport={(instanceId, connected) => (
          <WebSkillImportPanel
            controller={skillImport}
            instanceId={instanceId}
            connected={connected}
            locale={locale}
          />
        )}
      >
        <HbarComposerFeedbackRegistryProvider>
        <ResourceBrowserLayer controller={resourceBrowser}>
        <HbarMessageResourceLayer model={messageResources} labels={resourceCopy(locale)}>
        <WorkbenchSurfaceCleanup key={binding.hostId ?? 'pending'} runtime={runtime} />
        <NotificationDesktopBridge locale={locale} connected={connection === 'connected'} />
        <HbarWorkspaceShell
          labels={copy.shell}
          runtimeStatusLabels={copy.diagnostics.runtime}
          mobileNavigationLabel={mobileShellNavigationLabel(locale)}
          locale={locale}
          titlebar={
            nativeWindow ? (
              <NativeWindowTitlebar context={nativeWindow} labels={copy.windowControls} title={copy.shell.brand} />
            ) : undefined
          }
          sidebarWidthRem={sidebarLayout.size.preferredRem}
          sidebarRailWidthRem={sidebarLayout.size.collapsedRem}
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
          pageTitle={
            isGlobalFeaturePageId(presentation.page.kind)
              ? globalFeatureCopy(locale).titles[presentation.page.kind]
              : undefined
          }
          notificationNavigation={
            <NotificationPageNavigation
              labels={notificationNavigationCopy(locale)}
              selected={presentation.page.kind === 'notifications'}
              connected={connection === 'connected'}
              onOpen={() => openFeaturePanel('notifications')}
            />
          }
          featureNavigation={(compact) => (
                <GlobalFeatureNavigation
                  compact={compact}
                  locale={locale}
                  connected={connection === 'connected'}
                  hasWorkspace={Boolean(activeNavigation.workspaceId)}
                  onOpen={openFeaturePanel}
                  onStatus={() => openFeaturePanel('status')}
                  onCommands={() => openFeaturePanel('commands')}
                />
              )}
          {...(renderDesktopLayout ? { renderLayout: renderDesktopLayout } : {})}
          desktopToolPresentation={desktopLayoutModel.layout.children?.some((node) => node.id === 'session-tool') ? 'split' : 'drawer'}
          toolWidthRem={toolLayout.size.preferredRem}
          toolLayout={{
            constrainedPresentation: 'drawer',
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
          workspaceNodeNames={workspaceNodeNames}
          workspaceNodeFolderRegistry={workspaceNodeFolderRegistry}
          workspaceNodeFolderMutationAllowed={
            connection === 'connected' && client.connectionHost()?.deviceAccess?.role === 'operator'
          }
          refreshWorkspaceNodeFolderRegistry={refreshWorkspaceNodeFolderRegistry}
          workspaceNodeBadgeLabels={workspaceLocationLabels}
          renderWorkspaceCreator={({ open, onBrowseLocal, onCreated, onCancel }) => (
            <WebWorkspaceLocationPicker
              client={client}
              open={open}
              connected={connection === 'connected'}
              writable={connection === 'connected' && client.connectionHost()?.deviceAccess?.role === 'operator'}
              labels={workspaceLocationLabels}
              onBrowseLocal={async () => {
                onBrowseLocal()
                return null
              }}
              onCreated={onCreated}
              onCancel={onCancel}
            />
          )}
          onCloseTool={() => {
            if (presentation.toolInstanceId)
              void runtime.view.commands
                .execute('app.closePanel', { instanceId: presentation.toolInstanceId })
                .catch(() => undefined)
          }}
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
                <LazySurfaceBoundary labels={lazySurfaceCopy(locale)}>
                  <WorkspaceTool
                    client={client}
                    locale={locale}
                    connected={connection === 'connected'}
                    canExpand={workspaceLayout.config.tabs.visible}
                  />
                </LazySurfaceBoundary>
              </LumenFrame>
            ) : undefined
          }
          overlay={
            <LazySurfaceBoundary labels={lazySurfaceCopy(locale)}>
              <WorkspaceModal locale={locale} connected={connection === 'connected'} chatSearch={chatSearch} />
            </LazySurfaceBoundary>
          }
        >
          {workspaceLayout.config.tabs.visible && workspaceLayout.config.tabs.placement === 'before-content' ? (
            ({ leadingNavigation }) => (
              <WorkspaceTabsController
                runtime={runtime}
                client={client}
                locale={locale}
                leadingNavigation={leadingNavigation}
              >
                <WorkspaceBody
                  client={client}
                  storageLocations={storageLocations}
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
                  workspaceNodeNames={workspaceNodeNames}
                  workspaceLocationLabels={workspaceLocationLabels}
                />
              </WorkspaceTabsController>
            )
          ) : (
            <WorkspaceBody
              client={client}
              storageLocations={storageLocations}
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
              workspaceNodeNames={workspaceNodeNames}
              workspaceLocationLabels={workspaceLocationLabels}
            />
          )}
        </HbarWorkspaceShell>
        </HbarMessageResourceLayer>
        </ResourceBrowserLayer>
        </HbarComposerFeedbackRegistryProvider>
      </HbarRuntimeProvider>
    </LumenProvider>
  )
}
