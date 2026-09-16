import { ChevronLeft, ChevronRight, FileCode2, Folder, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiVirtualList } from '../../VirtualList'
import './WorkspaceFiles.css'

export interface HbarAppUiWorkspaceFile {
  readonly id: string
  readonly name: string
  readonly directory: boolean
}
export interface HbarAppUiWorkspaceFileLabels {
  readonly title: string
  readonly parent: string
  readonly refresh: string
  readonly loading: string
  readonly empty: string
  readonly retry: string
  readonly readOnly: string
}

export function HbarAppUiWorkspaceFiles({
  items,
  path,
  loading,
  error,
  labels,
  onOpen,
  onParent,
  onRefresh,
}: {
  readonly items: readonly HbarAppUiWorkspaceFile[]
  readonly path: string
  readonly loading: boolean
  readonly error?: string | undefined
  readonly labels: HbarAppUiWorkspaceFileLabels
  readonly onOpen: (id: string) => void
  readonly onParent: () => void
  readonly onRefresh: () => void
}) {
  return (
    <section className="hbar-app-ui-workspace-files file-nav" aria-label={labels.title} aria-busy={loading}>
      <header>
        <strong>{labels.title}</strong>
        <button
          type="button"
          aria-label={labels.parent}
          title={labels.parent}
          disabled={path === '.' || loading}
          onClick={onParent}
        >
          <HbarAppUiIcon icon={ChevronLeft} />
        </button>
        <button type="button" aria-label={labels.refresh} title={labels.refresh} disabled={loading} onClick={onRefresh}>
          <HbarAppUiIcon icon={RefreshCw} />
        </button>
      </header>
      <p className="hbar-app-ui-file-path">{path}</p>
      {loading && <p role="status">{labels.loading}</p>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRefresh}>
            {labels.retry}
          </button>
        </div>
      ) : (
        <HbarAppUiVirtualList
          items={items}
          label={labels.title}
          empty={loading ? null : <p>{labels.empty}</p>}
          className="file-list"
          renderRow={(item) => (
            <button type="button" title={item.id} onClick={() => onOpen(item.id)}>
              <HbarAppUiIcon icon={item.directory ? Folder : FileCode2} />
              <span>{item.name}</span>
              {item.directory && <HbarAppUiIcon icon={ChevronRight} tier="sm" />}
            </button>
          )}
        />
      )}
    </section>
  )
}

export function HbarAppUiFileDocument({
  path,
  labels,
  loading,
  error,
  onRetry,
  children,
}: {
  readonly path: string
  readonly labels: HbarAppUiWorkspaceFileLabels
  readonly loading: boolean
  readonly error?: string | undefined
  readonly onRetry: () => void
  readonly children: ReactNode
}) {
  return (
    <section className="hbar-app-ui-file-document file-viewer" aria-label={path} aria-busy={loading}>
      <header>
        <HbarAppUiIcon icon={FileCode2} />
        <strong>{path}</strong>
        <span>{labels.readOnly}</span>
        <button type="button" onClick={onRetry} disabled={loading} aria-label={labels.refresh}>
          <HbarAppUiIcon icon={RefreshCw} />
        </button>
      </header>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            {labels.retry}
          </button>
        </div>
      ) : loading ? (
        <p role="status">{labels.loading}</p>
      ) : (
        <div className="hbar-app-ui-file-document-body">{children}</div>
      )}
    </section>
  )
}
