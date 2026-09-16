import { useMemo, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { uniqueItems } from './collection'
import './virtual-list.css'

const ROW_ESTIMATE_REM = 4.5
const OVERSCAN_ROWS = 5
const SERVER_ROOT_FONT_PX = 16

/** A pane-owned, variable-height list. Header/footer belong outside this viewport. */
export function HbarAppUiVirtualList<T extends { readonly id: string }>({
  items,
  label,
  empty,
  renderRow,
  className = '',
}: {
  readonly items: readonly T[]
  readonly label: string
  readonly empty: ReactNode
  readonly renderRow: (item: T) => ReactNode
  readonly className?: string
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => uniqueItems(items), [items])
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    getItemKey: (index) => rows[index]?.id ?? index,
    estimateSize: () =>
      ROW_ESTIMATE_REM *
      (typeof document === 'undefined'
        ? SERVER_ROOT_FONT_PX
        : Number.parseFloat(getComputedStyle(document.documentElement).fontSize)),
    overscan: OVERSCAN_ROWS,
  })
  const visible = virtual.getVirtualItems()
  const leading = visible[0]?.start ?? 0
  const trailing = Math.max(0, virtual.getTotalSize() - (visible.at(-1)?.end ?? 0))
  return (
    <div
      ref={viewport}
      className={`hbar-app-ui-virtual-list ${className}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {rows.length ? (
        <div role="list">
          <div aria-hidden="true" style={{ blockSize: leading }} />
          {visible.map((item) => {
            const row = rows[item.index]
            return row ? (
              <div
                role="listitem"
                aria-posinset={item.index + 1}
                aria-setsize={rows.length}
                key={row.id}
                data-index={item.index}
                ref={virtual.measureElement}
              >
                {renderRow(row)}
              </div>
            ) : null
          })}
          <div aria-hidden="true" style={{ blockSize: trailing }} />
        </div>
      ) : (
        empty
      )}
    </div>
  )
}
