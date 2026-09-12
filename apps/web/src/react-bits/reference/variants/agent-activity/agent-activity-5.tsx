import { useState } from 'react'
import { Palette, Square } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-5. */
export default function AgentActivity5(props: ReferenceFixtureProps) {
  const [filter, setFilter] = useState<'All' | 'Info' | 'Warnings' | 'Errors'>('All')
  const [stopped, setStopped] = useState(false)
  const rows = [
    ['0:02.9', 'Connector lumendesk queued 318 tickets', 'muted'],
    ['0:03.7', 'Fetching postgres batch 1 of 3', 'info'],
    ['0:04.5', 'Fetched 512 rows in 0.8s', 'info'],
    ['0:05.2', 'Rate limit hit on halcyon, backing off 2s', 'warning'],
    ['0:07.3', 'Resumed halcyon after backoff', 'info'],
    ['0:08.0', 'Fetched 642 halcyon records', 'info'],
    ['0:08.8', 'Transforming records to the canonical schema', 'info'],
    ['0:09.6', 'Dropped 14 rows that failed validation', 'info'],
    ['0:10.4', 'Missing owner on 6 accounts, defaulting to unassigned', 'info'],
    ['0:11.2', 'Writing batch to the warehouse', 'info'],
    ['0:12.0', 'Write to reporting.accounts timed out after 30s', 'error'],
    ['0:12.4', 'Retrying write with a smaller batch size', 'info'],
    ['0:13.9', 'Write succeeded on retry', 'info'],
    ['0:14.6', 'Indexed 2,244 documents', 'info'],
    ['0:15.3', 'Building embeddings for 318 tickets', 'info'],
    ['0:17.1', 'Embeddings complete', 'info'],
    ['0:17.8', 'Refreshing materialised views', 'info'],
    ['0:18.5', 'View account_health refreshed', 'info'],
    ['0:19.2', 'View revenue_daily refreshed', 'info'],
    ['0:19.9', 'Verifying row counts against the sources', 'info'],
    ['0:20.6', 'Row counts match across 3 connectors', 'info'],
    ['0:21.3', 'Waiting for the next scheduled source', 'muted'],
  ] as const
  const visibleRows = filter === 'All' ? rows : rows.filter(([, , tone]) => filter === 'Warnings' ? tone === 'warning' : filter === 'Errors' ? tone === 'error' : tone === 'info')
  return <div className="rb-public-activity-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-activity-5-header">
      <div className="rb-public-activity-5-title"><span className="rb-public-activity-5-title-dot" aria-hidden="true" /><h2>Run log</h2></div>
      <div className="rb-public-activity-5-actions">
        <div className="rb-public-activity-5-filters" role="tablist" aria-label="Log severity">
          {(['All', 'Info', 'Warnings', 'Errors'] as const).map((item) => <button type="button" role="tab" aria-selected={filter === item} className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="rb-public-activity-5-stop-slot"><button type="button" className="rb-public-activity-5-stop" onClick={() => setStopped(true)} disabled={stopped}><Square size={14} strokeWidth={1.5} /> <span>{stopped ? 'Stopped' : 'Stop'}</span></button></div>
      </div>
    </header>
    <div className="rb-public-activity-5-frame">
      <div className="rb-public-activity-5-inner">
        <div className="rb-public-activity-5-content">
          <ol aria-live="polite">
            {visibleRows.map(([time, message, tone]) => <li className={`tone-${tone}`} key={`${time}-${message}`}><span className="rb-public-activity-5-time">{time}</span><span className="rb-public-activity-5-marker" aria-hidden="true" /><span className="rb-public-activity-5-message">{message}</span></li>)}
          </ol>
        </div>
      </div>
    </div>
    <button type="button" className="rb-public-activity-5-theme"><Palette size={14} /> Theme</button>
  </div>
}
