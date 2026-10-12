'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { type LumenSize } from './appearance'
import { LumenButton, LumenIconButton, LumenNavigationButton, LumenStatus, LumenText } from './primitives'
import {
  LUMEN_TOOL_SEPARATOR_WIDTH_REM,
  resolveLumenToolPaneLayout,
  type LumenToolLayout,
  type LumenToolPresentation,
} from './tool-pane-layout'
import { LumenToolPaneResizer, type LumenToolResize } from './tool-pane-resize'
import { useToolPaneGeometry } from './use-tool-pane-geometry'
import { resolveLumenSidebarLayout, type LumenSidebarLayout, type LumenSidebarResize } from './sidebar-layout'
import './workbench.css'
import { LumenFloatingSurface, useFloatingTrigger } from './floating-surface'

export type LumenIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface LumenIconProps extends React.SVGAttributes<SVGSVGElement> {
  icon: React.ElementType<React.SVGAttributes<SVGSVGElement>>
  tier?: LumenIconTier | undefined
}

export function LumenIcon({ icon: Icon, tier = 'md', className, ...other }: LumenIconProps) {
  return (
    <Icon
      {...other}
      {...lumenPartProps("icon")} className={['lumen-icon', className].filter(Boolean).join(' ')}
      data-tier={tier}
      aria-hidden="true"
      focusable="false"
    />
  )
}

export interface LumenAppShellProps {
  label: string
  titlebar?: React.ReactNode
  sidebar?: React.ReactNode
  sidebarWidthRem: number
  sidebarLayout?: LumenSidebarLayout | undefined
  sidebarResize?: LumenSidebarResize | undefined
  toolWidthRem?: number | undefined
  /** Opt in to available-container sizing. Omission preserves the legacy shell. */
  toolLayout?: LumenToolLayout | undefined
  mainRef?: React.Ref<HTMLElement> | undefined
  toolRef?: React.Ref<HTMLElement> | undefined
  resizeRef?: React.Ref<HTMLElement> | undefined
  onToolPresentationChange?: ((value: LumenToolPresentation) => void) | undefined
  toolResize?: LumenToolResize | undefined
  sidebarOpen: boolean
  closeSidebarLabel: string
  onCloseSidebar: () => void
  header?: React.ReactNode
  tool?: React.ReactNode
  toolLabel?: string | undefined
  onCloseTool?: (() => void) | undefined
  overlay?: React.ReactNode
  children: React.ReactNode
}

/** Adaptive panes stay in flow; content identity and persistence remain host-owned. */
export function LumenAppShell({
  label,
  titlebar,
  sidebar,
  sidebarWidthRem,
  sidebarLayout,
  sidebarResize,
  toolWidthRem = 24,
  toolLayout,
  mainRef,
  toolRef,
  resizeRef,
  onToolPresentationChange,
  toolResize,
  sidebarOpen,
  closeSidebarLabel,
  onCloseSidebar,
  header,
  tool,
  toolLabel,
  onCloseTool,
  overlay,
  children,
}: LumenAppShellProps) {
  const { bodyRef, remProbeRef, geometry } = useToolPaneGeometry(toolLayout !== undefined)
  const sidebarGeometry = useToolPaneGeometry(sidebarLayout !== undefined)
  const [previewWidthRem, setPreviewWidthRem] = React.useState<number | null>(null)
  const [sidebarPreviewRem, setSidebarPreviewRem] = React.useState<number | null>(null)
  const sidebarPresent = Boolean(sidebar)
  const sidebarPane = sidebarLayout
    ? resolveLumenSidebarLayout({
        sidebarPresent,
        sidebarOpen,
        viewportNarrow: sidebarGeometry.viewportNarrow,
        preferredWidthRem: sidebarPreviewRem ?? sidebarWidthRem,
        layout: sidebarLayout,
        geometry: sidebarGeometry.geometry,
      })
    : null
  React.useEffect(() => {
    setSidebarPreviewRem(null)
  }, [
    sidebarPresent,
    sidebarOpen,
    sidebarWidthRem,
    sidebarLayout?.minWidthRem,
    sidebarLayout?.maxWidthRem,
    sidebarLayout?.mainMinWidthRem,
    sidebarLayout?.defaultWidthRem,
  ])
  const toolPresent = Boolean(tool)
  const toolDock = React.useRef<HTMLDivElement>(null)
  const paneLayout = toolLayout
    ? resolveLumenToolPaneLayout({
        toolPresent,
        preferredWidthRem: previewWidthRem ?? toolWidthRem,
        layout: toolLayout,
        geometry,
      })
    : null
  const previousPresentation = React.useRef<LumenToolPresentation | null>(null)
  React.useEffect(() => {
    setPreviewWidthRem(null)
  }, [toolPresent, toolWidthRem, toolLayout?.mainMinWidthRem, toolLayout?.minWidthRem, toolLayout?.maxWidthRem])
  React.useEffect(() => {
    if (paneLayout && paneLayout.presentation !== previousPresentation.current) {
      previousPresentation.current = paneLayout.presentation
      onToolPresentationChange?.(paneLayout.presentation)
    }
  }, [paneLayout, onToolPresentationChange])
  const style = {
    '--lumen-sidebar-size': `${sidebarPane?.widthRem ?? sidebarWidthRem}rem`,
    '--lumen-sidebar-separator-size': `${LUMEN_TOOL_SEPARATOR_WIDTH_REM}rem`,
    '--lumen-tool-size': `${paneLayout?.widthRem ?? toolWidthRem}rem`,
    '--lumen-tool-separator-size': `${LUMEN_TOOL_SEPARATOR_WIDTH_REM}rem`,
    '--lumen-main-min-size': paneLayout?.presentation === 'split' ? `${toolLayout?.mainMinWidthRem}rem` : undefined,
  } as React.CSSProperties

  return (
    <div
      className="lumen-app-shell hbar-app-ui-app-shell"
      data-lumen-shell="app"
      data-hbar-app-ui-shell="app"
      data-sidebar-open={sidebarOpen}
      data-tool-presentation={paneLayout?.presentation}
      style={style}
    >
      {titlebar}
      {toolLayout ? <div ref={remProbeRef} className="lumen-app-rem-probe" aria-hidden="true" /> : null}
      {sidebarLayout ? (
        <div ref={sidebarGeometry.remProbeRef} className="lumen-app-rem-probe" aria-hidden="true" />
      ) : null}
      <div ref={sidebarGeometry.bodyRef} className="lumen-app-workspace">
        {sidebar ? (
          <div
            className="lumen-app-sidebar-drawer hbar-app-ui-app-sidebar-drawer"
            data-open={sidebarOpen}
            inert={!sidebarOpen || undefined}
          >
            <div className="lumen-app-sidebar-drawer-panel hbar-app-ui-app-sidebar-drawer-panel">{sidebar}</div>
            <LumenButton
              variant="text"
              className="lumen-app-sidebar-backdrop hbar-app-ui-app-sidebar-backdrop"
              aria-label={closeSidebarLabel}
              onClick={onCloseSidebar}
            />
          </div>
        ) : null}
        {sidebar && sidebarOpen && sidebarResize && sidebarPane && sidebarLayout ? (
          <LumenToolPaneResizer
            resize={sidebarResize}
            geometry={sidebarGeometry.geometry}
            layout={sidebarPane}
            onPreview={setSidebarPreviewRem}
            edge="start"
            className="lumen-app-sidebar-separator"
            reset={{ widthRem: sidebarLayout.defaultWidthRem, label: sidebarResize.resetLabel }}
            onFocusUnavailable={sidebarResize.onFocusUnavailable}
          />
        ) : null}
        <div className="lumen-app-frame hbar-app-ui-app-frame">
          {header ? <div className="lumen-app-header hbar-app-ui-app-header">{header}</div> : null}
          <div
            ref={bodyRef}
            className="lumen-app-body hbar-app-ui-app-body"
            data-tool-presentation={paneLayout?.presentation}
          >
            <main
              ref={mainRef}
              className="lumen-app-main hbar-app-ui-app-main"
              aria-label={label}
              tabIndex={-1}
              inert={paneLayout?.presentation === 'page' ? true : undefined}
            >
              {children}
            </main>
            {tool && paneLayout?.presentation === 'split' ? (
              toolResize ? (
                <LumenToolPaneResizer
                  resize={toolResize}
                  geometry={geometry}
                  layout={paneLayout}
                  onPreview={setPreviewWidthRem}
                  resizeRef={resizeRef}
                />
              ) : (
                <div className="lumen-app-tool-separator" aria-hidden="true" />
              )
            ) : null}
            {tool && toolLayout?.constrainedPresentation === 'drawer' ? (
              <div ref={toolDock} {...lumenPartProps("shell.tool-drawer")} className="lumen-app-tool-drawer" hidden={paneLayout?.presentation !== 'split'} />
            ) : tool ? (
              <aside
                ref={toolRef}
                {...lumenPartProps("shell.tool-drawer")} className="lumen-app-tool-drawer hbar-app-ui-app-tool-drawer"
                aria-label={toolLabel}
                tabIndex={-1}
              >
                {tool}
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      {tool && toolLayout?.constrainedPresentation === 'drawer' ? (
        <LumenFloatingSurface
          mode="modal"
          open={paneLayout?.presentation === 'drawer'}
          docked={paneLayout?.presentation === 'split'}
          dockRef={toolDock}
          keepMounted
          label={toolLabel}
          onClose={onCloseTool ?? (() => {})}
          className="lumen-tool-drawer-surface"
          backdropClassName="lumen-tool-drawer-root"
          style={{ '--lumen-tool-size': `${toolWidthRem}rem` } as React.CSSProperties}
        >
          <aside ref={toolRef} className="lumen-app-tool-content" aria-label={toolLabel} tabIndex={-1}>
            {tool}
          </aside>
        </LumenFloatingSurface>
      ) : null}
      {overlay}
    </div>
  )
}

export type LumenWindowPlatform = 'windows' | 'macos' | 'linux'

export interface LumenWindowTitlebarLabels {
  minimize: string
  maximize: string
  restore: string
  close: string
}

export interface LumenWindowTitlebarProps {
  title: string
  platform: LumenWindowPlatform
  labels: LumenWindowTitlebarLabels
  maximized: boolean
  onMinimize: () => void
  onToggleMaximize: () => void
  onClose: () => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

function WindowGlyph({ name }: { name: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  return (
    <svg className="lumen-window-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'minimize' ? <path d="M3 8.5h10" /> : null}
      {name === 'maximize' ? <rect x="3.5" y="3.5" width="9" height="9" rx="0.75" /> : null}
      {name === 'restore' ? (
        <React.Fragment>
          <path d="M5.5 3.5h7v7" />
          <rect x="3.5" y="5.5" width="7" height="7" rx="0.75" />
        </React.Fragment>
      ) : null}
      {name === 'close' ? <path d="m4 4 8 8m0-8-8 8" /> : null}
    </svg>
  )
}

/** Native window behavior is host-owned; this component only renders its labelled controls. */
export function LumenWindowTitlebar({
  title,
  platform,
  labels,
  maximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  leading,
  trailing,
}: LumenWindowTitlebarProps) {
  const controls = (
    <div className="lumen-window-controls">
      <LumenIconButton className="lumen-window-control" label={labels.minimize} shape="square" onClick={onMinimize}>
        <WindowGlyph name="minimize" />
      </LumenIconButton>
      <LumenIconButton
        className="lumen-window-control"
        label={maximized ? labels.restore : labels.maximize}
        shape="square"
        onClick={onToggleMaximize}
      >
        <WindowGlyph name={maximized ? 'restore' : 'maximize'} />
      </LumenIconButton>
      <LumenIconButton
        className="lumen-window-control lumen-window-close"
        label={labels.close}
        shape="square"
        tone="danger"
        onClick={onClose}
      >
        <WindowGlyph name="close" />
      </LumenIconButton>
    </div>
  )

  return (
    <header className="lumen-window-titlebar" data-platform={platform} data-tauri-drag-region>
      {platform === 'macos' ? controls : null}
      <div className="lumen-window-titlebar-leading">{leading}</div>
      <LumenText
        as="strong"
        className="lumen-window-title"
        variant="label"
        data-tauri-drag-region
        onDoubleClick={onToggleMaximize}
      >
        {title}
      </LumenText>
      <div className="lumen-window-titlebar-trailing">{trailing}</div>
      {platform === 'macos' ? null : controls}
    </header>
  )
}

export interface LumenAppSidebarStatus {
  label: string
  value: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface LumenAppSidebarProps {
  brand: string
  title: string
  emptyLabel: string
  status: LumenAppSidebarStatus
  children?: React.ReactNode
  brandAction?: React.ReactNode
  primaryActions?: React.ReactNode
  treeAction?: React.ReactNode
  actions?: React.ReactNode
}

export function LumenAppSidebar({
  brand,
  title,
  emptyLabel,
  status,
  children,
  brandAction,
  primaryActions,
  treeAction,
  actions,
}: LumenAppSidebarProps) {
  return (
    <aside {...lumenPartProps("sidebar.root")} className="lumen-app-sidebar hbar-app-ui-app-sidebar" aria-label={title}>
      <header {...lumenPartProps("sidebar.header")}>
        <div className="lumen-app-brand-row">
          <LumenText as="strong" variant="title" {...lumenPartProps("sidebar.brand")} className="lumen-app-brand">
            {brand}
          </LumenText>
          {brandAction}
        </div>
        {primaryActions}
      </header>
      <div {...lumenPartProps("sidebar.title")} className="lumen-app-sidebar-title">
        <LumenText as="h2" variant="label" tone="muted">
          {title}
        </LumenText>
        {treeAction}
      </div>
      <div {...lumenPartProps("sidebar.content")} className="lumen-app-sidebar-content">
        {children ?? (
          <LumenText as="p" tone="muted">
            {emptyLabel}
          </LumenText>
        )}
      </div>
      <footer {...lumenPartProps("sidebar.footer")}>
        <div {...lumenPartProps("sidebar.status")} className="lumen-app-host-status">
          <LumenStatus value={status.label} tone={status.tone} />
          <LumenText as="small" tone="subtle" variant="supporting">
            {status.value}
          </LumenText>
        </div>
        {actions}
      </footer>
    </aside>
  )
}

export interface LumenSidebarActionProps extends Omit<React.ComponentProps<typeof LumenNavigationButton>, 'children'> {
  icon: React.ReactNode
  label: string
  detail?: string | undefined
}

export function LumenSidebarAction({
  icon,
  label,
  detail,
  selected = false,
  variant = 'text',
  size = 'm',
  className,
  ...other
}: LumenSidebarActionProps) {
  return (
    <LumenNavigationButton
      {...other}
      type="button"
      className={['lumen-sidebar-action', className].filter(Boolean).join(' ')}
      selected={selected}
      variant={variant}
      size={size}
    >
      {icon}
      <LumenText as="span">{label}</LumenText>
      {detail ? (
        <LumenText as="small" size="s" tone="subtle" variant="supporting">
          {detail}
        </LumenText>
      ) : null}
    </LumenNavigationButton>
  )
}

export interface LumenActionMenuItem<ActionId extends string = string> {
  id: ActionId
  label: string
  tone?: 'neutral' | 'danger' | undefined
  disabled?: boolean | undefined
}

export interface LumenActionMenuProps<ActionId extends string = string> {
  label: string
  /** Show a complete text action when a destination needs a discoverable name. */
  labelVisible?: boolean | undefined
  items: readonly LumenActionMenuItem<ActionId>[]
  onAction: (actionId: ActionId) => void
}

export function LumenActionMenu<ActionId extends string = string>({
  label,
  labelVisible = false,
  items,
  onAction,
}: LumenActionMenuProps<ActionId>) {
  const Trigger = labelVisible ? LumenButton : 'button'
  const [open, setOpen] = React.useState(false)
  const menuId = `lumen-action-menu-${React.useId().replaceAll(':', '')}`
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const firstItemRef = React.useRef<HTMLButtonElement>(null)
  const itemRefs = React.useRef(new Map<ActionId, HTMLButtonElement>())
  const focusLastOnOpen = React.useRef(false)
  const triggerEvents = useFloatingTrigger({
    open,
    onOpen: () => setOpen(true),
    onClose: () => setOpen(false),
  })
  const uniqueItems = React.useMemo(() => {
    const seen = new Set<ActionId>()
    return items.filter((item) => {
      if (!item.id.trim() || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [items])
  const availableItems = React.useMemo(() => uniqueItems.filter((item) => !item.disabled), [uniqueItems])
  const setItemRef = React.useCallback((itemId: ActionId, element: HTMLButtonElement | null) => {
    if (element) itemRefs.current.set(itemId, element)
    else itemRefs.current.delete(itemId)
  }, [])
  const focusItem = React.useCallback(
    (index: number) => {
      if (availableItems.length === 0) return
      const item = availableItems[(index + availableItems.length) % availableItems.length]
      if (item) itemRefs.current.get(item.id)?.focus()
    },
    [availableItems],
  )
  React.useEffect(() => {
    if (!open || !focusLastOnOpen.current) return
    focusLastOnOpen.current = false
    const frame = window.requestAnimationFrame(() => focusItem(availableItems.length - 1))
    return () => window.cancelAnimationFrame(frame)
  }, [availableItems.length, focusItem, open])

  return (
    <div {...lumenPartProps("menu.root")} className="lumen-action-menu hbar-app-ui-action-menu" data-open={open || undefined}>
      <Trigger
        ref={triggerRef}
        type="button"
        {...(labelVisible ? { variant: 'text' as const } : {})}
        {...lumenPartProps("menu.trigger")} className={labelVisible ? 'lumen-action-menu-trigger-label' : 'lumen-action-menu-trigger'}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((current) => !current)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            focusLastOnOpen.current = true
            setOpen(true)
          }
        }}
        {...triggerEvents}
      >
        <span className="lumen-action-menu-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {labelVisible ? label : null}
      </Trigger>
      <LumenFloatingSurface
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        initialFocusRef={firstItemRef}
        placement="below"
        id={menuId}
        {...lumenPartProps("menu.popup")} className="lumen-action-menu-popup hbar-app-ui-dialog-menu"
        role="menu"
        aria-label={label}
      >
        {uniqueItems.map((item) => (
          <LumenButton
            key={item.id}
            ref={(element) => {
              setItemRef(item.id, element)
              if (item === availableItems[0]) {
                if (element) firstItemRef.current = element
                else firstItemRef.current = null
              }
            }}
            type="button"
            role="menuitem"
            data-value={item.id}
            title={item.label}
            size="s"
            variant="text"
            tone={item.tone === 'danger' ? 'danger' : 'neutral'}
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const current = availableItems.findIndex((candidate) => candidate.id === item.id)
                focusItem(current + (event.key === 'ArrowDown' ? 1 : -1))
              } else if (event.key === 'Home') {
                event.preventDefault()
                focusItem(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                focusItem(availableItems.length - 1)
              }
            }}
            onClick={() => {
              setOpen(false)
              // A following dialog must restore focus to the visible trigger, not a hidden item.
              triggerRef.current?.focus()
              onAction(item.id)
            }}
          >
            {item.label}
          </LumenButton>
        ))}
      </LumenFloatingSurface>
    </div>
  )
}

export function LumenShellHeaderAction({
  label,
  children,
  size = 'm',
  ...other
}: Omit<React.ComponentProps<typeof LumenIconButton>, 'size'> & { size?: LumenSize | undefined }) {
  return (
    <LumenIconButton {...other} label={label} size={size}>
      {children}
    </LumenIconButton>
  )
}
