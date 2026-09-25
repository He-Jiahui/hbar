import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { ChevronLeft, ChevronRight, Ellipsis, PanelRight, X } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenText } from '@lumen/app-ui'
import './workspace-tabs.css'

export type HbarWorkspaceTabCloseScope = 'one' | 'others' | 'left' | 'right' | 'all'
export interface HbarWorkspaceTabItem {
  readonly id: string
  readonly kind: 'session' | 'workbench'
  readonly title: string
  readonly detail?: string | undefined
  readonly activity: 'idle' | 'running' | 'unknown'
}
export interface HbarWorkspaceTabsLabels {
  readonly tabs: string
  readonly empty: string
  readonly scrollLeft: string
  readonly scrollRight: string
  readonly close: (title: string) => string
  readonly menu: (title: string) => string
  readonly activity: (value: HbarWorkspaceTabItem['activity']) => string
  readonly action: (scope: HbarWorkspaceTabCloseScope) => string
}
export interface HbarWorkspaceTabsProps {
  /** A runtime-bounded open collection. The view never silently truncates overflow. */
  readonly items: readonly HbarWorkspaceTabItem[]
  readonly activeId: string | null
  readonly busy: boolean
  readonly labels: HbarWorkspaceTabsLabels
  readonly onSelect: (id: string) => void
  readonly onRequestClose: (id: string, scope: HbarWorkspaceTabCloseScope) => void
  readonly onMove: (id: string, beforeId: string | null) => void
}

export function uniqueWorkspaceTabs(items: readonly HbarWorkspaceTabItem[]): readonly HbarWorkspaceTabItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

const closeScopes: readonly HbarWorkspaceTabCloseScope[] = ['one', 'others', 'left', 'right', 'all']

/** Only visual focus, scrolling, and disclosure state live here; the host owns every tab mutation. */
export function HbarWorkspaceTabs({
  items: source,
  activeId,
  busy,
  labels,
  onSelect,
  onRequestClose,
  onMove,
}: HbarWorkspaceTabsProps) {
  const items = uniqueWorkspaceTabs(source)
  const focusId = items.some((item) => item.id === activeId) ? activeId : items[0]?.id
  const strip = useRef<HTMLDivElement>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const popup = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const manualScroll = useRef(false)
  const dragging = useRef<string | null>(null)
  const lastFocusedId = useRef<string | null>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [menuId, setMenuId] = useState<string | null>(null)
  const menuItem = items.find((item) => item.id === menuId)
  const menuIndex = items.findIndex((item) => item.id === menuId)
  const menuDomId = useId()
  const itemIdentity = items.map((item) => item.id).join('\u0000')

  useEffect(() => {
    const element = strip.current
    if (!element) return
    manualScroll.current = false
    const update = () => {
      const focusedId = lastFocusedId.current
      if (focusedId && !buttons.current.has(focusedId) && document.activeElement === document.body) {
        const fallback = activeId ? buttons.current.get(activeId) : buttons.current.values().next().value
        fallback?.focus()
        lastFocusedId.current = null
      }
      const next = {
        left: element.scrollLeft > 1,
        right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      }
      setEdges((previous) => (previous.left === next.left && previous.right === next.right ? previous : next))
      if (!manualScroll.current && activeId)
        buttons.current.get(activeId)?.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    const frame = requestAnimationFrame(update)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [activeId, itemIdentity])

  const scroll = (direction: -1 | 1) => {
    const element = strip.current
    if (!element) return
    manualScroll.current = true
    element.scrollBy({ left: element.clientWidth * 0.75 * direction, behavior: 'smooth' })
  }
  const openMenu = (id: string, anchor: HTMLElement) => {
    if (busy || !items.some((item) => item.id === id)) return
    setMenuId(id)
    const rect = anchor.getBoundingClientRect()
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    popup.current?.style.setProperty(
      '--workspace-tab-menu-left',
      `${Math.max(rem / 2, Math.min(rect.left, innerWidth - Math.min(18 * rem, innerWidth - rem) - rem / 2))}px`,
    )
    popup.current?.style.setProperty('--workspace-tab-menu-top', `${rect.bottom + rem / 4}px`)
    popup.current?.showPopover()
    requestAnimationFrame(() => popup.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus())
  }
  const closeMenu = () => {
    popup.current?.hidePopover()
    ;(menuId ? buttons.current.get(menuId) : trigger.current)?.focus()
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const item = items[index]
    if (!item || busy) return
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault()
      openMenu(item.id, event.currentTarget)
      return
    }
    if (event.key === 'Delete') {
      event.preventDefault()
      onRequestClose(item.id, 'one')
      return
    }
    if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      const previous = items[index - 1]
      if (event.key === 'ArrowLeft' && previous) onMove(item.id, previous.id)
      if (event.key === 'ArrowRight' && index < items.length - 1) onMove(item.id, items[index + 2]?.id ?? null)
      return
    }
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % items.length
            : event.key === 'ArrowLeft'
              ? (index + items.length - 1) % items.length
              : null
    if (next === null || !items[next]) return
    event.preventDefault()
    buttons.current.get(items[next].id)?.focus()
    onSelect(items[next].id)
  }
  const contextMenu = (event: MouseEvent<HTMLElement>, id: string) => {
    event.preventDefault()
    openMenu(id, event.currentTarget)
  }
  return (
    <LumenFrame className="hbar-workspace-tabs" aria-busy={busy || undefined}>
      {edges.left && (
        <LumenButton
          variant="text"
          indicator="none"
          aria-label={labels.scrollLeft}
          title={labels.scrollLeft}
          onClick={() => scroll(-1)}
        >
          <LumenIcon icon={ChevronLeft} tier="sm" />
        </LumenButton>
      )}
      <LumenFrame
        ref={strip}
        role="tablist"
        aria-label={labels.tabs}
        className="hbar-workspace-tab-strip"
        onWheel={() => {
          manualScroll.current = true
        }}
        onPointerDown={() => {
          manualScroll.current = true
        }}
        onScroll={(event) => {
          const element = event.currentTarget
          setEdges({
            left: element.scrollLeft > 1,
            right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
          })
        }}
      >
        {items.length === 0 && <LumenText className="hbar-workspace-tabs-empty">{labels.empty}</LumenText>}
        {items.map((item, index) => (
          <LumenFrame
            key={item.id}
            role="presentation"
            className="hbar-workspace-tab"
            data-active={item.id === activeId}
            onContextMenu={(event) => contextMenu(event, item.id)}
            onDragOver={(event) => {
              if (!busy && dragging.current) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              const id = dragging.current
              dragging.current = null
              if (busy || !id || id === item.id || !items.some((candidate) => candidate.id === id)) return
              const rect = event.currentTarget.getBoundingClientRect()
              onMove(id, event.clientX > rect.left + rect.width / 2 ? (items[index + 1]?.id ?? null) : item.id)
            }}
          >
            <LumenButton
              ref={(node) => {
                if (node) buttons.current.set(item.id, node)
                else buttons.current.delete(item.id)
              }}
              role="tab"
              aria-label={item.title}
              aria-describedby={item.activity !== 'idle' ? `${menuDomId}-activity-${index}` : undefined}
              aria-selected={item.id === activeId}
              tabIndex={item.id === focusId ? 0 : -1}
              className="hbar-workspace-tab-select"
              variant="text"
              indicator="none"
              disabled={busy}
              title={item.detail ? `${item.title}\n${item.detail}` : item.title}
              onClick={() => onSelect(item.id)}
              onFocus={() => {
                lastFocusedId.current = item.id
              }}
              onKeyDown={(event) => keyDown(event, index)}
              draggable={!busy}
              onDragStart={(event) => {
                dragging.current = item.id
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', item.id)
              }}
              onDragEnd={() => {
                dragging.current = null
              }}
            >
              {item.kind === 'workbench' && <LumenIcon icon={PanelRight} tier="sm" />}
              {item.activity !== 'idle' && (
                <LumenFrame
                  as="i"
                  id={`${menuDomId}-activity-${index}`}
                  className="hbar-workspace-tab-activity"
                  data-activity={item.activity}
                  role="img"
                  aria-label={labels.activity(item.activity)}
                />
              )}
              <LumenText className="hbar-workspace-tab-title">{item.title}</LumenText>
            </LumenButton>
            <LumenButton
              variant="text"
              indicator="none"
              className="hbar-workspace-tab-close"
              aria-label={labels.close(item.title)}
              title={labels.close(item.title)}
              disabled={busy}
              onFocus={() => {
                lastFocusedId.current = item.id
                manualScroll.current = true
              }}
              onClick={() => onRequestClose(item.id, 'one')}
            >
              <LumenIcon icon={X} tier="sm" />
            </LumenButton>
          </LumenFrame>
        ))}
      </LumenFrame>
      {edges.right && (
        <LumenButton
          variant="text"
          indicator="none"
          aria-label={labels.scrollRight}
          title={labels.scrollRight}
          onClick={() => scroll(1)}
        >
          <LumenIcon icon={ChevronRight} tier="sm" />
        </LumenButton>
      )}
      {focusId && (
        <LumenButton
          variant="text"
          indicator="none"
          ref={trigger}
          aria-label={labels.menu(items.find((item) => item.id === focusId)?.title ?? '')}
          title={labels.menu(items.find((item) => item.id === focusId)?.title ?? '')}
          aria-haspopup="menu"
          aria-controls={menuDomId}
          disabled={busy}
          onClick={(event) => openMenu(focusId, event.currentTarget)}
        >
          <LumenIcon icon={Ellipsis} tier="sm" />
        </LumenButton>
      )}
      <LumenFrame
        id={menuDomId}
        ref={popup}
        popover="auto"
        role="menu"
        aria-label={menuItem ? labels.menu(menuItem.title) : labels.tabs}
        className="hbar-workspace-tab-menu-popover"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeMenu()
            return
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const entries = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
          ]
          const index = entries.findIndex((entry) => entry === document.activeElement)
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? entries.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length
          entries[next]?.focus()
        }}
      >
        {closeScopes.map((scope) => (
          <LumenButton
            key={scope}
            role="menuitem"
            variant="text"
            indicator="none"
            disabled={
              busy ||
              !menuItem ||
              (scope === 'others' && items.length < 2) ||
              (scope === 'left' && menuIndex < 1) ||
              (scope === 'right' && menuIndex >= items.length - 1)
            }
            onClick={() => {
              if (!menuItem || busy) return
              closeMenu()
              onRequestClose(menuItem.id, scope)
            }}
          >
            {labels.action(scope)}
          </LumenButton>
        ))}
      </LumenFrame>
    </LumenFrame>
  )
}
