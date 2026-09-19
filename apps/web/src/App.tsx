import { useEffect, useMemo, useState } from 'react'
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
import { createAppRuntime, type ClientJsonValue } from '@hbar/app-runtime'
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
import { HbarAppUiDialog } from 'hbar-app-ui'
import { HbarAppUiWorkbenchNotice } from 'hbar-app-ui/workbench'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { shellLayout } from './shell-layout'
import { createBrowserClientPersistence } from './client-persistence'
import { createBrowserClientExport } from './client-export'
import './App.css'

const panels = new Set(['commands', 'files', 'monitoring', 'agents', 'goals', 'status', 'settings', 'settings-editor'])

function isJsonObject(value: ClientJsonValue | undefined): value is Readonly<Record<string, ClientJsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function layoutSidebarWidth(layout: Readonly<Record<string, ClientJsonValue>>): number {
  const sidebar = layout.sidebar
  if (!isJsonObject(sidebar) || !Object.hasOwn(sidebar, 'widthRem')) return shellLayout.sidebar.widthRem
  const width = sidebar.widthRem
  return typeof width === 'number' ? Math.min(24, Math.max(12, width)) : shellLayout.sidebar.widthRem
}

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
    surfaces: { canRender: (panelId) => panels.has(panelId) },
    defaultLayout: shellLayout,
    persistence: createBrowserClientPersistence(window.localStorage, 'hbar:web'),
    exporter: createBrowserClientExport(),
  })
}

function WorkspaceBody({
  locale,
  connected,
  prepareAttachment,
}: {
  readonly locale: ShellLocale
  readonly connected: boolean
  readonly prepareAttachment: (file: File) => Promise<BrowserAttachmentSelection>
}) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  if (presentation.page.kind === 'status')
    return <HbarStatusWorkspace labels={copy.status} instanceId={presentation.page.instanceId} />
  if (presentation.page.kind === 'settings')
    return (
      <HbarSettingsWorkspace
        labels={copy.settings}
        connected={connected}
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
  const presentation = useHbarRuntimeState(runtime.state.presentation)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const instanceId = presentation.toolInstanceId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  if (!instanceId || !panel) return null
  if (panel.panelId === 'files')
    return <HbarFileWorkspace labels={copy.files} connected={connected} instanceId={instanceId} />
  if (panel.panelId === 'monitoring') return <HbarSessionMonitoring labels={copy.monitoring} instanceId={instanceId} />
  if (panel.panelId === 'agents')
    return <HbarAgentWorkspace labels={copy.agents} connected={connected} instanceId={instanceId} />
  if (panel.panelId === 'goals')
    return <HbarGoalPlanWorkspace labels={copy.goals} connected={connected} instanceId={instanceId} />
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
        onClose={() => close(modalInstanceId)}
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

export default function App({ locale }: { readonly locale: ShellLocale }) {
  const copy = getShellCopy(locale)
  const client = useMemo(() => new HbarClient(window.location.origin), [])
  const attachmentController = useMemo(() => createBrowserAttachmentController(client), [client])
  const resourcePicker = useMemo(() => createBrowserResourcePicker(client), [client])
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [hostId, setHostId] = useState(() => `pending:${window.location.origin}`)
  const runtime = useMemo(
    () => createRuntime(client, hostId, locale, attachmentController.commands, resourcePicker),
    [attachmentController, client, hostId, locale, resourcePicker],
  )
  const layout = useHbarRuntimeState(runtime.view.state.layout)
  const presentation = useHbarRuntimeState(runtime.view.state.presentation)
  const sidebarWidth = layoutSidebarWidth(layout.description)

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
    <HbarRuntimeProvider view={runtime.view}>
      <HbarWorkspaceShell
        labels={copy.shell}
        sidebarWidthRem={sidebarWidth}
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
        />
      </HbarWorkspaceShell>
    </HbarRuntimeProvider>
  )
}
