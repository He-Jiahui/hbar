import { LumenButton } from '../primitives'
import { Download, Filter, MoreHorizontal, SlidersHorizontal } from './glyphs'
import { useState } from 'react'
import { type LumenNavbarFilterContent, selectLumenNavbarItem, uniqueLumenNavbarItems } from './content'
import {
  NavbarButton,
  NavbarFrame,
  NavbarGlyph,
  NavbarIconOnly,
  type NavbarSurfaceProps,
  reportNavbarAction,
} from './primitives'

export function FilterNavbar({
  spec,
  onAction,
  content,
}: NavbarSurfaceProps & {
  readonly content: LumenNavbarFilterContent
}) {
  const filters = uniqueLumenNavbarItems(content.filters)
  const items = uniqueLumenNavbarItems(content.items)
  const [active, setActive] = useState(content.activeFilter)
  const selected = selectLumenNavbarItem(filters, content.selection ? (content.selection.filterId ?? '') : active)
  return (
    <NavbarFrame spec={spec} onAction={onAction} className="hbar-app-ui-navbar-filter-list">
      <header>
        <nav aria-label={content.labels.filter} role="tablist">
          {filters.map((filter) => (
            <NavbarButton
              key={filter.id}
              role="tab"
              aria-selected={selected?.id === filter.id}
              className={selected?.id === filter.id ? 'is-selected' : ''}
              onClick={() => {
                if (content.selection) {
                  content.selection.onFilterChange(filter.id)
                  return
                }
                setActive(filter.id)
                reportNavbarAction(onAction, spec, 'filter-tab', filter.id)
              }}
            >
              <span>{filter.label}</span>
              <small>{filter.count}</small>
            </NavbarButton>
          ))}
        </nav>
        <NavbarIconOnly
          className="hbar-app-ui-navbar-filter-more"
          label={content.labels.moreViews}
          icon={MoreHorizontal}
          tier="sm"
          onClick={() => reportNavbarAction(onAction, spec, 'more')}
        />
        <div>
          <NavbarIconOnly
            label={content.labels.filter}
            icon={Filter}
            tier="sm"
            onClick={() => reportNavbarAction(onAction, spec, 'filter')}
          />
          <NavbarButton
            className="hbar-app-ui-navbar-filter-display"
            onClick={() => reportNavbarAction(onAction, spec, 'display')}
          >
            <NavbarGlyph icon={SlidersHorizontal} tier="sm" />
            <span>{content.labels.display}</span>
          </NavbarButton>
          <NavbarButton
            className="hbar-app-ui-navbar-filter-export"
            onClick={() => reportNavbarAction(onAction, spec, 'export')}
          >
            <NavbarGlyph icon={Download} tier="sm" />
            <span>{content.labels.export}</span>
          </NavbarButton>
        </div>
      </header>
      <main
        data-hbar-app-ui-list-strategy={content.listStrategy.kind}
        data-hbar-app-ui-expected-maximum={content.listStrategy.expectedMaximum}
      >
        <p>{content.labels.itemCount(content.itemCount, selected?.label ?? '')}</p>
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <LumenButton type="button" onClick={() => reportNavbarAction(onAction, spec, 'open', item.id)}>
                <span aria-hidden="true" />
                <strong>{item.title}</strong>
                <small>{item.actor}</small>
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
