import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw } from 'lucide-react'
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

/** Filter only data that was already loaded. Folders remain visible so hidden descendants stay reachable. */
function visible(item: Item, filter: string) {
  return item.directory || !filter || item.name.toLocaleLowerCase().includes(filter)
}

export function HbarFileTree({
  entry,
  labels,
  connected,
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
  readonly onFilter: (filter: string) => void
  readonly onToggle: (path: string) => void
  readonly onRefreshNode: (path: string) => void
  readonly onMoreNode: (path: string) => void
  readonly onOpenFile: (path: string) => void
  readonly onNavigateFolder: (path: string) => void
  readonly onMoreRoot: () => void
  readonly onRefreshRoot: () => void
}) {
  const tree = entry?.tree
  const filter = tree?.filter.trim().toLocaleLowerCase() ?? ''
  const rootLoading = !entry || entry.status === 'loading'
  const rootItems = (entry?.items ?? []).filter((item) => visible(item, filter))
  const segments = entry?.path === '.' ? [] : (entry?.path.split('/') ?? [])

  const renderRows = (items: readonly Item[], depth: number, busy: boolean) => (
    <LumenCollection as="ul" className="hbar-file-tree-list" aria-label={depth === 0 ? labels.all : undefined}>
      {items
        .filter((item) => visible(item, filter))
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
                aria-current={!folder && entry?.document?.path === item.path ? 'page' : undefined}
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
        <LumenInput
          aria-label={labels.filter}
          placeholder={labels.filter}
          maxLength={4000}
          value={tree?.filter ?? ''}
          onChange={(event) => onFilter(event.currentTarget.value)}
        />
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={labels.refresh}
          title={labels.refresh}
          disabled={!connected || rootLoading}
          onClick={onRefreshRoot}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenButton>
      </LumenFrame>
      <LumenText as="small" className="hbar-file-tree-scope">
        {labels.filterScope}
      </LumenText>
      {segments.length > 0 && (
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
      {tree?.error && (
        <LumenText as="p" role="alert">
          {labels.error(tree.error)}
        </LumenText>
      )}
      {rootLoading && (
        <LumenText as="p" role="status">
          {labels.loading}
        </LumenText>
      )}
      {entry?.status === 'error' && (
        <LumenFrame className="hbar-file-tree-feedback">
          <LumenText as="p" role="alert">
            {labels.error(entry.error ?? 'EXECUTION_FAILED')}
          </LumenText>
          <LumenButton disabled={!connected} onClick={onRefreshRoot}>
            {labels.retry}
          </LumenButton>
        </LumenFrame>
      )}
      {entry?.status === 'ready' && rootItems.length === 0 && <LumenText as="p">{labels.empty}</LumenText>}
      <LumenFrame className="hbar-file-tree-scroll">
        {renderRows(rootItems, 0, rootLoading || entry?.status === 'error')}
        {entry?.rootLimitReached && (
          <LumenText as="p" role="status">
            {labels.rootLimit}
          </LumenText>
        )}
        {entry?.nextCursor && (
          <LumenButton disabled={!connected || rootLoading} onClick={onMoreRoot}>
            {labels.loadMore}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
