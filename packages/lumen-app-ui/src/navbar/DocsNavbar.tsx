import { LumenButton } from '../primitives'
import * as React from 'react'
import { useRef, useState } from 'react'
import { BookOpen, GitBranch, Menu, Moon, Search } from './glyphs'
import { type LumenNavbarDocsContent } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'
import { LumenDialog } from '../dialog'
import { LumenInput } from '../forms'
import { LumenDrawer, LumenMenu } from '../ui-controls'

function DocsNavbarLegacy({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarDocsContent
}) {
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({})
  const owner = useRef<HTMLDivElement>(null)
  const navigation = content.navigation
  function closeNavigation() {
    setNavigationOpen(false)
    owner.current?.querySelector<HTMLElement>('[data-navbar-navigation-trigger]')?.focus()
  }
  return (
    <div
      className="lumen-navbar-drawer-anchor"
      ref={owner}
      onKeyDown={(event) => {
        if (navigationOpen && event.key === 'Escape') {
          event.preventDefault()
          closeNavigation()
        }
      }}
    >
      <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-docs">
        <header>
          <NavbarIconOnly
            className="hbar-app-ui-navbar-docs-menu"
            label={content.labels.openNavigation}
            data-navbar-navigation-trigger="true"
            aria-expanded={navigation ? navigationOpen : undefined}
            aria-haspopup={navigation ? 'dialog' : undefined}
            icon={Menu}
            tier="sm"
            onClick={() => {
              if (navigation) setNavigationOpen(true)
              else reportNavbarAction(onAction, spec, 'menu')
            }}
          />
          <div className="hbar-app-ui-navbar-docs-brand">
            <span>
              <NavbarGlyph icon={BookOpen} tier="md" />
            </span>
            <strong>{content.brand}</strong>
          </div>
          <NavbarButton
            className="hbar-app-ui-navbar-docs-version"
            onClick={() => reportNavbarAction(onAction, spec, 'version')}
          >
            <span>{content.version}</span>
          </NavbarButton>
          <nav aria-label={content.brand}>
            {content.navItems.map((item, index) => (
              <NavbarButton
                key={`${index}-${item}`}
                onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}
              >
                {item}
              </NavbarButton>
            ))}
          </nav>
          <div className="hbar-app-ui-navbar-docs-actions">
            <NavbarButton
              className="hbar-app-ui-navbar-docs-search"
              onClick={() => reportNavbarAction(onAction, spec, 'search')}
            >
              <NavbarGlyph icon={Search} tier="sm" />
              <span>{content.labels.search}</span>
              <kbd>{content.labels.searchShortcut}</kbd>
            </NavbarButton>
            <NavbarIconOnly
              label={content.labels.switchTheme}
              icon={Moon}
              tier="sm"
              onClick={() => reportNavbarAction(onAction, spec, 'theme')}
            />
            <NavbarIconOnly
              label={content.labels.sourceRepository}
              icon={GitBranch}
              tier="sm"
              onClick={() => reportNavbarAction(onAction, spec, 'repository')}
            />
          </div>
        </header>
        <main>
          <aside
            data-hbar-app-ui-list-strategy={content.sidebarStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.sidebarStrategy.expectedMaximum}
          >
            {content.sidebar.map((group, groupIndex) => (
              <section key={`${groupIndex}-${group.group}`}>
                <p>{group.group}</p>
                <ul>
                  {group.items.map((item, itemIndex) => (
                    <li key={`${itemIndex}-${item}`}>
                      <LumenButton
                        className="hbar-app-ui-button"
                        type="button"
                        onClick={() => reportNavbarAction(onAction, spec, 'navigate', item)}
                      >
                        {item}
                      </LumenButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </aside>
          <article
            data-hbar-app-ui-list-strategy={content.linkStrategy.kind}
            data-hbar-app-ui-expected-maximum={content.linkStrategy.expectedMaximum}
          >
            <p>{content.labels.documentMeta(content.brand, content.version, content.labels.latest)}</p>
            <h1>{content.title}</h1>
            <p>{content.description}</p>
            {content.links.map((link, index) => (
              <LumenButton
                className="hbar-app-ui-button"
                type="button"
                key={`${index}-${link}`}
                onClick={() => reportNavbarAction(onAction, spec, 'open', link)}
              >
                <span>{link}</span>
                <span>{content.labels.nextMarker}</span>
              </LumenButton>
            ))}
          </article>
        </main>
      </NavbarFrame>
      {navigationOpen && navigation && (
        <div className="lumen-navbar-drawer-layer">
          <LumenButton
            className="lumen-navbar-drawer-backdrop"
            aria-label={navigation.close}
            onClick={closeNavigation}
          />
          <aside className="lumen-navbar-drawer-panel" role="dialog" aria-modal="true" aria-label={navigation.label}>
            <header>
              <h2>{navigation.title}</h2>
              <LumenButton className="hbar-app-ui-button" autoFocus onClick={closeNavigation}>
                {navigation.close}
              </LumenButton>
            </header>
            <nav aria-label={content.brand}>
              {content.navItems.map((item) => (
                <LumenButton
                  className="hbar-app-ui-button"
                  key={item}
                  onClick={() => {
                    closeNavigation()
                    reportNavbarAction(onAction, spec, 'navigate', item)
                  }}
                >
                  {item}
                </LumenButton>
              ))}
            </nav>
            {content.sidebar.map((group, index) => (
              <div key={`${index}-${group.group}`} data-expanded={expandedGroups[index] ?? index === 1}>
                <LumenButton
                  type="button"
                  variant="text"
                  aria-expanded={expandedGroups[index] ?? index === 1}
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [index]: !(current[index] ?? index === 1),
                    }))
                  }
                >
                  {group.group}
                </LumenButton>
                {(expandedGroups[index] ?? index === 1) &&
                  group.items.map((item) => (
                    <LumenButton
                      className="hbar-app-ui-button"
                      key={item}
                      onClick={() => {
                        closeNavigation()
                        reportNavbarAction(onAction, spec, 'navigate', item)
                      }}
                    >
                      {item}
                    </LumenButton>
                  ))}
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  )
}
;('use client')

function DocsNavigation({
  content,
  onSelect,
}: {
  readonly content: LumenNavbarDocsContent
  readonly onSelect: (item: string) => void
}) {
  return (
    <React.Fragment>
      {content.sidebar.map((group) => (
        <section key={group.group}>
          <p>{group.group}</p>
          <ul>
            {group.items.map((item) => (
              <li key={item}>
                <LumenButton type="button" variant="text" onClick={() => onSelect(item)}>
                  {item}
                </LumenButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </React.Fragment>
  )
}

function DocsNavbarWorkflow({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: DocsNavbarWorkflowContent
}) {
  const [versionId, setVersionId] = React.useState(content.version)
  const [versionOpen, setVersionOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [darkTheme, setDarkTheme] = React.useState(true)
  const [searchQuery, setSearchQuery] = React.useState('')
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const searchItems = content.searchItems.filter(
    (item) =>
      !normalizedQuery ||
      item.label.toLocaleLowerCase().includes(normalizedQuery) ||
      item.detail.toLocaleLowerCase().includes(normalizedQuery),
  )
  const selectLocation = (item: string) => {
    reportNavbarAction(onAction, spec, 'navigate', item)
    setMobileOpen(false)
    setSearchOpen(false)
  }
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-docs">
      <header>
        <NavbarIconOnly
          className="hbar-app-ui-navbar-docs-menu"
          label={content.labels.openNavigation}
          icon={Menu}
          tier="sm"
          aria-expanded={mobileOpen}
          onClick={() => {
            setMobileOpen(true)
            setVersionOpen(false)
            reportNavbarAction(onAction, spec, 'menu')
          }}
        />
        <div className="hbar-app-ui-navbar-docs-brand">
          <span>
            <NavbarGlyph icon={BookOpen} tier="md" />
          </span>
          <strong>{content.brand}</strong>
        </div>
        <NavbarButton
          className="hbar-app-ui-navbar-docs-version"
          variant="outlined"
          aria-expanded={versionOpen}
          onClick={() => {
            setVersionOpen((open) => !open)
            reportNavbarAction(onAction, spec, 'version')
          }}
        >
          <span>{versionId}</span>
        </NavbarButton>
        <LumenMenu
          open={versionOpen}
          label={content.labels.versionMenu}
          items={content.versions}
          empty={content.labels.emptyMenu}
          selectedId={versionId}
          onSelect={(id) => {
            setVersionId(id)
            setVersionOpen(false)
            reportNavbarAction(onAction, spec, 'version', id)
          }}
          className="hbar-app-ui-navbar-docs-version-menu"
        />
        <nav aria-label={content.brand}>
          {content.navItems.map((item) => (
            <NavbarButton key={item} onClick={() => selectLocation(item)}>
              {item}
            </NavbarButton>
          ))}
        </nav>
        <div className="hbar-app-ui-navbar-docs-actions">
          <NavbarButton
            className="hbar-app-ui-navbar-docs-search"
            variant="outlined"
            aria-expanded={searchOpen}
            onClick={() => {
              setSearchOpen(true)
              reportNavbarAction(onAction, spec, 'search')
            }}
          >
            <NavbarGlyph icon={Search} tier="sm" />
            <span>{content.labels.search}</span>
            <kbd>{content.labels.searchShortcut}</kbd>
          </NavbarButton>
          <NavbarIconOnly
            label={darkTheme ? content.labels.lightTheme : content.labels.darkTheme}
            icon={Moon}
            tier="sm"
            aria-pressed={darkTheme}
            onClick={() => {
              setDarkTheme((current) => !current)
              reportNavbarAction(onAction, spec, 'theme')
            }}
          />
          <NavbarIconOnly
            label={content.labels.sourceRepository}
            icon={GitBranch}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'repository')}
          />
        </div>
      </header>
      <LumenDialog
        open={searchOpen}
        title={content.labels.searchTitle}
        closeLabel={content.labels.closeSearch}
        onClose={() => setSearchOpen(false)}
        className="hbar-app-ui-navbar-docs-search-dialog"
      >
        <LumenInput
          autoFocus
          type="search"
          value={searchQuery}
          aria-label={content.labels.searchTitle}
          placeholder={content.labels.searchPlaceholder}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
        <div>
          {searchItems.length ? (
            searchItems.map((item) => (
              <LumenButton variant="text" key={item.id} onClick={() => selectLocation(item.id)}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </LumenButton>
            ))
          ) : (
            <p>{content.labels.searchEmpty}</p>
          )}
        </div>
      </LumenDialog>
      <LumenDrawer
        open={mobileOpen}
        title={content.labels.mobileNavigation}
        closeLabel={content.labels.closeNavigation}
        onClose={() => setMobileOpen(false)}
        className="hbar-app-ui-navbar-docs-drawer"
      >
        <nav aria-label={content.labels.mobileNavigation}>
          <DocsNavigation content={content} onSelect={selectLocation} />
        </nav>
      </LumenDrawer>
      <main>
        <aside
          data-hbar-app-ui-list-strategy={content.sidebarStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.sidebarStrategy.expectedMaximum}
        >
          <DocsNavigation content={content} onSelect={selectLocation} />
        </aside>
        <article
          data-hbar-app-ui-list-strategy={content.linkStrategy.kind}
          data-hbar-app-ui-expected-maximum={content.linkStrategy.expectedMaximum}
        >
          <p>{content.labels.documentMeta(content.brand, versionId, content.labels.latest)}</p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          {content.links.map((link) => (
            <LumenButton type="button" variant="text" key={link} onClick={() => selectLocation(link)}>
              <span>{link}</span>
              <span>{content.labels.nextMarker}</span>
            </LumenButton>
          ))}
        </article>
      </main>
    </NavbarFrame>
  )
}
export function DocsNavbar(props: NavbarSurfaceProps & { readonly content: LumenNavbarDocsContent }) {
  return hasDocsWorkflow(props.content) ? (
    <DocsNavbarWorkflow {...props} content={props.content} />
  ) : (
    <DocsNavbarLegacy {...props} />
  )
}

interface DocsNavbarWorkflowContent extends LumenNavbarDocsContent {
  readonly versions: NonNullable<LumenNavbarDocsContent['versions']>
  readonly searchItems: NonNullable<LumenNavbarDocsContent['searchItems']>
  readonly labels: LumenNavbarDocsContent['labels'] & {
    readonly versionMenu: NonNullable<LumenNavbarDocsContent['labels']['versionMenu']>
    readonly searchTitle: NonNullable<LumenNavbarDocsContent['labels']['searchTitle']>
    readonly closeSearch: NonNullable<LumenNavbarDocsContent['labels']['closeSearch']>
    readonly searchPlaceholder: NonNullable<LumenNavbarDocsContent['labels']['searchPlaceholder']>
    readonly searchEmpty: NonNullable<LumenNavbarDocsContent['labels']['searchEmpty']>
    readonly mobileNavigation: NonNullable<LumenNavbarDocsContent['labels']['mobileNavigation']>
    readonly closeNavigation: NonNullable<LumenNavbarDocsContent['labels']['closeNavigation']>
    readonly lightTheme: NonNullable<LumenNavbarDocsContent['labels']['lightTheme']>
    readonly darkTheme: NonNullable<LumenNavbarDocsContent['labels']['darkTheme']>
    readonly emptyMenu: NonNullable<LumenNavbarDocsContent['labels']['emptyMenu']>
  }
}

function hasDocsWorkflow(content: LumenNavbarDocsContent): content is DocsNavbarWorkflowContent {
  return (
    content.labels.versionMenu !== undefined &&
    content.labels.searchTitle !== undefined &&
    content.labels.closeSearch !== undefined &&
    content.labels.searchPlaceholder !== undefined &&
    content.labels.searchEmpty !== undefined &&
    content.labels.mobileNavigation !== undefined &&
    content.labels.closeNavigation !== undefined &&
    content.labels.lightTheme !== undefined &&
    content.labels.darkTheme !== undefined &&
    content.labels.emptyMenu !== undefined &&
    content.versions !== undefined &&
    content.searchItems !== undefined
  )
}
