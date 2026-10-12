import * as React from 'react'
import { ConversationHorizontalScrollMemory } from './conversation-horizontal-scroll'

export function ConversationVirtualMessageRow({
  messageId,
  index,
  count,
  measureElement,
  scrollKey,
  horizontalScrollMemory,
  children,
}: {
  readonly messageId: string
  readonly index: number
  readonly count: number
  readonly measureElement: (element: Element | null) => void
  readonly scrollKey: string
  readonly horizontalScrollMemory: ConversationHorizontalScrollMemory
  readonly children: React.ReactNode
}) {
  const row = React.useRef<HTMLDivElement>(null)
  const setRowRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      row.current = element
      measureElement(element)
    },
    [measureElement],
  )
  React.useLayoutEffect(() => {
    const element = row.current
    if (!element) return undefined
    horizontalScrollMemory.mount(scrollKey, messageId, element)
    return () => horizontalScrollMemory.unmount(scrollKey, messageId, element)
  }, [horizontalScrollMemory, messageId, scrollKey])

  return (
    <div
      ref={setRowRef}
      data-index={index}
      className="lumen-conversation-virtual-row"
      role="listitem"
      aria-posinset={index + 1}
      aria-setsize={count}
      onScrollCapture={(event) =>
        horizontalScrollMemory.capture(scrollKey, messageId, event.currentTarget, event.target)
      }
    >
      {children}
    </div>
  )
}
