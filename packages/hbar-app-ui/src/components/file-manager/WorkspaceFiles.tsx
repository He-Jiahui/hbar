import { LumenButton } from '@lumen/app-ui'
import { ChevronLeft, ChevronRight, FileCode2, Folder, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiButton, HbarAppUiIconButton } from '../../primitives'
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
  embedded = false,
}: {
  readonly items: readonly HbarAppUiWorkspaceFile[]
  readonly path: string
  readonly loading: boolean
  readonly error?: string | undefined
  readonly labels: HbarAppUiWorkspaceFileLabels
  readonly onOpen: (id: string) => void
  readonly onParent: () => void
  readonly onRefresh: () => void
  readonly embedded?: boolean | undefined
}) {
  return (
    <section
      className={`hbar-app-ui-workspace-files file-nav${embedded ? ' is-embedded' : ''}`}
      aria-label={labels.title}
      aria-busy={loading}
    >
      <header>
        {!embedded && <strong>{labels.title}</strong>}
        <HbarAppUiIconButton label={labels.parent} disabled={path === '.' || loading} onClick={onParent}>
          <HbarAppUiIcon icon={ChevronLeft} tier="sm" />
        </HbarAppUiIconButton>
        <HbarAppUiIconButton label={labels.refresh} disabled={loading} onClick={onRefresh}>
          <HbarAppUiIcon icon={RefreshCw} tier="sm" />
        </HbarAppUiIconButton>
      </header>
      {!embedded && <p className="hbar-app-ui-file-path">{path}</p>}
      {loading && <p role="status">{labels.loading}</p>}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <HbarAppUiButton type="button" onClick={onRefresh}>
            {labels.retry}
          </HbarAppUiButton>
        </div>
      ) : (
        <HbarAppUiVirtualList
          items={items}
          label={labels.title}
          empty={loading ? null : <p>{labels.empty}</p>}
          className="file-list"
          renderRow={(item) => (
            <LumenButton type="button" title={item.id} onClick={() => onOpen(item.id)}>
              <HbarAppUiIcon icon={item.directory ? Folder : FileCode2} tier="sm" />
              <span>{item.name}</span>
              {item.directory && <HbarAppUiIcon icon={ChevronRight} tier="sm" />}
            </LumenButton>
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
  name,
  back,
  contentAvailable = true,
  refreshDisabled = false,
  errorAction,
  children,
}: {
  readonly path: string
  readonly name?: string | undefined
  readonly labels: HbarAppUiWorkspaceFileLabels
  readonly loading: boolean
  readonly error?: string | undefined
  readonly onRetry: () => void
  readonly back?: { readonly label: string; readonly onInvoke: () => void } | undefined
  readonly contentAvailable?: boolean | undefined
  readonly refreshDisabled?: boolean | undefined
  readonly errorAction?: ReactNode | undefined
  readonly children: ReactNode
}) {
  return (
    <section className="hbar-app-ui-file-document file-viewer" aria-label={path} aria-busy={loading}>
      <header>
        {back && (
          <HbarAppUiIconButton label={back.label} onClick={back.onInvoke}>
            <HbarAppUiIcon icon={ChevronLeft} tier="sm" />
          </HbarAppUiIconButton>
        )}
        <HbarAppUiIcon icon={FileCode2} tier="sm" />
        <div className="hbar-app-ui-file-document-title">
          <strong title={path}>{name ?? path}</strong>
          <span>{labels.readOnly}</span>
        </div>
        <HbarAppUiIconButton label={labels.refresh} onClick={onRetry} disabled={loading || refreshDisabled}>
          <HbarAppUiIcon icon={RefreshCw} tier="sm" />
        </HbarAppUiIconButton>
      </header>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {contentAvailable ? (
            errorAction
          ) : (
            <HbarAppUiButton type="button" onClick={onRetry}>
              {labels.retry}
            </HbarAppUiButton>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">{labels.loading}</p>
      ) : contentAvailable ? (
        <div className="hbar-app-ui-file-document-body">{children}</div>
      ) : null}
    </section>
  )
}
