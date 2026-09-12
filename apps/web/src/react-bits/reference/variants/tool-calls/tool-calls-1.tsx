import { useState } from 'react'
import { ChevronDown, ChevronRight, Palette, Square } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-1. */
export default function ToolCalls1(props: ReferenceFixtureProps) {
  const [expanded, setExpanded] = useState(true)
  const rows = [
    ['read_file', '38ms', 'Done', 'done'],
    ['grep', '112ms', 'Done', 'done'],
    ['list_dir', '12ms', 'Done', 'done'],
    ['read_file', '41ms', 'Done', 'done'],
    ['run_tests', '2.30s', 'Failed', 'failed'],
    ['read_deploys', '88ms', 'Done', 'done'],
    ['git_blame', '64ms', 'Done', 'done'],
    ['fetch_dashboard', '210ms', 'Done', 'done'],
    ['read_config', '22ms', 'Done', 'done'],
    ['query_logs', '173ms', 'Done', 'done'],
    ['list_owners', '—', 'Running', 'running'],
  ] as const
  return <div className="rb-public-tool-calls-1" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-tool-calls-1-header"><h2>Tool calls</h2><button type="button" className="rb-public-tool-calls-1-stop"><Square size={14} strokeWidth={1.5} /> Stop</button></header>
    <div className="rb-public-tool-calls-1-frame"><div className="rb-public-tool-calls-1-inner">
      <div className="rb-public-tool-calls-1-list">
        {rows.map(([name, duration, status, tone]) => <div className="rb-public-tool-calls-1-row" key={`${name}-${duration}`}><button type="button" className="rb-public-tool-calls-1-row-button"><span className="rb-public-tool-calls-1-chevron"><ChevronRight size={14} /></span><span className="rb-public-tool-calls-1-command">{name}</span><span className="rb-public-tool-calls-1-duration">{duration}</span><span className={`rb-public-tool-calls-1-status ${tone}`}><i />{status}</span></button></div>)}
        <div className={`rb-public-tool-calls-1-row rb-public-tool-calls-1-expanded${expanded ? ' is-expanded' : ''}`}><button type="button" className="rb-public-tool-calls-1-row-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span className="rb-public-tool-calls-1-chevron">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span><span className="rb-public-tool-calls-1-command">search_incidents</span><span className="rb-public-tool-calls-1-duration">—</span><span className="rb-public-tool-calls-1-status running"><i />Streaming</span></button>{expanded && <div className="rb-public-tool-calls-1-detail"><div className="rb-public-tool-calls-1-meta"><span>Started&nbsp; <strong>14:08:30.118</strong></span><span>Duration&nbsp; —</span></div><small>ARGUMENTS</small><pre>{`{\n  "workspace": "northstar-prod",\n  "query": "open incidents touching `}</pre></div>}</div>
      </div>
    </div></div>
    <button type="button" className="rb-public-tool-calls-1-theme"><Palette size={14} /> Theme</button>
  </div>
}
