'use client'

import * as React from 'react'
import { BarChart3, Blocks, FileText, FolderKanban, Plus, Settings, Shield, Users, Workflow } from 'lucide-react'
import './app-sidebar-dual.css'

const icons = {
  automation: Workflow,
  projects: FolderKanban,
  people: Users,
  insights: BarChart3,
  documents: FileText,
  integrations: Blocks,
  security: Shield,
}
export type LumenAppSidebarDualIcon = keyof typeof icons
export interface LumenAppSidebarDualItem {
  readonly id: string
  readonly label: string
}
export interface LumenAppSidebarDualGroup {
  readonly id: string
  readonly label: string
  readonly items: readonly LumenAppSidebarDualItem[]
}
export interface LumenAppSidebarDualSection {
  readonly id: string
  readonly label: string
  readonly icon: LumenAppSidebarDualIcon
  readonly newAction: string
  readonly search: string
  readonly searchPlaceholder: string
  readonly navigation: string
  readonly groups: readonly LumenAppSidebarDualGroup[]
  readonly activePageId: string | null
}
export interface LumenAppSidebarDualContent {
  readonly labels: {
    readonly mark: string
    readonly sections: string
    readonly settings: string
    readonly emptySections: string
    readonly emptyPages: string
  }
  readonly sections: readonly LumenAppSidebarDualSection[]
  readonly selectedSectionId: string
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

export function AppSidebarDual({
  content,
  onAction,
}: {
  readonly content: LumenAppSidebarDualContent
  readonly onAction?: ((action: string, id?: string) => void) | undefined
}) {
  const [query, setQuery] = React.useState('')
  const sections = unique(content.sections)
  const selected = sections.find((section) => section.id === content.selectedSectionId) ?? sections[0]
  const seenPages = new Set<string>()
  return (
    <div className="lumen-dual-sidebar-root hbar-app-ui-full-canvas-owner">
      <aside className="lumen-dual-sidebar-rail">
        <span className="lumen-dual-sidebar-mark">{content.labels.mark}</span>
        <nav
          aria-label={content.labels.sections}
          className="lumen-dual-sidebar-sections"
          data-hbar-app-ui-list-strategy="pane-scroll"
        >
          {sections.map((section) => {
            const Icon = icons[section.icon]
            return (
              <button
                type="button"
                key={section.id}
                aria-label={section.label}
                className={section.id === selected?.id ? 'is-active' : undefined}
                onClick={() => onAction?.('section', section.id)}
              >
                <Icon aria-hidden="true" />
              </button>
            )
          })}
        </nav>
        <button
          type="button"
          aria-label={content.labels.settings}
          className="lumen-dual-sidebar-settings"
          onClick={() => onAction?.('settings')}
        >
          <Settings aria-hidden="true" />
        </button>
      </aside>
      <div className="lumen-dual-sidebar-panel">
        {selected ? (
          <React.Fragment>
            <div className="lumen-dual-sidebar-heading">
              <h2>{selected.label}</h2>
              <button type="button" aria-label={selected.newAction} onClick={() => onAction?.('new', selected.id)}>
                <Plus aria-hidden="true" />
              </button>
            </div>
            <div className="lumen-dual-sidebar-search">
              <input
                type="search"
                aria-label={selected.search}
                placeholder={selected.searchPlaceholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  onAction?.('search', event.target.value)
                }}
              />
            </div>
            <nav
              aria-label={selected.navigation}
              className="lumen-dual-sidebar-pages"
              data-hbar-app-ui-list-strategy="pane-scroll"
            >
              {unique(selected.groups).map((group) => (
                <div className="lumen-dual-sidebar-group" key={group.id}>
                  <p>{group.label}</p>
                  <ul>
                    {group.items
                      .filter((item) => {
                        if (seenPages.has(item.id)) {
                          return false
                        }
                        seenPages.add(item.id)
                        return true
                      })
                      .map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className={item.id === selected.activePageId ? 'is-active' : undefined}
                            onClick={() => onAction?.('page', item.id)}
                          >
                            {item.label}
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              {!selected.groups.length && <p className="lumen-dual-sidebar-empty">{content.labels.emptyPages}</p>}
            </nav>
          </React.Fragment>
        ) : (
          <p className="lumen-dual-sidebar-empty">{content.labels.emptySections}</p>
        )}
        <div className="lumen-dual-sidebar-profile">
          <span className="lumen-dual-sidebar-avatar">{content.profile.initials}</span>
          <span>
            <p>{content.profile.name}</p>
            <p>{content.profile.role}</p>
          </span>
        </div>
      </div>
    </div>
  )
}
