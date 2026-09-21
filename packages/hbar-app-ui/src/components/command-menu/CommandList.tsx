import { LumenButton, LumenInput } from '@lumen/app-ui'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Command, Search, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import { HbarAppUiDialog } from '../app-dialog/NativeDialog'
import { uniqueItems } from '../../collection'
import './CommandList.css'

const COMMAND_ROW_ESTIMATE_REM = 4
const COMMAND_OVERSCAN_ROWS = 5
const SERVER_ROOT_FONT_PX = 16

export interface HbarAppUiCommandItem {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly icon?: LucideIcon | undefined
  readonly group?: string | undefined
  readonly shortcut?: string | undefined
  readonly navigates?: boolean | undefined
  readonly disabled?: boolean | undefined
}
export interface HbarAppUiCommandListProps {
  readonly labels: {
    readonly search: string
    readonly available: string
    readonly empty: string
    readonly unavailable: string
    readonly navigate: string
    readonly execute: string
    readonly close: string
    readonly count: (count: number) => string
    readonly navigateKeys: string
    readonly executeKey: string
    readonly closeKey: string
  }
  readonly items: readonly HbarAppUiCommandItem[]
  readonly query: string
  readonly selectedId: string | undefined
  readonly selectionLost: boolean
  readonly onQueryChange: (value: string) => void
  readonly onSelect: (id: string) => void
  readonly onMove: (direction: -1 | 1) => void
  readonly onExecute: (id: string) => void
  readonly listStrategy: 'content-grown' | 'virtual'
  readonly error: string | undefined
  readonly inputRef?: RefObject<HTMLInputElement | null>
  readonly breadcrumb?: ReactNode
}
export function HbarAppUiCommandList(content: HbarAppUiCommandListProps) {
  const listId = useId(),
    viewport = useRef<HTMLDivElement>(null),
    previousQuery = useRef(content.query)
  const items = uniqueItems(content.items)
  const selected = items.find((item) => item.id === content.selectedId)
  const virtual = useVirtualizer({
    count: content.listStrategy === 'virtual' ? items.length : 0,
    getScrollElement: () => viewport.current,
    getItemKey: (index) => items[index]!.id,
    estimateSize: () => {
      const size =
        typeof document === 'undefined'
          ? SERVER_ROOT_FONT_PX
          : Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      return size * COMMAND_ROW_ESTIMATE_REM
    },
    overscan: COMMAND_OVERSCAN_ROWS,
  })
  const selectedIndex = items.findIndex((item) => item.id === content.selectedId)
  useEffect(() => {
    if (content.listStrategy !== 'virtual') return
    if (previousQuery.current !== content.query) {
      previousQuery.current = content.query
      virtual.scrollToOffset(0)
      return
    }
    if (selectedIndex >= 0) virtual.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [content.query, selectedIndex, content.listStrategy, virtual])
  const renderRow = (item: HbarAppUiCommandItem, index: number) => (
    <LumenButton
      type="button"
      role="option"
      id={`${listId}-${encodeURIComponent(item.id)}`}
      key={item.id}
      aria-selected={item.id === selected?.id}
      disabled={item.disabled}
      onMouseEnter={() => content.onSelect(item.id)}
      onClick={() => content.onExecute(item.id)}
      className={item.id === selected?.id ? 'is-selected' : ''}
    >
      <HbarAppUiIcon icon={item.icon ?? Command} tier="md" />
      <span>
        {item.group && items[index - 1]?.group !== item.group && (
          <small className="hbar-app-ui-command-group-name">{item.group}</small>
        )}
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
      </span>
      {item.shortcut && <kbd>{item.shortcut}</kbd>}
      {item.navigates && <HbarAppUiIcon icon={ChevronRight} tier="sm" />}
    </LumenButton>
  )
  const rows = virtual.getVirtualItems(),
    first = rows[0]?.start ?? 0,
    last = rows.at(-1)?.end ?? 0
  return (
    <div className={`hbar-app-ui-controlled-commands is-${content.listStrategy}`}>
      <label className="hbar-app-ui-command-query">
        <HbarAppUiIcon icon={Search} tier="md" />
        <LumenInput
          ref={content.inputRef}
          type="search"
          aria-label={content.labels.search}
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${encodeURIComponent(selected.id)}` : undefined}
          value={content.query}
          placeholder={content.labels.search}
          onChange={(event) => content.onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              content.onMove(event.key === 'ArrowDown' ? 1 : -1)
            } else if (event.key === 'Enter' && selected && !selected.disabled) {
              event.preventDefault()
              content.onExecute(selected.id)
            }
          }}
        />
      </label>
      {content.breadcrumb}
      {content.selectionLost && <p role="status">{content.labels.unavailable}</p>}
      <div
        ref={viewport}
        id={listId}
        role="listbox"
        aria-label={content.labels.available}
        className="hbar-app-ui-command-options"
      >
        {!items.length ? (
          <p>{content.labels.empty}</p>
        ) : content.listStrategy === 'content-grown' ? (
          items.map(renderRow)
        ) : (
          <>
            <div aria-hidden="true" style={{ blockSize: first }} />
            {rows.map((row) => {
              const item = items[row.index]!
              return (
                <div key={item.id} ref={virtual.measureElement} data-index={row.index}>
                  {renderRow(item, row.index)}
                </div>
              )
            })}
            <div aria-hidden="true" style={{ blockSize: Math.max(0, virtual.getTotalSize() - last) }} />
          </>
        )}
      </div>
      {content.error && <p role="alert">{content.error}</p>}
      <footer>
        <span>
          <kbd>{content.labels.navigateKeys}</kbd>
          {content.labels.navigate}
        </span>
        <span>
          <kbd>{content.labels.executeKey}</kbd>
          {content.labels.execute}
        </span>
        <span>
          <kbd>{content.labels.closeKey}</kbd>
          {content.labels.close}
        </span>
        <small>{content.labels.count(items.length)}</small>
      </footer>
    </div>
  )
}
export function HbarAppUiCommandDialog({
  open,
  title,
  onClose,
  ...content
}: HbarAppUiCommandListProps & { readonly open: boolean; readonly title: string; readonly onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <HbarAppUiDialog
      open={open}
      title={title}
      closeLabel={content.labels.close}
      onClose={onClose}
      initialFocus={input}
      className="hbar-app-ui-command-modal"
    >
      <HbarAppUiCommandList {...content} inputRef={input} />
    </HbarAppUiDialog>
  )
}
