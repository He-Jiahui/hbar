import type { ReferenceFixtureProps } from '../../reference-types'
import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './empty-state-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/empty-state/empty-state-2. */
export default function EmptyState2(props: ReferenceFixtureProps) {
  const [query, setQuery] = useState('quaterly revenu')
  const [filters, setFilters] = useState(['Owner Priya Nandakumar', 'Status Archived', 'Created Last 7 days', 'Tag Finance'])
  const results = [['quarterly revenue', '46'], ['revenue by region', '12'], ['revenue forecast', '8']]
  return <section className="rb-public-empty-2" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-empty-2-shell"><label className="rb-empty-2-search"><Search size={16} /><input aria-label="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="rb-empty-2-filters">{filters.map((filter) => <span key={filter}>{filter}<button type="button" aria-label={`Remove ${filter.split(' ')[0]} filter`} onClick={() => setFilters((value) => value.filter((item) => item !== filter))}><X size={13} /></button></span>)}</div><button type="button" className="rb-empty-2-clear" onClick={() => setFilters([])}>Clear all</button><article className="rb-empty-2-card"><div className="rb-empty-2-icon"><Search size={17} /></div><h2>No reports match “{query}”</h2><p>{filters.length} filters are narrowing this search. Removing one usually<br /> brings results back.</p><ul>{results.map(([name, count]) => <li key={name}><button type="button"><Search size={14} /><strong>{name}</strong><span>{count}</span></button></li>)}</ul></article><p className="rb-empty-2-footer">Searches cover report titles, descriptions and column names.</p></div></section>
}
