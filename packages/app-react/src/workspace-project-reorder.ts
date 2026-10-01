import { useRef, useState, type DragEvent, type MouseEvent } from 'react'
import './workspace-project-reorder.css'

type Placement = 'before' | 'after'
type DragSource = { readonly id: string; readonly order: readonly string[] }

/** Ephemeral browser gesture state only; Runtime owns the confirmed project order. */
export function useWorkspaceProjectReorder({
  enabled,
  workspaceIds,
  pinnedIds,
  onMove,
}: {
  readonly enabled: boolean
  readonly workspaceIds: readonly string[]
  readonly pinnedIds: readonly string[]
  readonly onMove: (sourceId: string, targetId: string, placement: Placement, expectedOrder: readonly string[]) => void
}) {
  const source = useRef<DragSource | null>(null)
  const suppressClickUntil = useRef(0)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [target, setTarget] = useState<{ id: string; placement: Placement } | null>(null)
  const clear = () => {
    source.current = null
    setDraggingId(null)
    setTarget(null)
  }
  const accepts = (id: string) =>
    enabled &&
    source.current !== null &&
    source.current.id !== id &&
    pinnedIds.includes(source.current.id) === pinnedIds.includes(id) &&
    workspaceIds.includes(id)
  const placement = (event: DragEvent<HTMLElement>): Placement => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY <= bounds.top + bounds.height / 2 ? 'before' : 'after'
  }
  return {
    sectionProps(id: string) {
      return {
        'data-project-dragging': enabled && draggingId === id ? 'true' : undefined,
        'data-project-drop': enabled && target?.id === id ? target.placement : undefined,
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (!accepts(id)) {
            setTarget(null)
            return
          }
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setTarget({ id, placement: placement(event) })
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
            setTarget((current) => (current?.id === id ? null : current))
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          if (!accepts(id) || !source.current) {
            clear()
            return
          }
          event.preventDefault()
          onMove(source.current.id, id, placement(event), source.current.order)
          clear()
        },
      }
    },
    handleProps(id: string) {
      return {
        draggable: enabled,
        onDragStart: (event: DragEvent<HTMLElement>) => {
          if (!enabled) {
            event.preventDefault()
            return
          }
          source.current = { id, order: [...workspaceIds] }
          setDraggingId(id)
          suppressClickUntil.current = Infinity
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', id)
        },
        onDragEnd: () => {
          suppressClickUntil.current = Date.now() + 250
          clear()
        },
        onClickCapture: (event: MouseEvent<HTMLElement>) => {
          if (Date.now() <= suppressClickUntil.current) {
            event.preventDefault()
            event.stopPropagation()
          }
        },
      }
    },
  }
}
