'use client'

import * as React from 'react'
import { LumenToggleControl } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { type LumenToolCallsIntent, type LumenToolCallsViewModel } from './tool-calls/view-model'
import './tool-calls.css'
import './tool-calls/controlled-flow.css'

export type { LumenToolCallsIntent, LumenToolCallsViewModel } from './tool-calls/view-model'

export type LumenToolCallsListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenToolCallsState =
  'complete' | 'failed' | 'running' | 'streaming' | 'approved' | 'pending' | 'needs-approval' | 'skipped'

export interface LumenToolCallsTraceItem {
  readonly id: string
  readonly name: string
  readonly duration: string
  readonly state: LumenToolCallsState
  readonly stateLabel: string
  readonly startedAt?: string | undefined
  readonly argumentsText?: string | undefined
  readonly resultText?: string | undefined
}

export interface LumenToolCallsTraceContent {
  readonly labels: {
    readonly title: string
    readonly stop: string
    readonly started: string
    readonly duration: string
    readonly arguments: string
    readonly result: string
    readonly callCount?: string | undefined
  }
  readonly items: readonly LumenToolCallsTraceItem[]
  readonly activeItemId: string
  readonly listStrategy: LumenToolCallsListStrategy
}

export interface LumenToolCallsActivityFilter {
  readonly id: string
  readonly label: string
}

export interface LumenToolCallsActivityItem {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly duration: string
  readonly filterIds: readonly string[]
  readonly state: LumenToolCallsState
  readonly stateLabel: string
  readonly retryLabel?: string | undefined
}

export interface LumenToolCallsActivityContent {
  readonly labels: {
    readonly title: string
    readonly stop: string
    readonly filtersLabel: string
  }
  readonly filters: readonly LumenToolCallsActivityFilter[]
  readonly activeFilterId: string
  readonly items: readonly LumenToolCallsActivityItem[]
  readonly listStrategy: LumenToolCallsListStrategy
}

export type LumenToolCallsDiffLineKind = 'context' | 'added' | 'removed'

export interface LumenToolCallsDiffLine {
  readonly id: string
  readonly beforeLine?: string | undefined
  readonly afterLine?: string | undefined
  readonly marker?: string | undefined
  readonly text: string
  readonly kind: LumenToolCallsDiffLineKind
}

export interface LumenToolCallsDiffFile {
  readonly id: string
  readonly fileName: string
  readonly fileSummary: string
  readonly lines: readonly LumenToolCallsDiffLine[]
}

export interface LumenToolCallsDiffContent {
  readonly toolName: string
  readonly title: string
  readonly summary: string
  readonly files: readonly LumenToolCallsDiffFile[]
  readonly activeFileId: string
  readonly listStrategy: LumenToolCallsListStrategy
}

export interface LumenToolCallsSearchResult {
  readonly id: string
  readonly title: string
  readonly source: string
  readonly excerpt: string
  readonly relevance: string
}

export interface LumenToolCallsSearchContent {
  readonly toolName: string
  readonly query: string
  readonly statusLabel: string
  readonly items: readonly LumenToolCallsSearchResult[]
  readonly listStrategy: LumenToolCallsListStrategy
}

export interface LumenToolCallsOutputTab {
  readonly id: string
  readonly label: string
  readonly output: string
}

export interface LumenToolCallsCommandContent {
  readonly toolName: string
  readonly title: string
  readonly duration: string
  readonly command: string
  readonly exitLabel: string
  readonly tabsLabel: string
  readonly tabs: readonly LumenToolCallsOutputTab[]
  readonly initialTabId: string
  readonly outputStrategy: LumenToolCallsListStrategy
  readonly copyCommandLabel?: string | undefined
}

export type LumenToolCallsPermissionItemKind = 'request' | 'toggle' | 'status'

export interface LumenToolCallsPermissionAction {
  readonly id: string
  readonly label: string
  readonly tone?: 'neutral' | 'accent' | 'danger' | undefined
}

export interface LumenToolCallsPermissionItem {
  readonly id: string
  readonly kind: LumenToolCallsPermissionItemKind
  readonly name: string
  readonly description: string
  readonly statusLabel?: string | undefined
  readonly enabled?: boolean | undefined
  readonly toggleLabel?: string | undefined
  readonly actions?: readonly LumenToolCallsPermissionAction[] | undefined
  readonly requestDetails?: string | undefined
}

export interface LumenToolCallsPermissionGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenToolCallsPermissionItem[]
}

export interface LumenToolCallsPermissionsContent {
  readonly title: string
  readonly pendingLabel: string
  readonly groups: readonly LumenToolCallsPermissionGroup[]
  readonly groupStrategy: LumenToolCallsListStrategy
}

export interface LumenToolCallsContent {
  readonly viewModel?: LumenToolCallsViewModel | undefined
  readonly trace?: LumenToolCallsTraceContent | undefined
  readonly activity?: LumenToolCallsActivityContent | undefined
  readonly diff?: LumenToolCallsDiffContent | undefined
  readonly search?: LumenToolCallsSearchContent | undefined
  readonly command?: LumenToolCallsCommandContent | undefined
  readonly permissions?: LumenToolCallsPermissionsContent | undefined
}

export interface LumenToolCallsProviderProps {
  readonly content: LumenToolCallsContent
  readonly children: React.ReactNode
}

export interface LumenToolCallsAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenToolCallsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenToolCallsContent | undefined
  readonly viewModel?: LumenToolCallsViewModel | undefined
  readonly onAction?: ((event: LumenToolCallsAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  readonly controlled?: { readonly body: React.ReactNode } | undefined
}

export type LumenToolCallsVariantProps = Omit<LumenToolCallsProps, 'variant' | 'variantId'>

const ToolCallsContentContext = React.createContext<LumenToolCallsContent | undefined>(undefined)

const ToolCallsViewModelContext = React.createContext<LumenToolCallsViewModel | undefined>(undefined)

export function LumenToolCallsProvider({ content, children }: LumenToolCallsProviderProps) {
  return <ToolCallsContentContext.Provider value={content}>{children}</ToolCallsContentContext.Provider>
}

export function useLumenToolCallsContent() {
  return React.useContext(ToolCallsContentContext)
}

export function uniqueLumenToolCallsItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export function selectLumenToolCallsItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function report(onAction: LumenToolCallsProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function dispatch(
  viewModel: LumenToolCallsViewModel | undefined,
  intent: LumenToolCallsIntent,
  onAction: LumenToolCallsProps['onAction'],
  value?: string,
) {
  if (viewModel) viewModel.onAction?.(intent)
  else report(onAction, intent.actionId, value)
}

function toolStateTone(state: LumenToolCallsState): 'neutral' | 'success' | 'warning' | 'danger' {
  if (state === 'complete' || state === 'approved') {
    return 'success'
  }
  if (state === 'failed') {
    return 'danger'
  }
  if (state === 'running' || state === 'streaming' || state === 'needs-approval') {
    return 'warning'
  }
  return 'neutral'
}

function ToolStatus({ state, label }: { readonly state: LumenToolCallsState; readonly label: string }) {
  return (
    <LumenStatus
      className={`hbar-app-ui-tool-calls-status is-${state}`}
      data-state={state}
      tone={toolStateTone(state)}
      value={label}
    />
  )
}

function ToolGlyph({ name }: { readonly name: 'chevron-down' | 'chevron-right' | 'retry' | 'stop' }) {
  return (
    <svg className="lumen-tool-calls-glyph" data-tier="sm" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'chevron-down' ? <path d="m3 6 5 5 5-5" /> : null}
      {name === 'chevron-right' ? <path d="m6 3 5 5-5 5" /> : null}
      {name === 'retry' ? <path d="M4 5H1V2m0 3a6 6 0 1 1-1 5" /> : null}
      {name === 'stop' ? <rect x="4" y="4" width="8" height="8" rx="1" /> : null}
    </svg>
  )
}

function ToolCallsRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  controlled,
  children,
}: Omit<LumenToolCallsProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const contentClassName = [
    'lumen-tool-calls',
    viewModel ? 'lumen-tool-calls-controlled' : '',
    'hbar-app-ui-tool-calls-surface',
    `hbar-app-ui-tool-calls-variant-${variant}`,
    density ? `hbar-app-ui-density-${density}` : '',
    surface ? `hbar-app-ui-surface-${surface}` : '',
    state ? `hbar-app-ui-state-${state}` : '',
    visualMode ? `hbar-app-ui-visual-${visualMode}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <LumenSurface
      as="section"
      surfaceRole={controlled ? 'reading' : undefined}
      boundary={controlled ? 'none' : 'horizontal'}
      className={`lumen-tool-calls-root-surface${viewModel ? ' lumen-tool-calls-controlled-root' : ''}`}
      contentClassName={contentClassName}
      data-lumen-component="tool-calls"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {viewModel?.notice ? (
        <p className="lumen-tool-calls-notice" role="status">
          {viewModel.notice}
        </p>
      ) : null}
      {children}
    </LumenSurface>
  )
}

function Pane({
  strategy,
  className,
  children,
}: {
  readonly strategy: LumenToolCallsListStrategy
  readonly className?: string | undefined
  readonly children: React.ReactNode
}) {
  return (
    <main
      className={className}
      data-hbar-app-ui-expected-maximum={strategy.expectedMaximum}
      data-hbar-app-ui-list-strategy={strategy.kind}
    >
      {children}
    </main>
  )
}

function StopButton({
  label,
  onClick,
  disabled,
}: {
  readonly label: string
  readonly onClick: () => void
  readonly disabled?: boolean | undefined
}) {
  return (
    <LumenButton
      aria-label={label}
      className="hbar-app-ui-tool-calls-button hbar-app-ui-tool-calls-stop"
      variant="outlined"
      onClick={onClick}
      disabled={disabled}
    >
      <ToolGlyph name="stop" />
      {label}
    </LumenButton>
  )
}

function ToolTrace(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsTraceContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const instanceId = React.useId()
  const items = uniqueLumenToolCallsItems(content.items)
  const [openId, setOpenId] = React.useState(content.activeItemId)
  const activeItem = selectLumenToolCallsItem(items, openId)

  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-trace">
      <header className="hbar-app-ui-tool-calls-heading">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        {viewModel ? (
          <span>{content.labels.callCount}</span>
        ) : (
          <StopButton label={content.labels.stop} onClick={() => report(onAction, 'stop')} />
        )}
      </header>
      <Pane strategy={content.listStrategy} className="hbar-app-ui-tool-calls-trace-pane">
        <ol>
          {items.map((item) => {
            const open = viewModel ? viewModel.openTraceIds.includes(item.id) : item.id === activeItem?.id
            const detailsId = `${instanceId}-trace-${encodeURIComponent(item.id)}`
            return (
              <li key={item.id}>
                <LumenButton
                  variant="text"
                  aria-controls={detailsId}
                  aria-expanded={open}
                  className="hbar-app-ui-tool-calls-button hbar-app-ui-tool-calls-trace-row"
                  disabled={viewModel !== undefined && !viewModel.onAction}
                  onClick={() => {
                    if (!viewModel) setOpenId(item.id)
                    dispatch(viewModel, { actionId: 'toggle-trace-item', itemId: item.id }, onAction, item.id)
                  }}
                >
                  <ToolGlyph name={open ? 'chevron-down' : 'chevron-right'} />
                  <code>{item.name}</code>
                  <time>{item.duration}</time>
                  <ToolStatus label={item.stateLabel} state={item.state} />
                </LumenButton>
                {open ? (
                  <section id={detailsId} className="hbar-app-ui-tool-calls-trace-details">
                    <dl>
                      {item.startedAt ? (
                        <div>
                          <dt>{content.labels.started}</dt>
                          <dd>{item.startedAt}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{content.labels.duration}</dt>
                        <dd>{item.duration}</dd>
                      </div>
                    </dl>
                    {item.argumentsText ? (
                      <div>
                        <p>{content.labels.arguments}</p>
                        <pre>{item.argumentsText}</pre>
                      </div>
                    ) : null}
                    {item.resultText ? (
                      <div>
                        <p>{content.labels.result}</p>
                        <pre>{item.resultText}</pre>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </li>
            )
          })}
        </ol>
      </Pane>
    </ToolCallsRoot>
  )
}

function ToolActivityRowContent({ item }: { readonly item: LumenToolCallsActivityItem }) {
  return (
    <>
      <span className={`hbar-app-ui-tool-calls-state-mark is-${item.state}`} />
      <span>
        <code>{item.name}</code>
        <small>{item.detail}</small>
      </span>
      <time>{item.duration}</time>
      <ToolStatus label={item.stateLabel} state={item.state} />
    </>
  )
}

function moveTabFocus(event: React.KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
  const index = tabs.findIndex((tab) => tab === event.target)
  if (index < 0 || !tabs.length) return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  tabs[next]?.focus()
  tabs[next]?.click()
}

function ToolActivity(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsActivityContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const filters = uniqueLumenToolCallsItems(content.filters)
  const items = uniqueLumenToolCallsItems(content.items)
  const [activeFilterId, setActiveFilterId] = React.useState(content.activeFilterId)
  const activeFilter = selectLumenToolCallsItem(filters, viewModel?.activeFilterId ?? activeFilterId)
  const visibleItems = activeFilter ? items.filter((item) => item.filterIds.includes(activeFilter.id)) : items
  React.useEffect(() => setActiveFilterId(content.activeFilterId), [content.activeFilterId])

  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-activity">
      <header className="hbar-app-ui-tool-calls-activity-heading">
        <LumenText as="h2" variant="heading">
          {content.labels.title}
        </LumenText>
        <StopButton
          label={content.labels.stop}
          disabled={viewModel !== undefined && !viewModel.onAction}
          onClick={() => dispatch(viewModel, { actionId: 'stop' }, onAction)}
        />
        <nav aria-label={content.labels.filtersLabel} role="tablist" onKeyDown={moveTabFocus}>
          {filters.map((filter) => {
            const selected = filter.id === activeFilter?.id
            return (
              <LumenButton
                variant="text"
                aria-selected={selected}
                className={`hbar-app-ui-tool-calls-button${selected ? ' is-selected' : ''}`}
                key={filter.id}
                disabled={viewModel !== undefined && !viewModel.onAction}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  if (!viewModel) setActiveFilterId(filter.id)
                  dispatch(viewModel, { actionId: 'filter-tool-activity', optionId: filter.id }, onAction, filter.id)
                }}
                role="tab"
              >
                {filter.label}
              </LumenButton>
            )
          })}
        </nav>
      </header>
      <Pane strategy={content.listStrategy} className="hbar-app-ui-tool-calls-activity-pane">
        <ol>
          {visibleItems.map((item) => (
            <li key={item.id}>
              {viewModel ? (
                <div className="hbar-app-ui-tool-calls-activity-row">
                  <ToolActivityRowContent item={item} />
                </div>
              ) : (
                <LumenButton
                  variant="text"
                  className="hbar-app-ui-tool-calls-button hbar-app-ui-tool-calls-activity-row"
                  onClick={() => report(onAction, 'open-tool-activity', item.id)}
                >
                  <ToolActivityRowContent item={item} />
                </LumenButton>
              )}
              {item.retryLabel ? (
                <LumenIconButton
                  label={item.retryLabel}
                  className="hbar-app-ui-tool-calls-retry"
                  disabled={viewModel !== undefined && !viewModel.onAction}
                  onClick={() =>
                    dispatch(viewModel, { actionId: 'retry-tool-activity', itemId: item.id }, onAction, item.id)
                  }
                >
                  <ToolGlyph name="retry" />
                </LumenIconButton>
              ) : null}
            </li>
          ))}
        </ol>
      </Pane>
    </ToolCallsRoot>
  )
}

function ToolDiffResult(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsDiffContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const instanceId = React.useId()
  const files = uniqueLumenToolCallsItems(content.files)
  const [openFileId, setOpenFileId] = React.useState(content.activeFileId)
  const openFile = selectLumenToolCallsItem(files, openFileId)

  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-diff">
      <header className="hbar-app-ui-tool-calls-code-heading">
        <code>{content.toolName}</code>
        <h2>{content.title}</h2>
        <span>{content.summary}</span>
      </header>
      <Pane strategy={content.listStrategy}>
        <ol>
          {files.map((file) => {
            const open = viewModel ? viewModel.openDiffIds.includes(file.id) : file.id === openFile?.id
            const lines = uniqueLumenToolCallsItems(file.lines)
            const detailsId = `${instanceId}-diff-${encodeURIComponent(file.id)}`
            return (
              <li key={file.id}>
                <LumenButton
                  variant="text"
                  aria-controls={detailsId}
                  aria-expanded={open}
                  className="hbar-app-ui-tool-calls-button hbar-app-ui-tool-calls-diff-file"
                  disabled={viewModel !== undefined && !viewModel.onAction}
                  onClick={() => {
                    if (!viewModel) setOpenFileId(file.id)
                    dispatch(viewModel, { actionId: 'toggle-diff-file', itemId: file.id }, onAction, file.id)
                  }}
                >
                  <ToolGlyph name={open ? 'chevron-down' : 'chevron-right'} />
                  <code>{file.fileName}</code>
                  <span>{file.fileSummary}</span>
                </LumenButton>
                {open ? (
                  <ol id={detailsId}>
                    {lines.map((line) => (
                      <li className={`is-${line.kind}`} key={line.id}>
                        <span>{line.beforeLine}</span>
                        <span>{line.afterLine}</span>
                        <span>{line.marker}</span>
                        <code>{line.text}</code>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            )
          })}
        </ol>
      </Pane>
    </ToolCallsRoot>
  )
}

function ToolSearchResults(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsSearchContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const items = uniqueLumenToolCallsItems(content.items)
  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-search">
      <header>
        <code>{content.toolName}</code>
        <h2>{content.query}</h2>
        <span>{content.statusLabel}</span>
      </header>
      <Pane strategy={content.listStrategy}>
        <ol>
          {items.map((item, index) => (
            <li key={item.id}>
              {viewModel ? (
                <a
                  href={viewModel.onAction ? '#' : undefined}
                  aria-disabled={!viewModel.onAction || undefined}
                  className="hbar-app-ui-tool-calls-search-link"
                  onClick={(event) => {
                    event.preventDefault()
                    dispatch(viewModel, { actionId: 'open-search-result', itemId: item.id }, onAction, item.id)
                  }}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.source}</small>
                    <span className="hbar-app-ui-tool-calls-search-excerpt">{item.excerpt}</span>
                  </span>
                  <em>{item.relevance}</em>
                </a>
              ) : (
                <LumenButton
                  variant="text"
                  className="hbar-app-ui-tool-calls-button"
                  onClick={() => report(onAction, 'open-search-result', item.id)}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.source}</small>
                    <span className="hbar-app-ui-tool-calls-search-excerpt">{item.excerpt}</span>
                  </span>
                  <em>{item.relevance}</em>
                </LumenButton>
              )}
            </li>
          ))}
        </ol>
      </Pane>
    </ToolCallsRoot>
  )
}

function ToolCommandOutput(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsCommandContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const instanceId = React.useId()
  const tabs = uniqueLumenToolCallsItems(content.tabs)
  const [selectedTabId, setSelectedTabId] = React.useState(content.initialTabId)
  const selectedTab = selectLumenToolCallsItem(tabs, viewModel?.selectedOutputTabId ?? selectedTabId)
  React.useEffect(() => setSelectedTabId(content.initialTabId), [content.initialTabId])

  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-command">
      <header>
        <code>{content.toolName}</code>
        <h2>{content.title}</h2>
        <time>{content.duration}</time>
      </header>
      <Pane strategy={content.outputStrategy}>
        <section>
          <header>
            <pre className="hbar-app-ui-tool-calls-command-line">{content.command}</pre>
            <LumenStatus value={content.exitLabel} tone="danger" />
            {viewModel && content.copyCommandLabel ? (
              <LumenIconButton
                label={content.copyCommandLabel}
                disabled={!viewModel.onAction}
                onClick={() => dispatch(viewModel, { actionId: 'copy-command' }, onAction)}
              >
                <svg className="lumen-tool-calls-glyph" data-tier="sm" viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="5" y="5" width="9" height="9" rx="1" />
                  <path d="M11 2H3a1 1 0 0 0-1 1v8" />
                </svg>
              </LumenIconButton>
            ) : null}
          </header>
          <nav aria-label={content.tabsLabel} role="tablist" onKeyDown={moveTabFocus}>
            {tabs.map((tab) => {
              const selected = tab.id === selectedTab?.id
              return (
                <LumenButton
                  variant="text"
                  aria-selected={selected}
                  className={`hbar-app-ui-tool-calls-button${selected ? ' is-selected' : ''}`}
                  key={tab.id}
                  id={`${instanceId}-tab-${encodeURIComponent(tab.id)}`}
                  aria-controls={`${instanceId}-output`}
                  disabled={viewModel !== undefined && !viewModel.onAction}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    if (!viewModel) setSelectedTabId(tab.id)
                    dispatch(viewModel, { actionId: 'select-command-output', optionId: tab.id }, onAction, tab.id)
                  }}
                  role="tab"
                >
                  {tab.label}
                </LumenButton>
              )
            })}
          </nav>
          {selectedTab ? (
            <pre
              className="hbar-app-ui-tool-calls-command-output"
              id={`${instanceId}-output`}
              role="tabpanel"
              tabIndex={0}
              aria-labelledby={`${instanceId}-tab-${encodeURIComponent(selectedTab.id)}`}
            >
              {selectedTab.output}
            </pre>
          ) : null}
        </section>
      </Pane>
    </ToolCallsRoot>
  )
}

function permissionTone(tone: LumenToolCallsPermissionAction['tone']): 'neutral' | 'primary' | 'danger' {
  if (tone === 'accent') {
    return 'primary'
  }
  if (tone === 'danger') {
    return 'danger'
  }
  return 'neutral'
}

function ToolPermissions(props: Omit<LumenToolCallsProps, 'content'> & { content: LumenToolCallsPermissionsContent }) {
  const { content, onAction } = props
  const viewModel = React.useContext(ToolCallsViewModelContext)
  const instanceId = React.useId()
  const groups = uniqueLumenToolCallsItems(content.groups)
  const [overrides, setOverrides] = React.useState<ReadonlyMap<string, boolean>>(() => new Map())
  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-permissions">
      <header>
        <h2>{content.title}</h2>
        <LumenStatus value={content.pendingLabel} tone="warning" />
      </header>
      <Pane strategy={content.groupStrategy}>
        {groups.map((group) => (
          <section key={group.id}>
            <h3>{group.label}</h3>
            <ul>
              {uniqueLumenToolCallsItems(group.items).map((item) => {
                const statusAfterActions =
                  item.kind === 'request' && item.statusLabel !== undefined && (item.actions?.length ?? 0) > 0
                const enabled = viewModel
                  ? (viewModel.permissions.find(
                      (permission) => permission.groupId === group.id && permission.itemId === item.id,
                    )?.enabled ?? item.enabled)
                  : (overrides.get(item.id) ?? item.enabled)
                const requestOpen =
                  viewModel?.openRequestIds.some(
                    (request) => request.groupId === group.id && request.itemId === item.id,
                  ) ?? false
                const feedback = viewModel?.requestFeedback?.find(
                  (request) => request.groupId === group.id && request.itemId === item.id,
                )
                const detailsId = `${instanceId}-request-${encodeURIComponent(group.id)}-${encodeURIComponent(item.id)}`
                return (
                  <li className={`is-${item.kind}`} key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                      {item.statusLabel && !statusAfterActions ? <span>{item.statusLabel}</span> : null}
                    </div>
                    {item.kind === 'request' && item.actions ? (
                      <nav>
                        {uniqueLumenToolCallsItems(item.actions).map((action) => {
                          const button = (
                            <LumenButton
                              variant={action.tone === 'accent' ? 'solid' : 'outlined'}
                              tone={permissionTone(action.tone)}
                              className={`hbar-app-ui-tool-calls-button${action.tone ? ` is-${action.tone}` : ''}`}
                              disabled={viewModel !== undefined && !viewModel.onAction}
                              data-hbar-app-ui-action={action.id}
                              aria-expanded={viewModel && action.id === 'view' ? requestOpen : undefined}
                              aria-controls={viewModel && action.id === 'view' ? detailsId : undefined}
                              onClick={() =>
                                dispatch(
                                  viewModel,
                                  {
                                    actionId: 'permission-request-action',
                                    groupId: group.id,
                                    itemId: item.id,
                                    optionId: action.id,
                                  },
                                  onAction,
                                  `${item.id}:${action.id}`,
                                )
                              }
                            >
                              {action.id === 'view' ? <ToolGlyph name="chevron-right" /> : null}
                              {action.label}
                            </LumenButton>
                          )
                          return viewModel && action.id === 'view' ? (
                            <div className="lumen-tool-calls-view-request-row" key={action.id}>
                              {button}
                              {requestOpen && item.requestDetails ? (
                                <pre id={detailsId} className="lumen-tool-calls-request-details">
                                  {item.requestDetails}
                                </pre>
                              ) : null}
                            </div>
                          ) : (
                            <React.Fragment key={action.id}>{button}</React.Fragment>
                          )
                        })}
                      </nav>
                    ) : null}
                    {feedback ? (
                      <p className="lumen-tool-calls-request-feedback" role="status">
                        {feedback.message}
                      </p>
                    ) : null}
                    {statusAfterActions ? (
                      <span className="hbar-app-ui-tool-calls-request-status">{item.statusLabel}</span>
                    ) : null}
                    {item.kind === 'toggle' && enabled !== undefined && item.toggleLabel ? (
                      <LumenToggleControl
                        checked={enabled}
                        aria-checked={enabled}
                        aria-label={item.toggleLabel}
                        className="hbar-app-ui-tool-calls-toggle"
                        disabled={viewModel !== undefined && !viewModel.onAction}
                        onChange={(event) => {
                          const next = event.currentTarget.checked
                          if (!viewModel) setOverrides((current) => new Map(current).set(item.id, next))
                          dispatch(
                            viewModel,
                            {
                              actionId: 'toggle-permission',
                              groupId: group.id,
                              itemId: item.id,
                              enabled: next,
                            },
                            onAction,
                            `${item.id}:${next}`,
                          )
                        }}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </Pane>
    </ToolCallsRoot>
  )
}

function emptyToolCalls(props: LumenToolCallsProps) {
  return (
    <ToolCallsRoot {...props} className="hbar-app-ui-tool-calls-empty">
      {null}
    </ToolCallsRoot>
  )
}

function ToolCallsRouter(props: LumenToolCallsProps) {
  const content = props.content
  switch (props.variant) {
    case 1:
      return content?.trace ? <ToolTrace {...props} content={content.trace} /> : emptyToolCalls(props)
    case 2:
      return content?.activity ? <ToolActivity {...props} content={content.activity} /> : emptyToolCalls(props)
    case 3:
      return content?.diff ? <ToolDiffResult {...props} content={content.diff} /> : emptyToolCalls(props)
    case 4:
      return content?.search ? <ToolSearchResults {...props} content={content.search} /> : emptyToolCalls(props)
    case 5:
      return content?.command ? <ToolCommandOutput {...props} content={content.command} /> : emptyToolCalls(props)
    case 6:
      return content?.permissions ? <ToolPermissions {...props} content={content.permissions} /> : emptyToolCalls(props)
    default:
      return emptyToolCalls(props)
  }
}

export function LumenToolCalls(props: LumenToolCallsProps) {
  const providerContent = useLumenToolCallsContent()
  if (props.controlled) return <ToolCallsRoot {...props}>{props.controlled.body}</ToolCallsRoot>
  const content = props.content ?? providerContent
  const viewModel = props.viewModel ?? content?.viewModel
  return (
    <ToolCallsViewModelContext.Provider key={`${props.variant}:${viewModel?.ownerId ?? 'legacy'}`} value={viewModel}>
      <ToolCallsRouter {...props} content={content} />
    </ToolCallsViewModelContext.Provider>
  )
}

function toolCallsVariant(variant: number, props: LumenToolCallsVariantProps) {
  return <LumenToolCalls {...props} variant={variant} variantId={`hbar-app-ui-tool-calls-${variant}`} />
}

export function LumenToolCalls01(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(1, props)
}

export function LumenToolCalls02(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(2, props)
}

export function LumenToolCalls03(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(3, props)
}

export function LumenToolCalls04(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(4, props)
}

export function LumenToolCalls05(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(5, props)
}

export function LumenToolCalls06(props: LumenToolCallsVariantProps) {
  return toolCallsVariant(6, props)
}
