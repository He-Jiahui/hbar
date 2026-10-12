'use client'

import * as React from 'react'
import { LumenCheckBoxControl, LumenInput } from './forms'
import LumenSurface from './LumenSurface'
import { LumenButton, LumenIconButton, LumenStatus } from './primitives'
import './file-manager.css'
import './file-manager-reference.css'
import LumenFileManagerReference from './file-manager-reference'
import { type LumenFileManagerReferenceContent } from './file-manager-reference-contracts'
import { LumenProgress } from './ui-controls'

export type LumenFileManagerListStrategy =
  | { readonly kind: 'content-grown'; readonly expectedMaximum: number }
  | { readonly kind: 'pane-scroll'; readonly expectedMaximum: number }

export type LumenFileKind = 'folder' | 'image' | 'document' | 'video' | 'archive' | 'file'

export interface LumenFileManagerFolder {
  readonly id: string
  readonly name: string
  readonly kind?: LumenFileKind | undefined
  readonly detail?: string | undefined
  readonly parentId?: string | undefined
  readonly expandable?: boolean | undefined
}

export interface LumenFileManagerOwner {
  readonly initials: string
  readonly name: string
}

export interface LumenFileManagerCollaborator extends LumenFileManagerOwner {
  readonly permission: string
}

export interface LumenFileManagerActivity {
  readonly id: string
  readonly text: string
}

export interface LumenFileManagerDriveRow {
  readonly id: string
  readonly name: string
  readonly kind: LumenFileKind
  readonly detail?: string | undefined
  readonly size: string
  readonly modified: string
  readonly owner: LumenFileManagerOwner
  readonly starred?: boolean | undefined
}

export interface LumenFileManagerDriveContent {
  readonly labels: {
    readonly title: string
    readonly description: string
    readonly newFolder: string
    readonly upload: string
    readonly myDrive: string
    readonly shared: string
    readonly recent: string
    readonly starred: string
    readonly bin: string
    readonly search: string
    readonly name: string
    readonly size: string
    readonly modified: string
    readonly owner: string
    readonly actions: string
    readonly storage: string
    readonly storageProgress: string
    readonly storageSummary: (used: string, total: string) => string
    readonly empty: string
    readonly collapseFolder: (name: string) => string
    readonly expandFolder: (name: string) => string
    readonly openFolder: (name: string) => string
    readonly openItem: (name: string) => string
    readonly itemActions: (name: string) => string
    readonly selectAll: string
    readonly selectItem: (name: string) => string
    readonly starItem: (name: string) => string
    readonly unstarItem: (name: string) => string
    readonly listView: string
    readonly gridView: string
  }
  readonly folders: readonly LumenFileManagerFolder[]
  readonly rows: readonly LumenFileManagerDriveRow[]
  readonly storageUsed: string
  readonly storageTotal: string
  readonly storagePercent: number
  readonly listStrategy: LumenFileManagerListStrategy
}

export interface LumenFileManagerAsset {
  readonly id: string
  readonly name: string
  readonly kind: LumenFileKind
  readonly format: string
  readonly size: string
  readonly selectedByDefault?: boolean | undefined
}

export interface LumenFileManagerAssetContent {
  readonly labels: {
    readonly breadcrumb: string
    readonly title: string
    readonly summary: string
    readonly folders: string
    readonly files: string
    readonly all: string
    readonly images: string
    readonly video: string
    readonly documents: string
    readonly sort: string
    readonly selected: (count: number) => string
    readonly share: string
    readonly delete: string
    readonly more: string
    readonly empty: string
    readonly selectAsset: (name: string) => string
    readonly assetSummary: (format: string, size: string) => string
  }
  readonly folders: readonly LumenFileManagerFolder[]
  readonly assets: readonly LumenFileManagerAsset[]
  readonly listStrategy: LumenFileManagerListStrategy
}

export interface LumenFileManagerMetadata {
  readonly id: string
  readonly label: string
  readonly value: string
}

export interface LumenFileManagerDetailItem {
  readonly id: string
  readonly name: string
  readonly kind: LumenFileKind
  readonly format: string
  readonly size: string
  readonly previewLabel: string
  readonly version: string
  readonly metadata: readonly LumenFileManagerMetadata[]
  readonly collaborators: readonly LumenFileManagerCollaborator[]
  readonly accessNotice: string
  readonly activity: readonly LumenFileManagerActivity[]
}

export interface LumenFileManagerDetailContent {
  readonly labels: {
    readonly title: string
    readonly summary: string
    readonly download: string
    readonly shareItem: (name: string) => string
    readonly details: string
    readonly sharedWith: string
    readonly activity: string
    readonly copyLink: string
    readonly makeCopy: string
    readonly openItem: (name: string) => string
    readonly itemSummary: (format: string, size: string) => string
    readonly previewSummary: (version: string, size: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenFileManagerDetailItem[]
  readonly activeItemId?: string | undefined
  readonly listStrategy: LumenFileManagerListStrategy
}

export type LumenFileManagerUploadState = 'queued' | 'uploading' | 'uploaded' | 'failed'

export interface LumenFileManagerUploadItem {
  readonly id: string
  readonly name: string
  readonly kind: LumenFileKind
  readonly size: string
  readonly state: LumenFileManagerUploadState
  readonly progress: number
  readonly remaining?: string | undefined
  readonly statusDetail?: string | undefined
}

export interface LumenFileManagerUploadContent {
  readonly labels: {
    readonly title: string
    readonly summary: string
    readonly dismiss: string
    readonly dropTitle: string
    readonly dropDescription: string
    readonly queue: string
    readonly uploaded: string
    readonly uploading: string
    readonly failed: string
    readonly queued: string
    readonly cancelAll: string
    readonly clearCompleted: string
    readonly transferSummary: string
    readonly progress: (percent: number, remaining: string | undefined) => string
    readonly pause: (name: string) => string
    readonly start: (name: string) => string
    readonly retry: (name: string) => string
    readonly remove: (name: string) => string
    readonly empty: string
  }
  readonly items: readonly LumenFileManagerUploadItem[]
  readonly listStrategy: LumenFileManagerListStrategy
}

export interface LumenFileManagerContent {
  readonly reference?: LumenFileManagerReferenceContent | undefined
  readonly drive?: LumenFileManagerDriveContent | undefined
  readonly assets?: LumenFileManagerAssetContent | undefined
  readonly detail?: LumenFileManagerDetailContent | undefined
  readonly upload?: LumenFileManagerUploadContent | undefined
}

export interface LumenFileManagerProviderProps {
  readonly content: LumenFileManagerContent
  readonly children: React.ReactNode
}

export interface LumenFileManagerAction {
  readonly actionId: string
  readonly value?: string | undefined
}

export interface LumenFileManagerProps {
  readonly variant: number
  readonly variantId: string
  readonly content?: LumenFileManagerContent | undefined
  readonly onAction?: ((event: LumenFileManagerAction) => void) | undefined
  readonly className?: string | undefined
  readonly density?: string | undefined
  readonly surface?: string | undefined
  readonly state?: string | undefined
  readonly visualMode?: string | undefined
  /** Host controlled regions for production workspaces. */
  readonly slots?:
    | {
        readonly navigation?: React.ReactNode | undefined
        readonly toolbar?: React.ReactNode | undefined
        readonly content?: React.ReactNode | undefined
        readonly footer?: React.ReactNode | undefined
      }
    | undefined
}

export type LumenFileManagerVariantProps = Omit<LumenFileManagerProps, 'variant' | 'variantId'>

const FileManagerContentContext = React.createContext<LumenFileManagerContent | undefined>(undefined)

export function LumenFileManagerProvider({ content, children }: LumenFileManagerProviderProps) {
  return <FileManagerContentContext.Provider value={content}>{children}</FileManagerContentContext.Provider>
}

export function useLumenFileManagerContent() {
  return React.useContext(FileManagerContentContext)
}

export function uniqueLumenFileManagerItems<Item extends { readonly id: string }>(
  items: readonly Item[],
): readonly Item[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function selectLumenFileManagerItem<Item extends { readonly id: string }>(
  items: readonly Item[],
  selectedId: string | undefined,
): Item | undefined {
  return items.find((item) => item.id === selectedId) ?? items[0]
}

function report(onAction: LumenFileManagerProps['onAction'], actionId: string, value?: string) {
  onAction?.(value === undefined ? { actionId } : { actionId, value })
}

function FileGlyph({
  name,
  tier = 'sm',
}: {
  readonly name:
    | LumenFileKind
    | 'chevron-down'
    | 'chevron-right'
    | 'close'
    | 'copy'
    | 'download'
    | 'grid'
    | 'link'
    | 'list'
    | 'more'
    | 'new-folder'
    | 'pause'
    | 'play'
    | 'retry'
    | 'search'
    | 'share'
    | 'sort'
    | 'star'
    | 'trash'
    | 'upload'
  readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | undefined
}) {
  return (
    <svg className="lumen-file-manager-glyph" data-tier={tier} viewBox="0 0 16 16" aria-hidden="true">
      {name === 'folder' || name === 'new-folder' ? <path d="M2.5 4h4l1 1h6v7.5h-11z" /> : null}
      {name === 'image' ? <path d="M2.5 3h11v10h-11zM4 11l3-3 2 2 1.5-1.5L13 11M5 6h.01" /> : null}
      {name === 'document' || name === 'file' || name === 'video' || name === 'archive' ? (
        <path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" />
      ) : null}
      {name === 'chevron-down' ? <path d="m3 6 5 5 5-5" /> : null}
      {name === 'chevron-right' ? <path d="m6 3 5 5-5 5" /> : null}
      {name === 'close' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
      {name === 'copy' ? <path d="M6 5h7v8H6zM3 3h7v2M3 3v8h3" /> : null}
      {name === 'download' ? <path d="M8 2v8m-3-3 3 3 3-3M3 13h10" /> : null}
      {name === 'grid' ? <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" /> : null}
      {name === 'link' ? (
        <path d="M6.5 10.5 5 12a3 3 0 0 1-4-4l2-2a3 3 0 0 1 4 0m2.5-.5L11 4a3 3 0 0 1 4 4l-2 2a3 3 0 0 1-4 0M5.5 10.5l5-5" />
      ) : null}
      {name === 'list' ? <path d="M5 4h8M5 8h8M5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" /> : null}
      {name === 'more' ? <path d="M3 8h.01M8 8h.01M13 8h.01" /> : null}
      {name === 'new-folder' ? <path d="M10.5 8v4M8.5 10h4" /> : null}
      {name === 'pause' ? <path d="M5.5 4v8M10.5 4v8" /> : null}
      {name === 'play' ? <path d="m5 3 8 5-8 5Z" /> : null}
      {name === 'retry' ? <path d="M4 5H1V2m0 3a6 6 0 1 1-1 5" /> : null}
      {name === 'search' ? <path d="m11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z" /> : null}
      {name === 'share' ? (
        <path d="M5 8.5 11 5m-6 2.5L11 11M3.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12.5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      ) : null}
      {name === 'sort' ? <path d="M5 3v10m-2-2 2 2 2-2M11 13V3m-2 2 2-2 2 2" /> : null}
      {name === 'star' ? <path d="m8 2 1.8 3.7 4.2.6-3 2.9.7 4.1L8 11.4l-3.7 1.9.7-4.1-3-2.9 4.2-.6Z" /> : null}
      {name === 'trash' ? <path d="M3.5 5h9M6 5V3h4v2m1.5 0-.5 8H5l-.5-8M7 7v4m2-4v4" /> : null}
      {name === 'upload' ? <path d="M8 11V2m-3 3 3-3 3 3M3 9v4h10V9" /> : null}
    </svg>
  )
}

function FileManagerRoot({
  variant,
  variantId,
  density,
  surface,
  state,
  visualMode,
  className,
  children,
}: Omit<LumenFileManagerProps, 'content' | 'onAction'> & { readonly children: React.ReactNode }) {
  const contentClassName = [
    'lumen-file-manager',
    'hbar-app-ui-file-manager-surface',
    `hbar-app-ui-file-manager-variant-${variant}`,
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
      className="lumen-file-manager-surface"
      contentClassName={contentClassName}
      data-lumen-component="file-manager"
      data-lumen-variant={variant}
      data-hbar-app-ui-component={variantId}
      data-hbar-app-ui-surface={surface}
      data-hbar-app-ui-state={state}
    >
      {children}
    </LumenSurface>
  )
}

function Meter({ value, label }: { readonly value: number; readonly label: string }) {
  return <LumenProgress className="hbar-app-ui-file-manager-meter" label={label} value={value} tone="info" />
}

function DriveExplorer(props: Omit<LumenFileManagerProps, 'content'> & { content: LumenFileManagerDriveContent }) {
  const { content, onAction } = props
  const folders = React.useMemo(() => uniqueLumenFileManagerItems(content.folders), [content.folders])
  const rows = React.useMemo(() => uniqueLumenFileManagerItems(content.rows), [content.rows])
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | undefined>(folders[0]?.id)
  const [expandedFolderIds, setExpandedFolderIds] = React.useState<ReadonlySet<string>>(
    () => new Set(folders.filter((folder) => folder.expandable).map((folder) => folder.id)),
  )
  const [selectedRowId, setSelectedRowId] = React.useState<string>()
  const [selectedRowIds, setSelectedRowIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = React.useState('')
  const activeFolder = selectLumenFileManagerItem(folders, selectedFolderId)
  const selectedRow = selectLumenFileManagerItem(rows, selectedRowId)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleRows = normalizedQuery
    ? rows.filter((row) => row.name.toLocaleLowerCase().includes(normalizedQuery))
    : rows
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedRowIds.has(row.id))
  const toggleSelectedRow = (id: string, selected: boolean) => {
    setSelectedRowIds(
      (current) => new Set(selected ? [...current, id] : [...current].filter((currentId) => currentId !== id)),
    )
    report(onAction, 'select-item', id)
  }
  return (
    <FileManagerRoot {...props} className="hbar-app-ui-file-manager-drive-surface">
      <header className="hbar-app-ui-file-manager-drive-header">
        <div>
          <h2>{content.labels.title}</h2>
          <p>{content.labels.description}</p>
        </div>
        <div className="hbar-app-ui-file-manager-header-actions">
          <LumenButton variant="outlined" onClick={() => report(onAction, 'new-folder')}>
            <FileGlyph name="new-folder" />
            {content.labels.newFolder}
          </LumenButton>
          <LumenButton tone="primary" onClick={() => report(onAction, 'upload')}>
            <FileGlyph name="upload" />
            {content.labels.upload}
          </LumenButton>
        </div>
      </header>
      <div className="hbar-app-ui-file-manager-drive-body">
        <aside className="hbar-app-ui-file-manager-drive-sidebar">
          <LumenButton
            variant="text"
            className="hbar-app-ui-file-manager-location"
            onClick={() => setSelectedFolderId(folders[0]?.id)}
          >
            <FileGlyph name="chevron-down" tier="xs" />
            <span>{content.labels.myDrive}</span>
          </LumenButton>
          <nav className="hbar-app-ui-file-manager-folder-nav" aria-label={content.labels.myDrive}>
            {folders
              .filter((folder) => !folder.parentId || expandedFolderIds.has(folder.parentId))
              .map((folder) => (
                <div className="hbar-app-ui-file-manager-folder-row" key={folder.id}>
                  <LumenButton
                    variant="text"
                    aria-current={activeFolder?.id === folder.id ? 'page' : undefined}
                    aria-label={content.labels.openFolder(folder.name)}
                    onClick={() => {
                      setSelectedFolderId(folder.id)
                      report(onAction, 'open-folder', folder.id)
                    }}
                  >
                    <FileGlyph name={folder.kind ?? 'folder'} tier="xs" />
                    <span>{folder.name}</span>
                    {folder.detail ? <small>{folder.detail}</small> : null}
                  </LumenButton>
                  {folder.expandable ? (
                    <LumenIconButton
                      label={
                        expandedFolderIds.has(folder.id)
                          ? content.labels.collapseFolder(folder.name)
                          : content.labels.expandFolder(folder.name)
                      }
                      onClick={() =>
                        setExpandedFolderIds(
                          (current) =>
                            new Set(
                              current.has(folder.id)
                                ? [...current].filter((id) => id !== folder.id)
                                : [...current, folder.id],
                            ),
                        )
                      }
                    >
                      <FileGlyph name={expandedFolderIds.has(folder.id) ? 'chevron-down' : 'chevron-right'} tier="xs" />
                    </LumenIconButton>
                  ) : null}
                </div>
              ))}
          </nav>
          <nav className="hbar-app-ui-file-manager-drive-secondary" aria-label={content.labels.shared}>
            {[
              ['shared', content.labels.shared],
              ['recent', content.labels.recent],
              ['starred', content.labels.starred],
              ['bin', content.labels.bin],
            ].map(([id, label]) => (
              <LumenButton variant="text" key={id} onClick={() => report(onAction, id!)}>
                {label}
              </LumenButton>
            ))}
          </nav>
          <section className="hbar-app-ui-file-manager-storage" aria-label={content.labels.storage}>
            <div>
              <span>{content.labels.storage}</span>
              <span>{content.labels.storageProgress}</span>
            </div>
            <Meter value={content.storagePercent} label={content.labels.storage} />
            <small>{content.labels.storageSummary(content.storageUsed, content.storageTotal)}</small>
          </section>
        </aside>
        <main className="hbar-app-ui-file-manager-drive-main">
          <header className="hbar-app-ui-file-manager-drive-toolbar">
            <strong>{activeFolder?.name ?? content.labels.myDrive}</strong>
            <div className="hbar-app-ui-file-manager-search">
              <FileGlyph name="search" tier="xs" />
              <LumenInput
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder={content.labels.search}
                aria-label={content.labels.search}
              />
            </div>
            <div className="hbar-app-ui-file-manager-view-actions">
              <LumenIconButton label={content.labels.listView}>
                <FileGlyph name="list" tier="xs" />
              </LumenIconButton>
              <LumenIconButton label={content.labels.gridView}>
                <FileGlyph name="grid" tier="xs" />
              </LumenIconButton>
            </div>
          </header>
          <div
            className="hbar-app-ui-file-manager-table-wrap"
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            <table className="hbar-app-ui-file-manager-drive-table">
              <thead>
                <tr>
                  <th>
                    <label className="hbar-app-ui-file-manager-select-all">
                      <LumenCheckBoxControl
                        aria-label={content.labels.selectAll}
                        checked={allVisibleSelected}
                        onChange={(event) => {
                          const next = event.currentTarget.checked
                          setSelectedRowIds(
                            (current) =>
                              new Set(
                                next
                                  ? [...current, ...visibleRows.map((row) => row.id)]
                                  : [...current].filter((id) => !visibleRows.some((row) => row.id === id)),
                              ),
                          )
                        }}
                      />
                      <span>{content.labels.name}</span>
                    </label>
                  </th>
                  <th>{content.labels.size}</th>
                  <th>{content.labels.modified}</th>
                  <th>{content.labels.owner}</th>
                  <th>{content.labels.actions}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.id} className={selectedRow?.id === row.id ? 'is-selected' : ''}>
                    <td>
                      <div className="hbar-app-ui-file-manager-row-select">
                        <LumenCheckBoxControl
                          aria-label={content.labels.selectItem(row.name)}
                          checked={selectedRowIds.has(row.id)}
                          onChange={(event) => toggleSelectedRow(row.id, event.currentTarget.checked)}
                        />
                        <FileGlyph name={row.kind} tier="xs" />
                        <LumenButton
                          variant="text"
                          className="hbar-app-ui-file-manager-drive-row-open"
                          aria-label={
                            row.kind === 'folder'
                              ? content.labels.openFolder(row.name)
                              : content.labels.openItem(row.name)
                          }
                          onClick={() => {
                            setSelectedRowId(row.id)
                            report(onAction, 'open-item', row.id)
                          }}
                        >
                          <span>{row.name}</span>
                          {row.detail ? <small>{row.detail}</small> : null}
                        </LumenButton>
                        <LumenIconButton
                          label={row.starred ? content.labels.unstarItem(row.name) : content.labels.starItem(row.name)}
                          onClick={() => report(onAction, row.starred ? 'unstar' : 'star', row.id)}
                        >
                          <FileGlyph name="star" tier="xs" />
                        </LumenIconButton>
                      </div>
                    </td>
                    <td>{row.size}</td>
                    <td>{row.modified}</td>
                    <td>
                      <span className="hbar-app-ui-file-manager-owner">{row.owner.initials}</span>
                      <span>{row.owner.name}</span>
                    </td>
                    <td>
                      <LumenIconButton
                        label={content.labels.itemActions(row.name)}
                        onClick={() => report(onAction, 'item-actions', row.id)}
                      >
                        <FileGlyph name="more" tier="xs" />
                      </LumenIconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 ? <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p> : null}
          </div>
        </main>
      </div>
    </FileManagerRoot>
  )
}

type AssetFilter = 'all' | 'images' | 'video' | 'documents'

function matchesFilter(kind: LumenFileKind, filter: AssetFilter) {
  if (filter === 'all') {
    return true
  }
  if (filter === 'images') {
    return kind === 'image'
  }
  if (filter === 'video') {
    return kind === 'video'
  }
  return kind === 'document'
}

function AssetLibrary(props: Omit<LumenFileManagerProps, 'content'> & { content: LumenFileManagerAssetContent }) {
  const { content, onAction } = props
  const [filter, setFilter] = React.useState<AssetFilter>('all')
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>(() =>
    content.assets.filter((asset) => asset.selectedByDefault).map((asset) => asset.id),
  )
  const folders = uniqueLumenFileManagerItems(content.folders)
  const assets = uniqueLumenFileManagerItems(content.assets)
  const visibleAssets = assets.filter((asset) => matchesFilter(asset.kind, filter))
  const options: readonly { readonly id: AssetFilter; readonly label: string }[] = [
    { id: 'all', label: content.labels.all },
    { id: 'images', label: content.labels.images },
    { id: 'video', label: content.labels.video },
    { id: 'documents', label: content.labels.documents },
  ]
  const toggleSelection = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    )
    report(onAction, 'select-asset', id)
  }
  return (
    <FileManagerRoot {...props} className="hbar-app-ui-file-manager-assets-surface">
      <section className="hbar-app-ui-file-manager-assets">
        <header className="hbar-app-ui-file-manager-assets-header">
          <p>{content.labels.breadcrumb}</p>
          <div>
            <h2>{content.labels.title}</h2>
            <span>{content.labels.summary}</span>
          </div>
          <div className="hbar-app-ui-file-manager-asset-controls">
            <div className="hbar-app-ui-file-manager-filter-row" role="group" aria-label={content.labels.title}>
              {options.map((option) => (
                <LumenButton
                  variant="text"
                  key={option.id}
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                >
                  {option.label}
                </LumenButton>
              ))}
            </div>
            <LumenButton variant="outlined" onClick={() => report(onAction, 'sort')}>
              <FileGlyph name="sort" tier="xs" />
              {content.labels.sort}
            </LumenButton>
          </div>
        </header>
        <section className="hbar-app-ui-file-manager-asset-section" aria-label={content.labels.folders}>
          <h3>{content.labels.folders}</h3>
          <div
            className="hbar-app-ui-file-manager-folder-cards"
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {folders.map((folder) => (
              <LumenButton
                variant="outlined"
                key={folder.id}
                onClick={() => report(onAction, 'open-folder', folder.id)}
              >
                <FileGlyph name={folder.kind ?? 'folder'} />
                <span>{folder.name}</span>
                {folder.detail ? <small>{folder.detail}</small> : null}
              </LumenButton>
            ))}
          </div>
        </section>
        <section
          className="hbar-app-ui-file-manager-asset-section hbar-app-ui-file-manager-asset-files"
          aria-label={content.labels.files}
        >
          <h3>{content.labels.files}</h3>
          <div
            className="hbar-app-ui-file-manager-asset-grid"
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {visibleAssets.map((asset) => (
              <LumenButton
                variant="outlined"
                className={selectedIds.includes(asset.id) ? 'is-selected' : ''}
                aria-label={content.labels.selectAsset(asset.name)}
                key={asset.id}
                onClick={() => toggleSelection(asset.id)}
              >
                <span className="hbar-app-ui-file-manager-asset-preview">
                  <FileGlyph name={asset.kind} tier="md" />
                </span>
                <span>{asset.name}</span>
                <small>{content.labels.assetSummary(asset.format, asset.size)}</small>
              </LumenButton>
            ))}
          </div>
          {visibleAssets.length === 0 ? <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p> : null}
        </section>
        <footer className="hbar-app-ui-file-manager-selection-footer">
          <span>{content.labels.selected(selectedIds.length)}</span>
          <div>
            <LumenButton variant="outlined" onClick={() => report(onAction, 'share', selectedIds.join(','))}>
              <FileGlyph name="share" tier="xs" />
              {content.labels.share}
            </LumenButton>
            <LumenButton
              tone="danger"
              variant="outlined"
              onClick={() => report(onAction, 'delete', selectedIds.join(','))}
            >
              <FileGlyph name="trash" tier="xs" />
              {content.labels.delete}
            </LumenButton>
            <LumenButton variant="outlined" onClick={() => report(onAction, 'more', selectedIds.join(','))}>
              <FileGlyph name="more" tier="xs" />
              {content.labels.more}
            </LumenButton>
          </div>
        </footer>
      </section>
    </FileManagerRoot>
  )
}

function FileDetail(props: Omit<LumenFileManagerProps, 'content'> & { content: LumenFileManagerDetailContent }) {
  const { content, onAction } = props
  const items = uniqueLumenFileManagerItems(content.items)
  const [activeItemId, setActiveItemId] = React.useState<string | undefined>(content.activeItemId)
  const activeItem = selectLumenFileManagerItem(items, activeItemId)
  return (
    <FileManagerRoot {...props} className="hbar-app-ui-file-manager-detail-surface">
      <section className="hbar-app-ui-file-manager-detail">
        <div className="hbar-app-ui-file-manager-detail-layout">
          <section className="hbar-app-ui-file-manager-detail-left">
            <header className="hbar-app-ui-file-manager-detail-header">
              <div>
                <h2>{content.labels.title}</h2>
                <p>{content.labels.summary}</p>
              </div>
            </header>
            <nav
              className="hbar-app-ui-file-manager-detail-list"
              aria-label={content.labels.title}
              data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
              data-hbar-app-ui-list-strategy={content.listStrategy.kind}
            >
              {items.map((item) => (
                <LumenButton
                  variant="text"
                  aria-current={activeItem?.id === item.id ? 'page' : undefined}
                  aria-label={content.labels.openItem(item.name)}
                  key={item.id}
                  onClick={() => {
                    setActiveItemId(item.id)
                    report(onAction, 'open-item', item.id)
                  }}
                >
                  <FileGlyph name={item.kind} tier="xs" />
                  <span>{item.name}</span>
                  <small>{content.labels.itemSummary(item.format, item.size)}</small>
                </LumenButton>
              ))}
              {items.length === 0 ? <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p> : null}
            </nav>
          </section>
          {activeItem ? (
            <main className="hbar-app-ui-file-manager-detail-preview">
              <div className="hbar-app-ui-file-manager-preview-canvas">
                <FileGlyph name={activeItem.kind} tier="lg" />
              </div>
              <header>
                <h3>{activeItem.name}</h3>
                <p>{content.labels.previewSummary(activeItem.version, activeItem.size)}</p>
              </header>
              <LumenButton tone="primary" onClick={() => report(onAction, 'download', activeItem.id)}>
                <FileGlyph name="download" tier="xs" />
                {content.labels.download}
              </LumenButton>
              <section className="hbar-app-ui-file-manager-detail-metadata" aria-label={content.labels.details}>
                <h4>{content.labels.details}</h4>
                <dl>
                  {uniqueLumenFileManagerItems(activeItem.metadata).map((row) => (
                    <div key={row.id}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="hbar-app-ui-file-manager-detail-owners" aria-label={content.labels.sharedWith}>
                <h4>{content.labels.sharedWith}</h4>
                {activeItem.collaborators.map((owner) => (
                  <div key={`${owner.initials}-${owner.name}`}>
                    <span>{owner.initials}</span>
                    <span>{owner.name}</span>
                    <small>{owner.permission}</small>
                  </div>
                ))}
                <p>{activeItem.accessNotice}</p>
                <div className="hbar-app-ui-file-manager-detail-actions">
                  <LumenButton variant="outlined" onClick={() => report(onAction, 'share', activeItem.id)}>
                    <FileGlyph name="share" tier="xs" />
                    {content.labels.shareItem(activeItem.name)}
                  </LumenButton>
                  <LumenButton variant="outlined" onClick={() => report(onAction, 'copy-link', activeItem.id)}>
                    <FileGlyph name="link" tier="xs" />
                    {content.labels.copyLink}
                  </LumenButton>
                  <LumenButton variant="outlined" onClick={() => report(onAction, 'make-copy', activeItem.id)}>
                    <FileGlyph name="copy" tier="xs" />
                    {content.labels.makeCopy}
                  </LumenButton>
                </div>
              </section>
              <section className="hbar-app-ui-file-manager-detail-activity" aria-label={content.labels.activity}>
                <h4>{content.labels.activity}</h4>
                {uniqueLumenFileManagerItems(activeItem.activity).map((entry) => (
                  <p key={entry.id}>{entry.text}</p>
                ))}
              </section>
            </main>
          ) : null}
        </div>
      </section>
    </FileManagerRoot>
  )
}

function labelForState(labels: LumenFileManagerUploadContent['labels'], state: LumenFileManagerUploadState) {
  switch (state) {
    case 'uploaded':
      return labels.uploaded
    case 'uploading':
      return labels.uploading
    case 'failed':
      return labels.failed
    case 'queued':
      return labels.queued
  }
}

function toneForUploadState(state: LumenFileManagerUploadState) {
  if (state === 'failed') {
    return 'danger' as const
  }
  if (state === 'uploaded') {
    return 'success' as const
  }
  return state === 'uploading' ? ('warning' as const) : ('neutral' as const)
}

function UploadQueue(props: Omit<LumenFileManagerProps, 'content'> & { content: LumenFileManagerUploadContent }) {
  const { content, onAction } = props
  const [recoveredIds, setRecoveredIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const [removedIds, setRemovedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const [pausedIds, setPausedIds] = React.useState<ReadonlySet<string>>(() => new Set())
  const items = uniqueLumenFileManagerItems(content.items).filter((item) => !removedIds.has(item.id))
  return (
    <FileManagerRoot {...props} className="hbar-app-ui-file-manager-upload-surface">
      <section className="hbar-app-ui-file-manager-upload">
        <header className="hbar-app-ui-file-manager-upload-header">
          <div>
            <h2>{content.labels.title}</h2>
            <p>{content.labels.summary}</p>
          </div>
          <LumenIconButton label={content.labels.dismiss} onClick={() => report(onAction, 'dismiss')}>
            <FileGlyph name="close" tier="xs" />
          </LumenIconButton>
        </header>
        <LumenButton
          variant="outlined"
          className="hbar-app-ui-file-manager-drop-zone"
          onClick={() => report(onAction, 'browse')}
        >
          <FileGlyph name="upload" tier="lg" />
          <strong>{content.labels.dropTitle}</strong>
          <small>{content.labels.dropDescription}</small>
        </LumenButton>
        <section className="hbar-app-ui-file-manager-upload-queue" aria-label={content.labels.queue}>
          <h3>{content.labels.queue}</h3>
          <ul
            data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
            data-hbar-app-ui-list-strategy={content.listStrategy.kind}
          >
            {items.map((item) => {
              const state: LumenFileManagerUploadState = recoveredIds.has(item.id) ? 'uploading' : item.state
              const progress = Math.max(
                0,
                Math.min(100, recoveredIds.has(item.id) ? Math.max(item.progress, 1) : item.progress),
              )
              const paused = pausedIds.has(item.id)
              const statusDetail =
                item.statusDetail ??
                (state === 'uploading' ? content.labels.progress(progress, item.remaining) : undefined)
              return (
                <li key={item.id} className={`is-${state}`}>
                  <FileGlyph name={item.kind} />
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      <LumenStatus value={labelForState(content.labels, state)} tone={toneForUploadState(state)} />
                      {statusDetail ? <small>{statusDetail}</small> : null}
                    </span>
                    {state === 'uploading' && !paused ? <Meter value={progress} label={item.name} /> : null}
                  </div>
                  <small>{item.size}</small>
                  {state === 'uploading' ? (
                    <LumenIconButton
                      label={paused ? content.labels.start(item.name) : content.labels.pause(item.name)}
                      onClick={() => {
                        setPausedIds(
                          (current) =>
                            new Set(paused ? [...current].filter((id) => id !== item.id) : [...current, item.id]),
                        )
                        report(onAction, paused ? 'start' : 'pause', item.id)
                      }}
                    >
                      <FileGlyph name={paused ? 'play' : 'pause'} tier="xs" />
                    </LumenIconButton>
                  ) : null}
                  {state === 'failed' ? (
                    <LumenIconButton
                      label={content.labels.retry(item.name)}
                      onClick={() => {
                        setRecoveredIds((current) => new Set([...current, item.id]))
                        report(onAction, 'retry', item.id)
                      }}
                    >
                      <FileGlyph name="retry" tier="xs" />
                    </LumenIconButton>
                  ) : null}
                  <LumenIconButton
                    label={content.labels.remove(item.name)}
                    onClick={() => {
                      setRemovedIds((current) => new Set([...current, item.id]))
                      report(onAction, 'remove', item.id)
                    }}
                  >
                    <FileGlyph name="close" tier="xs" />
                  </LumenIconButton>
                </li>
              )
            })}
          </ul>
          {items.length === 0 ? <p className="hbar-app-ui-file-manager-empty">{content.labels.empty}</p> : null}
        </section>
        <footer className="hbar-app-ui-file-manager-upload-footer">
          <span>{content.labels.transferSummary}</span>
          <div>
            <LumenButton variant="outlined" onClick={() => report(onAction, 'cancel-all')}>
              {content.labels.cancelAll}
            </LumenButton>
            <LumenButton tone="primary" onClick={() => report(onAction, 'clear-completed')}>
              {content.labels.clearCompleted}
            </LumenButton>
          </div>
        </footer>
      </section>
    </FileManagerRoot>
  )
}

function emptyFileManager(props: LumenFileManagerProps) {
  return (
    <FileManagerRoot {...props} className="hbar-app-ui-file-manager-empty-surface">
      {null}
    </FileManagerRoot>
  )
}

export function LumenFileManager(props: LumenFileManagerProps) {
  const providerContent = useLumenFileManagerContent()
  if (props.slots) {
    return (
      <FileManagerRoot {...props} className="hbar-app-ui-file-manager-slot-surface">
        {props.slots.toolbar ? <header>{props.slots.toolbar}</header> : null}
        <div className="hbar-app-ui-file-manager-slot-body">
          {props.slots.navigation ? <aside>{props.slots.navigation}</aside> : null}
          <main>{props.slots.content}</main>
        </div>
        {props.slots.footer ? <footer>{props.slots.footer}</footer> : null}
      </FileManagerRoot>
    )
  }
  const content = props.content ?? providerContent
  if (content?.reference) {
    return (
      <FileManagerRoot {...props}>
        <LumenFileManagerReference content={content.reference} />
      </FileManagerRoot>
    )
  }
  if (!content) {
    return emptyFileManager(props)
  }
  if (props.variant === 1) {
    return content.drive ? <DriveExplorer {...props} content={content.drive} /> : emptyFileManager(props)
  }
  if (props.variant === 2) {
    return content.assets ? <AssetLibrary {...props} content={content.assets} /> : emptyFileManager(props)
  }
  if (props.variant === 3) {
    return content.detail ? <FileDetail {...props} content={content.detail} /> : emptyFileManager(props)
  }
  if (props.variant === 4) {
    return content.upload ? <UploadQueue {...props} content={content.upload} /> : emptyFileManager(props)
  }
  return emptyFileManager(props)
}

function fileManagerVariant(variant: number, props: LumenFileManagerVariantProps) {
  return <LumenFileManager {...props} variant={variant} variantId={`hbar-app-ui-file-manager-${variant}`} />
}

export function LumenFileManager01(props: LumenFileManagerVariantProps) {
  return fileManagerVariant(1, props)
}

export function LumenFileManager02(props: LumenFileManagerVariantProps) {
  return fileManagerVariant(2, props)
}

export function LumenFileManager03(props: LumenFileManagerVariantProps) {
  return fileManagerVariant(3, props)
}

export function LumenFileManager04(props: LumenFileManagerVariantProps) {
  return fileManagerVariant(4, props)
}
