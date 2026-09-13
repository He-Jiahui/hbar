import { Square } from 'lucide-react'
import type { Run } from '@hbar/contracts'
import GlassSurface from '../GlassSurface'
import { referenceAttributes } from '../production'

export interface RunOutcomeSurfaceLabels {
  readonly stopped: string
  readonly editAgain: string
}

export interface RunOutcomeSurfaceProps {
  readonly run: Run
  readonly labels: RunOutcomeSurfaceLabels
  onEdit(): void
}

/**
 * Compact terminal run outcome surface, retaining the ReactBits tool-result
 * status treatment and a local recovery action.
 *
 * Reference: https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2
 */
export default function RunOutcomeSurface({ run, labels, onEdit }: RunOutcomeSurfaceProps) {
  const cancelled = run.status === 'cancelled'
  return (
    <div
      {...referenceAttributes('https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2', 'session-chat')}
      className={`run-outcome rb-run-outcome-surface${cancelled ? '' : ' danger'}`}
      data-run-id={run.id}
    >
      <GlassSurface className="run-outcome-glass" width="100%" height="100%" aria-hidden="true" />
      <Square size={12} />
      <span className="run-outcome-copy">{cancelled ? labels.stopped : run.error}</span>
      <button type="button" className="text-command" onClick={onEdit}>
        {labels.editAgain}
      </button>
    </div>
  )
}
