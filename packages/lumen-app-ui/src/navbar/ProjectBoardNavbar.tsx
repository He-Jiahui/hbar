import { ChevronRight, CirclePlus, Folder, MoreHorizontal, Search, Star } from './glyphs'
import { useState } from 'react'
import { type LumenNavbarProjectBoardContent } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'

export function ProjectBoardNavbar({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarProjectBoardContent
}) {
  const [localTab, setTab] = useState(content.initialTab)
  const tab = content.selection?.tabId ?? localTab
  const columns = content.tabColumns?.find((group) => group.tabId === tab)?.columns ?? content.columns
  const tabs = [
    { id: 'discussion' as const, label: content.labels.discussion, count: content.discussionCount },
    { id: 'tasks' as const, label: content.labels.tasks },
    { id: 'timeline' as const, label: content.labels.timeline },
    { id: 'files' as const, label: content.labels.files },
    { id: 'overview' as const, label: content.labels.overview },
  ]
  const chooseTab = (next: typeof tab) => {
    if (content.selection) {
      content.selection.onTabChange(next)
      return
    }
    setTab(next)
    reportNavbarAction(onAction, spec, 'tabs', next)
  }
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-project-board">
      <header className="hbar-app-ui-navbar-board-header">
        <div className="hbar-app-ui-navbar-board-title-row">
          <h1>{content.title}</h1>
          <div className="hbar-app-ui-navbar-board-actions">
            <NavbarIconOnly
              label={content.labels.searchProject}
              icon={Search}
              tier="md"
              onClick={() => reportNavbarAction(onAction, spec, 'search')}
            />
            <NavbarIconOnly
              label={content.starred?.label ?? content.labels.starProject}
              icon={Star}
              tier="md"
              className="hbar-app-ui-navbar-board-star"
              role={content.starred ? 'checkbox' : undefined}
              aria-checked={content.starred?.value}
              onClick={() => {
                if (content.starred) content.starred.onChange(!content.starred.value)
                else reportNavbarAction(onAction, spec, 'star')
              }}
            />
            <NavbarIconOnly
              label={content.labels.moreActions}
              icon={MoreHorizontal}
              tier="md"
              onClick={() => reportNavbarAction(onAction, spec, 'more')}
            />
          </div>
        </div>
        <div className="hbar-app-ui-navbar-board-meta-row">
          <nav aria-label={content.title} className="hbar-app-ui-navbar-board-breadcrumbs">
            {content.breadcrumbs.map((item, index) => (
              <span className={index === content.breadcrumbs.length - 1 ? 'is-current' : ''} key={`${index}-${item}`}>
                {index > 0 && <NavbarGlyph icon={ChevronRight} tier="xs" />}
                <NavbarGlyph icon={Folder} tier="sm" />
                <span>{item}</span>
              </span>
            ))}
          </nav>
        </div>
        <div className="hbar-app-ui-navbar-board-tabs-row">
          <nav className="hbar-app-ui-navbar-board-tabs" role="tablist" aria-label={content.labels.tasks}>
            {tabs.map((item) => (
              <NavbarButton
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-selected' : ''}
                onClick={() => chooseTab(item.id)}
              >
                <span>{item.label}</span>
                {item.count !== undefined && <small>{item.count}</small>}
              </NavbarButton>
            ))}
          </nav>
          <div className="hbar-app-ui-navbar-board-people">
            <NavbarButton
              aria-label={content.labels.invitePeople}
              className="hbar-app-ui-navbar-add"
              onClick={() => reportNavbarAction(onAction, spec, 'invite')}
            >
              <NavbarGlyph icon={CirclePlus} tier="lg" />
            </NavbarButton>
            <div className="hbar-app-ui-navbar-avatar-stack">
              {content.avatars.map((avatar, index) => (
                <span key={`${index}-${avatar}`}>{avatar}</span>
              ))}
              <small>{content.extraAvatarLabel}</small>
            </div>
          </div>
        </div>
      </header>
      <main
        className="hbar-app-ui-navbar-board-columns"
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        {columns.map((column) => (
          <section key={column.id}>
            <h2>{column.label}</h2>
            <ul>
              {column.cards.map((card, index) => (
                <li key={`${column.id}-${index}`}>{card}</li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </NavbarFrame>
  )
}
;('use client')
