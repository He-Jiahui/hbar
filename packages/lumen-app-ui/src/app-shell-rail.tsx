'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Building2, Check, ChevronsUpDown, Menu, Package, Receipt, Route, Truck, X } from 'lucide-react'
import { LumenButton, LumenIconButton } from './primitives'
import './app-shell-rail.css'

export interface LumenShellRailWorkspace {
  readonly id: string
  readonly mark: string
  readonly name: string
  readonly detail: string
}
export interface LumenShellRailRecord {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly value: string
  readonly valueMuted?: boolean | undefined
  readonly status: string
  readonly tone: 'neutral' | 'warning' | 'danger'
}
export interface LumenShellRailArea {
  readonly id: string
  readonly label: string
  readonly icon: 'shipments' | 'dispatch' | 'fleet' | 'customers' | 'billing'
  readonly title: string
  readonly primaryAction: string
  readonly recordsTitle: string
  readonly recordsCount: string
  readonly currentLinkId: string | null
  /** Navigation scrolls independently. Hosts group inventories above 50 links. */
  readonly sections: readonly {
    readonly id: string
    readonly label: string
    readonly links: readonly {
      readonly id: string
      readonly label: string
      readonly href: string
      readonly count?: string | undefined
    }[]
  }[]
  /** Full rows remain in the bounded main scroll pane; hosts page histories above 100. */
  readonly records: readonly LumenShellRailRecord[]
}
export interface LumenAppShellRailContent {
  readonly labels: {
    readonly areas: string
    readonly navigationDialog: string
    readonly openNavigation: string
    readonly closeNavigation: string
    readonly closeOverlay: string
    readonly switchWorkspace: string
    readonly addWorkspace: string
    readonly emptyAreas: string
    readonly emptyNavigation: string
    readonly emptyRecords: string
    readonly emptyWorkspaces: string
  }
  readonly account: { readonly initials: string; readonly label: string }
  readonly areas: readonly LumenShellRailArea[]
  readonly selectedAreaId: string | null
  readonly workspaces: readonly LumenShellRailWorkspace[]
  readonly selectedWorkspaceId: string | null
  readonly onSelectArea: (id: string) => void
  readonly onSelectWorkspace: (id: string) => void
  readonly onAddWorkspace: () => void
  readonly onAccount: () => void
  readonly onNavigate: (areaId: string, linkId: string) => void
  readonly onPrimaryAction: (areaId: string) => void
  readonly onRecord: (areaId: string, recordId: string) => void
}
/** Repeated identities update in place; removed selections remain explicitly empty. */
export function stableLumenShellRailItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}
const icons = {
  shipments: Package,
  dispatch: Route,
  fleet: Truck,
  customers: Building2,
  billing: Receipt,
}
function WorkspacePicker({ content }: { readonly content: LumenAppShellRailContent }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const workspaces = stableLumenShellRailItems(content.workspaces)
  const selected = workspaces.find((item) => item.id === content.selectedWorkspaceId)
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const document = trigger.current?.ownerDocument
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setOpen(false)
    }
    document?.addEventListener('pointerdown', dismiss)
    return () => document?.removeEventListener('pointerdown', dismiss)
  }, [open])
  return (
    <div className="lumen-rail-workspace">
      <div
        className="lumen-rail-workspace-anchor"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            close()
          }
        }}
      >
        <LumenButton
          ref={trigger}
          variant="text"
          size="s"
          indicator="none"
          className="lumen-rail-workspace-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
        >
          {selected ? (
            <>
              <span className="lumen-rail-mark">{selected.mark}</span>
              <span className="lumen-rail-pair">
                <span title={selected.name}>{selected.name}</span>
                <span title={selected.detail}>{selected.detail}</span>
              </span>
            </>
          ) : (
            <span className="lumen-rail-truncate">{content.labels.emptyWorkspaces}</span>
          )}
          <ChevronsUpDown className="lumen-rail-icon" aria-hidden="true" />
        </LumenButton>
        {open ? (
          <div
            ref={menu}
            id={menuId}
            className="lumen-rail-workspace-menu"
            role="menu"
            aria-label={content.labels.switchWorkspace}
            onKeyDown={(event) => {
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
              const index = buttons.findIndex((button) => button === event.target)
              if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                buttons[next]?.focus()
              }
              if (event.key === 'Tab') setOpen(false)
            }}
          >
            {workspaces.map((item) => (
              <LumenButton
                key={item.id}
                variant="text"
                size="s"
                indicator="none"
                role="menuitemradio"
                aria-checked={item.id === selected?.id}
                onClick={() => {
                  close()
                  content.onSelectWorkspace(item.id)
                }}
              >
                <span className="lumen-rail-pair">
                  <span title={item.name}>{item.name}</span>
                  <span title={item.detail}>{item.detail}</span>
                </span>
                {item.id === selected?.id ? <Check className="lumen-rail-icon" aria-hidden="true" /> : null}
              </LumenButton>
            ))}
            <LumenButton
              variant="text"
              size="s"
              indicator="none"
              role="menuitem"
              onClick={() => {
                close()
                content.onAddWorkspace()
              }}
            >
              {content.labels.addWorkspace}
            </LumenButton>
          </div>
        ) : null}
      </div>
    </div>
  )
}
function RailPane({
  content,
  area,
  mobile,
  onClose,
}: {
  readonly content: LumenAppShellRailContent
  readonly area: LumenShellRailArea | undefined
  readonly mobile?: boolean
  readonly onClose: () => void
}) {
  const pane = useRef<HTMLElement>(null)
  useEffect(() => {
    if (mobile) pane.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [mobile])
  return (
    <aside
      ref={pane}
      className={`lumen-rail-pane ${mobile ? 'lumen-rail-mobile' : 'lumen-rail-desktop'}`}
      role={mobile ? 'dialog' : undefined}
      aria-label={mobile ? content.labels.navigationDialog : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && mobile) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="lumen-rail-icons">
        {mobile ? (
          <LumenIconButton
            size="s"
            label={content.labels.closeNavigation}
            className="lumen-rail-close"
            onClick={onClose}
          >
            <X className="lumen-rail-icon" aria-hidden="true" />
          </LumenIconButton>
        ) : null}
        <nav aria-label={content.labels.areas}>
          {stableLumenShellRailItems(content.areas).map((item) => {
            const Icon = icons[item.icon]
            return (
              <span className="lumen-rail-area" key={item.id}>
                <LumenIconButton
                  size="s"
                  label={item.label}
                  aria-current={item.id === area?.id ? 'page' : undefined}
                  onClick={() => content.onSelectArea(item.id)}
                >
                  <Icon className="lumen-rail-icon" aria-hidden="true" />
                </LumenIconButton>
              </span>
            )
          })}
        </nav>
        <LumenButton
          size="s"
          variant="text"
          indicator="none"
          className="lumen-rail-avatar"
          aria-label={content.account.label}
          onClick={content.onAccount}
        >
          {content.account.initials}
        </LumenButton>
      </div>
      <div className="lumen-rail-secondary">
        <WorkspacePicker content={content} />
        <div className="lumen-rail-nav-frame">
          <nav aria-label={area?.label ?? content.labels.areas} data-lumen-list-strategy="pane-scroll">
            {area?.sections.length ? (
              stableLumenShellRailItems(area.sections).map((section) => (
                <div key={section.id} className="lumen-rail-nav-section">
                  <p>{section.label}</p>
                  <ul>
                    {stableLumenShellRailItems(section.links).map((link) => (
                      <li key={link.id}>
                        <a
                          href={link.href}
                          aria-current={link.id === area.currentLinkId ? 'page' : undefined}
                          onClick={() => content.onNavigate(area.id, link.id)}
                        >
                          <span className="lumen-rail-truncate" title={link.label}>
                            {link.label}
                          </span>
                          {link.count ? <span className="lumen-rail-count">{link.count}</span> : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="lumen-rail-empty">{content.labels.emptyNavigation}</p>
            )}
          </nav>
        </div>
      </div>
    </aside>
  )
}
export function AppShellRail({ content }: { readonly content: LumenAppShellRailContent }) {
  const [navigationOpen, setNavigationOpen] = useState(true)
  const [narrow, setNarrow] = useState(false)
  const shell = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const area = stableLumenShellRailItems(content.areas).find((item) => item.id === content.selectedAreaId)
  useEffect(() => {
    const element = shell.current
    if (!element) return
    const observe = () =>
      setNarrow(
        element.clientWidth < 64 * Number.parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize),
      )
    observe()
    const observer = new ResizeObserver(observe)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const close = () => {
    setNavigationOpen(false)
    trigger.current?.focus()
  }
  return (
    <div className="lumen-rail-shell" ref={shell}>
      <RailPane content={content} area={area} onClose={close} />
      <div className="lumen-rail-main-column">
        <header className="lumen-rail-header" role="banner">
          <LumenIconButton
            ref={trigger}
            size="s"
            className="lumen-rail-open"
            label={content.labels.openNavigation}
            aria-expanded={navigationOpen && narrow}
            onClick={() => setNavigationOpen(true)}
          >
            <Menu className="lumen-rail-icon" aria-hidden="true" />
          </LumenIconButton>
          <h1 title={area?.title}>{area?.title ?? content.labels.emptyAreas}</h1>
          {area ? (
            <LumenButton
              variant="solid"
              size="s"
              className="lumen-rail-primary"
              onClick={() => content.onPrimaryAction(area.id)}
            >
              {area.primaryAction}
            </LumenButton>
          ) : null}
        </header>
        <div className="lumen-rail-main-frame">
          <main data-lumen-list-strategy="pane-scroll">
            {area ? (
              <section className="lumen-rail-records">
                <div className="lumen-rail-record-heading">
                  <h2>{area.recordsTitle}</h2>
                  <span>{area.recordsCount}</span>
                </div>
                {area.records.length ? (
                  <ul>
                    {stableLumenShellRailItems(area.records).map((record) => (
                      <li key={record.id} data-record-id={record.id}>
                        <LumenButton
                          variant="text"
                          size="s"
                          indicator="none"
                          onClick={() => content.onRecord(area.id, record.id)}
                        >
                          <span className="lumen-rail-pair">
                            <span title={record.title}>{record.title}</span>
                            <span title={record.detail}>{record.detail}</span>
                          </span>
                          <span className="lumen-rail-record-value">
                            <span data-muted={record.valueMuted || undefined}>{record.value}</span>
                            <span>
                              <span className="lumen-rail-dot" data-tone={record.tone} aria-hidden="true" />
                              {record.status}
                            </span>
                          </span>
                        </LumenButton>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="lumen-rail-empty">{content.labels.emptyRecords}</p>
                )}
              </section>
            ) : (
              <p className="lumen-rail-empty">{content.labels.emptyAreas}</p>
            )}
          </main>
        </div>
      </div>
      {navigationOpen && narrow ? (
        <div className="lumen-rail-overlay">
          <button
            type="button"
            className="lumen-rail-backdrop"
            aria-label={content.labels.closeOverlay}
            onClick={close}
          />
          <RailPane mobile content={content} area={area} onClose={close} />
        </div>
      ) : null}
    </div>
  )
}
