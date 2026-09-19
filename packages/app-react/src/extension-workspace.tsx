import { useCallback, useEffect } from 'react'
import { HbarAppUiButton, HbarAppUiMetricStrip, HbarAppUiStatus, HbarAppUiSurface } from 'hbar-app-ui'
import type { ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import './extension-workspace.css'

type PluginStatus = ExtensionWorkspaceEntryState['plugins'][number]['status']

export interface HbarExtensionWorkspaceLabels {
  readonly title: string
  readonly description: string
  readonly close: string
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
  readonly openCommands: string
  readonly openSystemCommands: string
  readonly enable: string
  readonly disable: string
  readonly changing: string
  readonly reconcile: string
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
}: {
  readonly labels: HbarExtensionWorkspaceLabels
  readonly connected: boolean
}) {
  const runtime = useHbarRuntime()
  const surfaces = useHbarRuntimeState(runtime.state.surfaces)
  const extensions = useHbarRuntimeState(runtime.state.extensions)
  const instanceId = surfaces.focusedPanelId
  const panel = instanceId ? surfaces.panels[instanceId] : undefined
  const entry = instanceId ? extensions.entries[instanceId] : undefined
  const invoke = useCallback(
    (name: string, input: unknown) =>
      void (runtime.commands.execute as (command: string, value: unknown) => Promise<unknown>)(name, input).catch(
        () => {},
      ),
    [runtime.commands],
  )
  useEffect(() => {
    if (instanceId && panel?.panelId === 'extensions' && !entry) invoke('extensionWorkspace.refresh', { instanceId })
  }, [entry, instanceId, invoke, panel?.panelId])
  if (!instanceId || panel?.panelId !== 'extensions') return null

  const openCommands = (query: string) => {
    void runtime.commands
      .execute('app.openPanel', { panelId: 'commands' })
      .then(() => runtime.commands.execute('commandPalette.setQuery', { query }))
      .catch(() => {})
  }

  return (
    <HbarAppUiSurface className="hbar-app-react-extension-workspace">
      <header>
        <div>
          <h1>{labels.title}</h1>
          <p>{labels.description}</p>
        </div>
        <div>
          <HbarAppUiButton
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('extensionWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </HbarAppUiButton>
          <HbarAppUiButton onClick={() => invoke('app.closePanel', { instanceId })}>{labels.close}</HbarAppUiButton>
        </div>
      </header>
      {!entry || entry.status === 'loading' ? (
        <p className="hbar-app-react-extension-loading">{labels.loading}</p>
      ) : entry.error ? (
        <p className="hbar-app-react-extension-loading" role="alert">
          {labels.error(entry.error)}
        </p>
      ) : (
        <main>
          <HbarAppUiMetricStrip
            metrics={[
              { label: labels.plugins, value: labels.pluginCount(entry.plugins.length) },
              { label: labels.skills, value: labels.skillCount(entry.skills.length) },
            ]}
          />
          <section className="hbar-app-react-extension-plugins">
            <header>
              <h2>{labels.plugins}</h2>
              <HbarAppUiButton onClick={() => openCommands('system.')}>{labels.openSystemCommands}</HbarAppUiButton>
            </header>
            {entry.plugins.length === 0 ? (
              <p>{labels.noPlugins}</p>
            ) : (
              <ul>
                {entry.plugins.map((plugin) => {
                  const action = entry.actions[plugin.id]
                  const query = plugin.contributes?.commands[0]?.id ?? plugin.provides[0] ?? plugin.id
                  return (
                    <li key={plugin.id}>
                      <header>
                        <div>
                          <strong>{plugin.name}</strong>
                          <small>
                            {plugin.id} · {plugin.version}
                          </small>
                        </div>
                        <HbarAppUiStatus value={labels.status[plugin.status]} tone={tone(plugin.status)} />
                      </header>
                      <p>{plugin.description}</p>
                      <dl>
                        <div>
                          <dt>{labels.provides}</dt>
                          <dd>{plugin.provides.join(', ') || '—'}</dd>
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
          <section className="hbar-app-react-extension-skills">
            <h2>{labels.skills}</h2>
            {entry.skills.length === 0 ? (
              <p>{labels.noSkills}</p>
            ) : (
              <ul>
                {entry.skills.map((skill) => (
                  <li key={skill.id}>
                    <strong>{skill.id}</strong>
                    <small>{skill.path}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}
    </HbarAppUiSurface>
  )
}
