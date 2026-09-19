import { useCallback, useEffect } from 'react'
import { HbarAppUiButton, HbarAppUiStatus } from 'hbar-app-ui/primitives'
import type { ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './extension-workspace.css'

type PluginStatus = ExtensionWorkspaceEntryState['plugins'][number]['status']

export interface HbarExtensionWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly hostWide: string
  readonly refresh: string
  readonly loading: string
  readonly plugins: string
  readonly skills: string
  readonly noPlugins: string
  readonly noSkills: string
  readonly status: Readonly<Record<PluginStatus, string>>
  readonly required: string
  readonly provides: string
  readonly commands: string
  readonly panels: string
  readonly source: string
  readonly skillScope: string
  readonly discovered: string
  readonly unavailable: string
  readonly openCommands: string
  readonly openSystemCommands: string
  readonly enable: string
  readonly disable: string
  readonly changing: string
  readonly reconcile: string
  readonly pluginMetadata: (id: string, version: string) => string
  readonly pluginCount: (count: number) => string
  readonly skillCount: (count: number) => string
  readonly error: (code: string) => string
}

function tone(status: PluginStatus): 'positive' | 'neutral' | 'danger' {
  if (status === 'active') return 'positive'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

export function HbarExtensionWorkspace({
  labels,
  connected,
  instanceId,
}: {
  readonly labels: HbarExtensionWorkspaceLabels
  readonly connected: boolean
  readonly instanceId: string
}) {
  const runtime = useHbarRuntime()
  const extensions = useHbarRuntimeState(runtime.state.extensions)
  const entry = extensions.entries[instanceId]
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (!entry) invoke('extensionWorkspace.refresh', { instanceId })
  }, [entry, instanceId, invoke])

  const openCommands = (query: string) => {
    void runtime.commands
      .execute('app.openPanel', { panelId: 'commands' })
      .then(() => runtime.commands.execute('commandPalette.setQuery', { query }))
      .catch(() => {})
  }

  return (
    <section className="hbar-app-react-extension-workspace" aria-labelledby={`${instanceId}-extensions-title`}>
      <header className="hbar-app-react-extension-heading">
        <div>
          <h2 id={`${instanceId}-extensions-title`}>{labels.title}</h2>
          <p>{labels.description}</p>
          <small>{labels.hostWide}</small>
        </div>
        <div>
          <HbarAppUiButton
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('extensionWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={() => openCommands('system.')}>{labels.openSystemCommands}</HbarAppUiButton>
        </div>
      </header>

      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-extension-state" role="status">
          {labels.loading}
        </p>
      ) : entry.error ? (
        <p className="hbar-app-react-extension-state" role="alert">
          {labels.error(entry.error)}
        </p>
      ) : (
        <>
          <section className="hbar-app-react-extension-section">
            <header>
              <h3>{labels.plugins}</h3>
              <small>{labels.pluginCount(entry.plugins.length)}</small>
            </header>
            {entry.plugins.length === 0 ? (
              <p className="hbar-app-react-extension-empty">{labels.noPlugins}</p>
            ) : (
              <ul className="hbar-app-react-extension-list">
                {entry.plugins.map((plugin) => {
                  const action = entry.actions[plugin.id]
                  const query = plugin.contributes?.commands[0]?.id ?? plugin.provides[0] ?? plugin.id
                  const source = plugin.packageName ?? plugin.path ?? plugin.id
                  return (
                    <li key={plugin.id} className="hbar-app-react-extension-plugin">
                      <header>
                        <div>
                          <strong>{plugin.name}</strong>
                          <small>{labels.pluginMetadata(plugin.id, plugin.version)}</small>
                        </div>
                        <HbarAppUiStatus value={labels.status[plugin.status]} tone={tone(plugin.status)} />
                      </header>
                      <p>{plugin.description}</p>
                      <dl>
                        <div>
                          <dt>{labels.source}</dt>
                          <dd>{source}</dd>
                        </div>
                        <div>
                          <dt>{labels.provides}</dt>
                          <dd>{plugin.provides.join(', ') || labels.unavailable}</dd>
                        </div>
                        <div>
                          <dt>{labels.commands}</dt>
                          <dd>{plugin.contributes?.commands.length ?? plugin.terminalCommands?.length ?? 0}</dd>
                        </div>
                        <div>
                          <dt>{labels.panels}</dt>
                          <dd>{plugin.contributes?.panels.length ?? 0}</dd>
                        </div>
                      </dl>
                      {action?.error && <p role="alert">{labels.error(action.error)}</p>}
                      <footer>
                        <HbarAppUiButton onClick={() => openCommands(query)}>{labels.openCommands}</HbarAppUiButton>
                        {action?.status === 'unknown' ? (
                          <HbarAppUiButton onClick={() => invoke('extensionWorkspace.refresh', { instanceId })}>
                            {labels.reconcile}
                          </HbarAppUiButton>
                        ) : (
                          !plugin.required && (
                            <HbarAppUiButton
                              disabled={!connected || action?.status === 'submitting'}
                              tone={plugin.status === 'active' ? 'warning' : 'accent'}
                              onClick={() =>
                                invoke('extensionWorkspace.setEnabled', {
                                  instanceId,
                                  pluginId: plugin.id,
                                  enabled: plugin.status !== 'active',
                                })
                              }
                            >
                              {action?.status === 'submitting'
                                ? labels.changing
                                : plugin.status === 'active'
                                  ? labels.disable
                                  : labels.enable}
                            </HbarAppUiButton>
                          )
                        )}
                        {plugin.required && <small>{labels.required}</small>}
                      </footer>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <section className="hbar-app-react-extension-section">
            <header>
              <h3>{labels.skills}</h3>
              <small>{labels.skillCount(entry.skills.length)}</small>
            </header>
            {entry.skills.length === 0 ? (
              <p className="hbar-app-react-extension-empty">{labels.noSkills}</p>
            ) : (
              <ul className="hbar-app-react-extension-list hbar-app-react-extension-skill-list">
                {entry.skills.map((skill) => (
                  <li key={skill.id}>
                    <div>
                      <strong>{skill.id}</strong>
                      <small title={skill.path}>{skill.path}</small>
                      <span>{labels.skillScope}</span>
                    </div>
                    <HbarAppUiStatus value={labels.discovered} tone="neutral" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}
