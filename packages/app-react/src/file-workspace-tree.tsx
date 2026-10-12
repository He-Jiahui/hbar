import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, RefreshCw, Search, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import {
  LumenContentText,
  LumenButton,
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenIcon,
  LumenInput,
} from '@lumen/app-ui'
import type { FileWorkspaceEntryState } from '@hbar/app-runtime'
import { fileSearchFocusIndex } from './file-search-focus'
import { fileTreeMessages } from './file-workspace-messages'

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

type HbarFileTreeProps = {
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
}

export function HbarFileTree(props: HbarFileTreeProps) {
  const { labels, ...contentProps } = props
  return (
    <fileTreeMessages.Provider messages={labels}>
      <FileTreeContent {...contentProps} />
    </fileTreeMessages.Provider>
  )
}

type FileTreeContentProps = Omit<HbarFileTreeProps, 'labels'>

function FileTreeContent({
  entry,
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
}: FileTreeContentProps) {
  const { t } = fileTreeMessages.useMessages()
  const searchInput = useRef<HTMLInputElement>(null)
  const searchResults = useRef<HTMLUListElement>(null)
  const focusedResult = useRef<HTMLButtonElement | null>(null)
  const tree = entry?.tree
  const searching = Boolean(tree?.filter.trim())
  const results = tree?.search.paths ?? []
  const rootLoading = !entry || entry.status === 'loading'
  const canNavigate = connected && !rootLoading && tree?.search.status === 'ready'
  const searchOwner = JSON.stringify([
    entry?.instanceId,
    entry?.workspaceId,
    entry?.sourceSessionId,
    entry?.sessionTarget,
  ])
  const rootItems = entry?.items ?? []
  const segments = entry?.path === '.' ? [] : (entry?.path.split('/') ?? [])

  useLayoutEffect(() => {
    const previous = focusedResult.current
    if (!previous || (previous.isConnected && !previous.disabled)) return
    focusedResult.current = null
    const input = searchInput.current
    const active = previous.ownerDocument.activeElement
    // Removed rows do not emit blur. Recover only focus still owned by this list,
    // never from another pane or a hidden navigator.
    if (
      input?.isConnected &&
      input.getClientRects().length > 0 &&
      (active === previous || active === previous.ownerDocument.body)
    )
      input.focus({ preventScroll: true })
  }, [tree?.search, connected, rootLoading, searchOwner])

  const clearSearch = () => {
    onFilter('')
    searchInput.current?.focus({ preventScroll: true })
  }
  const focusResult = (key: string, current: HTMLButtonElement | null) => {
    if (!canNavigate) return false
    const buttons = [
      ...(searchResults.current?.querySelectorAll<HTMLButtonElement>('.hbar-file-search-row:not(:disabled)') ?? []),
    ]
    const index = fileSearchFocusIndex(key, buttons.length, current ? buttons.indexOf(current) : null)
    const target = index === null ? undefined : buttons[index]
    if (!target) return false
    target.focus()
    return true
  }

  const renderRows = (items: readonly Item[], depth: number, busy: boolean) => (
    <LumenCollection as="ul" className="hbar-file-tree-list" aria-label={depth === 0 ? t('all') : undefined}>
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
                ? t('collapse')(item.path)
                : t('expand')(item.path)
              : t('openFolder')(item.path)
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
                <LumenContentText context="control.label">{item.name}</LumenContentText>
              </LumenButton>
              {folder && inline && expanded && (
                <LumenFrame className="hbar-file-tree-children">
                  {node?.status === 'loading' && (
                    <LumenContentText context="feedback.message" role="status">
                      {t('loading')}
                    </LumenContentText>
                  )}
                  {node?.error && (
                    <LumenFrame className="hbar-file-tree-feedback">
                      <LumenContentText context="feedback.message" role="alert">
                        {t('error')(node.error)}
                      </LumenContentText>
                      <LumenButton
                        disabled={!connected || node.status === 'loading'}
                        onClick={() =>
                          node.nextCursor && node.items.length ? onMoreNode(item.path) : onRefreshNode(item.path)
                        }
                      >
                        {t('retry')}
                      </LumenButton>
                    </LumenFrame>
                  )}
                  {node?.status === 'ready' && node.items.length === 0 && (
                    <LumenContentText context="section.description">{t('empty')}</LumenContentText>
                  )}
                  {node &&
                    node.items.length > 0 &&
                    renderRows(node.items, depth + 1, busy || node.status === 'loading')}
                  {node?.nextCursor && node.items.length >= 500 && (
                    <LumenContentText context="feedback.message" role="status">
                      {t('folderLimit')}
                    </LumenContentText>
                  )}
                  {node?.nextCursor && node.items.length < 500 && (
                    <LumenButton
                      disabled={!connected || node.status === 'loading'}
                      onClick={() => onMoreNode(item.path)}
                    >
                      {t('loadMore')}
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
          ref={searchInput}
          aria-label={t('filter')}
          placeholder={t('filter')}
          maxLength={160}
          value={tree?.filter ?? ''}
          onChange={(event) => onFilter(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || !searching) return
            if (event.key === 'Escape') {
              event.preventDefault()
              clearSearch()
            } else if (focusResult(event.key, null)) {
              event.preventDefault()
            } else if (event.key === 'Enter' && canNavigate && results[0]) {
              event.preventDefault()
              onOpenFile(results[0])
            }
          }}
        />
        {searching && (
          <LumenButton
            type="button"
            size="s"
            variant="text"
            indicator="none"
            aria-label={t('clearSearch')}
            title={t('clearSearch')}
            onClick={clearSearch}
          >
            <LumenIcon icon={X} tier="sm" />
          </LumenButton>
        )}
        <LumenButton
          type="button"
          size="s"
          variant="text"
          indicator="none"
          aria-label={searching ? t('refreshSearch') : t('refresh')}
          title={searching ? t('refreshSearch') : t('refresh')}
          disabled={!connected || rootLoading}
          onClick={searching ? () => onFilter(tree?.filter ?? '') : onRefreshRoot}
        >
          <LumenIcon icon={RefreshCw} tier="sm" />
        </LumenButton>
      </LumenFrame>
      <LumenContentText context="record.description" className="hbar-file-tree-scope">
        {searching ? t('searchScope') : t('filterScope')}
      </LumenContentText>
      {!searching && segments.length > 0 && (
        <LumenFrame as="nav" aria-label={t('navigation')} className="hbar-file-tree-breadcrumbs">
          <LumenButton onClick={() => onNavigateFolder('.')}>{t('root')}</LumenButton>
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
        <LumenContentText context="feedback.message" role="alert">
          {t('error')(tree.error)}
        </LumenContentText>
      )}
      {!searching && rootLoading && (
        <LumenContentText context="feedback.message" role="status">
          {t('loading')}
        </LumenContentText>
      )}
      {!searching && entry?.status === 'error' && (
        <LumenFrame className="hbar-file-tree-feedback">
          <LumenContentText context="feedback.message" role="alert">
            {t('error')(entry.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={onRefreshRoot}>
            {t('retry')}
          </LumenButton>
        </LumenFrame>
      )}
      {searching && tree?.search.status === 'loading' && (
        <LumenContentText context="feedback.message" role="status">
          {t('searching')}
        </LumenContentText>
      )}
      {searching && tree?.search.status === 'error' && (
        <LumenFrame className="hbar-file-tree-feedback">
          <LumenContentText context="feedback.message" role="alert">
            {t('searchError')(tree.search.error ?? 'EXECUTION_FAILED')}
          </LumenContentText>
          <LumenButton disabled={!connected} onClick={() => onFilter(tree.filter)}>
            {t('refreshSearch')}
          </LumenButton>
        </LumenFrame>
      )}
      {searching && tree?.search.status === 'ready' && results.length === 0 && (
        <LumenContentText context="section.description">{t('noMatches')}</LumenContentText>
      )}
      {!searching && entry?.status === 'ready' && rootItems.length === 0 && (
        <LumenContentText context="section.description">{t('empty')}</LumenContentText>
      )}
      <LumenFrame className="hbar-file-tree-scroll">
        {searching
          ? tree?.search.status === 'ready' && (
              <LumenCollection
                ref={searchResults}
                key={`${searchOwner}:${tree.filter}`}
                as="ul"
                className="hbar-file-tree-list"
                aria-label={t('searchResults')}
              >
                {results.map((path) => (
                  <LumenCollectionItem as="li" key={path}>
                    <LumenButton
                      type="button"
                      variant="text"
                      indicator="none"
                      className="hbar-file-tree-row hbar-file-search-row"
                      aria-label={path}
                      aria-current={selectedPath === path ? 'page' : undefined}
                      data-selected={selectedPath === path}
                      title={path}
                      disabled={!connected || rootLoading}
                      onFocus={(event) => {
                        focusedResult.current = event.currentTarget
                      }}
                      onBlur={() => {
                        focusedResult.current = null
                      }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          clearSearch()
                        } else if (focusResult(event.key, event.currentTarget)) {
                          event.preventDefault()
                        }
                      }}
                      onClick={() => onOpenFile(path)}
                    >
                      <LumenIcon icon={FileText} tier="sm" />
                      <LumenFrame className="hbar-file-search-path">
                        <LumenContentText context="control.label">{path.split('/').at(-1)}</LumenContentText>
                        <LumenContentText context="choice.description">
                          {path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : t('root')}
                        </LumenContentText>
                      </LumenFrame>
                    </LumenButton>
                  </LumenCollectionItem>
                ))}
              </LumenCollection>
            )
          : renderRows(rootItems, 0, rootLoading || entry?.status === 'error')}
        {searching && tree?.search.status === 'ready' && tree.search.truncated && (
          <LumenContentText context="feedback.message" role="status">
            {t('searchLimit')}
          </LumenContentText>
        )}
        {!searching && entry?.rootLimitReached && (
          <LumenContentText context="feedback.message" role="status">
            {t('rootLimit')}
          </LumenContentText>
        )}
        {!searching && entry?.nextCursor && (
          <LumenButton disabled={!connected || rootLoading} onClick={onMoreRoot}>
            {t('loadMore')}
          </LumenButton>
        )}
      </LumenFrame>
    </LumenFrame>
  )
}
