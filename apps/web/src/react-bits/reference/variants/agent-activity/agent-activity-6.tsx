import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-6. */
export default function AgentActivity6({ onInteraction }: ReferenceFixtureProps) {
  const [approved, setApproved] = useState(false)
  const workers = [
    ['Invoices', 'Reconciling batch 3 of 5', '42', 63, 'running'],
    ['Contacts', 'Merging duplicate records', '18', 35, 'running'],
    ['Documents', approved ? 'Approval received — deleting archived files' : 'Waiting to delete 240 archived files', '-', 0, approved ? 'running' : 'approval'],
    ['Embeddings', 'Indexing 318 support tickets', '96', 82, 'running'],
    ['Metrics', 'Aggregating daily revenue', '63', 48, 'running'],
    ['Exports', 'Waiting for a free slot', '-', 0, 'queued'],
  ] as const

  return <section className="rb-public-activity-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><h1>Import workers</h1><p><strong>4</strong> active <strong>18</strong> queued</p></header>
    <div className="rb-public-activity-6-frame">
      <div className="rb-public-activity-6-inner">
        <ol>
          {workers.map(([name, detail, rate, progress, status]) => <li key={name} className={`is-${status}`}>
            <div className="rb-public-activity-6-row">
              <i aria-hidden="true" />
              <div><strong>{name}</strong><small>{detail}</small></div>
              <aside><b>{rate}</b>{rate !== '-' && <em>/min</em>}<small>{status === 'approval' ? 'Needs approval' : status === 'queued' ? 'Queued' : 'Running'}</small></aside>
            </div>
            {status === 'approval' ? <button type="button" className="rb-public-activity-6-approve" onClick={() => setApproved(true)}>Approve deletion</button> : status === 'running' ? <span className="rb-public-activity-6-progress"><b style={{ width: `${progress}%` }} /></span> : <span className="rb-public-activity-6-progress empty" />}
          </li>)}
        </ol>
      </div>
    </div>
  </section>
}
