'use client'

import * as React from 'react'
import {
  Archive,
  Blocks,
  Check,
  ChevronsUpDown,
  FileText,
  Folder,
  Grid2X2,
  Inbox,
  Plus,
  Settings,
  Users,
  Workflow,
} from 'lucide-react'
import './app-sidebar-workspace.css'

const icons = {
  archive: Archive,
  blocks: Blocks,
  file: FileText,
  folder: Folder,
  grid: Grid2X2,
  inbox: Inbox,
  settings: Settings,
  users: Users,
  workflow: Workflow,
}
export type LumenAppSidebarWorkspaceIcon = keyof typeof icons
export interface LumenAppSidebarWorkspaceOption {
  readonly id: string
  readonly initials: string
  readonly name: string
  readonly tier: string
  readonly searchName: string
}
export interface LumenAppSidebarWorkspaceItem {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarWorkspaceIcon
  readonly badge?: string | undefined
  readonly href: string
}
export interface LumenAppSidebarWorkspaceGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenAppSidebarWorkspaceItem[]
}
export interface LumenAppSidebarWorkspaceContent {
  readonly labels: {
    readonly navigation: string
    readonly search: string
    readonly searchPlaceholder: (workspace: LumenAppSidebarWorkspaceOption) => string
    readonly switchWorkspace: string
    readonly createWorkspace: string
    readonly noWorkspaces: string
    readonly empty: string
  }
  readonly workspaces: readonly LumenAppSidebarWorkspaceOption[]
  readonly selectedWorkspaceId: string
  readonly groups: readonly LumenAppSidebarWorkspaceGroup[]
  readonly activeItemId: string | null
  readonly profile: {
    readonly initials: string
    readonly name: string
    readonly role: string
  }
}

function unique<T extends { readonly id: string }>(items: readonly T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })
}

export function AppSidebarWorkspace({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarWorkspaceContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const sidebarRef = React.useRef<HTMLElement>(null)
  const workspaces = unique(content.workspaces)
  const selected = workspaces.find((item) => item.id === content.selectedWorkspaceId) ?? workspaces[0]
  React.useEffect(() => {
    if (!menuOpen) {
      return undefined
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOutside)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOutside)
    }
  }, [menuOpen])
  const seenItems = new Set<string>()
  return (
    <div className="lumen-workspace-sidebar-root hbar-app-ui-full-canvas-owner">
      <aside ref={sidebarRef} className="lumen-workspace-sidebar">
        <div className="lumen-workspace-header">
          <button
            type="button"
            className="lumen-workspace-switcher"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={!selected}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="lumen-workspace-mark">{selected?.initials ?? content.labels.noWorkspaces}</span>
            {selected && (
              <span className="lumen-workspace-identity">
                <span className="lumen-workspace-name">{selected.name}</span>
                <span className="lumen-workspace-tier">{selected.tier}</span>
              </span>
            )}
            <span className="lumen-workspace-switcher-chevrons" aria-hidden="true">
              <ChevronsUpDown />
            </span>
          </button>
          {menuOpen && selected && (
            <div role="menu" aria-label={content.labels.switchWorkspace} className="lumen-workspace-menu">
              {workspaces.map((workspace) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={workspace.id === selected.id}
                  className={workspace.id === selected.id ? 'is-selected' : undefined}
                  key={workspace.id}
                  onClick={() => {
                    onAction?.('workspace', workspace.id)
                    setMenuOpen(false)
                  }}
                >
                  <span className="lumen-workspace-menu-mark">{workspace.initials}</span>
                  <span>{workspace.name}</span>
                  {workspace.id === selected.id && <Check aria-hidden="true" />}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAction?.('create-workspace')
                  setMenuOpen(false)
                }}
              >
                <Plus aria-hidden="true" />
                {content.labels.createWorkspace}
              </button>
            </div>
          )}
        </div>
        <div className="lumen-workspace-search">
          <input
            type="search"
            aria-label={content.labels.search}
            placeholder={selected ? content.labels.searchPlaceholder(selected) : content.labels.noWorkspaces}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              onAction?.('search', event.target.value)
            }}
          />
        </div>
        <nav
          aria-label={content.labels.navigation}
          className="lumen-workspace-navigation"
          data-hbar-app-ui-list-strategy="pane-scroll"
        >
          {unique(content.groups).length ? (
            unique(content.groups).map((group) => (
              <div className="lumen-workspace-group" key={group.id}>
                <p>{group.label}</p>
                <ul>
                  {group.items
                    .filter((item) => {
                      if (seenItems.has(item.id)) {
                        return false
                      }
                      seenItems.add(item.id)
                      return true
                    })
                    .map((item) => {
                      const Icon = icons[item.icon]
                      return (
                        <li key={item.id}>
                          <a
                            href={item.href}
                            className={item.id === content.activeItemId ? 'is-active' : undefined}
                            onClick={() => onAction?.('open', item.id)}
                          >
                            <Icon aria-hidden="true" />
                            <span>{item.label}</span>
                            {item.badge && <small>{item.badge}</small>}
                          </a>
                        </li>
                      )
                    })}
                </ul>
              </div>
            ))
          ) : (
            <p className="lumen-workspace-empty">{content.labels.empty}</p>
          )}
        </nav>
        <div className="lumen-workspace-profile">
          <span className="lumen-workspace-avatar">{content.profile.initials}</span>
          <span>
            <p>{content.profile.name}</p>
            <p>{content.profile.role}</p>
          </span>
        </div>
      </aside>
    </div>
  )
}
