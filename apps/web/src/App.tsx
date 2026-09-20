import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ChangeEvent } from 'react'
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
  HbarWorkspaceShell,
  useHbarRuntime,
  useHbarRuntimeState,
} from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
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
  createGitCommandClient,
  createRunCommandClient,
  createSessionTimelineClient,
  createInteractionCommandClient,
  createMetricsCommandClient,
  createModelCommandClient,
  createSchemaCallbackClient,
  createSettingsCommandClient,
  createUsageCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import type { BrowserAttachmentSelection, ConnectionStatus } from '@hbar/client'
import { HbarAppUiDialog } from 'hbar-app-ui/app-dialog'
import { HbarAppUiSelect } from 'hbar-app-ui/forms'
import { HbarAppUiWorkbenchNotice } from 'hbar-app-ui/workbench'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { normalizeShellLayout, shellLayout, shellLayoutModule } from './shell-layout'
import { createBrowserClientPersistence } from './client-persistence'
import { createBrowserClientExport } from './client-export'
import { canRenderWebSurface } from './surface-manifest'
import type { HbarNativeConnection } from './native-connection'
import {
  applyWebTheme,
  readThemeBootstrap,
  readThemePreference,
  resolveWebTheme,
  writeThemeBootstrap,
  type WebThemePreference,
} from './theme'
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
    models: createModelCommandClient(client),
    usage: createUsageCommandClient(client),
    budget: createBudgetCommandClient(client),
    settings: createSettingsCommandClient(client),
    configuration: createConfigurationCommandClient(client),
    files: createFileCommandClient(client),
    agents: createAgentCommandClient(client),
    goals: createGoalPlanCommandClient(client),
    extensions: createExtensionCommandClient(client),
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

function WorkspaceBody({
  locale,
  connected,
  prepareAttachment,
  themePreference,
  onThemePreferenceChange,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly prepareAttachment: (file: File) => Promise<BrowserAttachmentSelection>
  readonly themePreference: WebThemePreference
  readonly onThemePreferenceChange: (preference: WebThemePreference) => Promise<void>
}) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const [themeBusy, setThemeBusy] = useState(false)
  const [themeError, setThemeError] = useState(false)
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  if (presentation.page.kind === 'status')
    return <HbarStatusWorkspace labels={copy.status} instanceId={presentation.page.instanceId} />
  if (presentation.page.kind === 'settings')
    return (
      <HbarSettingsWorkspace
        labels={copy.settings}
        connected={connected}
        headerActions={
          <span className="hbar-web-theme-control">
            <HbarAppUiSelect
              aria-label={copy.theme.label}
              value={themePreference}
              disabled={themeBusy}
              aria-invalid={themeError || undefined}
              title={themeError ? copy.theme.saveError : copy.theme.label}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                const preference = readThemePreference(event.currentTarget.value)
                if (!preference) return
                setThemeBusy(true)
                setThemeError(false)
                void onThemePreferenceChange(preference)
                  .catch(() => setThemeError(true))
                  .finally(() => setThemeBusy(false))
              }}
            >
              <option value="system">{copy.theme.system}</option>
              <option value="light">{copy.theme.light}</option>
              <option value="dark">{copy.theme.dark}</option>
            </HbarAppUiSelect>
            {themeError && <small role="alert">{copy.theme.saveError}</small>}
          </span>
        }
        renderGroup={(groupId) => {
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
          return null
        }}
      />
    )
  if (session)
    return (
      <HbarSessionWorkspace
        sessionTitle={session.title}
        workspaceName={directory.workspaces[session.workspaceId]?.name ?? session.workspaceId}
        labels={copy.session}
        connected={connected}
        prepareAttachment={prepareAttachment}
      />
    )
  return <HbarAppUiWorkbenchNotice title={copy.empty.title} description={copy.empty.description} />
}

function WorkspaceTool({ locale, connected }: { readonly locale: ShellLocale; readonly connected: boolean }) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
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
      <HbarFileWorkspace labels={copy.files} connected={connected} instanceId={instanceId} targetLabel={targetLabel} />
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
  const providers = useHbarRuntimeState(runtime.state.providers)
  const modalInstanceId = presentation.modalInstanceId
  const modal = modalInstanceId ? surfaces.panels[modalInstanceId] : undefined
  const close = (instanceId: string) => {
    void runtime.commands.execute('app.closePanel', { instanceId }).catch(() => {})
  }
  if (modalInstanceId && modal?.panelId === 'commands')
    return (
      <HbarAppUiDialog
        open
        chromeless
        title={copy.commandPalette.title}
        closeLabel={copy.commandPalette.close}
        className="hbar-app-react-workspace-modal hbar-app-react-command-modal"
        onClose={() => {
          if (runtime.state.commandPalette.getSnapshot().view !== 'search') {
            void runtime.commands.execute('commandPalette.back', {}).catch(() => {})
            return
          }
          close(modalInstanceId)
        }}
      >
        <HbarCommandPalette labels={copy.commandPalette} connected={connected} />
      </HbarAppUiDialog>
    )
  if (modalInstanceId && modal?.panelId === 'settings-editor') {
    const editor = providers.editor
    const title = editor?.providerId
      ? copy.providers.dialog.editTitle(editor.draft.name || editor.providerId)
      : copy.providers.dialog.addTitle
    return (
      <HbarAppUiDialog
        open
        chromeless
        title={title}
        closeLabel={copy.providers.dialog.back}
        className="hbar-app-react-workspace-modal hbar-app-react-provider-modal"
        onClose={() => close(modalInstanceId)}
      >
        <HbarProviderDialog labels={copy.providers.dialog} connected={connected} />
      </HbarAppUiDialog>
    )
  }
  return null
}

export default function App({
  locale,
  nativeConnection,
}: {
  readonly locale: ShellLocale
  readonly nativeConnection?: HbarNativeConnection | undefined
}) {
  const copy = getShellCopy(locale)
  const clientUrl = nativeConnection?.url ?? window.location.origin
  const clientToken = nativeConnection?.token
  const client = useMemo(() => new HbarClient(clientUrl, clientToken), [clientToken, clientUrl])
  const attachmentController = useMemo(() => createBrowserAttachmentController(client), [client])
  const resourcePicker = useMemo(() => createBrowserResourcePicker(client), [client])
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [hostId, setHostId] = useState(() => `pending:${clientUrl}`)
  const [bootstrapTheme, setBootstrapTheme] = useState(() => readThemeBootstrap(window.localStorage))
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const runtime = useMemo(
    () => createRuntime(client, hostId, locale, attachmentController.commands, resourcePicker),
    [attachmentController, client, hostId, locale, resourcePicker],
  )
  const layout = useHbarRuntimeState(runtime.view.state.layout)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const preferences = useHbarRuntimeState(runtime.view.state.preferences)
  const persistedTheme = readThemePreference(preferences.values.theme)
  const themePreference = persistedTheme ?? bootstrapTheme
  const resolvedTheme = resolveWebTheme(themePreference, systemPrefersDark)
  const resolvedLayout = useMemo(() => normalizeShellLayout(layout.description), [layout.description])
  const sidebarLayout = shellLayoutModule(resolvedLayout, 'projects')
  const toolLayout = shellLayoutModule(resolvedLayout, 'session-tool')

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

  useLayoutEffect(() => {
    applyWebTheme(document.documentElement, resolvedTheme)
    writeThemeBootstrap(window.localStorage, themePreference)
  }, [resolvedTheme, themePreference])

  useEffect(() => {
    if (persistedTheme && persistedTheme !== bootstrapTheme) setBootstrapTheme(persistedTheme)
  }, [bootstrapTheme, persistedTheme])

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

  const setThemePreference = useCallback(
    async (preference: WebThemePreference) => {
      await runtime.view.commands.execute('preferences.set', { key: 'theme', value: preference })
      setBootstrapTheme(preference)
    },
    [runtime.view.commands],
  )

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
    <HbarRuntimeProvider view={runtime.view}>
      <HbarWorkspaceShell
        labels={copy.shell}
        sidebarWidthRem={sidebarLayout.size.preferredRem}
        toolWidthRem={toolLayout.size.preferredRem}
        connection={connection}
        onReconnect={reconnect}
        toolLabel={copy.session.tools.label}
        tool={
          presentation.toolInstanceId ? (
            <WorkspaceTool locale={locale} connected={connection === 'connected'} />
          ) : undefined
        }
        overlay={<WorkspaceModal locale={locale} connected={connection === 'connected'} />}
      >
        <WorkspaceBody
          locale={locale}
          connected={connection === 'connected'}
          prepareAttachment={attachmentController.prepare}
          themePreference={themePreference}
          onThemePreferenceChange={setThemePreference}
        />
      </HbarWorkspaceShell>
    </HbarRuntimeProvider>
  )
}
