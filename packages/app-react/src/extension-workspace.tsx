import { useEffect, useId, useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { ChevronRight, Puzzle, RefreshCw, SearchX, X } from 'lucide-react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
  LumenInput,
  LumenStatus,
  LumenIntegrations02,
  LumenIntegrations01,
} from '@lumen/app-ui'
import { extensionWorkspacePage, type ExtensionWorkspaceEntryState } from '@hbar/app-runtime'
import { useHbarRuntime, useHbarRuntimeState, useHbarSkillImportSurface } from './runtime'
import { ExtensionPluginDetail, type ExtensionPluginDetailLabels } from './extension-plugin-detail'
import { ExtensionSkillDetail, type ExtensionSkillDetailLabels } from './extension-skill-detail'
import { ExtensionPagination, type ExtensionPaginationLabels } from './extension-pagination'
import { ExtensionCollectionFeedback, type ExtensionCollectionLabels } from './extension-collection-feedback'
import './extension-workspace.css'

type PluginStatus = ExtensionWorkspaceEntryState['plugins'][number]['status']

export interface HbarExtensionWorkspaceLabels {
  readonly navigation: Readonly<
    Record<
      'plugins' | 'skills',
      {
        readonly title: string
        readonly description: string
        readonly filter: string
      }
    >
  >
  readonly collections: {
    readonly plugins: ExtensionCollectionLabels
    readonly skills: ExtensionCollectionLabels
  }
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
  readonly noMatchingPlugins: string
  readonly noMatchingSkills: string
  readonly noMatchesHint: string
  readonly clearSearch: string
  readonly skillSearchResults: (matching: number, total: number) => string
  readonly inspect: (name: string) => string
  readonly pagination: ExtensionPaginationLabels
  readonly detail: ExtensionPluginDetailLabels
  readonly skillDetail: ExtensionSkillDetailLabels
}

/** A short, content-grown recovery surface for a confirmed nonempty collection. */
function ExtensionNoMatches({
  title,
  labels,
  onClear,
}: {
  readonly title: string
  readonly labels: Pick<HbarExtensionWorkspaceLabels, 'noMatchesHint' | 'clearSearch'>
  readonly onClear: () => void
}) {
  return (
    <LumenFrame className="hbar-app-react-extension-no-matches" role="status">
      <LumenIcon icon={SearchX} tier="lg" />
      <LumenContentText context="record.title">{title}</LumenContentText>
      <LumenContentText context="section.description">{labels.noMatchesHint}</LumenContentText>
      <LumenButton type="button" variant="outlined" onClick={onClear}>
        {labels.clearSearch}
      </LumenButton>
    </LumenFrame>
  )
}

export function HbarExtensionWorkspace({
  labels,
  connected,
  instanceId,
  collection,
  onCommandPaletteOpen,
  commandPaletteTriggerRef,
}: {
  readonly labels: HbarExtensionWorkspaceLabels
  readonly connected: boolean
  readonly instanceId: string
  readonly collection?: 'plugins' | 'skills'
  readonly onCommandPaletteOpen?: (opener: HTMLButtonElement) => () => void
  readonly commandPaletteTriggerRef?: RefObject<HTMLButtonElement | null>
}) {
  const runtime = useHbarRuntime()
  const renderSkillImport = useHbarSkillImportSurface()
  const extensions = useHbarRuntimeState(runtime.state.extensions)
  const entry = extensions.entries[instanceId]
  const detail = collection === 'skills' ? undefined : entry?.detail
  const skillDetail = collection === 'plugins' ? undefined : entry?.skillDetail
  const navigation = collection ? labels.navigation[collection] : labels
  const page = entry ? extensionWorkspacePage(entry) : null
  const plugins = entry?.collections.plugins
  const skills = entry?.collections.skills
  const pluginsBusy = plugins?.status === 'loading' || plugins?.requestInFlight === true
  const skillsBusy = skills?.status === 'loading' || skills?.requestInFlight === true
  const query = entry?.queries[collection ?? 'plugins'] ?? ''
  const root = useRef<HTMLElement>(null)
  const filterInput = useRef<HTMLInputElement>(null)
  const filterId = useId()
  const heading = useRef<HTMLDivElement>(null)
  const pluginsHeading = useRef<HTMLDivElement>(null)
  const skillsHeading = useRef<HTMLDivElement>(null)
  const focusDirection = useRef<'detail' | 'list' | null>(null)
  useLayoutEffect(() => {
    // Collection navigation invalidates only view focus ownership, not retained
    // plugin details, filters, actions or their original write receipts.
    focusDirection.current = null
  }, [runtime, instanceId, collection])
  useEffect(() => {
    // A remounted collection or restored connection reads again. A read failure
    // itself must not retrigger this effect; its recovery remains an explicit action.
    if (connected)
      void runtime.commands
        .execute('extensionWorkspace.refresh', { instanceId, ...(collection ? { collection } : {}) })
        .catch(() => {})
  }, [connected, instanceId, collection, runtime.commands])
  useLayoutEffect(() => {
    if (!focusDirection.current) return
    if ((detail || skillDetail) && focusDirection.current === 'detail') {
      root.current
        ?.querySelector<HTMLButtonElement>(
          '.hbar-app-react-plugin-detail-navigation button, .hbar-app-react-skill-detail-navigation button',
        )
        ?.focus()
      focusDirection.current = null
    } else if (!detail && !skillDetail && focusDirection.current === 'list') {
      const selectedId = collection === 'skills' ? entry?.selectedSkillId : entry?.selectedPluginId
      const selectedAttribute = collection === 'skills' ? 'data-skill-id' : 'data-plugin-id'
      const row = Array.from(root.current?.querySelectorAll<HTMLElement>(`[${selectedAttribute}]`) ?? []).find(
        (item) => (collection === 'skills' ? item.dataset.skillId : item.dataset.pluginId) === selectedId,
      )
      const target = row?.querySelector<HTMLButtonElement>('.hbar-app-react-extension-open')
      const fallback = root.current?.querySelector<HTMLInputElement>('input') ?? heading.current
      if (target?.isConnected && target.getClientRects().length) target.focus()
      else fallback?.focus()
      focusDirection.current = null
    }
  }, [detail, entry?.selectedPluginId, entry?.selectedSkillId, skillDetail, collection])

  const refresh = (collection?: 'plugins' | 'skills') =>
    runtime.commands
      .execute('extensionWorkspace.refresh', { instanceId, ...(collection ? { collection } : {}) })
      .then(() => undefined)
      .catch(() => {})
  const clearQuery = () => {
    filterInput.current?.focus()
    void runtime.commands
      .execute('extensionWorkspace.setQuery', { instanceId, query: '', ...(collection ? { collection } : {}) })
      .catch(() => {})
  }
  const openCommands = (event: MouseEvent<HTMLButtonElement>) => {
    const presentation = runtime.state.presentation.getSnapshot()
    if (
      presentation.page.kind !== 'settings' ||
      presentation.page.instanceId !== instanceId ||
      presentation.modalInstanceId !== null
    )
      return
    const releaseReturnFocus = onCommandPaletteOpen?.(event.currentTarget)
    void runtime.commands
      .execute('app.openPanel', { panelId: 'commands' })
      .then((opened) => {
        if (opened.instanceId !== 'commands') return
        const openedPanel = runtime.state.surfaces.getSnapshot().panels[opened.instanceId]
        // The palette clears its search on mount. Apply the contextual query
        // after that passive initialization, while this panel incarnation is open.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const current = runtime.state.presentation.getSnapshot()
            if (
              current.page.kind === 'settings' &&
              current.page.instanceId === instanceId &&
              current.modalInstanceId === opened.instanceId &&
              runtime.state.surfaces.getSnapshot().panels[opened.instanceId] === openedPanel
            )
              void runtime.commands.execute('commandPalette.setQuery', { query: 'system.' }).catch(() => {})
          })
        })
      })
      .catch(() => {
        releaseReturnFocus?.()
      })
  }

  return (
    <LumenFrame
      ref={root}
      as="section"
      className="hbar-app-react-extension-workspace"
      aria-labelledby={detail || skillDetail ? undefined : `${instanceId}-extensions-title`}
      aria-label={detail || skillDetail ? navigation.title : undefined}
    >
      {!detail && !skillDetail && (
        <LumenFrame as="header" className="hbar-app-react-extension-heading">
          <LumenFrame>
            <LumenFrame
              ref={heading}
              role="heading"
              aria-level={2}
              tabIndex={-1}
              className="hbar-app-react-extension-title"
              id={`${instanceId}-extensions-title`}
            >
              <LumenContentText context="message.inline">{navigation.title}</LumenContentText>
            </LumenFrame>
            <LumenContentText context="section.description">{navigation.description}</LumenContentText>
            {!collection && <LumenContentText context="record.description">{labels.hostWide}</LumenContentText>}
            {collection === 'plugins' && plugins?.hasSnapshot && page && (
              <LumenContentText context="record.description">{labels.pluginCount(page.pluginCount)}</LumenContentText>
            )}
            {collection === 'skills' && skills?.hasSnapshot && page && (
              <LumenContentText context="record.description">{labels.skillCount(page.skillCount)}</LumenContentText>
            )}
          </LumenFrame>
          <LumenFrame>
            <LumenButton
              variant="outlined"
              disabled={
                !connected ||
                (collection === 'plugins'
                  ? pluginsBusy
                  : collection === 'skills'
                    ? skillsBusy
                    : pluginsBusy || skillsBusy)
              }
              onClick={() => void refresh(collection)}
            >
              <LumenIcon icon={RefreshCw} tier="md" />
              {labels.refresh}
            </LumenButton>
            {collection !== 'skills' && (
              <LumenButton ref={commandPaletteTriggerRef} variant="text" onClick={openCommands}>
                {labels.openSystemCommands}
              </LumenButton>
            )}
          </LumenFrame>
        </LumenFrame>
      )}

      <LumenIntegrations01
        slots={{
          list: (
            <LumenFrame className="hbar-app-react-extension-browser" hidden={Boolean(detail || skillDetail)}>
              {collection !== 'skills' && entry?.error === 'CAPACITY_EXCEEDED' && (
                <LumenContentText context="feedback.message" role="alert">
                  {labels.detail.actions.error(entry.error)}
                </LumenContentText>
              )}
              <>
                <LumenFrame className="hbar-app-react-extension-filter">
                  <LumenFrame as="label" htmlFor={filterId}>
                    {navigation.filter}
                  </LumenFrame>
                  <LumenFrame className="hbar-app-react-extension-filter-control">
                    <LumenInput
                      ref={filterInput}
                      id={filterId}
                      variant="plain"
                      value={query}
                      disabled={!entry}
                      maxLength={200}
                      onChange={(event) =>
                        void runtime.commands
                          .execute('extensionWorkspace.setQuery', {
                            instanceId,
                            query: event.currentTarget.value,
                            ...(collection ? { collection } : {}),
                          })
                          .catch(() => {})
                      }
                    />
                    {query && (
                      <LumenIconButton label={labels.clearSearch} size="s" onClick={clearQuery}>
                        <LumenIcon icon={X} tier="sm" />
                      </LumenIconButton>
                    )}
                  </LumenFrame>
                  {collection === 'skills' && query.trim() && skills?.status === 'ready' && page && (
                    <LumenContentText context="record.description" role="status">
                      {labels.skillSearchResults(page.skillCount, entry?.skills.length ?? 0)}
                    </LumenContentText>
                  )}
                </LumenFrame>
                {collection !== 'skills' && (
                  <LumenFrame
                    as="section"
                    className="hbar-app-react-extension-section"
                    data-extension-collection="plugins"
                    aria-label={collection ? undefined : labels.plugins}
                  >
                    {!collection && (
                      <LumenFrame as="header">
                        <LumenFrame
                          role="heading"
                          aria-level={3}
                          className="hbar-app-react-extension-collection-heading"
                          ref={pluginsHeading}
                          tabIndex={-1}
                        >
                          <LumenContentText context="message.inline">{labels.plugins}</LumenContentText>
                        </LumenFrame>
                        {plugins?.hasSnapshot && page && (
                          <LumenContentText context="record.description">
                            {labels.pluginCount(page.pluginCount)}
                          </LumenContentText>
                        )}
                      </LumenFrame>
                    )}
                    <ExtensionCollectionFeedback
                      key={collection ?? 'combined'}
                      state={plugins}
                      labels={labels.collections.plugins}
                      connected={connected}
                      onRetry={() => refresh('plugins')}
                      owner={runtime}
                      instanceId={instanceId}
                      collection="plugins"
                      heading={collection ? heading : pluginsHeading}
                    />
                    {!plugins?.hasSnapshot || !entry || !page ? null : !page.plugins.length ? (
                      plugins.status === 'ready' &&
                      (entry.plugins.length && collection === 'plugins' ? (
                        <ExtensionNoMatches title={labels.noMatchingPlugins} labels={labels} onClear={clearQuery} />
                      ) : (
                        <LumenContentText context="section.description" className="hbar-app-react-extension-empty">
                          {entry.plugins.length ? labels.noMatches : labels.noPlugins}
                        </LumenContentText>
                      ))
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
                                onClick={() => {
                                  focusDirection.current = 'detail'
                                  void runtime.commands
                                    .execute('extensionWorkspace.inspect', { instanceId, pluginId: plugin.id })
                                    .catch(() => {})
                                }}
                              >
                                <LumenIcon icon={Puzzle} tier="md" />
                                <LumenContentText
                                  context="control.label"
                                  className="hbar-app-react-extension-open-copy"
                                >
                                  <LumenContentText context="choice.title">{plugin.name}</LumenContentText>
                                  <LumenContentText context="choice.description">
                                    {labels.pluginMetadata(plugin.id, plugin.version)}
                                  </LumenContentText>
                                  <LumenContentText context="choice.description">{plugin.description}</LumenContentText>
                                </LumenContentText>
                                <LumenStatus
                                  value={labels.status[plugin.status]}
                                  tone={
                                    plugin.status === 'active'
                                      ? 'success'
                                      : plugin.status === 'failed'
                                        ? 'danger'
                                        : 'neutral'
                                  }
                                />
                                <LumenIcon icon={ChevronRight} tier="md" />
                              </LumenButton>
                              <LumenContentText context="record.description">
                                {plugin.packageName ?? plugin.path ?? plugin.id}
                              </LumenContentText>
                              {action?.status === 'unknown' && (
                                <LumenContentText context="feedback.message" role="status">
                                  {labels.detail.actions.unknown}
                                </LumenContentText>
                              )}
                              {action?.error && action.status === 'failed' && (
                                <LumenContentText context="feedback.message" role="alert">
                                  {labels.detail.actions.error(action.error)}
                                </LumenContentText>
                              )}
                              <LumenFrame as="footer">
                                {plugin.required && (
                                  <LumenContentText context="record.description">{labels.required}</LumenContentText>
                                )}
                                {action?.status === 'unknown' ? (
                                  <LumenButton
                                    variant="outlined"
                                    disabled={!connected || pluginsBusy}
                                    onClick={() => void refresh('plugins')}
                                  >
                                    {labels.detail.actions.readCurrent}
                                  </LumenButton>
                                ) : (
                                  !plugin.required && (
                                    <LumenButton
                                      variant="text"
                                      disabled={!connected || action?.status === 'submitting' || pluginsBusy}
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
                    {plugins?.hasSnapshot && page && (
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
                    )}
                  </LumenFrame>
                )}
                {collection !== 'plugins' && (
                  <LumenFrame
                    as="section"
                    className="hbar-app-react-extension-section"
                    data-extension-collection="skills"
                    aria-label={collection ? undefined : labels.skills}
                  >
                    {!collection && (
                      <LumenFrame as="header">
                        <LumenFrame
                          role="heading"
                          aria-level={3}
                          className="hbar-app-react-extension-collection-heading"
                          ref={skillsHeading}
                          tabIndex={-1}
                        >
                          <LumenContentText context="message.inline">{labels.skills}</LumenContentText>
                        </LumenFrame>
                        {skills?.hasSnapshot && page && (
                          <LumenContentText context="record.description">
                            {labels.skillCount(page.skillCount)}
                          </LumenContentText>
                        )}
                      </LumenFrame>
                    )}
                    {renderSkillImport?.(instanceId, connected)}
                    <ExtensionCollectionFeedback
                      key={collection ?? 'combined'}
                      state={skills}
                      labels={labels.collections.skills}
                      connected={connected}
                      onRetry={() => refresh('skills')}
                      owner={runtime}
                      instanceId={instanceId}
                      collection="skills"
                      heading={collection ? heading : skillsHeading}
                    />
                    {!skills?.hasSnapshot || !entry || !page ? null : !page.skills.length ? (
                      skills.status === 'ready' &&
                      (entry.skills.length && collection === 'skills' ? (
                        <ExtensionNoMatches title={labels.noMatchingSkills} labels={labels} onClear={clearQuery} />
                      ) : (
                        <LumenContentText context="section.description" className="hbar-app-react-extension-empty">
                          {entry.skills.length ? labels.noMatches : labels.noSkills}
                        </LumenContentText>
                      ))
                    ) : (
                      <LumenCollection
                        as="ul"
                        className="hbar-app-react-extension-list hbar-app-react-extension-skill-list"
                      >
                        {page.skills.map((skill) => (
                          <LumenCollectionItem as="li" key={skill.id} data-skill-id={skill.id}>
                            <LumenButton
                              type="button"
                              variant="text"
                              className="hbar-app-react-extension-open"
                              aria-label={labels.inspect(skill.id)}
                              aria-current={entry.selectedSkillId === skill.id ? 'true' : undefined}
                              disabled={!connected}
                              onClick={() => {
                                focusDirection.current = 'detail'
                                void runtime.commands
                                  .execute('extensionWorkspace.inspectSkill', { instanceId, skillId: skill.id })
                                  .catch(() => {})
                              }}
                            >
                              <LumenFrame className="hbar-app-react-extension-skill-content">
                                <LumenContentText context="choice.title">{skill.id}</LumenContentText>
                                <LumenContentText context="choice.description" title={skill.path}>
                                  {skill.path}
                                </LumenContentText>
                                <LumenContentText context="control.label">{labels.skillScope}</LumenContentText>
                              </LumenFrame>
                            </LumenButton>
                            <LumenStatus
                              className="hbar-app-react-extension-skill-status"
                              value={labels.discovered}
                              tone="neutral"
                            />
                          </LumenCollectionItem>
                        ))}
                      </LumenCollection>
                    )}
                    {skills?.hasSnapshot && page && (
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
                    )}
                  </LumenFrame>
                )}
              </>
            </LumenFrame>
          ),
        }}
      />
      {detail && (
        <LumenIntegrations02
          slots={{
            detail: (
              <ExtensionPluginDetail
                key={detail.pluginId}
                detail={detail}
                labels={labels.detail}
                connected={connected}
                action={entry?.actions[detail.pluginId]}
                refreshing={pluginsBusy || detail.status === 'loading'}
                operationError={entry?.error === 'CAPACITY_EXCEEDED' ? entry.error : null}
                onSetEnabled={(enabled) =>
                  void runtime.commands
                    .execute('extensionWorkspace.setEnabled', { instanceId, pluginId: detail.pluginId, enabled })
                    .catch(() => {})
                }
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
            ),
          }}
        />
      )}
      {skillDetail && !detail && (
        <ExtensionSkillDetail
          key={skillDetail.skillId}
          detail={skillDetail}
          labels={labels.skillDetail}
          connected={connected}
          onBack={() => {
            focusDirection.current = 'list'
            void runtime.commands.execute('extensionWorkspace.backSkill', { instanceId }).catch(() => {})
          }}
          onRetry={() =>
            void runtime.commands
              .execute('extensionWorkspace.inspectSkill', { instanceId, skillId: skillDetail.skillId })
              .catch(() => {})
          }
          onView={(view) =>
            void runtime.commands.execute('extensionWorkspace.selectSkillView', { instanceId, view }).catch(() => {})
          }
          onFilesPage={(page) =>
            void runtime.commands.execute('extensionWorkspace.setSkillFilesPage', { instanceId, page }).catch(() => {})
          }
          onOpenFile={(path) =>
            void runtime.commands.execute('extensionWorkspace.openSkillFile', { instanceId, path }).catch(() => {})
          }
        />
      )}
    </LumenFrame>
  )
}
