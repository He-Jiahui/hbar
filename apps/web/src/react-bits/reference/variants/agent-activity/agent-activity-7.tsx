import { useState } from 'react'
import { Palette, RotateCcw, Square } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-7.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-7. */
export default function AgentActivity7(props: ReferenceFixtureProps) {
  const [retried, setRetried] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const inputs = [['Trigger', 'Scheduled'], ['Dataset', 'reporting.ledger'], ['Model', 'Atlas Pro'], ['Started', 'Today at 06:00'], ['Requested by', 'Automation']] as const
  const attempts = [['Attempt 1', 'Timed out writing 2,244 rows', '12.0s'], ['Attempt 2', 'Timed out writing 1,536 rows', '30.0s']] as const
  return <div className={`rb-public-activity-7${retried ? ' is-retried' : ''}`} onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-activity-7-header">
      <div>
        <h2>Export October ledger</h2>
        <p><span className="rb-public-activity-7-status-dot" />{retried ? 'Queued' : 'Failed'}<span aria-hidden="true">·</span><span>{retried ? '0.0s' : '42.1s'}</span></p>
      </div>
      <button type="button" className="rb-public-activity-7-view" onClick={() => setShowLog((value) => !value)}>{showLog ? 'Hide log' : 'View log'}</button>
    </header>
    {showLog ? <div className="rb-public-activity-7-log"><strong>Run log</strong><pre>0:12.0 Write to reporting.accounts timed out after 30s{`\n`}0:12.4 Retrying write with a smaller batch size</pre></div> : <>
      <section className="rb-public-activity-7-error-group">
        <div className="rb-public-activity-7-card rb-public-activity-7-error-card"><div className="rb-public-activity-7-error-title"><span className="rb-public-activity-7-error-dot" /> <strong>{retried ? 'Retry queued' : 'Warehouse write timed out'}</strong></div><p>{retried ? 'The run will resume when the warehouse is available.' : 'Two attempts exceeded the 30s write limit. Retry off-peak or lower the batch size before running again.'}</p></div>
        <div className="rb-public-activity-7-card rb-public-activity-7-retry-row"><button type="button" className="rb-public-activity-7-retry" onClick={() => setRetried(true)} disabled={retried}><RotateCcw size={14} /> Retry run</button></div>
      </section>
      <section className="rb-public-activity-7-section"><h3>Inputs</h3><div className="rb-public-activity-7-table">{inputs.map(([label, value]) => <div className="rb-public-activity-7-table-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
      <section className="rb-public-activity-7-section"><h3>Attempts</h3><div className="rb-public-activity-7-attempts">{attempts.map(([label, value, time]) => <div className="rb-public-activity-7-attempt" key={label}><strong>{label}</strong><span>{value}</span><small>{time}</small></div>)}<p>Reduced the batch size after the first timeout, then stopped to avoid partial writes.</p></div></section>
      <section className="rb-public-activity-7-section rb-public-activity-7-output"><h3>Output</h3><ul><li><div><strong>ledger-partial.csv</strong><small>1,024 of 2,244 rows · 84 KB</small></div><button type="button">Download</button></li><li><div><strong>run.log</strong><small>Full trace · 12 KB</small></div><button type="button">Download</button></li></ul></section>
    </>}
    <button type="button" className="rb-public-activity-7-stop" aria-label="Stop run"><Square size={13} /></button>
    <button type="button" className="rb-public-activity-7-theme"><Palette size={14} /> Theme</button>
  </div>
}
