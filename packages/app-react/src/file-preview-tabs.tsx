import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Circle, FileDiff, FileText, X } from 'lucide-react'
import {
  LumenButton,
  LumenContentText,
  LumenFloatingSurface,
  LumenFrame,
  LumenIcon,
  LumenIconButton,
} from '@lumen/app-ui'
import './file-preview-tabs.css'
import { revealInlineItem } from './inline-item-reveal'
import { canFocusWorkspaceElement } from './workspace-tool-focus'

export type HbarFilePreviewKind = 'document' | 'working' | 'staged'
export type HbarFilePreviewCloseScope = 'current' | 'others' | 'left' | 'right' | 'all'
export type HbarFilePreviewProtection = 'dirty' | 'submitting' | 'unknown'
export interface HbarFilePreviewItem {
  readonly id: string
  readonly path: string
  readonly kind: HbarFilePreviewKind
  readonly protection: HbarFilePreviewProtection | null
}
export interface HbarFilePreviewLabels {
  readonly tabs: string
  readonly kind: (kind: HbarFilePreviewKind) => string
  readonly tab: (path: string, kind: HbarFilePreviewKind) => string
  readonly close: (path: string, kind: HbarFilePreviewKind) => string
  readonly menu: (path: string, kind: HbarFilePreviewKind) => string
  readonly action: (scope: HbarFilePreviewCloseScope) => string
  readonly status: (status: HbarFilePreviewProtection) => string
  readonly blocked: (path: string, reason: HbarFilePreviewProtection) => string
  readonly showBlocked: string
  readonly error: (code: string) => string
}
export interface HbarFilePreviewTabsProps {
  /** Runtime owns the 32-entry bound. This scroll strip never truncates valid entries. */
  readonly items: readonly HbarFilePreviewItem[]
  readonly activeId: string | null
  readonly labels: HbarFilePreviewLabels
  readonly onSelect: (id: string) => void
  /** IDs are captured when the menu opens, not recomputed after a list mutation. */
  readonly onClose: (ids: readonly string[]) => void
}

export function uniqueFilePreviews(items: readonly HbarFilePreviewItem[]): readonly HbarFilePreviewItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
export function filePreviewCloseTargets(
  ids: readonly string[],
  id: string,
  scope: HbarFilePreviewCloseScope,
): readonly string[] {
  const index = ids.indexOf(id)
  if (index < 0) return []
  switch (scope) {
    case 'current':
      return [id]
    case 'others':
      return ids.filter((candidate) => candidate !== id)
    case 'left':
      return ids.slice(0, index)
    case 'right':
      return ids.slice(index + 1)
    case 'all':
      return ids
  }
}
const scopes: readonly HbarFilePreviewCloseScope[] = ['current', 'others', 'left', 'right', 'all']

/** Only disclosure, focus and scrolling are local; selection and close belong to the host. */
export function HbarFilePreviewTabs({ items: source, activeId, labels, onSelect, onClose }: HbarFilePreviewTabsProps) {
  const items = uniqueFilePreviews(source)
  const focusId = items.some((item) => item.id === activeId) ? activeId : items[0]?.id
  const anchorRef = useRef<HTMLElement>(null)
  const positionReferenceRef = useRef<HTMLElement>(null)
  const firstMenuItemRef = useRef<HTMLButtonElement>(null)
  const focusedTabRef = useRef<HTMLButtonElement | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const [menu, setMenu] = useState<{ item: HbarFilePreviewItem; ids: readonly string[] } | null>(null)
  const identity = items.map((item) => item.id).join('\u0000')
  const menuOpen = Boolean(menu && items.some((item) => item.id === menu.item.id))
  useLayoutEffect(() => {
    if (!menuOpen) setMenu(null)
  }, [menuOpen])
  useLayoutEffect(() => {
    const original = focusedTabRef.current
    const fallback = focusId ? buttons.current.get(focusId) : undefined
    if (
      original &&
      !original.isConnected &&
      document.activeElement === document.body &&
      fallback &&
      canFocusWorkspaceElement(fallback)
    )
      fallback.focus({ preventScroll: true })
  }, [identity, focusId])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const item = activeId ? buttons.current.get(activeId)?.parentElement : null
      const rail = item?.parentElement
      if (item && rail) revealInlineItem(rail, item, item.querySelector<HTMLElement>('.hbar-file-preview-close'))
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [activeId, identity])
  const openMenu = (item: HbarFilePreviewItem, anchor: HTMLElement) => {
    const trigger = buttons.current.get(item.id)
    if (!trigger) return
    trigger.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    trigger.focus({ preventScroll: true })
    anchorRef.current = trigger
    positionReferenceRef.current = anchor
    setMenu({ item, ids: items.map((candidate) => candidate.id) })
  }
  const closeMenu = () => {
    setMenu(null)
    if (menu) (buttons.current.get(menu.item.id) ?? (focusId ? buttons.current.get(focusId) : null))?.focus()
  }
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const item = items[index]
    if (!item) return
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault()
      openMenu(item, event.currentTarget)
      return
    }
    if (event.key === 'Delete') {
      event.preventDefault()
      onClose([item.id])
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
  if (!items.length) return null
  return (
    <LumenFrame className="hbar-file-preview-tabs">
      <LumenFrame role="tablist" aria-label={labels.tabs} className="hbar-file-preview-strip">
        {items.map((item, index) => (
          <LumenFrame
            key={item.id}
            role="presentation"
            className="hbar-file-preview-tab"
            data-active={activeId === item.id}
            onContextMenu={(event) => {
              event.preventDefault()
              openMenu(item, event.currentTarget)
            }}
          >
            <LumenButton
              ref={(node) => {
                if (node) buttons.current.set(item.id, node)
                else buttons.current.delete(item.id)
              }}
              id={`file-preview-tab-${item.id}`}
              role="tab"
              aria-controls={`file-preview-panel-${item.id}`}
              aria-selected={activeId === item.id}
              aria-label={labels.tab(item.path, item.kind)}
              aria-describedby={item.protection ? `file-preview-status-${item.id}` : undefined}
              tabIndex={focusId === item.id ? 0 : -1}
              title={labels.tab(item.path, item.kind)}
              variant="text"
              indicator="none"
              className="hbar-file-preview-select"
              onClick={() => onSelect(item.id)}
              onFocus={(event) => {
                focusedTabRef.current = event.currentTarget
              }}
              onKeyDown={(event) => keyDown(event, index)}
            >
              <LumenIcon icon={item.kind === 'document' ? FileText : FileDiff} tier="sm" />
              <LumenFrame className="hbar-file-preview-copy">
                <LumenContentText context="collection.title">
                  {item.path.replaceAll('\\', '/').split('/').at(-1) ?? item.path}
                </LumenContentText>
                {item.kind !== 'document' && (
                  <LumenContentText context="collection.detail">{labels.kind(item.kind)}</LumenContentText>
                )}
              </LumenFrame>
              {item.protection && (
                <LumenFrame
                  as="span"
                  role="img"
                  id={`file-preview-status-${item.id}`}
                  title={labels.status(item.protection)}
                  className="hbar-file-preview-status"
                  aria-label={labels.status(item.protection)}
                >
                  <LumenIcon icon={Circle} tier="sm" />
                </LumenFrame>
              )}
            </LumenButton>
            <LumenIconButton
              label={labels.close(item.path, item.kind)}
              className="hbar-file-preview-close"
              onClick={() => onClose([item.id])}
            >
              <LumenIcon icon={X} tier="sm" />
            </LumenIconButton>
          </LumenFrame>
        ))}
      </LumenFrame>
      <LumenFloatingSurface
        open={menuOpen}
        onClose={() => setMenu(null)}
        anchorRef={anchorRef}
        positionReferenceRef={positionReferenceRef}
        initialFocusRef={firstMenuItemRef}
        responsivePresentation="anchored"
        material={{ background: 'var(--lumen-contrast)' }}
        placement="below"
        restoreFocus
        tabIndex={0}
        role="menu"
        label={menu ? labels.menu(menu.item.path, menu.item.kind) : labels.tabs}
        className="hbar-file-preview-menu-popover"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            closeMenu()
            return
          }
          const available = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)'),
          )
          const index = available.findIndex((item) => item === document.activeElement)
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? available.length - 1
                : event.key === 'ArrowDown'
                  ? (index + 1) % available.length
                  : event.key === 'ArrowUp'
                    ? (index + available.length - 1) % available.length
                    : null
          if (next !== null) {
            event.preventDefault()
            available[next]?.focus()
          }
        }}
      >
        {menu &&
          scopes.map((scope) => {
            const ids = filePreviewCloseTargets(menu.ids, menu.item.id, scope)
            return (
              <LumenButton
                key={scope}
                ref={scope === 'current' ? firstMenuItemRef : undefined}
                role="menuitem"
                variant="text"
                indicator="none"
                disabled={ids.length === 0}
                onClick={() => {
                  closeMenu()
                  onClose(ids)
                }}
              >
                {labels.action(scope)}
              </LumenButton>
            )
          })}
      </LumenFloatingSurface>
    </LumenFrame>
  )
}
