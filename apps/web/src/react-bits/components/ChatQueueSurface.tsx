import { useState } from 'react'
import type { Run } from '@hbar/contracts'
import GlassSurface from '../GlassSurface'
import { referenceAttributes } from '../production'

export interface ChatQueueSurfaceLabels {
  readonly queueAria: string
  readonly queueCount: string
  readonly queueAutoSend: string
  readonly queueContinue: string
  readonly editQueued: string
  readonly removeQueued: string
  readonly edit: string
  readonly remove: string
  readonly attachmentMessage: string
}

export interface ChatQueueSurfaceProps {
  readonly runs: readonly Run[]
  readonly activeRun?: Run | undefined
  readonly labels: ChatQueueSurfaceLabels
  onStopActive(): void
  onEdit(run: Run): void
  onRemove(run: Run): void
  onReorder(runIds: string[]): void
}

/**
 * ReactBits agent-activity queue surface. Drag/reorder state is local to the
 * visual component; the adapter owns the real run cancellation/reorder RPCs.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-6
 */
export default function ChatQueueSurface({
  runs,
  activeRun,
  labels,
  onStopActive,
  onEdit,
  onRemove,
  onReorder,
}: ChatQueueSurfaceProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  if (!runs.length) return null
  return (
    <section
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-6', 'activity')}
      className="queue-panel rb-queue-surface"
      aria-label={labels.queueAria}
    >
      <GlassSurface className="queue-glass" width="100%" height="100%" aria-hidden="true" />
      <header className="queue-panel-heading">
        <div>
          <strong>{runs.length} {labels.queueCount}</strong>
          <small>{labels.queueAutoSend}</small>
        </div>
        {activeRun && (
          <button type="button" className="queue-continue" onClick={onStopActive}>
            {labels.queueContinue}
          </button>
        )}
      </header>
      <ol className="queue-list">
        {runs.map((run, index) => (
          <li
            key={run.id}
            draggable
            className={`queue-item ${dragOverId === run.id ? 'drag-over' : ''}`}
            onDragStart={() => setDraggedId(run.id)}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOverId(run.id)
            }}
            onDragEnd={() => {
              setDraggedId(null)
              setDragOverId(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!draggedId || draggedId === run.id) return
              const ids = runs.map((item) => item.id).filter((id) => id !== draggedId)
              const targetIndex = ids.indexOf(run.id)
              ids.splice(Math.max(0, targetIndex), 0, draggedId)
              onReorder(ids)
              setDraggedId(null)
              setDragOverId(null)
            }}
          >
            <span className="queue-item-index">{index + 1}</span>
            <span className="queue-item-grip" aria-hidden="true">⋮⋮</span>
            <span className="queue-item-text">{run.input.text || labels.attachmentMessage}</span>
            <div className="queue-item-actions">
              <button type="button" title={labels.editQueued} aria-label={labels.editQueued} onClick={() => onEdit(run)}>
                {labels.edit}
              </button>
              <button type="button" title={labels.removeQueued} aria-label={labels.removeQueued} onClick={() => onRemove(run)}>
                {labels.remove}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
