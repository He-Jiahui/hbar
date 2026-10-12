import { LumenInput } from '../forms'
import { LumenButton } from '../primitives'
import * as React from 'react'
import { useState } from 'react'
import { Bell, CircleHelp, Plus, Search } from './glyphs'
import { type LumenNavbarActivityContent, uniqueLumenNavbarItems } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'
import { LumenMenu, LumenPopover } from '../ui-controls'

function ActivityNavbarLegacy({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarActivityContent
}) {
  const items = uniqueLumenNavbarItems(content.items)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-activity">
      <header>
        <div className="hbar-app-ui-navbar-activity-brand">
          <span>{content.brandInitial}</span>
          <strong>{content.brand}</strong>
        </div>
        <div className={`lumen-navbar-search-anchor${mobileSearchOpen ? ' is-open' : ''}`}>
          <label className="hbar-app-ui-navbar-activity-search">
            <NavbarGlyph icon={Search} tier="sm" />
            <LumenInput
              variant="plain"
              aria-label={content.labels.searchLabel}
              placeholder={content.labels.searchPlaceholder}
              value={content.search?.query}
              onChange={
                content.search ? (event) => content.search?.onQueryChange(event.currentTarget.value) : undefined
              }
            />
            <kbd>{content.labels.shortcut}</kbd>
          </label>
          {content.search?.query.trim() && (
            <div className="lumen-navbar-search-results">
              <p>{content.search.resultsLabel}</p>
              {content.search.results.length ? (
                <>
                  {content.search.results.map((item) => (
                    <LumenButton
                      className="hbar-app-ui-button"
                      key={item.id}
                      onClick={() => content.search?.onResult(item.id)}
                    >
                      {item.label}
                    </LumenButton>
                  ))}
                </>
              ) : (
                <p>{content.search.empty(content.search.query)}</p>
              )}
            </div>
          )}
        </div>
        <div className="hbar-app-ui-navbar-activity-actions">
          <NavbarButton
            className="hbar-app-ui-navbar-activity-new"
            onClick={() => reportNavbarAction(onAction, spec, 'new')}
          >
            <NavbarGlyph icon={Plus} tier="sm" />
            <span>{content.labels.newItem}</span>
          </NavbarButton>
          <NavbarIconOnly
            className="hbar-app-ui-navbar-activity-mobile-search"
            label={mobileSearchOpen && content.search ? content.search.closeLabel : content.labels.openSearch}
            aria-expanded={content.search ? mobileSearchOpen : undefined}
            icon={Search}
            tier="sm"
            onClick={() => {
              if (content.search) setMobileSearchOpen(!mobileSearchOpen)
              else reportNavbarAction(onAction, spec, 'search')
            }}
          />
          <NavbarIconOnly
            label={content.labels.helpLabel}
            icon={CircleHelp}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'help')}
          />
          <NavbarIconOnly
            label={content.labels.notifications}
            icon={Bell}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'notifications')}
          />
          <NavbarButton
            aria-label={content.labels.accountLabel}
            className="hbar-app-ui-navbar-account-button"
            onClick={() => reportNavbarAction(onAction, spec, 'account')}
          >
            <span className="hbar-app-ui-navbar-account">{content.labels.accountInitial}</span>
          </NavbarButton>
        </div>
      </header>
      <main
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        <h1>{content.labels.today}</h1>
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <LumenButton type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}>
                <span>
                  <strong>{item.actor}</strong> {item.message}
                </span>
                <time>{item.age}</time>
              </LumenButton>
            </li>
          ))}
        </ol>
      </main>
    </NavbarFrame>
  )
}
;('use client')

function ActivityNavbarWorkflow({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: ActivityNavbarWorkflowContent
}) {
  const items = uniqueLumenNavbarItems(content.items)
  const [openSurface, setOpenSurface] = React.useState<'search' | 'notifications' | 'account' | null>(null)
  return (
    <NavbarFrame spec={spec} className="hbar-app-ui-navbar-activity">
      <header>
        <div className="hbar-app-ui-navbar-activity-brand">
          <span>{content.brandInitial}</span>
          <strong>{content.brand}</strong>
        </div>
        <label className="hbar-app-ui-navbar-activity-search">
          <NavbarGlyph icon={Search} tier="sm" />
          <LumenInput aria-label={content.labels.searchLabel} placeholder={content.labels.searchPlaceholder} />
          <kbd>{content.labels.shortcut}</kbd>
        </label>
        <div className="hbar-app-ui-navbar-activity-actions">
          <NavbarButton
            className="hbar-app-ui-navbar-activity-new"
            variant="solid"
            onClick={() => reportNavbarAction(onAction, spec, 'new')}
          >
            <NavbarGlyph icon={Plus} tier="sm" />
            <span>{content.labels.newItem}</span>
          </NavbarButton>
          <NavbarIconOnly
            className="hbar-app-ui-navbar-activity-mobile-search"
            label={content.labels.openSearch}
            icon={Search}
            tier="sm"
            aria-expanded={openSurface === 'search'}
            onClick={() => {
              setOpenSurface((current) => (current === 'search' ? null : 'search'))
              reportNavbarAction(onAction, spec, 'search')
            }}
          />
          <NavbarIconOnly
            label={content.labels.helpLabel}
            icon={CircleHelp}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'help')}
          />
          <NavbarIconOnly
            label={content.labels.notifications}
            icon={Bell}
            tier="sm"
            aria-expanded={openSurface === 'notifications'}
            onClick={() => {
              setOpenSurface((current) => (current === 'notifications' ? null : 'notifications'))
              reportNavbarAction(onAction, spec, 'notifications')
            }}
          />
          <NavbarButton
            aria-label={content.labels.accountLabel}
            className="hbar-app-ui-navbar-account-button"
            aria-expanded={openSurface === 'account'}
            onClick={() => {
              setOpenSurface((current) => (current === 'account' ? null : 'account'))
              reportNavbarAction(onAction, spec, 'account')
            }}
          >
            <span className="hbar-app-ui-navbar-account">{content.labels.accountInitial}</span>
          </NavbarButton>
          <LumenPopover
            open={openSurface === 'search'}
            label={content.labels.openSearch}
            className="hbar-app-ui-navbar-activity-search-popover"
          >
            <LumenInput
              type="search"
              aria-label={content.labels.searchLabel}
              placeholder={content.labels.searchPlaceholder}
            />
          </LumenPopover>
          <LumenPopover
            open={openSurface === 'notifications'}
            label={content.labels.notificationsTitle}
            className="hbar-app-ui-navbar-activity-notifications"
          >
            {items.map((item) => (
              <LumenButton
                variant="text"
                key={item.id}
                onClick={() => {
                  reportNavbarAction(onAction, spec, 'open', item.id)
                  setOpenSurface(null)
                }}
              >
                <span>
                  <strong>{item.actor}</strong>
                  <small>{item.message}</small>
                </span>
                <time>{item.age}</time>
              </LumenButton>
            ))}
          </LumenPopover>
          <LumenMenu
            open={openSurface === 'account'}
            label={content.labels.accountMenu}
            items={[
              { id: 'settings', label: content.labels.settingsLabel },
              { id: 'help', label: content.labels.helpLabel },
              { id: 'sign-out', label: content.labels.signOut },
            ]}
            empty={content.labels.emptyMenu}
            onSelect={(id) => {
              reportNavbarAction(onAction, spec, 'account-action', id)
              setOpenSurface(null)
            }}
            className="hbar-app-ui-navbar-activity-account-menu"
          />
        </div>
      </header>
      <main
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        <h1>{content.labels.today}</h1>
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <LumenButton
                type="button"
                variant="text"
                onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}
              >
                <span>
                  <strong>{item.actor}</strong> {item.message}
                </span>
                <time>{item.age}</time>
              </LumenButton>
            </li>
          ))}
        </ol>
      </main>
    </NavbarFrame>
  )
}
interface ActivityNavbarWorkflowContent extends LumenNavbarActivityContent {
  readonly labels: LumenNavbarActivityContent['labels'] & {
    readonly notificationsTitle: NonNullable<LumenNavbarActivityContent['labels']['notificationsTitle']>
    readonly accountMenu: NonNullable<LumenNavbarActivityContent['labels']['accountMenu']>
    readonly signOut: NonNullable<LumenNavbarActivityContent['labels']['signOut']>
    readonly emptyMenu: NonNullable<LumenNavbarActivityContent['labels']['emptyMenu']>
  }
}
function hasActivityWorkflow(content: LumenNavbarActivityContent): content is ActivityNavbarWorkflowContent {
  return (
    content.labels.notificationsTitle !== undefined &&
    content.labels.accountMenu !== undefined &&
    content.labels.signOut !== undefined &&
    content.labels.emptyMenu !== undefined
  )
}
export function ActivityNavbar(props: NavbarSurfaceProps & { readonly content: LumenNavbarActivityContent }) {
  return hasActivityWorkflow(props.content) ? (
    <ActivityNavbarWorkflow {...props} content={props.content} />
  ) : (
    <ActivityNavbarLegacy {...props} />
  )
}
