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
import { createAppRuntime } from '@hbar/app-runtime'
import {
  HbarClient,
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
} from '@hbar/client'
import type { ConnectionStatus } from '@hbar/client'
import { HbarAppUiWorkbenchNotice } from 'hbar-app-ui/workbench'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { shellLayout } from './shell-layout'

const panels = new Set([
  'commands',
  'files',
  'monitoring',
  'agents',
  'goals',
  'extensions',
  'status',
  'settings',
  'settings-editor',
])

function createRuntime(client: HbarClient, hostId: string, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  return createAppRuntime({
    instanceId: crypto.randomUUID(),
    hostId,
    directory: createDirectoryQueryAdapter(client),
    timeline: createSessionTimelineClient(client),
    run: createRunCommandClient(client),
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
  })
}

function WorkspaceBody({ locale, connected }: { readonly locale: ShellLocale; readonly connected: boolean }) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const panel = surfaces.focusedPanelId ? surfaces.panels[surfaces.focusedPanelId] : undefined
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  if (panel?.panelId === 'settings-editor')
    return <HbarProviderDialog labels={copy.providers.dialog} connected={connected} />
  if (panel?.panelId === 'commands') return <HbarCommandPalette labels={copy.commandPalette} connected={connected} />
  if (panel?.panelId === 'files') return <HbarFileWorkspace labels={copy.files} connected={connected} />
  if (panel?.panelId === 'monitoring') return <HbarSessionMonitoring labels={copy.monitoring} />
  if (panel?.panelId === 'agents') return <HbarAgentWorkspace labels={copy.agents} connected={connected} />
  if (panel?.panelId === 'goals') return <HbarGoalPlanWorkspace labels={copy.goals} connected={connected} />
  if (panel?.panelId === 'extensions') return <HbarExtensionWorkspace labels={copy.extensions} connected={connected} />
  if (panel?.panelId === 'status') return <HbarStatusWorkspace labels={copy.status} />
  if (panel?.panelId === 'settings')
    return (
      <HbarSettingsWorkspace
        labels={copy.settings}
        connected={connected}
        renderGroup={(groupId) =>
          groupId === 'providers' ? <HbarProviderSettings labels={copy.providers.list} connected={connected} /> : null
        }
      />
    )
  if (panel) {
    const content = copy.panels[panel.panelId as keyof typeof copy.panels] ?? copy.panels.commands
    return <HbarAppUiWorkbenchNotice title={content.title} description={content.description} />
  }
  if (session) return <HbarSessionWorkspace sessionTitle={session.title} labels={copy.session} connected={connected} />
  return <HbarAppUiWorkbenchNotice title={copy.empty.title} description={copy.empty.description} />
}

export default function App({ locale }: { readonly locale: ShellLocale }) {
  const copy = getShellCopy(locale)
  const client = useMemo(() => new HbarClient(window.location.origin), [])
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [hostId, setHostId] = useState(() => `pending:${window.location.origin}`)
  const runtime = useMemo(() => createRuntime(client, hostId, locale), [client, hostId, locale])

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
      client.disconnect()
    }
  }, [client])

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
        sidebarWidthRem={shellLayout.sidebar.widthRem}
        connection={connection}
        onReconnect={reconnect}
      >
        <WorkspaceBody locale={locale} connected={connection === 'connected'} />
      </HbarWorkspaceShell>
    </HbarRuntimeProvider>
  )
}
