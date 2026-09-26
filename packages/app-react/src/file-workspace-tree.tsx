import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw, Search, X } from 'lucide-react'
import { useState } from 'react'
import {
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
  LumenText,
} from '@lumen/app-ui'
import type { FileWorkspaceEntryState } from '@hbar/app-runtime'

type Item = FileWorkspaceEntryState['items'][number]
type Node = FileWorkspaceEntryState['tree']['nodes'][string]

export interface HbarFileTreeLabels {
  readonly all: string
  readonly filter: string
  readonly filterScope: string
  readonly searchScope: string
  readonly searching: string
  readonly noMatches: string
  readonly searchLimit: string
  readonly searchError: (code: string) => string
  readonly searchResults: string
  readonly clearSearch: string
  readonly refreshSearch: string
  readonly navigation: string
  readonly root: string
  readonly expand: (path: string) => string
  readonly collapse: (path: string) => string
  readonly openFolder: (path: string) => string
  readonly loading: string
  readonly empty: string
  readonly loadMore: string
  readonly rootLimit: string
  readonly folderLimit: string
  readonly retry: string
  readonly refresh: string
  readonly error: (code: string) => string
}

const MAX_INLINE_DEPTH = 6

export function HbarFileTree({
  entry,
  labels,
  connected,
  selectedPath,
  onFilter,
  onToggle,
  onRefreshNode,
  onMoreNode,
  onOpenFile,
  onNavigateFolder,
  onMoreRoot,
  onRefreshRoot,
}: {
  readonly entry: FileWorkspaceEntryState | undefined
  readonly labels: HbarFileTreeLabels
  readonly connected: boolean
  readonly selectedPath?: string | null
  readonly onFilter: (filter: string) => void
  readonly onToggle: (path: string) => void
  readonly onRefreshNode: (path: string) => void
  readonly onMoreNode: (path: string) => void
  readonly onOpenFile: (path: string) => void
  readonly onNavigateFolder: (path: string) => void
  readonly onMoreRoot: () => void
  readonly onRefreshRoot: () => void
}) {
  const [activePath, setActivePath] = useState<string | null>(null)
  const tree = entry?.tree
  const searching = Boolean(tree?.filter.trim())
  const results = tree?.search.paths ?? []
  const activeIndex = Math.max(0, results.indexOf(activePath ?? ''))
  const rootLoading = !entry || entry.status === 'loading'
  const rootItems = entry?.items ?? []
  const segments = entry?.path === '.' ? [] : (entry?.path.split('/') ?? [])

  const renderRows = (items: readonly Item[], depth: number, busy: boolean) => (
    <LumenCollection as="ul" className="hbar-file-tree-list" aria-label={depth === 0 ? labels.all : undefined}>
      {[...items]
        // Host pages use path order for a correct cursor; presentation keeps folders first.
        .sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name))
        .map((item) => {
          const node: Node | undefined = tree?.nodes[item.path]
          const expanded = Boolean(node?.expanded)
          const inline = depth < MAX_INLINE_DEPTH
          const folder = item.directory
          const caption = folder
            ? inline
              ? expanded
                ? labels.collapse(item.path)
                : labels.expand(item.path)
              : labels.openFolder(item.path)
            : item.name
          return (
            <LumenCollectionItem as="li" key={item.path}>
              <LumenButton
                type="button"
                variant="text"
                indicator="none"
                className="hbar-file-tree-row"
                title={item.path}
                aria-label={caption}
                aria-expanded={folder && inline ? expanded : undefined}
                aria-current={!folder && selectedPath === item.path ? 'page' : undefined}
                disabled={!connected || busy}
                onClick={() =>
                  folder ? (inline ? onToggle(item.path) : onNavigateFolder(item.path)) : onOpenFile(item.path)
                }
              >
                {folder && inline && <LumenIcon icon={expanded ? ChevronDown : ChevronRight} tier="sm" />}
                <LumenIcon icon={folder ? (expanded ? FolderOpen : Folder) : FileText} tier="sm" />
                <LumenText as="span">{item.name}</LumenText>
              </LumenButton>
              {folder && inline && expanded && (
                <LumenFrame className="hbar-file-tree-children">
                  {node?.status === 'loading' && (
                    <LumenText as="p" role="status">
                      {labels.loading}
                    </LumenText>
                  )}
                  {node?.error && (
                    <LumenFrame className="hbar-file-tree-feedback">
                      <LumenText as="p" role="alert">
                        {labels.error(node.error)}
                      </LumenText>
                      <LumenButton
                        disabled={!connected || node.status === 'loading'}
                        onClick={() =>
                          node.nextCursor && node.items.length ? onMoreNode(item.path) : onRefreshNode(item.path)
                        }
                      >
                        {labels.retry}
                      </LumenButton>
                    </LumenFrame>
                  )}
                  {node?.status === 'ready' && node.items.length === 0 && <LumenText as="p">{labels.empty}</LumenText>}
                  {node &&
                    node.items.length > 0 &&
                    renderRows(node.items, depth + 1, busy || node.status === 'loading')}
                  {node?.nextCursor && node.items.length >= 500 && (
                    <LumenText as="p" role="status">
                      {labels.folderLimit}
                    </LumenText>
                  )}
                  {node?.nextCursor && node.items.length < 500 && (
                    <LumenButton
                      disabled={!connected || node.status === 'loading'}
                      onClick={() => onMoreNode(item.path)}
                    >
                      {labels.loadMore}
                    </LumenButton>
                  )}
                </LumenFrame>
              )}
            </LumenCollectionItem>
          )
        })}
    </LumenCollection>
  )

  return (
    <LumenFrame className="hbar-file-tree">
      <LumenFrame className="hbar-file-tree-controls">
        <LumenIcon icon={Search} tier="sm" />
        <LumenInput
          aria-label={labels.filter}
          placeholder={labels.filter}
          maxLength={160}
          value={tree?.filter ?? ''}
          onChange={(event) => {
            setActivePath(null)
            onFilter(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !searching) return
            if (event.key === 'Escape') {
              event.preventDefault()
              setActivePath(null)
              onFilter('')
            } else if (tree?.search.status === 'ready' && results.length) {
              const next =
                event.key === 'ArrowDown'
                  ? Math.min(results.length - 1, activeIndex + 1)
                  : event.key === 'ArrowUp'
                    ? Math.max(0, activeIndex - 1)
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? results.length - 1
                        : null
              if (next !== null) {
                event.preventDefault()
                setActivePath(results[next]!)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                onOpenFile(results[activeIndex]!)
              }
            }
          }}
        />
        {searching && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={labels.clearSearch}
            title={labels.clearSearch}
            onClick={() => onFilter('')}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        )}
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={searching ? labels.refreshSearch : labels.refresh}
          title={searching ? labels.refreshSearch : labels.refresh}
          disabled={!connected || rootLoading}
          onClick={searching ? () => onFilter(tree?.filter ?? '') : onRefreshRoot}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenButton>
      </LumenFrame>
      <LumenText as="small" className="hbar-file-tree-scope">
        {searching ? labels.searchScope : labels.filterScope}
      </LumenText>
      {!searching && segments.length > 0 && (
        <LumenFrame as="nav" aria-label={labels.navigation} className="hbar-file-tree-breadcrumbs">
          <LumenButton onClick={() => onNavigateFolder('.')}>{labels.root}</LumenButton>
          {segments.map((segment, index) => (
            <LumenButton
              key={index}
              disabled={index === segments.length - 1}
              onClick={() => onNavigateFolder(segments.slice(0, index + 1).join('/'))}
            >
              {segment}
            </LumenButton>
          ))}
        </LumenFrame>
      )}
      {!searching && tree?.error && (
        <LumenText as="p" role="alert">
          {labels.error(tree.error)}
        </LumenText>
      )}
      {!searching && rootLoading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {!searching && entry?.status === 'error' && (
        <LumenFrame className="hbar-file-tree-feedback">
          <LumenText as="p" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton disabled={!connected} onClick={onRefreshRoot}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {searching && tree?.search.status === 'loading' && (
        <LumenText as="p" role="status">
          {labels.searching}
        </LumenText>
      )}
      {searching && tree?.search.status === 'error' && (
        <LumenFrame className="hbar-file-tree-feedback">
          <LumenText as="p" role="alert">
            {labels.searchError(tree.search.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton disabled={!connected} onClick={() => onFilter(tree.filter)}>
            {labels.refreshSearch}
          </LumenButton>
        </LumenFrame>
      )}
      {searching && tree?.search.status === 'ready' && results.length === 0 && (
        <LumenText as="p">{labels.noMatches}</LumenText>
      )}
      {!searching && entry?.status === 'ready' && rootItems.length === 0 && (
        <LumenText as="p">{labels.empty}</LumenText>
      )}
      <LumenFrame className="hbar-file-tree-scroll">
        {searching
          ? tree?.search.status === 'ready' && (
              <LumenCollection as="ul" className="hbar-file-tree-list" aria-label={labels.searchResults}>
                {results.map((path, index) => (
                  <LumenCollectionItem as="li" key={path}>
                    <LumenButton
                      type="button"
                      variant="text"
                      indicator="none"
                      className="hbar-file-tree-row hbar-file-search-row"
                      aria-label={path}
                      aria-current={index === activeIndex ? 'true' : undefined}
                      data-selected={selectedPath === path}
                      title={path}
                      disabled={!connected}
                      onMouseEnter={() => setActivePath(path)}
                      onClick={() => onOpenFile(path)}
                    >
                      <LumenIcon icon={FileText} tier="sm" />
                      <LumenFrame className="hbar-file-search-path">
                        <LumenText as="span">{path.split('/').at(-1)}</LumenText>
                        <LumenText as="small">
                          {path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : labels.root}
                        </LumenText>
                      </LumenFrame>
                    </LumenButton>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )
          : renderRows(rootItems, 0, rootLoading || entry?.status === 'error')}
        {searching && tree?.search.status === 'ready' && tree.search.truncated && (
          <LumenText as="p" role="status">
            {labels.searchLimit}
          </LumenText>
        )}
        {!searching && entry?.rootLimitReached && (
          <LumenText as="p" role="status">
            {labels.rootLimit}
          </LumenText>
        )}
        {!searching && entry?.nextCursor && (
          <LumenButton disabled={!connected || rootLoading} onClick={onMoreRoot}>
            {labels.loadMore}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
