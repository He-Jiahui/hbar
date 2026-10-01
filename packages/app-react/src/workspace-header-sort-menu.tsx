import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronRight, Clock, Ellipsis, RefreshCw, RotateCcw } from 'lucide-react'
import { LumenButton, LumenFrame, LumenIcon, LumenIconButton, LumenText } from '@lumen/app-ui'
import type { WorkspaceActivitySortBy } from '@hbar/contracts/directory'
import { workspaceHeaderMenuPosition, type WorkspaceHeaderMenuAlignment } from './workspace-header-sort-menu-model'
import './workspace-header-sort-menu.css'

const HEADER_MENU_WIDTH_REM = 16.875
const SORT_SUBMENU_WIDTH_REM = 14.375

function placePopover(
  popup: HTMLDivElement | null,
  anchor: HTMLElement | null,
  alignment: WorkspaceHeaderMenuAlignment,
  widthRem: number,
) {
  if (!popup || !anchor || typeof window === 'undefined') return
  const fontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  const position = workspaceHeaderMenuPosition(
    anchor.getBoundingClientRect(),
    {
      width: window.innerWidth,
      height: window.innerHeight,
      rootFontSize: fontSize,
    },
    widthRem,
    popup.getBoundingClientRect().height,
    alignment,
  )
  popup.style.setProperty('--workspace-sort-menu-left', `${position.left}px`)
  popup.style.setProperty('--workspace-sort-menu-top', `${position.top}px`)
}

export interface WorkspaceHeaderSortMenuLabels {
  readonly menu: string
  readonly sortCondition: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly restoreHidden: (count: number) => string
  readonly refresh: string
  readonly updating: string
}

export interface WorkspaceHeaderSortMenuProps {
  readonly labels: WorkspaceHeaderSortMenuLabels
  readonly sortBy: WorkspaceActivitySortBy
  readonly pending: boolean
  readonly sortDisabled: boolean
  readonly hiddenCount: number
  readonly restoreDisabled: boolean
  readonly refreshDisabled: boolean
  readonly onSortChange: (sortBy: WorkspaceActivitySortBy) => void
  readonly onRestoreHidden: () => void
  readonly onRefresh: () => void
  readonly menuRef?: { current: HTMLDivElement | null } | undefined
}

/** Host-owned labels and preference state keep this More menu local to the Projects and Sessions header. */
export function WorkspaceHeaderSortMenu({
  labels,
  sortBy,
  pending,
  sortDisabled,
  hiddenCount,
  restoreDisabled,
  refreshDisabled,
  onSortChange,
  onRestoreHidden,
  onRefresh,
  menuRef,
}: WorkspaceHeaderSortMenuProps) {
  const generatedId = useId()
  const menuId = `workspace-header-menu-${generatedId}`
  const sortMenuId = `workspace-header-sort-${generatedId}`
  const trigger = useRef<HTMLButtonElement | null>(null)
  const menu = useRef<HTMLDivElement | null>(null)
  const sortCondition = useRef<HTMLButtonElement | null>(null)
  const sortMenu = useRef<HTMLDivElement | null>(null)
  const focusOnSortOpen = useRef(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)

  const setRoot = useCallback(
    (node: HTMLDivElement | null) => {
      if (menuRef) menuRef.current = node
    },
    [menuRef],
  )

  const closeSortMenu = useCallback((restoreFocus: boolean) => {
    const popup = sortMenu.current
    if (popup?.matches(':popover-open')) popup.hidePopover()
    focusOnSortOpen.current = false
    setSortMenuOpen(false)
    if (restoreFocus) sortCondition.current?.focus()
  }, [])

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      closeSortMenu(false)
      if (menu.current?.matches(':popover-open')) menu.current.hidePopover()
      setMenuOpen(false)
      if (restoreFocus) trigger.current?.focus()
    },
    [closeSortMenu],
  )

  const openSortMenu = useCallback(
    (focusCheckedChoice: boolean) => {
      if (pending || sortDisabled) return
      focusOnSortOpen.current = focusCheckedChoice
      const popup = sortMenu.current
      if (!popup) return
      if (popup.matches(':popover-open')) {
        if (focusCheckedChoice) {
          requestAnimationFrame(() => {
            if (!popup.matches(':popover-open') || document.activeElement !== sortCondition.current) return
            focusOnSortOpen.current = false
            popup
              .querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]:not(:disabled)')
              ?.focus()
          })
        }
        return
      }
      placePopover(popup, sortCondition.current, 'flyout', SORT_SUBMENU_WIDTH_REM)
      popup.showPopover()
    },
    [pending, sortDisabled],
  )

  const navigateMenu = (event: KeyboardEvent<HTMLDivElement>, selector: string) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(selector)]
    if (items.length === 0) return
    event.preventDefault()
    const index = items.findIndex((item) => item === document.activeElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  const handleMainMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.isDefaultPrevented() || event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    if (event.key === 'ArrowRight' && event.target === sortCondition.current) {
      event.preventDefault()
      openSortMenu(true)
      return
    }
    navigateMenu(
      event,
      ':scope > button[role="menuitem"]:not(:disabled), :scope > [role="none"] > button[role="menuitem"]:not(:disabled)',
    )
  }

  const handleSortMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      closeSortMenu(true)
      return
    }
    navigateMenu(event, ':scope > button[role="menuitemradio"]:not(:disabled)')
  }

  useEffect(() => {
    if (!menuOpen && !sortMenuOpen) return
    const repositionOpenMenus = () => {
      if (menu.current?.matches(':popover-open'))
        placePopover(menu.current, trigger.current, 'below', HEADER_MENU_WIDTH_REM)
      if (sortMenu.current?.matches(':popover-open'))
        placePopover(sortMenu.current, sortCondition.current, 'flyout', SORT_SUBMENU_WIDTH_REM)
    }
    window.addEventListener('resize', repositionOpenMenus)
    window.addEventListener('scroll', repositionOpenMenus, true)
    return () => {
      window.removeEventListener('resize', repositionOpenMenus)
      window.removeEventListener('scroll', repositionOpenMenus, true)
    }
  }, [menuOpen, sortMenuOpen])

  return (
    <LumenFrame
      ref={setRoot}
      className="hbar-app-react-workspace-header-sort-menu"
      data-testid="workspace-organization-menu"
    >
      <LumenIconButton
        ref={trigger}
        label={labels.menu}
        className="hbar-app-react-workspace-menu-trigger"
        data-workspace-menu-trigger
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        popoverTarget={menuId}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          if (menu.current?.matches(':popover-open')) return
          placePopover(menu.current, event.currentTarget, 'below', HEADER_MENU_WIDTH_REM)
          menu.current?.showPopover()
        }}
      >
        <LumenIcon icon={Ellipsis} tier="sm" />
      </LumenIconButton>
      {pending && (
        <LumenText role="status" className="hbar-app-react-workspace-sort-pending">
          {labels.updating}
        </LumenText>
      )}
      <LumenFrame
        ref={menu}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={labels.menu}
        className="hbar-app-react-workspace-header-menu-popover"
        onBeforeToggle={(event) => {
          if (event.newState === 'open')
            placePopover(event.currentTarget, trigger.current, 'below', HEADER_MENU_WIDTH_REM)
        }}
        onToggle={(event) => {
          const opening = event.newState === 'open'
          setMenuOpen(opening)
          if (!opening) {
            closeSortMenu(false)
            return
          }
          requestAnimationFrame(() => {
            if (!menu.current?.matches(':popover-open')) return
            placePopover(menu.current, trigger.current, 'below', HEADER_MENU_WIDTH_REM)
            if (document.activeElement === trigger.current)
              menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
          })
        }}
        onKeyDown={handleMainMenuKeyDown}
      >
        <LumenFrame role="none" className="hbar-app-react-workspace-sort-condition-group">
          <LumenButton
            ref={sortCondition}
            role="menuitem"
            variant="text"
            indicator="none"
            className="hbar-app-react-workspace-sort-condition"
            aria-haspopup="menu"
            aria-expanded={sortMenuOpen}
            aria-controls={sortMenuId}
            popoverTarget={sortMenuId}
            popoverTargetAction="show"
            disabled={pending || sortDisabled}
            onPointerEnter={(event) => {
              if (event.pointerType !== 'mouse') return
              const anchor = event.currentTarget.getBoundingClientRect()
              const position = workspaceHeaderMenuPosition(
                anchor,
                {
                  width: window.innerWidth,
                  height: window.innerHeight,
                  rootFontSize: Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize),
                },
                SORT_SUBMENU_WIDTH_REM,
                0,
                'flyout',
              )
              // In a constrained viewport the flyout overlaps its parent row.
              // Keep that row clickable; click/keyboard opens it after the interaction finishes.
              if (position.left >= anchor.right) openSortMenu(false)
            }}
            onClick={() => openSortMenu(true)}
          >
            <LumenIcon icon={Clock} tier="md" />
            <LumenText as="span" className="hbar-app-react-workspace-sort-menu-label">
              {labels.sortCondition}
            </LumenText>
            <LumenIcon icon={ChevronRight} tier="sm" className="hbar-app-react-workspace-sort-chevron" />
          </LumenButton>
          <LumenFrame
            ref={sortMenu}
            id={sortMenuId}
            popover="auto"
            role="menu"
            aria-label={labels.sortCondition}
            data-testid="workspace-sort-submenu"
            className="hbar-app-react-workspace-sort-submenu"
            onBeforeToggle={(event) => {
              if (event.newState === 'open')
                placePopover(event.currentTarget, sortCondition.current, 'flyout', SORT_SUBMENU_WIDTH_REM)
            }}
            onToggle={(event) => {
              const opening = event.newState === 'open'
              setSortMenuOpen(opening)
              if (!opening) {
                focusOnSortOpen.current = false
                return
              }
              requestAnimationFrame(() => {
                if (!sortMenu.current?.matches(':popover-open')) return
                placePopover(sortMenu.current, sortCondition.current, 'flyout', SORT_SUBMENU_WIDTH_REM)
                if (!focusOnSortOpen.current || document.activeElement !== sortCondition.current) return
                focusOnSortOpen.current = false
                sortMenu.current
                  ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]:not(:disabled)')
                  ?.focus()
              })
            }}
            onKeyDown={handleSortMenuKeyDown}
          >
            <LumenButton
              role="menuitemradio"
              aria-checked={sortBy === 'createdAt'}
              variant="text"
              indicator="none"
              disabled={pending || sortDisabled}
              onClick={() => {
                closeMenu(true)
                onSortChange('createdAt')
              }}
            >
              <LumenIcon icon={Clock} tier="md" />
              <LumenText as="span" className="hbar-app-react-workspace-sort-menu-label">
                {labels.createdAt}
              </LumenText>
              {sortBy === 'createdAt' && <LumenIcon icon={Check} tier="sm" />}
            </LumenButton>
            <LumenButton
              role="menuitemradio"
              aria-checked={sortBy === 'updatedAt'}
              variant="text"
              indicator="none"
              disabled={pending || sortDisabled}
              onClick={() => {
                closeMenu(true)
                onSortChange('updatedAt')
              }}
            >
              <LumenIcon icon={RefreshCw} tier="md" />
              <LumenText as="span" className="hbar-app-react-workspace-sort-menu-label">
                {labels.updatedAt}
              </LumenText>
              {sortBy === 'updatedAt' && <LumenIcon icon={Check} tier="sm" />}
            </LumenButton>
          </LumenFrame>
        </LumenFrame>
        {hiddenCount > 0 && (
          <LumenButton
            role="menuitem"
            variant="text"
            indicator="none"
            disabled={restoreDisabled}
            onClick={() => {
              closeMenu(true)
              onRestoreHidden()
            }}
          >
            <LumenIcon icon={RotateCcw} tier="md" />
            <LumenText as="span" className="hbar-app-react-workspace-sort-menu-label">
              {labels.restoreHidden(hiddenCount)}
            </LumenText>
          </LumenButton>
        )}
        <LumenButton
          role="menuitem"
          variant="text"
          indicator="none"
          disabled={refreshDisabled}
          onClick={() => {
            closeMenu(true)
            onRefresh()
          }}
        >
          <LumenIcon icon={RefreshCw} tier="md" />
          <LumenText as="span" className="hbar-app-react-workspace-sort-menu-label">
            {labels.refresh}
          </LumenText>
        </LumenButton>
      </LumenFrame>
    </LumenFrame>
  )
}
