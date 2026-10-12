'use client'

import { lumenPartProps } from './style-contract'

import * as React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LumenDialog } from './dialog'
import { LumenInput } from './forms'
import { LumenButton, LumenText } from './primitives'
import { LumenIcon } from './workbench'
import './command-list.css'

export interface LumenCommandItem {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly icon?: React.ElementType<React.SVGAttributes<SVGSVGElement>> | undefined
  readonly group?: string | undefined
  readonly shortcut?: string | undefined
  readonly navigates?: boolean | undefined
  readonly disabled?: boolean | undefined
}

export interface LumenCommandListLabels {
  search: string
  available: string
  empty: string
  unavailable: string
  navigate: string
  execute: string
  close: string
  count: (count: number) => string
  navigateKeys: string
  executeKey: string
  closeKey: string
}

export interface LumenCommandListProps {
  labels: LumenCommandListLabels
  items: readonly LumenCommandItem[]
  query: string
  selectedId?: string | undefined
  selectionLost?: boolean | undefined
  onQueryChange: (value: string) => void
  onSelect: (id: string) => void
  onMove: (direction: -1 | 1) => void
  onExecute: (id: string) => void
  /** Short, host-bounded menus grow with content; large collections use a virtualized scroll pane. */
  listStrategy?: 'content-grown' | 'virtual' | undefined
  error?: string | undefined
  inputRef?: React.RefObject<HTMLInputElement | null> | undefined
  breadcrumb?: React.ReactNode
  breadcrumbPosition?: 'before-query' | 'after-query' | undefined
  onBack?: (() => void) | undefined
  hideQuery?: boolean | undefined
  shortcutExecution?: boolean | undefined
  inputId?: string | undefined
  inputRole?: 'searchbox' | 'combobox' | undefined
  hints?: LumenCommandHints | undefined
}

export interface LumenCommandHints {
  readonly items: readonly { readonly id: string; readonly key: string; readonly label: string }[]
  readonly result?: string | undefined
}

export function LumenCommandFooter({
  hints,
  as: Tag = 'footer',
}: {
  readonly hints: LumenCommandHints
  readonly as?: 'footer' | 'div'
}) {
  return (
    <Tag className="lumen-command-footer">
      {hints.items.map((item) => (
        <span key={item.id}>
          <kbd>{item.key}</kbd>
          {item.label}
        </span>
      ))}
      {hints.result !== undefined && <small>{hints.result}</small>}
    </Tag>
  )
}

function uniqueCommands(items: readonly LumenCommandItem[]): readonly LumenCommandItem[] {
  return [...new Map(items.filter((item) => item.id.trim()).map((item) => [item.id, item])).values()]
}

export function LumenCommandQuery({
  labels,
  items,
  query,
  selectedId,
  onQueryChange,
  onMove,
  onExecute,
  inputRef,
  inputId = 'lumen-command-query',
  inputRole = 'searchbox',
  onBack,
  shortcutExecution,
}: LumenCommandListProps) {
  const selected = uniqueCommands(items).find((item) => item.id === selectedId)
  const listId = `${inputId}-options`
  return (
    <label className="lumen-command-query" htmlFor={inputId}>
      <CommandGlyph name="search" />
      <LumenInput
        variant="plain"
        ref={inputRef}
        id={inputId}
        type="search"
        role={inputRole}
        aria-expanded={inputRole === 'combobox' ? true : undefined}
        aria-autocomplete={inputRole === 'combobox' ? 'list' : undefined}
        aria-label={labels.search}
        aria-controls={listId}
        aria-activedescendant={selected ? `${listId}-${encodeURIComponent(selected.id)}` : undefined}
        value={query}
        placeholder={labels.search}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return
          const shortcut =
            shortcutExecution && !query && /^[1-9]$/.test(event.key)
              ? items.find((item) => item.shortcut === event.key && !item.disabled)
              : undefined
          if (shortcut) {
            event.preventDefault()
            onExecute(shortcut.id)
          } else if (event.key === 'Escape' && query) {
            event.preventDefault()
            event.stopPropagation()
            onQueryChange('')
          } else if (event.key === 'Backspace' && !query && onBack) {
            event.preventDefault()
            onBack()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            onMove(event.key === 'ArrowDown' ? 1 : -1)
          } else if (event.key === 'Enter' && selected && !selected.disabled) {
            event.preventDefault()
            onExecute(selected.id)
          }
        }}
      />
    </label>
  )
}

function CommandGlyph({ name }: { name: 'command' | 'navigate' | 'search' }) {
  return (
    <svg className="lumen-command-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {name === 'command' ? <path d="M5 5h6v6H5zM3 6.5h2m6 0h2M6.5 3v2m0 6v2M9.5 3v2m0 6v2M3 9.5h2m6 0h2" /> : null}
      {name === 'navigate' ? <path d="m6 3.5 4.5 4.5L6 12.5" /> : null}
      {name === 'search' ? <path d="m11 11 3 3M7 12A5 5 0 1 1 7 2a5 5 0 0 1 0 10Z" /> : null}
    </svg>
  )
}

/** Controlled command catalog. The host owns filtering, selection, execution, and all copy. */
export function LumenCommandList({
  labels,
  items: sourceItems,
  query,
  selectedId,
  selectionLost = false,
  onQueryChange,
  onSelect,
  onMove,
  onExecute,
  listStrategy = 'content-grown',
  error,
  inputRef,
  breadcrumb,
  breadcrumbPosition = 'after-query',
  onBack,
  hideQuery = false,
  shortcutExecution,
  inputId = 'lumen-command-query',
  inputRole = 'searchbox',
  hints,
}: LumenCommandListProps) {
  const items = React.useMemo(() => uniqueCommands(sourceItems), [sourceItems])
  const selected = items.find((item) => item.id === selectedId)
  const listId = `${inputId}-options`
  const viewport = React.useRef<HTMLDivElement>(null)
  const virtual = listStrategy === 'virtual'
  const rootFont =
    typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewport.current,
    getItemKey: (index) => items[index]?.id ?? index,
    estimateSize: () => rootFont * 4,
    overscan: 4,
    enabled: virtual,
    initialRect: { width: 0, height: rootFont * 24 },
  })
  const selectedIndex = items.findIndex((item) => item.id === selectedId)
  React.useEffect(() => {
    if (virtual && selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [virtual, selectedIndex, virtualizer])
  const visible = virtualizer.getVirtualItems()
  const rows = virtual
    ? visible.map((row) => ({ index: row.index, key: row.key }))
    : items.map((item, index) => ({ index, key: item.id }))
  const groups: {
    readonly key: string
    readonly label: string | undefined
    readonly rows: typeof rows
  }[] = []
  for (const row of rows) {
    const item = items[row.index]
    if (!item) continue
    const previous = groups.at(-1)
    if (previous && previous.label === item.group) previous.rows.push(row)
    else groups.push({ key: item.id, label: item.group, rows: [row] })
  }
  const leading = visible[0]?.start ?? 0
  const trailing = Math.max(0, virtualizer.getTotalSize() - (visible.at(-1)?.end ?? 0))
  const option = (item: LumenCommandItem, index: number) => (
    <LumenButton
      className="lumen-command-option"
      variant="text"
      indicatorEdge="left"
      indicatorState={item.id === selected?.id ? 'selected' : 'idle'}
      role="option"
      id={`${listId}-${encodeURIComponent(item.id)}`}
      key={item.id}
      aria-selected={item.id === selected?.id}
      aria-posinset={virtual ? index + 1 : undefined}
      aria-setsize={virtual ? items.length : undefined}
      disabled={item.disabled}
      onMouseEnter={() => onSelect(item.id)}
      onFocus={() => onSelect(item.id)}
      onClick={() => onExecute(item.id)}
    >
      <span className="lumen-command-leading" aria-hidden="true">
        {item.icon ? <LumenIcon icon={item.icon} tier="md" /> : <CommandGlyph name="command" />}
      </span>
      <span className="lumen-command-copy">
        <LumenText as="strong" variant="label">
          {item.label}
        </LumenText>
        {item.description && (
          <LumenText as="small" tone="muted" variant="supporting">
            {item.description}
          </LumenText>
        )}
      </span>
      {item.shortcut && <kbd>{item.shortcut}</kbd>}
      {item.navigates && <CommandGlyph name="navigate" />}
    </LumenButton>
  )

  return (
    <section {...lumenPartProps("command-list")} className="lumen-command-list" data-list-strategy={listStrategy} aria-label={labels.available}>
      {breadcrumbPosition === 'before-query' && breadcrumb}
      {!hideQuery && (
        <LumenCommandQuery
          labels={labels}
          items={items}
          query={query}
          selectedId={selectedId}
          onQueryChange={onQueryChange}
          onMove={onMove}
          onSelect={onSelect}
          onExecute={onExecute}
          inputRef={inputRef}
          inputId={inputId}
          inputRole={inputRole}
          onBack={onBack}
          shortcutExecution={shortcutExecution}
        />
      )}
      {breadcrumbPosition === 'after-query' && breadcrumb}
      {selectionLost ? (
        <LumenText as="p" tone="warning" role="status">
          {labels.unavailable}
        </LumenText>
      ) : null}
      <div ref={viewport} id={listId} role="listbox" aria-label={labels.available} className="lumen-command-options">
        {items.length === 0 ? (
          <LumenText as="p" tone="muted">
            {labels.empty}
          </LumenText>
        ) : (
          <>
            {virtual && <div aria-hidden="true" className="lumen-command-spacer" style={{ blockSize: leading }} />}
            {groups.map((group) => (
              <div
                key={group.key}
                className="lumen-command-group"
                role={group.label ? 'group' : undefined}
                aria-label={group.label}
              >
                {!virtual && group.label && <p className="lumen-command-group-label">{group.label}</p>}
                {group.rows.map(({ index, key }) => {
                  const item = items[index]
                  return item ? (
                    virtual ? (
                      <div
                        key={key}
                        data-index={index}
                        ref={virtualizer.measureElement}
                        className="lumen-command-virtual-row"
                      >
                        {item.group && items[index - 1]?.group !== item.group && (
                          <p className="lumen-command-group-label">{item.group}</p>
                        )}
                        {option(item, index)}
                      </div>
                    ) : (
                      option(item, index)
                    )
                  ) : null
                })}
              </div>
            ))}
            {virtual && <div aria-hidden="true" className="lumen-command-spacer" style={{ blockSize: trailing }} />}
          </>
        )}
      </div>
      {error ? (
        <LumenText as="p" tone="danger" role="alert">
          {error}
        </LumenText>
      ) : null}
      {hints ? (
        <LumenCommandFooter hints={hints} />
      ) : (
        <footer>
          <span>
            <kbd>{labels.navigateKeys}</kbd>
            {labels.navigate}
          </span>
          <span>
            <kbd>{labels.executeKey}</kbd>
            {labels.execute}
          </span>
          <span>
            <kbd>{labels.closeKey}</kbd>
            {labels.close}
          </span>
          <small>{labels.count(items.length)}</small>
        </footer>
      )}
    </section>
  )
}

export interface LumenCommandDialogProps extends LumenCommandListProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
}

export function LumenCommandDialog({ open, title, onClose, ...content }: LumenCommandDialogProps) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <LumenDialog
      open={open}
      title={title}
      closeLabel={content.labels.close}
      onClose={onClose}
      initialFocus={input}
      className="lumen-command-dialog"
      chromeless
    >
      <LumenCommandList {...content} inputRef={input} />
    </LumenDialog>
  )
}
