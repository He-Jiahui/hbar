import { useEffect, useLayoutEffect, useRef } from 'react'
import { ChevronRight, Puzzle, RefreshCw } from 'lucide-react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenStatus,
  LumenText,
} from '@lumen/app-ui'
import { extensionWorkspacePage, type ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState } from './runtime'
import { ExtensionPluginDetail, type ExtensionPluginDetailLabels } from './extension-plugin-detail'
import { ExtensionPagination, type ExtensionPaginationLabels } from './extension-pagination'
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
  readonly filter: string
  readonly noMatches: string
  readonly inspect: (name: string) => string
  readonly pagination: ExtensionPaginationLabels
  readonly detail: ExtensionPluginDetailLabels
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
  const detail = entry?.detail
  const page = entry ? extensionWorkspacePage(entry) : null
  const root = useRef<HTMLElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const focusDirection = useRef<'detail' | 'list' | null>(null)
  useEffect(() => {
    if (!entry && connected) void runtime.commands.execute('extensionWorkspace.refresh', { instanceId }).catch(() => {})
  }, [entry, connected, instanceId, runtime.commands])
  useLayoutEffect(() => {
    if (!focusDirection.current) return
    if (entry?.detail && focusDirection.current === 'detail') {
      root.current?.querySelector<HTMLButtonElement>('.hbar-app-react-plugin-detail-navigation button')?.focus()
      focusDirection.current = null
    } else if (!entry?.detail && focusDirection.current === 'list') {
      if (opener.current?.isConnected && opener.current.getClientRects().length) opener.current.focus()
      else root.current?.querySelector<HTMLInputElement>('input')?.focus()
      focusDirection.current = null
    }
  }, [entry?.detail])

  const refresh = () => void runtime.commands.execute('extensionWorkspace.refresh', { instanceId }).catch(() => {})
  const openCommands = () =>
    void runtime.commands
      .execute('app.openPanel', { panelId: 'commands' })
      .then(() => runtime.commands.execute('commandPalette.setQuery', { query: 'system.' }))
      .catch(() => {})

  return (
    <LumenFrame
      ref={root}
      as="section"
      className="hbar-app-react-extension-workspace"
      aria-labelledby={detail ? undefined : `${instanceId}-extensions-title`}
      aria-label={detail ? labels.title : undefined}
    >
      {!detail && (
        <LumenFrame as="header" className="hbar-app-react-extension-heading">
          <LumenFrame>
            <LumenText as="h2" id={`${instanceId}-extensions-title`}>
              {labels.title}
            </LumenText>
            <LumenText as="p">{labels.description}</LumenText>
            <LumenText as="small">{labels.hostWide}</LumenText>
          </LumenFrame>
          <LumenFrame>
            <LumenButton variant="outlined" disabled={!connected || entry?.status === 'loading'} onClick={refresh}>
              <LumenIcon icon={RefreshCw} tier="md" />
              {labels.refresh}
            </LumenButton>
            <LumenButton variant="text" onClick={openCommands}>
              {labels.openSystemCommands}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
      )}

      <LumenFrame className="hbar-app-react-extension-browser" hidden={Boolean(entry?.detail)}>
        {!entry || entry.status === 'loading' ? (
          <LumenText as="p" className="hbar-app-react-extension-state" role="status">
            {labels.loading}
          </LumenText>
        ) : null}
        {entry?.error && (
          <LumenText as="p" role="alert">
            {labels.error(entry.error)}
          </LumenText>
        )}
        {entry && page && (
          <>
            <LumenFrame as="label" className="hbar-app-react-extension-filter">
              <LumenText as="span">{labels.filter}</LumenText>
              <LumenInput
                value={entry.query}
                maxLength={200}
                onChange={(event) =>
                  void runtime.commands
                    .execute('extensionWorkspace.setQuery', { instanceId, query: event.currentTarget.value })
                    .catch(() => {})
                }
              />
            </LumenFrame>
            <LumenFrame as="section" className="hbar-app-react-extension-section" aria-label={labels.plugins}>
              <LumenFrame as="header">
                <LumenText as="h3">{labels.plugins}</LumenText>
                <LumenText as="small">{labels.pluginCount(page.pluginCount)}</LumenText>
              </LumenFrame>
              {!page.plugins.length ? (
                <LumenText as="p" className="hbar-app-react-extension-empty">
                  {entry.plugins.length ? labels.noMatches : labels.noPlugins}
                </LumenText>
              ) : (
                <LumenCollection as="ul" className="hbar-app-react-extension-list">
                  {page.plugins.map((plugin) => {
                    const action = entry.actions[plugin.id]
                    return (
                      <LumenCollectionItem
                        as="li"
                        key={plugin.id}
                        className="hbar-app-react-extension-plugin"
                        data-plugin-id={plugin.id}
                      >
                        <LumenButton
                          type="button"
                          variant="text"
                          className="hbar-app-react-extension-open"
                          aria-label={labels.inspect(plugin.name)}
                          aria-current={entry.selectedPluginId === plugin.id ? 'true' : undefined}
                          disabled={!connected}
                          onClick={(event) => {
                            opener.current = event.currentTarget
                            focusDirection.current = 'detail'
                            void runtime.commands
                              .execute('extensionWorkspace.inspect', { instanceId, pluginId: plugin.id })
                              .catch(() => {})
                          }}
                        >
                          <LumenIcon icon={Puzzle} tier="md" />
                          <LumenText as="span" className="hbar-app-react-extension-open-copy">
                            <LumenText as="strong">{plugin.name}</LumenText>
                            <LumenText as="small">{labels.pluginMetadata(plugin.id, plugin.version)}</LumenText>
                            <LumenText as="span">{plugin.description}</LumenText>
                          </LumenText>
                          <LumenStatus
                            value={labels.status[plugin.status]}
                            tone={
                              plugin.status === 'active' ? 'success' : plugin.status === 'failed' ? 'danger' : 'neutral'
                            }
                          />
                          <LumenIcon icon={ChevronRight} tier="md" />
                        </LumenButton>
                        <LumenText as="small">{plugin.packageName ?? plugin.path ?? plugin.id}</LumenText>
                        {action?.error && (
                          <LumenText as="p" role="alert">
                            {labels.error(action.error)}
                          </LumenText>
                        )}
                        <LumenFrame as="footer">
                          {plugin.required && <LumenText as="small">{labels.required}</LumenText>}
                          {action?.status === 'unknown' ? (
                            <LumenButton
                              variant="outlined"
                              disabled={!connected || entry.status === 'loading'}
                              onClick={refresh}
                            >
                              {labels.reconcile}
                            </LumenButton>
                          ) : (
                            !plugin.required && (
                              <LumenButton
                                variant="text"
                                disabled={!connected || action?.status === 'submitting' || entry.status === 'loading'}
                                onClick={() =>
                                  void runtime.commands
                                    .execute('extensionWorkspace.setEnabled', {
                                      instanceId,
                                      pluginId: plugin.id,
                                      enabled: plugin.status !== 'active',
                                    })
                                    .catch(() => {})
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
                        </LumenFrame>
                      </LumenCollectionItem>
                    )
                  })}
                </LumenCollection>
              )}
              <ExtensionPagination
                labels={labels.pagination}
                count={page.pluginCount}
                page={page.pluginPage}
                onPage={(page) =>
                  void runtime.commands
                    .execute('extensionWorkspace.setPage', { instanceId, collection: 'plugins', page })
                    .catch(() => {})
                }
              />
            </LumenFrame>
            <LumenFrame as="section" className="hbar-app-react-extension-section" aria-label={labels.skills}>
              <LumenFrame as="header">
                <LumenText as="h3">{labels.skills}</LumenText>
                <LumenText as="small">{labels.skillCount(page.skillCount)}</LumenText>
              </LumenFrame>
              {!page.skills.length ? (
                <LumenText as="p" className="hbar-app-react-extension-empty">
                  {entry.skills.length ? labels.noMatches : labels.noSkills}
                </LumenText>
              ) : (
                <LumenCollection as="ul" className="hbar-app-react-extension-list hbar-app-react-extension-skill-list">
                  {page.skills.map((skill) => (
                    <LumenCollectionItem as="li" key={skill.id}>
                      <LumenFrame>
                        <LumenText as="strong">{skill.id}</LumenText>
                        <LumenText as="small" title={skill.path}>
                          {skill.path}
                        </LumenText>
                        <LumenText as="span">{labels.skillScope}</LumenText>
                      </LumenFrame>
                      <LumenStatus value={labels.discovered} tone="neutral" />
                    </LumenCollectionItem>
                  ))}
                </LumenCollection>
              )}
              <ExtensionPagination
                labels={labels.pagination}
                count={page.skillCount}
                page={page.skillPage}
                onPage={(page) =>
                  void runtime.commands
                    .execute('extensionWorkspace.setPage', { instanceId, collection: 'skills', page })
                    .catch(() => {})
                }
              />
            </LumenFrame>
          </>
        )}
      </LumenFrame>
      {detail && (
        <ExtensionPluginDetail
          key={detail.pluginId}
          detail={detail}
          labels={labels.detail}
          connected={connected}
          onBack={() => {
            focusDirection.current = 'list'
            void runtime.commands.execute('extensionWorkspace.back', { instanceId }).catch(() => {})
          }}
          onRetry={() =>
            void runtime.commands
              .execute('extensionWorkspace.inspect', { instanceId, pluginId: detail.pluginId })
              .catch(() => {})
          }
        />
      )}
    </LumenFrame>
  )
}
