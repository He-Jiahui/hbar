import { useCallback, useEffect } from 'react'
import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton, LumenStatus } from '@lumen/app-ui'
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

function tone(status: PluginStatus): 'success' | 'neutral' | 'danger' {
  if (status === 'active') return 'success'
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
    <LumenFrame as="section" className="hbar-app-react-extension-workspace" aria-labelledby={`${instanceId}-extensions-title`}>
      <LumenFrame as="header" className="hbar-app-react-extension-heading">
        <LumenFrame>
          <LumenText as="h2" id={`${instanceId}-extensions-title`}>{labels.title}</LumenText>
          <LumenText as="p">{labels.description}</LumenText>
          <LumenText as="small">{labels.hostWide}</LumenText>
        </LumenFrame>
        <LumenFrame>
          <LumenButton
            variant="outlined"
            disabled={!connected || entry?.status === 'loading'}
            onClick={() => invoke('extensionWorkspace.refresh', { instanceId })}
          >
            {labels.refresh}
          </LumenButton>
          <LumenButton variant="outlined" onClick={() => openCommands('system.')}>
            {labels.openSystemCommands}
          </LumenButton>
        </LumenFrame>
      </LumenFrame>

      {!entry || entry.status === 'loading' ? (
        <LumenText as="p" className="hbar-app-react-extension-state" role="status">
          {labels.loading}
        </LumenText>
      ) : entry.error ? (
        <LumenText as="p" className="hbar-app-react-extension-state" role="alert">
          {labels.error(entry.error)}
        </LumenText>
      ) : (
        <>
          <LumenFrame as="section" className="hbar-app-react-extension-section">
            <LumenFrame as="header">
              <LumenText as="h3">{labels.plugins}</LumenText>
              <LumenText as="small">{labels.pluginCount(entry.plugins.length)}</LumenText>
            </LumenFrame>
            {entry.plugins.length === 0 ? (
              <LumenText as="p" className="hbar-app-react-extension-empty">{labels.noPlugins}</LumenText>
            ) : (
              <LumenCollection as="ul" className="hbar-app-react-extension-list">
                {entry.plugins.map((plugin) => {
                  const action = entry.actions[plugin.id]
                  const query = plugin.contributes?.commands[0]?.id ?? plugin.provides[0] ?? plugin.id
                  const source = plugin.packageName ?? plugin.path ?? plugin.id
                  return (
                    <LumenCollectionItem key={plugin.id} className="hbar-app-react-extension-plugin">
                      <LumenFrame as="header">
                        <LumenFrame>
                          <LumenText as="strong">{plugin.name}</LumenText>
                          <LumenText as="small">{labels.pluginMetadata(plugin.id, plugin.version)}</LumenText>
                        </LumenFrame>
                        <LumenStatus value={labels.status[plugin.status]} tone={tone(plugin.status)} />
                      </LumenFrame>
                      <LumenText as="p">{plugin.description}</LumenText>
                      <LumenCollection as="dl">
                        <LumenFrame>
                          <LumenCollectionItem as="dt">{labels.source}</LumenCollectionItem>
                          <LumenCollectionItem as="dd">{source}</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                          <LumenCollectionItem as="dt">{labels.provides}</LumenCollectionItem>
                          <LumenCollectionItem as="dd">{plugin.provides.join(', ') || labels.unavailable}</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                          <LumenCollectionItem as="dt">{labels.commands}</LumenCollectionItem>
                          <LumenCollectionItem as="dd">{plugin.contributes?.commands.length ?? plugin.terminalCommands?.length ?? 0}</LumenCollectionItem>
                        </LumenFrame>
                        <LumenFrame>
                          <LumenCollectionItem as="dt">{labels.panels}</LumenCollectionItem>
                          <LumenCollectionItem as="dd">{plugin.contributes?.panels.length ?? 0}</LumenCollectionItem>
                        </LumenFrame>
                      </LumenCollection>
                      {action?.error && <LumenText as="p" role="alert">{labels.error(action.error)}</LumenText>}
                      <LumenFrame as="footer">
                        <LumenButton variant="text" onClick={() => openCommands(query)}>
                          {labels.openCommands}
                        </LumenButton>
                        {action?.status === 'unknown' ? (
                          <LumenButton
                            variant="outlined"
                            onClick={() => invoke('extensionWorkspace.refresh', { instanceId })}
                          >
                            {labels.reconcile}
                          </LumenButton>
                        ) : (
                          !plugin.required && (
                            <LumenButton
                              disabled={!connected || action?.status === 'submitting'}
                              tone={plugin.status === 'active' ? 'warning' : 'primary'}
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
                            </LumenButton>
                          )
                        )}
                        {plugin.required && <LumenText as="small">{labels.required}</LumenText>}
                      </LumenFrame>
                    </LumenCollectionItem>
                  )
                })}
              </LumenCollection>
            )}
          </LumenFrame>
          <LumenFrame as="section" className="hbar-app-react-extension-section">
            <LumenFrame as="header">
              <LumenText as="h3">{labels.skills}</LumenText>
              <LumenText as="small">{labels.skillCount(entry.skills.length)}</LumenText>
            </LumenFrame>
            {entry.skills.length === 0 ? (
              <LumenText as="p" className="hbar-app-react-extension-empty">{labels.noSkills}</LumenText>
            ) : (
              <LumenCollection as="ul" className="hbar-app-react-extension-list hbar-app-react-extension-skill-list">
                {entry.skills.map((skill) => (
                  <LumenCollectionItem key={skill.id}>
                    <LumenFrame>
                      <LumenText as="strong">{skill.id}</LumenText>
                      <LumenText as="small" title={skill.path}>{skill.path}</LumenText>
                      <LumenText as="span">{labels.skillScope}</LumenText>
                    </LumenFrame>
                    <LumenStatus value={labels.discovered} tone="neutral" />
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )}
          </LumenFrame>
        </>
      )}
    </LumenFrame>
  )
}
