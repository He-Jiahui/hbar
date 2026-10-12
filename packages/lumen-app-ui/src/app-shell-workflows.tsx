'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { LumenInput, LumenTextarea, LumenChoiceSelect } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus, LumenText } from './primitives'
import { LumenAppShell, type LumenAppShellProps } from './workbench'
import './app-shell-workflows.css'
import { AppShellSidebar, type LumenAppShellSidebarContent } from './app-shell-sidebar'
import { AppShellRail, type LumenAppShellRailContent } from './app-shell-rail'
import { AppShellContracts, type LumenAppShellContractsContent } from './app-shell-contracts'
import { AppShellEditorial, type LumenAppShellEditorialContent } from './app-shell-editorial'
import { AppShellInbox, type LumenAppShellInboxContent } from './app-shell-inbox'
import { AppShellDocuments, type LumenAppShellDocumentsContent } from './app-shell-documents'
import { AppShellScope, type LumenAppShellScopeContent } from './app-shell-scope'
import { AppShellAdaptive, type LumenAppShellAdaptiveContent } from './app-shell-adaptive'
import { AppShellChat, type LumenAppShellChatContent } from './app-shell-chat'
import './app-shell-practical-flow.css'
import { LumenTabs } from './ui-controls'

export interface LumenAppShellListStrategy {
  readonly kind: 'content-grown' | 'pane-scroll'
  readonly expectedMaximum: number
}

export interface LumenAppShellChoice {
  readonly id: string
  readonly label: string
  readonly detail?: string | undefined
  readonly badge?: string | undefined
}

export interface LumenAppShellMetric extends LumenAppShellChoice {
  readonly value: string
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenAppShellRecord extends LumenAppShellChoice {
  readonly status?: string | undefined
  readonly tone?: 'neutral' | 'success' | 'warning' | 'danger' | undefined
}

export interface LumenAppShellScope {
  readonly id: string
  readonly label: string
  readonly options: readonly LumenAppShellChoice[]
  readonly initialOptionId: string
}

export interface LumenAppShellContent {
  /** Optional owned preview feedback; production data and pane sizing remain unchanged. */
  readonly presentation?: { readonly ownerId: string; readonly notice?: string | undefined } | undefined
  /** Reference sidebar/records contract. Other variants retain their existing contract. */
  readonly sidebar?: LumenAppShellSidebarContent | undefined
  readonly rail?: LumenAppShellRailContent | undefined
  readonly contracts?: LumenAppShellContractsContent | undefined
  readonly editorial?: LumenAppShellEditorialContent | undefined
  readonly inbox?: LumenAppShellInboxContent | undefined
  readonly documents?: LumenAppShellDocumentsContent | undefined
  readonly scope?: LumenAppShellScopeContent | undefined
  readonly adaptive?: LumenAppShellAdaptiveContent | undefined
  readonly chat?: LumenAppShellChatContent | undefined
  readonly labels: {
    readonly brand: string
    readonly title: string
    readonly detail: string
    readonly navigation: string
    readonly toggleNavigation: string
    readonly closeNavigation: string
    readonly search: string
    readonly connected: string
    readonly records: string
    readonly context: string
    readonly showContext: string
    readonly hideContext: string
    readonly files: string
    readonly save: string
    readonly bold: string
    readonly italic: string
    readonly code: string
    readonly link: string
    readonly scopes: string
    readonly frameSize: string
    readonly messages: string
    readonly model: string
    readonly composer: string
    readonly send: string
    readonly empty: string
    readonly emptyRecords: string
  }
  readonly navigation: readonly LumenAppShellChoice[]
  readonly initialNavigationId: string
  readonly metrics: readonly LumenAppShellMetric[]
  readonly records: readonly LumenAppShellRecord[]
  readonly initialRecordId: string
  readonly workspaces: readonly LumenAppShellChoice[]
  readonly initialWorkspaceId: string
  readonly context: readonly LumenAppShellChoice[]
  readonly files: readonly LumenAppShellChoice[]
  readonly initialFileId: string
  readonly documentValue: string
  readonly scopes: readonly LumenAppShellScope[]
  readonly views: readonly LumenAppShellChoice[]
  readonly initialViewId: string
  readonly threads: readonly LumenAppShellChoice[]
  readonly initialThreadId: string
  readonly models: readonly LumenAppShellChoice[]
  readonly initialModelId: string
  readonly messages: readonly LumenAppShellChoice[]
  readonly listStrategy: LumenAppShellListStrategy
}

export interface LumenAppShellWorkflowsProviderProps {
  readonly content: LumenAppShellContent
  readonly children: React.ReactNode
}

export interface LumenAppShellWorkflowAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenAppShellWorkflowsProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenAppShellContent | undefined
  readonly onAction?: ((event: LumenAppShellWorkflowAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Host-owned regions for production workbench composition. */
  readonly slots?: LumenAppShellWorkflowSlots | undefined
  /** Controlled runtime shell layout props. These let AppShell09 project a live app without preview data. */
  readonly label?: LumenAppShellProps['label']
  readonly titlebar?: LumenAppShellProps['titlebar']
  readonly sidebar?: LumenAppShellProps['sidebar']
  readonly sidebarWidthRem?: LumenAppShellProps['sidebarWidthRem']
  readonly sidebarLayout?: LumenAppShellProps['sidebarLayout']
  readonly sidebarResize?: LumenAppShellProps['sidebarResize']
  readonly toolWidthRem?: LumenAppShellProps['toolWidthRem']
  readonly toolLayout?: LumenAppShellProps['toolLayout']
  readonly mainRef?: LumenAppShellProps['mainRef']
  readonly toolRef?: LumenAppShellProps['toolRef']
  readonly resizeRef?: LumenAppShellProps['resizeRef']
  readonly onToolPresentationChange?: LumenAppShellProps['onToolPresentationChange']
  readonly onCloseTool?: LumenAppShellProps['onCloseTool']
  readonly toolResize?: LumenAppShellProps['toolResize']
  readonly sidebarOpen?: LumenAppShellProps['sidebarOpen']
  readonly closeSidebarLabel?: LumenAppShellProps['closeSidebarLabel']
  readonly onCloseSidebar?: LumenAppShellProps['onCloseSidebar']
  readonly header?: LumenAppShellProps['header']
  readonly tool?: LumenAppShellProps['tool']
  readonly toolLabel?: LumenAppShellProps['toolLabel']
  readonly overlay?: LumenAppShellProps['overlay']
  readonly children?: LumenAppShellProps['children']
}

export interface LumenAppShellWorkflowSlots {
  readonly desktopLayout?: React.ReactNode
  readonly navigation?: React.ReactNode
  readonly header?: React.ReactNode
  readonly content?: React.ReactNode
  readonly composer?: React.ReactNode
  readonly context?: React.ReactNode
}

export type LumenAppShellWorkflowVariantProps = Omit<LumenAppShellWorkflowsProps, 'variant' | 'variantId'>

const Context = React.createContext<LumenAppShellContent | undefined>(undefined)

export function LumenAppShellWorkflowsProvider({ content, children }: LumenAppShellWorkflowsProviderProps) {
  return <Context.Provider value={content}>{children}</Context.Provider>
}

export function useLumenAppShellWorkflowsContent() {
  return React.useContext(Context)
}

export function uniqueLumenAppShellItems<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenAppShellItem<T extends { readonly id: string }>(
  items: readonly T[],
  id: string | undefined,
) {
  return items.find((item) => item.id.trim() && item.id === id) ?? items.find((item) => item.id.trim())
}

const report = (fn: LumenAppShellWorkflowsProps['onAction'], actionId: string, value?: string) =>
  fn?.(value === undefined ? { actionId } : { actionId, value })

function Glyph({ name }: { name: 'menu' | 'search' | 'area' | 'file' | 'send' | 'spark' }) {
  const paths = {
    menu: 'M2 4h12M2 8h12M2 12h12',
    search: 'm11 11 3 3m-2-7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    file: 'M4 2h5l3 3v9H4zM9 2v3h3',
    send: 'm2 3 12 5-12 5 2-5z',
    spark: 'M8 1.5 9.5 6 14 8l-4.5 2L8 14.5 6.5 10 2 8l4.5-2z',
    area: 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z',
  } as const
  return (
    <svg className="lumen-app-shell-glyph" viewBox="0 0 16 16" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}

function Root({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenAppShellWorkflowsProps, 'content' | 'onAction'> & { children: React.ReactNode }) {
  const contentClassName = [
    'lumen-app-shell-stage',
    `hbar-app-ui-shell-variant-${variant}`,
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
      boundary="horizontal"
      className="lumen-app-shell-stage-surface"
      contentClassName={contentClassName}
      data-lumen-component="app-shell"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Header({ content, title }: { content: LumenAppShellContent; title?: string | undefined }) {
  return (
    <header className="lumen-app-shell-header">
      <div>
        <LumenText as="h1" variant="title">
          {title ?? content.labels.title}
        </LumenText>
        <LumenText as="p" tone="muted">
          {content.labels.detail}
        </LumenText>
      </div>
      <LumenStatus value={content.labels.connected} tone="success" />
    </header>
  )
}

function Empty({ children }: { children: string }) {
  return (
    <LumenText as="p" className="lumen-app-shell-empty" tone="muted">
      {children}
    </LumenText>
  )
}

function Navigation({
  content,
  selectedId,
  compact = false,
  onSelect,
}: {
  content: LumenAppShellContent
  selectedId?: string | undefined
  compact?: boolean | undefined
  onSelect: (id: string) => void
}) {
  const items = uniqueLumenAppShellItems(content.navigation)
  return (
    <nav
      className={compact ? 'lumen-app-shell-nav is-compact' : 'lumen-app-shell-nav'}
      aria-label={content.labels.navigation}
    >
      {items.map((item) => (
        <LumenButton
          key={item.id}
          variant="text"
          aria-current={item.id === selectedId ? 'page' : undefined}
          aria-label={item.label}
          onClick={() => onSelect(item.id)}
        >
          <Glyph name="area" />
          <span>{item.label}</span>
          {item.badge ? <small>{item.badge}</small> : null}
        </LumenButton>
      ))}
    </nav>
  )
}

function RecordList({
  content,
  selectedId,
  onSelect,
}: {
  content: LumenAppShellContent
  selectedId?: string | undefined
  onSelect: (id: string) => void
}) {
  const records = uniqueLumenAppShellItems(content.records)
  return records.length ? (
    <div className="lumen-app-shell-records" data-hbar-app-ui-list-strategy={content.listStrategy.kind}>
      {records.map((record) => (
        <LumenButton
          key={record.id}
          variant="text"
          aria-pressed={record.id === selectedId}
          onClick={() => onSelect(record.id)}
        >
          <span>
            <strong>{record.label}</strong>
            <small>{record.detail}</small>
          </span>
          {record.status ? <LumenStatus value={record.status} tone={record.tone} /> : null}
        </LumenButton>
      ))}
    </div>
  ) : (
    <Empty>{content.labels.emptyRecords}</Empty>
  )
}

function Sidebar(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const items = uniqueLumenAppShellItems(props.content.navigation)
  const [selectedId, setSelectedId] = React.useState(props.content.initialNavigationId)
  const [open, setOpen] = React.useState(true)
  const selected = selectLumenAppShellItem(items, selectedId)
  return (
    <Root {...props}>
      <div className="lumen-app-shell-sidebar-layout hbar-app-ui-shell-layout">
        <aside>
          <div className="lumen-app-shell-brand">
            <Glyph name="spark" />
            <strong>{props.content.labels.brand}</strong>
          </div>
          <LumenButton variant="text" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <Glyph name="menu" />
            {props.content.labels.toggleNavigation}
          </LumenButton>
          {open ? (
            <Navigation
              content={props.content}
              selectedId={selected?.id}
              onSelect={(id) => {
                setSelectedId(id)
                report(props.onAction, 'navigate', id)
              }}
            />
          ) : null}
        </aside>
        <main>
          <Header content={props.content} title={selected?.label} />
          <LumenButton
            className="lumen-app-shell-search"
            variant="outlined"
            onClick={() => report(props.onAction, 'search')}
          >
            <Glyph name="search" />
            {props.content.labels.search}
          </LumenButton>
          <div className="lumen-app-shell-metrics">
            {props.content.metrics.map((metric) => (
              <article key={metric.id}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>
          <RecordList
            content={props.content}
            selectedId={props.content.initialRecordId}
            onSelect={(id) => report(props.onAction, 'open', id)}
          />
        </main>
      </div>
    </Root>
  )
}

function Rails(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const items = uniqueLumenAppShellItems(props.content.navigation)
  const [selectedId, setSelectedId] = React.useState(props.content.initialNavigationId)
  const selected = selectLumenAppShellItem(items, selectedId)
  return (
    <Root {...props}>
      <div className="lumen-app-shell-three-pane hbar-app-ui-three-pane">
        <Navigation
          content={props.content}
          selectedId={selected?.id}
          compact
          onSelect={(id) => {
            setSelectedId(id)
            report(props.onAction, 'navigate', id)
          }}
        />
        <aside>
          <LumenText as="strong">{selected?.label ?? props.content.labels.navigation}</LumenText>
          {items.map((item) => (
            <LumenText key={item.id} as="span" tone={item.id === selected?.id ? 'neutral' : 'muted'}>
              {item.label}
            </LumenText>
          ))}
        </aside>
        <main>
          <Header content={props.content} title={selected?.label} />
          <RecordList
            content={props.content}
            selectedId={props.content.initialRecordId}
            onSelect={(id) => report(props.onAction, 'open', id)}
          />
        </main>
      </div>
    </Root>
  )
}

function Workbench(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const workspaces = uniqueLumenAppShellItems(props.content.workspaces)
  const [workspaceId, setWorkspaceId] = React.useState(props.content.initialWorkspaceId)
  const [sidebarOpen, setSidebarOpen] = React.useState(true)
  const workspace = selectLumenAppShellItem(workspaces, workspaceId)
  return (
    <Root {...props}>
      <LumenAppShell
        label={props.content.labels.title}
        sidebarWidthRem={17}
        sidebarOpen={sidebarOpen}
        closeSidebarLabel={props.content.labels.closeNavigation}
        onCloseSidebar={() => setSidebarOpen(false)}
        header={
          <div className="lumen-app-shell-workbench-header">
            <LumenIconButton
              label={props.content.labels.toggleNavigation}
              onClick={() => setSidebarOpen((value) => !value)}
            >
              <Glyph name="menu" />
            </LumenIconButton>
            <strong>{props.content.labels.brand}</strong>
            <LumenChoiceSelect
              id={`${props.variantId}-workspace`}
              label={props.content.labels.title}
              options={workspaces}
              value={workspace?.id ?? null}
              onValueChange={(id) => {
                setWorkspaceId(id)
                report(props.onAction, 'workspace', id)
              }}
            />
            <LumenButton variant="outlined" onClick={() => report(props.onAction, 'search')}>
              <Glyph name="search" />
              {props.content.labels.search}
            </LumenButton>
            <LumenStatus value={props.content.labels.connected} tone="success" />
          </div>
        }
        sidebar={
          <Navigation
            content={props.content}
            selectedId={props.content.initialNavigationId}
            onSelect={(id) => report(props.onAction, 'navigate', id)}
          />
        }
      >
        <div className="lumen-app-shell-workbench">
          <Header content={props.content} title={workspace?.label} />
          <RecordList
            content={props.content}
            selectedId={props.content.initialRecordId}
            onSelect={(id) => report(props.onAction, 'open', id)}
          />
        </div>
      </LumenAppShell>
    </Root>
  )
}

function Contextual(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const [open, setOpen] = React.useState(true)
  return (
    <Root {...props}>
      <Header content={props.content} />
      <div className="lumen-app-shell-context-actions">
        <LumenButton
          variant="outlined"
          onClick={() => {
            setOpen((value) => !value)
            report(props.onAction, 'context', String(!open))
          }}
        >
          {open ? props.content.labels.hideContext : props.content.labels.showContext}
        </LumenButton>
      </div>
      <div className="lumen-app-shell-context-columns hbar-app-ui-context-columns">
        <Navigation
          content={props.content}
          selectedId={props.content.initialNavigationId}
          onSelect={(id) => report(props.onAction, 'navigate', id)}
        />
        <main>
          <RecordList
            content={props.content}
            selectedId={props.content.initialRecordId}
            onSelect={(id) => report(props.onAction, 'open', id)}
          />
        </main>
        {open ? (
          <aside>
            <LumenText as="h2" variant="heading">
              {props.content.labels.context}
            </LumenText>
            {props.content.context.map((item) => (
              <div key={item.id}>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </aside>
        ) : null}
      </div>
    </Root>
  )
}

function Triage(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const records = uniqueLumenAppShellItems(props.content.records)
  const [selectedId, setSelectedId] = React.useState(props.content.initialRecordId)
  const [query, setQuery] = React.useState('')
  const selected = selectLumenAppShellItem(records, selectedId)
  const visible = records.filter((item) =>
    `${item.label} ${item.detail}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <Root {...props}>
      <div className="lumen-app-shell-triage hbar-app-ui-triage">
        <Navigation
          content={props.content}
          selectedId={props.content.initialNavigationId}
          compact
          onSelect={(id) => report(props.onAction, 'navigate', id)}
        />
        <aside>
          <label className="lumen-app-shell-filter" htmlFor="lumen-app-shell-filter-input">
            <Glyph name="search" />
            <LumenInput
              id="lumen-app-shell-filter-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={props.content.labels.search}
              aria-label={props.content.labels.search}
            />
          </label>
          {visible.length ? (
            <div className="lumen-app-shell-records" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
              {visible.map((record) => (
                <LumenButton
                  key={record.id}
                  variant="text"
                  aria-pressed={record.id === selected?.id}
                  onClick={() => {
                    setSelectedId(record.id)
                    report(props.onAction, 'open', record.id)
                  }}
                >
                  <span>
                    <strong>{record.label}</strong>
                    <small>{record.detail}</small>
                  </span>
                </LumenButton>
              ))}
            </div>
          ) : (
            <Empty>{props.content.labels.emptyRecords}</Empty>
          )}
        </aside>
        <main>
          <Header content={props.content} title={selected?.label} />
          <LumenText as="p">{selected?.detail ?? props.content.labels.empty}</LumenText>
        </main>
      </div>
    </Root>
  )
}

function Document(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const files = uniqueLumenAppShellItems(props.content.files)
  const [fileId, setFileId] = React.useState(props.content.initialFileId)
  return (
    <Root {...props}>
      <Header content={props.content} />
      <div className="lumen-app-shell-document hbar-app-ui-document-shell">
        <aside>
          <LumenText as="h2" variant="heading">
            {props.content.labels.files}
          </LumenText>
          {files.length ? (
            files.map((file) => (
              <LumenButton
                key={file.id}
                variant="text"
                aria-current={file.id === selectLumenAppShellItem(files, fileId)?.id ? 'page' : undefined}
                onClick={() => {
                  setFileId(file.id)
                  report(props.onAction, 'file', file.id)
                }}
              >
                <Glyph name="file" />
                {file.label}
              </LumenButton>
            ))
          ) : (
            <Empty>{props.content.labels.empty}</Empty>
          )}
        </aside>
        <main>
          <div className="lumen-app-shell-format">
            <LumenButton variant="text" aria-label={props.content.labels.bold}>
              <strong>{props.content.labels.bold}</strong>
            </LumenButton>
            <LumenButton variant="text" aria-label={props.content.labels.italic}>
              <em>{props.content.labels.italic}</em>
            </LumenButton>
            <LumenButton variant="text">{props.content.labels.code}</LumenButton>
            <LumenButton variant="text">{props.content.labels.link}</LumenButton>
            <LumenButton tone="primary" onClick={() => report(props.onAction, 'save', fileId)}>
              {props.content.labels.save}
            </LumenButton>
          </div>
          <LumenTextarea
            defaultValue={props.content.documentValue}
            aria-label={selectLumenAppShellItem(files, fileId)?.label ?? props.content.labels.files}
          />
        </main>
      </div>
    </Root>
  )
}

function Scoped(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const scopes = uniqueLumenAppShellItems(props.content.scopes)
  const [values, setValues] = React.useState(() =>
    Object.fromEntries(
      scopes.map((scope) => [
        scope.id,
        selectLumenAppShellItem(uniqueLumenAppShellItems(scope.options), scope.initialOptionId)?.id ?? '',
      ]),
    ),
  )
  return (
    <Root {...props}>
      <Header content={props.content} />
      <main className="lumen-app-shell-scoped">
        <div
          className="lumen-app-shell-scope-pickers hbar-app-ui-scope-pickers"
          aria-label={props.content.labels.scopes}
        >
          {scopes.map((scope) => {
            const options = uniqueLumenAppShellItems(scope.options)
            return (
              <div className="lumen-app-shell-scope-field" key={scope.id}>
                <span>{scope.label}</span>
                <LumenChoiceSelect
                  id={`${props.variantId}-scope-${scope.id}`}
                  label={scope.label}
                  options={options}
                  value={selectLumenAppShellItem(options, values[scope.id])?.id ?? null}
                  onValueChange={(id) => {
                    setValues((current) => ({ ...current, [scope.id]: id }))
                    report(props.onAction, 'scope', `${scope.id}:${id}`)
                  }}
                />
              </div>
            )
          })}
        </div>
        <RecordList
          content={props.content}
          selectedId={props.content.initialRecordId}
          onSelect={(id) => report(props.onAction, 'open', id)}
        />
      </main>
    </Root>
  )
}

function Adaptive(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const views = uniqueLumenAppShellItems(props.content.views)
  const [viewId, setViewId] = React.useState(props.content.initialViewId)
  const view = selectLumenAppShellItem(views, viewId)
  return (
    <Root {...props}>
      <Header content={props.content} />
      <LumenTabs
        className="lumen-app-shell-view-tabs"
        label={props.content.labels.frameSize}
        items={views}
        selectedId={view?.id ?? null}
        onChange={(id) => {
          setViewId(id)
          report(props.onAction, 'view', id)
        }}
      />
      <div className="lumen-app-shell-adaptive hbar-app-ui-adaptive-frame" data-view={view?.id}>
        <Navigation
          content={props.content}
          selectedId={props.content.initialNavigationId}
          onSelect={(id) => report(props.onAction, 'navigate', id)}
        />
        <main>
          <RecordList
            content={props.content}
            selectedId={props.content.initialRecordId}
            onSelect={(id) => report(props.onAction, 'open', id)}
          />
        </main>
      </div>
    </Root>
  )
}

function Chat(props: Omit<LumenAppShellWorkflowsProps, 'content'> & { content: LumenAppShellContent }) {
  const threads = uniqueLumenAppShellItems(props.content.threads)
  const models = uniqueLumenAppShellItems(props.content.models)
  const [threadId, setThreadId] = React.useState(props.content.initialThreadId)
  const [modelId, setModelId] = React.useState(props.content.initialModelId)
  const [message, setMessage] = React.useState('')
  return (
    <Root {...props}>
      <div className="lumen-app-shell-chat hbar-app-ui-chat-shell">
        <aside>
          <LumenText as="h2" variant="heading">
            {props.content.labels.messages}
          </LumenText>
          {threads.map((thread) => (
            <LumenButton
              key={thread.id}
              variant="text"
              aria-current={thread.id === selectLumenAppShellItem(threads, threadId)?.id ? 'page' : undefined}
              onClick={() => {
                setThreadId(thread.id)
                report(props.onAction, 'thread', thread.id)
              }}
            >
              {thread.label}
            </LumenButton>
          ))}
        </aside>
        <main>
          <Header content={props.content} title={selectLumenAppShellItem(threads, threadId)?.label} />
          <LumenChoiceSelect
            id={`${props.variantId}-model`}
            label={props.content.labels.model}
            options={models}
            value={selectLumenAppShellItem(models, modelId)?.id ?? null}
            onValueChange={(id) => {
              setModelId(id)
              report(props.onAction, 'model', id)
            }}
          />
          <div className="lumen-app-shell-messages" data-hbar-app-ui-list-strategy={props.content.listStrategy.kind}>
            {props.content.messages.length ? (
              props.content.messages.map((item) => (
                <article key={item.id}>
                  <strong>{item.label}</strong>
                  <p>{item.detail}</p>
                </article>
              ))
            ) : (
              <Empty>{props.content.labels.empty}</Empty>
            )}
          </div>
          <form
            className="lumen-app-shell-composer"
            onSubmit={(event) => {
              event.preventDefault()
              if (!message.trim()) {
                return
              }
              report(props.onAction, 'send', message.trim())
              setMessage('')
            }}
          >
            <LumenTextarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={props.content.labels.composer}
              aria-label={props.content.labels.composer}
            />
            <LumenIconButton label={props.content.labels.send} type="submit" disabled={!message.trim()}>
              <Glyph name="send" />
            </LumenIconButton>
          </form>
        </main>
      </div>
    </Root>
  )
}

function empty(props: LumenAppShellWorkflowsProps) {
  return <Root {...props}>{null}</Root>
}

export function LumenAppShellWorkflows(props: LumenAppShellWorkflowsProps) {
  const providerContent = useLumenAppShellWorkflowsContent()
  if (props.variant === 9 && props.slots?.desktopLayout)
    return (
      <Root
        {...props}
        className={['lumen-shell-chat-stage', 'lumen-shell-chat-runtime-stage', props.className]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className="lumen-app-shell lumen-desktop-shell"
          data-lumen-shell="app"
          data-hbar-app-ui-shell="app"
          data-sidebar-open={props.sidebarOpen}
          data-tool-presentation={props.tool ? 'split' : 'none'}
        >
          {props.titlebar}
          {props.header || props.slots.header ? (
            <header {...lumenPartProps("shell.header")} className="lumen-desktop-shell-header">{props.header ?? props.slots.header}</header>
          ) : null}
          {props.slots.desktopLayout}
          {props.overlay}
        </div>
      </Root>
    )
  const content = props.content ?? providerContent
  if (!content) {
    if (props.variant === 4 && props.slots?.context) {
      return (
        <Root
          {...props}
          className={['lumen-shell-editorial-stage', 'lumen-shell-context-runtime-stage', props.className]
            .filter(Boolean)
            .join(' ')}
        >
          <aside className="lumen-app-shell-context-surface" aria-label={props.toolLabel ?? 'Context'}>
            {props.slots.context}
          </aside>
        </Root>
      )
    }
    if (props.variant === 9 && (props.sidebar !== undefined || props.children !== undefined)) {
      return (
        <Root
          {...props}
          className={['lumen-shell-chat-stage', 'lumen-shell-chat-runtime-stage', props.className]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenAppShell
            label={props.label ?? 'main'}
            titlebar={props.titlebar}
            sidebar={props.sidebar}
            sidebarWidthRem={props.sidebarWidthRem ?? 18}
            sidebarLayout={props.sidebarLayout}
            sidebarResize={props.sidebarResize}
            toolWidthRem={props.toolWidthRem}
            toolLayout={props.toolLayout}
            mainRef={props.mainRef}
            toolRef={props.toolRef}
            resizeRef={props.resizeRef}
            onToolPresentationChange={props.onToolPresentationChange}
            onCloseTool={props.onCloseTool}
            toolResize={props.toolResize}
            sidebarOpen={props.sidebarOpen ?? true}
            closeSidebarLabel={props.closeSidebarLabel ?? 'Close navigation'}
            onCloseSidebar={props.onCloseSidebar ?? (() => undefined)}
            header={props.header}
            tool={props.tool}
            toolLabel={props.toolLabel}
            overlay={props.overlay}
          >
            {props.children}
          </LumenAppShell>
        </Root>
      )
    }
    return empty(props)
  }
  const view = <AppShellWorkflowView {...props} content={content} />
  return content.presentation ? (
    <div className="lumen-app-shell-preview" key={content.presentation.ownerId}>
      {content.presentation.notice ? (
        <p className="lumen-app-shell-preview-notice" role="status">
          {content.presentation.notice}
        </p>
      ) : null}
      {view}
    </div>
  ) : (
    view
  )
}

function AppShellWorkflowView(props: LumenAppShellWorkflowsProps & { readonly content: LumenAppShellContent }) {
  const content = props.content
  if (props.variant === 1) {
    if (content.sidebar) {
      return (
        <Root {...props} className={['lumen-shell-sidebar-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellSidebar content={content.sidebar} />
        </Root>
      )
    }
    return <Sidebar {...props} content={content} />
  }
  if (props.variant === 2) {
    if (content.rail) {
      return (
        <Root {...props} className={['lumen-shell-rail-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellRail content={content.rail} />
        </Root>
      )
    }
    return <Rails {...props} content={content} />
  }
  if (props.variant === 3) {
    if (content.contracts)
      return (
        <Root {...props} className={['lumen-shell-contracts-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellContracts content={content.contracts} />
        </Root>
      )
    return <Workbench {...props} content={content} />
  }
  if (props.variant === 4) {
    if (props.slots?.context)
      return (
        <Root
          {...props}
          className={['lumen-shell-editorial-stage', 'lumen-shell-context-runtime-stage', props.className]
            .filter(Boolean)
            .join(' ')}
        >
          <aside className="lumen-app-shell-context-surface" aria-label={props.toolLabel ?? 'Context'}>
            {props.slots.context}
          </aside>
        </Root>
      )
    if (content.editorial)
      return (
        <Root {...props} className={['lumen-shell-editorial-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellEditorial content={content.editorial} />
        </Root>
      )
    return <Contextual {...props} content={content} />
  }
  if (props.variant === 5) {
    if (content.inbox)
      return (
        <Root {...props} className={['lumen-shell-inbox-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellInbox content={content.inbox} />
        </Root>
      )
    return <Triage {...props} content={content} />
  }
  if (props.variant === 6) {
    if (content.documents)
      return (
        <Root {...props} className={['lumen-shell-documents-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellDocuments content={content.documents} />
        </Root>
      )
    return <Document {...props} content={content} />
  }
  if (props.variant === 7) {
    if (content.scope)
      return (
        <Root {...props} className={['lumen-shell-scope-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellScope content={content.scope} />
        </Root>
      )
    return <Scoped {...props} content={content} />
  }
  if (props.variant === 8) {
    if (content.adaptive)
      return (
        <Root {...props} className={['lumen-shell-adaptive-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellAdaptive content={content.adaptive} />
        </Root>
      )
    return <Adaptive {...props} content={content} />
  }
  if (props.variant === 9) {
    if (props.slots)
      return (
        <Root
          {...props}
          className={['lumen-shell-chat-stage', 'lumen-shell-chat-runtime-stage', props.className]
            .filter(Boolean)
            .join(' ')}
        >
          <LumenAppShell
            label={props.label ?? content.labels.title}
            titlebar={props.titlebar}
            sidebar={props.sidebar ?? props.slots.navigation}
            sidebarWidthRem={props.sidebarWidthRem ?? 18}
            sidebarLayout={props.sidebarLayout}
            sidebarResize={props.sidebarResize}
            toolWidthRem={props.toolWidthRem}
            toolLayout={props.toolLayout}
            mainRef={props.mainRef}
            toolRef={props.toolRef}
            resizeRef={props.resizeRef}
            onToolPresentationChange={props.onToolPresentationChange}
            onCloseTool={props.onCloseTool}
            toolResize={props.toolResize}
            sidebarOpen={props.sidebarOpen ?? true}
            closeSidebarLabel={props.closeSidebarLabel ?? content.labels.closeNavigation}
            onCloseSidebar={props.onCloseSidebar ?? (() => undefined)}
            header={props.header ?? props.slots.header}
            tool={props.tool ?? props.slots.context}
            toolLabel={props.toolLabel}
            overlay={props.overlay}
          >
            {props.children ?? (
              <>
                {props.slots.content}
                {props.slots.composer}
              </>
            )}
          </LumenAppShell>
        </Root>
      )
    if (content.chat)
      return (
        <Root {...props} className={['lumen-shell-chat-stage', props.className].filter(Boolean).join(' ')}>
          <AppShellChat content={content.chat} />
        </Root>
      )
    // Runtime callers may supply the live pane contract without preview content.
    // Keep the canonical AppShell09 identity while delegating flow, resize and
    // focus behavior to the shared production shell implementation.
    if (props.sidebar !== undefined || props.children !== undefined)
      return (
        <LumenAppShell
          label={props.label ?? content.labels.title}
          titlebar={props.titlebar}
          sidebar={props.sidebar}
          sidebarWidthRem={props.sidebarWidthRem ?? 18}
          sidebarLayout={props.sidebarLayout}
          sidebarResize={props.sidebarResize}
          toolWidthRem={props.toolWidthRem}
          toolLayout={props.toolLayout}
          mainRef={props.mainRef}
          toolRef={props.toolRef}
          resizeRef={props.resizeRef}
          onToolPresentationChange={props.onToolPresentationChange}
          onCloseTool={props.onCloseTool}
          toolResize={props.toolResize}
          sidebarOpen={props.sidebarOpen ?? true}
          closeSidebarLabel={props.closeSidebarLabel ?? content.labels.closeNavigation}
          onCloseSidebar={props.onCloseSidebar ?? (() => undefined)}
          header={props.header}
          tool={props.tool}
          toolLabel={props.toolLabel}
          overlay={props.overlay}
        >
          {props.children}
        </LumenAppShell>
      )
    return <Chat {...props} content={content} />
  }
  return empty(props)
}

function variant(value: number, props: LumenAppShellWorkflowVariantProps) {
  return <LumenAppShellWorkflows {...props} variant={value} variantId={`hbar-app-ui-app-shell-${value}`} />
}

export const LumenAppShell01 = (props: LumenAppShellWorkflowVariantProps) => variant(1, props),
  LumenAppShell02 = (props: LumenAppShellWorkflowVariantProps) => variant(2, props),
  LumenAppShell03 = (props: LumenAppShellWorkflowVariantProps) => variant(3, props),
  LumenAppShell04 = (props: LumenAppShellWorkflowVariantProps) => variant(4, props),
  LumenAppShell05 = (props: LumenAppShellWorkflowVariantProps) => variant(5, props),
  LumenAppShell06 = (props: LumenAppShellWorkflowVariantProps) => variant(6, props),
  LumenAppShell07 = (props: LumenAppShellWorkflowVariantProps) => variant(7, props),
  LumenAppShell08 = (props: LumenAppShellWorkflowVariantProps) => variant(8, props),
  LumenAppShell09 = (props: LumenAppShellWorkflowVariantProps) => variant(9, props)
