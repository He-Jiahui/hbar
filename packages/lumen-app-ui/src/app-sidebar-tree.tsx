'use client'

import * as React from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import './app-sidebar-tree.css'

export interface LumenAppSidebarTreeDocument {
  readonly id: string
  readonly label: string
}
export interface LumenAppSidebarTreeFolder {
  readonly id: string
  readonly label: string
  readonly documents: readonly LumenAppSidebarTreeDocument[]
}
export interface LumenAppSidebarTreeContent {
  readonly labels: {
    readonly title: string
    readonly newDocument: string
    readonly search: string
    readonly searchPlaceholder: string
    readonly navigation: string
    readonly actionsFor: string
    readonly actionsSuffix: string
    readonly rename: string
    readonly duplicate: string
    readonly delete: string
    readonly empty: string
  }
  readonly folders: readonly LumenAppSidebarTreeFolder[]
  readonly selectedDocumentId: string | null
  readonly profile: {
    readonly initials: string
    readonly name: string
    readonly role: string
  }
}

function unique<T extends { readonly id: string }>(values: readonly T[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value.id)) return false
    seen.add(value.id)
    return true
  })
}

export function AppSidebarTree({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarTreeContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set())
  const [openMenu, setOpenMenu] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const folders = unique(content.folders)
  const seenDocuments = new Set<string>()
  const actionLabel = (label: string) => `${content.labels.actionsFor} ${label}`
  const menu = (id: string, label: string) => (
    <div className="lumen-tree-menu" role="menu" aria-label={`${label} ${content.labels.actionsSuffix}`}>
      {(
        [
          ['rename', content.labels.rename, Pencil],
          ['duplicate', content.labels.duplicate, Copy],
          ['delete', content.labels.delete, Trash2],
        ] as const
      ).map(([action, text, Icon]) => (
        <button
          key={action}
          type="button"
          role="menuitem"
          className={action === 'delete' ? 'is-danger' : undefined}
          onClick={() => {
            setOpenMenu(null)
            onAction?.(action, id)
          }}
        >
          <Icon aria-hidden="true" />
          {text}
        </button>
      ))}
    </div>
  )
  const actions = (id: string, label: string) => (
    <button
      type="button"
      className="lumen-tree-actions"
      aria-label={actionLabel(label)}
      aria-expanded={openMenu === id}
      onClick={() => setOpenMenu((current) => (current === id ? null : id))}
    >
      <MoreHorizontal aria-hidden="true" />
    </button>
  )
  return (
    <div className="lumen-tree-root hbar-app-ui-full-canvas-owner">
      <aside className="lumen-tree-pane">
        <header className="lumen-tree-header">
          <h2>{content.labels.title}</h2>
          <button type="button" aria-label={content.labels.newDocument} onClick={() => onAction?.('new')}>
            <Plus aria-hidden="true" />
          </button>
        </header>
        <label className="lumen-tree-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            aria-label={content.labels.search}
            placeholder={content.labels.searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              onAction?.('search', event.target.value)
            }}
          />
        </label>
        <nav
          aria-label={content.labels.navigation}
          className="lumen-tree-navigation"
          data-hbar-app-ui-list-strategy="pane-scroll"
        >
          <ul>
            {folders.map((folder) => {
              const expanded = !closed.has(folder.id)
              return (
                <li key={folder.id}>
                  <div className="lumen-tree-row">
                    <button
                      type="button"
                      className="lumen-tree-label is-folder"
                      aria-expanded={expanded}
                      onClick={() => {
                        setClosed((previous) => {
                          const next = new Set(previous)
                          if (expanded) next.add(folder.id)
                          else next.delete(folder.id)
                          return next
                        })
                        setOpenMenu(null)
                        onAction?.('folder', folder.id)
                      }}
                    >
                      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                      <FolderOpen aria-hidden="true" />
                      <span>{folder.label}</span>
                    </button>
                    {actions(folder.id, folder.label)}
                    {openMenu === folder.id && menu(folder.id, folder.label)}
                  </div>
                  {expanded && (
                    <ul className="lumen-tree-documents">
                      {folder.documents
                        .filter((document) => {
                          if (seenDocuments.has(document.id)) return false
                          seenDocuments.add(document.id)
                          return true
                        })
                        .map((document) => (
                          <li key={document.id}>
                            <div
                              className={
                                document.id === content.selectedDocumentId
                                  ? 'lumen-tree-row is-selected'
                                  : 'lumen-tree-row'
                              }
                            >
                              <button
                                type="button"
                                className="lumen-tree-label is-document"
                                onClick={() => {
                                  setOpenMenu(null)
                                  onAction?.('document', document.id)
                                }}
                              >
                                <FileText aria-hidden="true" />
                                <span>{document.label}</span>
                              </button>
                              {actions(document.id, document.label)}
                              {openMenu === document.id && menu(document.id, document.label)}
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          {!folders.length && <p className="lumen-tree-empty">{content.labels.empty}</p>}
        </nav>
        <div className="lumen-tree-profile">
          <span className="lumen-tree-avatar">{content.profile.initials}</span>
          <span>
            <p>{content.profile.name}</p>
            <p>{content.profile.role}</p>
          </span>
        </div>
      </aside>
    </div>
  )
}
