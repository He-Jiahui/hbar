import { ChevronDown, Download, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import { DATA_TABLE_PREVIEWS } from '../../reference-preview-data'
import './data-table-1.css'

const config = DATA_TABLE_PREVIEWS['data-table-1']!
const plans = ['All plans', 'Enterprise', 'Scale', 'Growth'] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/data-table/data-table-1. */
export default function DataTable1({ onInteraction }: ReferenceFixtureProps) {
  const [query, setQuery] = useState('')
  const [plan, setPlan] = useState<(typeof plans)[number]>('All plans')
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [theme, setTheme] = useState(false)
  const filteredRows = useMemo(() => config.rows.filter((row) => {
    const matchesQuery = `${row.account} ${row.owner} ${row.region} ${row.plan} ${row.status}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (plan === 'All plans' || row.plan === plan)
  }), [plan, query])
  return <div className={`rb-public-data-table-1${theme ? ' light' : ''}`} onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><h2>Accounts</h2><button type="button" className="export" onClick={() => undefined}><Download size={16} /> Export</button></header>
    <div className="toolbar"><label className="search"><Search size={16} /><input aria-label="Search accounts" placeholder="Search accounts" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="plan-filters">{plans.map((item) => <button type="button" key={item} className={plan === item ? 'selected' : ''} onClick={() => setPlan(item)}>{item}</button>)}</div><div className="columns"><button type="button" aria-label="Columns" onClick={() => setColumnsOpen((value) => !value)}><SlidersHorizontal size={16} /><span>Columns</span><ChevronDown size={15} /></button>{columnsOpen && <div role="menu"><span>Account</span><span>Owner</span><span>Plan</span><span>Status</span></div>}</div></div>
    <div className="table-wrap"><table><colgroup><col className="account" /><col className="owner" /><col className="plan" /><col className="status" /><col className="region" /><col className="mrr" /><col className="renewal" /></colgroup><thead><tr><th>Account</th><th>Owner</th><th>Plan</th><th>Status</th><th>Region</th><th className="sorted"><button type="button" aria-label="MRR sorted"><ChevronDown size={11} /> MRR</button></th><th>Renewal</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.account}><td><span>{row.account}</span></td><td>{row.owner}</td><td>{row.plan}</td><td><span className={`status ${row.status === 'Needs review' ? 'review' : row.status === 'Paused' ? 'paused' : ''}`}><i />{row.status}</span></td><td>{row.region}</td><td className="money">{row.mrr}</td><td>{row.renewal}</td></tr>)}</tbody></table><div className="mobile-cards">{filteredRows.map((row) => <article key={row.account}><div><strong>{row.account}</strong><b>{row.mrr}</b></div><div><span className={`status ${row.status === 'Needs review' ? 'review' : row.status === 'Paused' ? 'paused' : ''}`}><i />{row.status}</span><small>{row.plan} · Renews {row.renewal}</small></div></article>)}</div></div>
    <footer>Showing {filteredRows.length} of {config.rows.length} accounts</footer>
    <button type="button" className="theme" aria-label="Theme" onClick={() => setTheme((value) => !value)}>◉&nbsp; Theme</button>
  </div>
}
