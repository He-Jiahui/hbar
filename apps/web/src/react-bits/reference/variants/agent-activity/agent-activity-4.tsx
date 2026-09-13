import { RotateCcw } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-4.css'

const runs = [
  ['Reconcile October invoices', 'Succeeded', '24.1s', '$0.42', '12m ago'],
  ['Sync Northwind CRM accounts', 'Succeeded', '1m 18s', '$1.85', '46m ago'],
  ['Refresh churn model features', 'Failed', '8.3s', '$0.11', '1h ago'],
  ['Export weekly board metrics', 'Succeeded', '42.7s', '$0.63', '2h ago'],
  ['Deduplicate contact records', 'Cancelled', '5.0s', '—', '3h ago'],
  ['Backfill subscription events', 'Succeeded', '3m 04s', '$2.40', '5h ago'],
  ['Retag support conversations', 'Succeeded', '58.9s', '$0.71', '6h ago'],
  ['Generate quarterly revenue summary for the finance leadership review', 'Succeeded', '1m 02s', '$0.94', '9h ago'],
  ['Rotate warehouse credentials', 'Failed', '2.1s', '$0.03', '11h ago'],
  ['Import marketing leads', 'Cancelled', '14.6s', '—', '14h ago'],
  ['Reindex the product catalogue', 'Succeeded', '2m 41s', '$1.12', '18h ago'],
  ['Recompute account health scores', 'Succeeded', '47.5s', '$0.55', '1d ago'],
  ['Summarise overnight support volume', 'Succeeded', '31.2s', '$0.38', '1d ago'],
  ['Prune stale vector embeddings', 'Cancelled', '9.4s', '—', '2d ago'],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-4. */
export default function AgentActivity4({ onInteraction }: ReferenceFixtureProps) {
  return (
    <main className="rb-public-activity-4" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
      <header>
        <h2>
          Run history <small>14 runs</small>
        </h2>
        <span>⌄</span>
      </header>
      <section>
        <div className="head">
          <span>Run</span>
          <span>Status</span>
          <span>Duration</span>
          <span>Cost</span>
          <span>Started</span>
        </div>
        {runs.map(([name, status, duration, cost, started]) => (
          <div className="row" key={name}>
            <strong>{name}</strong>
            <span className={`status ${status.toLowerCase()}`}>
              <i />
              {status}
            </span>
            <span>{duration}</span>
            <span>{cost}</span>
            <span>{started}</span>
            <button type="button" aria-label={`Rerun ${name}`}>
              <RotateCcw size={13} />
            </button>
          </div>
        ))}
        <ul className="rb-activity-4-mobile-runs">
          {runs.map(([name, status, duration, cost, started]) => (
            <li key={name}>
              <div className="rb-activity-4-mobile-head">
                <strong>{name}</strong>
                <button type="button" aria-label={`Rerun ${name}`}>
                  <RotateCcw size={13} />
                </button>
              </div>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`status ${status.toLowerCase()}`}>
                      <i />
                      {status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{duration}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{cost}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{started}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
