'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { LumenButton, LumenIconButton, LumenText } from './primitives'
import './file-workspace.css'

export interface LumenWorkspaceFile {
  id: string
  name: string
  directory: boolean
}

export interface LumenWorkspaceFileLabels {
  title: string
  parent: string
  refresh: string
  loading: string
  empty: string
  retry: string
  readOnly: string
}

export interface LumenWorkspaceFilesProps {
  items: readonly LumenWorkspaceFile[]
  path: string
  loading: boolean
  error?: string | undefined
  labels: LumenWorkspaceFileLabels
  onOpen: (id: string) => void
  onParent: () => void
  onRefresh: () => void
  embedded?: boolean | undefined
}

function uniqueFiles(items: readonly LumenWorkspaceFile[]): readonly LumenWorkspaceFile[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

function FileGlyph({ name }: { name: 'back' | 'file' | 'folder' | 'forward' | 'refresh' }) {
  return (
    <svg className="lumen-file-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'back' ? <path d="m10 3-5 5 5 5" /> : null}
      {name === 'file' ? <path d="M4 2.5h5l3 3v8H4zM9 2.5v3h3" /> : null}
      {name === 'folder' ? <path d="M2.5 4h4l1 1h6v7.5h-11z" /> : null}
      {name === 'forward' ? <path d="m6 3 5 5-5 5" /> : null}
      {name === 'refresh' ? <path d="M12.5 6A5 5 0 1 0 13 9m-.5-3V2.5M12.5 6H9" /> : null}
    </svg>
  )
}

/** Controlled file browser. The host owns directory data, paging, loading, and navigation. */
export function LumenWorkspaceFiles({
  items: sourceItems,
  path,
  loading,
  error,
  labels,
  onOpen,
  onParent,
  onRefresh,
  embedded = false,
}: LumenWorkspaceFilesProps) {
  const items = uniqueFiles(sourceItems)
  let listing: React.ReactNode = null
  if (error) {
    listing = (
      <div className="lumen-file-error" role="alert">
        <LumenText as="p" tone="danger">
          {error}
        </LumenText>
        <LumenButton variant="outlined" onClick={onRefresh}>
          {labels.retry}
        </LumenButton>
      </div>
    )
  } else if (items.length > 0) {
    listing = (
      <ol className="lumen-file-list" aria-label={labels.title}>
        {items.map((item) => (
          <li key={item.id}>
            <LumenButton className="lumen-file-row" variant="text" title={item.id} onClick={() => onOpen(item.id)}>
              <FileGlyph name={item.directory ? 'folder' : 'file'} />
              <span>{item.name}</span>
              {item.directory ? <FileGlyph name="forward" /> : null}
            </LumenButton>
          </li>
        ))}
      </ol>
    )
  } else if (!loading) {
    listing = (
      <LumenText as="p" className="lumen-file-empty" tone="muted">
        {labels.empty}
      </LumenText>
    )
  }
  return (
    <section
      className="lumen-workspace-files"
      data-embedded={embedded || undefined}
      aria-label={labels.title}
      aria-busy={loading || undefined}
    >
      <header>
        {!embedded ? (
          <LumenText as="strong" variant="heading">
            {labels.title}
          </LumenText>
        ) : null}
        <LumenIconButton label={labels.parent} disabled={path === '.' || loading} onClick={onParent}>
          <FileGlyph name="back" />
        </LumenIconButton>
        <LumenIconButton label={labels.refresh} disabled={loading} onClick={onRefresh}>
          <FileGlyph name="refresh" />
        </LumenIconButton>
      </header>
      {!embedded ? (
        <LumenText as="p" className="lumen-file-path" tone="muted" variant="code">
          {path}
        </LumenText>
      ) : null}
      {loading ? (
        <LumenText as="p" tone="muted" role="status">
          {labels.loading}
        </LumenText>
      ) : null}
      {listing}
    </section>
  )
}

export interface LumenFileDocumentProps {
  path: string
  name?: string | undefined
  labels: LumenWorkspaceFileLabels
  loading: boolean
  error?: string | undefined
  onRetry: () => void
  back?: { label: string; onInvoke: () => void } | undefined
  contentAvailable?: boolean | undefined
  refreshDisabled?: boolean | undefined
  errorAction?: React.ReactNode
  headerActions?: React.ReactNode
  /** Keep confirmed content mounted during a host-owned revalidation. */
  retainContentWhileLoading?: boolean | undefined
  children: React.ReactNode
}

/** Controlled document frame. The host owns file content, conflict policy, and persistence. */
export function LumenFileDocument({
  path,
  name,
  labels,
  loading,
  error,
  onRetry,
  back,
  contentAvailable = true,
  refreshDisabled = false,
  errorAction,
  headerActions,
  retainContentWhileLoading = false,
  children,
}: LumenFileDocumentProps) {
  let body: React.ReactNode = null
  if (loading && !(retainContentWhileLoading && contentAvailable)) {
    body = (
      <LumenText as="p" tone="muted" role="status">
        {labels.loading}
      </LumenText>
    )
  } else if (contentAvailable) {
    body = <div {...lumenPartProps("file-document.body")} className="lumen-file-document-body">{children}</div>
  }
  return (
    <section {...lumenPartProps("file-document.root")} className="lumen-file-document" aria-label={path} aria-busy={loading || undefined}>
      <header>
        {back ? (
          <LumenIconButton label={back.label} onClick={back.onInvoke}>
            <FileGlyph name="back" />
          </LumenIconButton>
        ) : null}
        <FileGlyph name="file" />
        <div className="lumen-file-document-title" role="group" aria-label={path} tabIndex={0}>
          <LumenText as="strong" variant="label" title={path}>
            {name ?? path}
          </LumenText>
          <LumenText as="span" tone="subtle" variant="supporting">
            {labels.readOnly}
          </LumenText>
        </div>
        <LumenIconButton label={labels.refresh} onClick={onRetry} disabled={loading || refreshDisabled}>
          <FileGlyph name="refresh" />
        </LumenIconButton>
        {headerActions}
      </header>
      {error ? (
        <div className="lumen-file-error" role="alert">
          <LumenText as="p" tone="danger">
            {error}
          </LumenText>
          {contentAvailable ? (
            errorAction
          ) : (
            <LumenButton variant="outlined" onClick={onRetry}>
              {labels.retry}
            </LumenButton>
          )}
        </div>
      ) : null}
      {body}
    </section>
  )
}
