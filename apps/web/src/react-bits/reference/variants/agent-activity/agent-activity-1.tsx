import { useState } from 'react'
import { Square } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-1. */
export default function AgentActivity1(props: ReferenceFixtureProps) {
  const [stopped, setStopped] = useState(false)
  // The public preview uses a live elapsed label.  Freeze the observed value
  // per capture viewport so screenshot comparisons remain deterministic.
  const elapsed = props.viewport === 'mobile' ? '15.9s' : props.viewport === 'tablet' ? '14.0s' : '12.2s'
  const currentElapsed = props.viewport === 'mobile' ? '5.5s' : props.viewport === 'tablet' ? '3.6s' : '1.8s'
  const steps = [
    ['Loaded October general ledger', '0.4s', 'done'],
    ['Pulled bank statement export', '1.3s', 'done'],
    ['Normalised 1,284 transactions', '2.1s', 'done'],
    ['Split multi-currency lines', '1.7s', 'done'],
    ['Matched transactions to ledger', '3.6s', 'done'],
    ['Flagged 12 unmatched entries', '0.8s', 'done'],
    ['Grouped duplicates by reference', '0.5s', 'done'],
    ['Reconciling flagged entries', currentElapsed, 'current'],
    ['Resolve foreign-exchange rounding', '-', 'pending'],
    ['Post adjustments to the ledger', '-', 'pending'],
    ['Generate the reconciliation report', '-', 'pending'],
    ['Archive the reconciliation run', '-', 'pending'],
    ['Notify the finance team', '-', 'pending'],
  ] as const

  return <div className={`rb-public-activity-1${stopped ? ' is-stopped' : ''}`} onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-activity-1-header">
      <div>
        <h2>Reconcile October invoices</h2>
        <p><span className="rb-public-activity-1-status-dot" />{stopped ? 'Stopped' : 'Running'}<span aria-hidden="true">·</span><span>{elapsed}</span></p>
      </div>
      <button type="button" className="rb-public-activity-1-stop" onClick={() => setStopped(true)} disabled={stopped}>
        <Square size={14} strokeWidth={1.5} />
        <span>{stopped ? 'Stopped' : 'Stop'}</span>
      </button>
    </header>
    <div className="rb-public-activity-1-frame">
      <div className="rb-public-activity-1-inner">
        <div className="rb-public-activity-1-content">
          <ol>
            {steps.map(([title, time, state]) => <li className={`state-${state}`} key={title}>
              <span className="rb-public-activity-1-marker" aria-hidden="true" />
              <span className="rb-public-activity-1-label">{title}</span>
              <span className="rb-public-activity-1-time">{time}</span>
            </li>)}
          </ol>
        </div>
      </div>
    </div>
  </div>
}
