import { Database, FileSpreadsheet, Plus, PlugZap } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './empty-state-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/empty-state/empty-state-1. */
export default function EmptyState1({ onInteraction }: ReferenceFixtureProps) {
  const [message, setMessage] = useState('')
  const cards = [
    ['Connect a warehouse', 'Postgres, BigQuery or Snowflake. Read-only credentials are enough.', 'ABOUT 2 MINUTES', <PlugZap size={16} />],
    ['Upload a spreadsheet', 'Drop in a CSV and we will infer the column types for you.', 'NO SETUP', <FileSpreadsheet size={16} />],
    ['Load the sample dataset', 'A fictional storefront with 18 months of orders to explore.', 'INSTANT', <Database size={16} />],
  ] as const
  return <section className="rb-public-empty-state-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-empty-shell"><div className="rb-empty-skeleton" aria-hidden="true"><i /><i /><i /><i /></div><div className="rb-empty-copy"><h2>{message || 'Nothing in this workspace yet'}</h2><p>{message ? 'The selected source is ready to build your first chart.' : 'Point Northwind at a source and the first charts build themselves.'}<br />{!message && 'You can change or remove a source at any time.'}</p></div><div className="rb-empty-source-cards">{cards.map(([title, description, hint, icon]) => <button type="button" key={title} onClick={() => setMessage(title)}><span className="rb-empty-card-icon">{icon}</span><strong>{title}</strong><p>{description}</p><small>{hint}</small></button>)}</div><div className="rb-empty-actions"><button type="button" className="primary" onClick={() => setMessage('Add a source')}><Plus size={14} /> Add a source</button><button type="button" onClick={() => setMessage('Read the setup guide')}>Read the setup guide</button></div></div><button type="button" className="rb-empty-theme">◉&nbsp; Theme</button></section>
}
