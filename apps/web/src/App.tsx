import { useEffect, useMemo, useState } from 'react'
import { HbarRuntimeProvider, HbarWorkspaceShell, useHbarRuntime, useHbarRuntimeState } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  HbarClient,
  createBudgetCommandClient,
  createConnectionCommands,
  createDirectoryQueryAdapter,
  createRunCommandClient,
  createSessionTimelineClient,
  createInteractionCommandClient,
  createModelCommandClient,
  createUsageCommandClient,
} from '@hbar/client'
import type { ConnectionStatus } from '@hbar/client'
import { HbarAppUiWorkbenchNotice } from 'hbar-app-ui/workbench'
import { getShellCopy, type ShellLocale } from './shell-copy'
import { shellLayout } from './shell-layout'

const panels = new Set(['commands', 'status', 'settings'])

function createRuntime(client: HbarClient, hostId: string) {
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
    surfaces: { canRender: (panelId) => panels.has(panelId) },
  })
}

function WorkspaceBody({ locale }: { readonly locale: ShellLocale }) {
  const copy = getShellCopy(locale)
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const directory = useHbarRuntimeState(runtime.state.directory)
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const panel = surfaces.focusedPanelId ? surfaces.panels[surfaces.focusedPanelId] : undefined
  const session = navigation.sessionId ? directory.sessions[navigation.sessionId] : undefined
  const content = panel
    ? (copy.panels[panel.panelId as keyof typeof copy.panels] ?? copy.panels.commands)
    : session
      ? { title: session.title, description: copy.selectedSession(session.title) }
      : copy.empty
  return <HbarAppUiWorkbenchNotice title={content.title} description={content.description} />
}

export default function App({ locale }: { readonly locale: ShellLocale }) {
  const copy = getShellCopy(locale)
  const client = useMemo(() => new HbarClient(window.location.origin), [])
  const [connection, setConnection] = useState<ConnectionStatus>('connecting')
  const [hostId, setHostId] = useState(() => `pending:${window.location.origin}`)
  const runtime = useMemo(() => createRuntime(client, hostId), [client, hostId])

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
        <WorkspaceBody locale={locale} />
      </HbarWorkspaceShell>
    </HbarRuntimeProvider>
  )
}
