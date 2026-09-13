import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, ChevronUp, MessageCircle, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './feedback-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/feedback/feedback-4. */
export default function Feedback4(props: ReferenceFixtureProps) {
  const [tab, setTab] = useState<'Top' | 'New' | 'Shipped'>('Top')
  const [query, setQuery] = useState('')
  const [votes, setVotes] = useState<Record<string, boolean>>({
    'Dark mode for shared dashboards': true,
    'Schedule exports to a Google Sheet': true,
  })
  const requests = [
    { title: 'Dark mode for shared dashboards', status: 'Shipped', body: 'Our wallboards run overnight in a dim room and the white background is hard to look at for a whole shift.', area: 'Dashboards', count: 41, votes: 342 },
    { title: 'Schedule exports to a Google Sheet', status: 'In progress', body: 'We rebuild the same sheet every Monday. A native destination would remove the last manual step in our reporting.', area: 'Exports', count: 18, votes: 214 },
    { title: 'Row-level permissions on shared views', status: 'Planned', body: 'Contractors should see their own accounts only. Today we duplicate a view per person, which drifts within a week.', area: 'Access', count: 24, votes: 187 },
    { title: 'Webhook retries with a dead letter queue', status: 'Planned', body: 'A five minute outage on our side silently dropped events. We would rather replay them than reconcile by hand.', area: 'Integrations', count: 11, votes: 128 },
    { title: 'Undo a bulk edit', status: 'Under review', body: 'One mis-clicked filter rewrote 4,000 rows. A 30 second undo window would have saved a full afternoon.', area: 'Editing', count: 7, votes: 96 },
  ] as const
  const visible = requests.filter((item) => {
    if (query && !`${item.title} ${item.body} ${item.area}`.toLowerCase().includes(query.toLowerCase())) return false
    if (tab === 'Shipped') return item.status === 'Shipped'
    if (tab === 'New') return item.status !== 'Shipped'
    return true
  })
  return <section className="rb-public-feedback-4" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <div className="rb-feedback-4-shell">
      <header className="rb-feedback-4-header"><div><h2>Feature requests</h2><p>Vote on what you need next. Status changes appear here first.</p></div><button type="button" className="rb-feedback-4-new" onClick={() => setQuery('')}><Plus size={14} />New request</button></header>
      <div className="rb-feedback-4-toolbar"><div className="rb-feedback-4-tabs">{(['Top', 'New', 'Shipped'] as const).map((value) => <button type="button" key={value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{value}</button>)}</div><label className="rb-feedback-4-search"><Search size={14} /><span className="sr-only">Search requests</span><input aria-label="Search requests" placeholder="Search requests" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <div className="rb-feedback-4-list">{visible.map((item) => { const voted = Boolean(votes[item.title]); const count = item.votes + (voted && item.title !== 'Dark mode for shared dashboards' && item.title !== 'Schedule exports to a Google Sheet' ? 1 : 0); return <article className="rb-feedback-4-item" key={item.title}><button type="button" className={`rb-feedback-4-vote${voted ? ' voted' : ''}`} aria-label={`${voted ? 'Remove vote from' : 'Vote for'} ${item.title}`} onClick={() => setVotes((current) => ({ ...current, [item.title]: !current[item.title] }))}><ChevronUp size={13} /><span>{count}</span></button><div className="rb-feedback-4-copy"><div className="rb-feedback-4-title"><h3>{item.title}</h3><span className={`status-${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></div><p>{item.body}</p><div className="rb-feedback-4-meta"><span>{item.area}</span><span><MessageCircle size={12} />{item.count}</span></div></div></article> })}</div>
      <button type="button" className="rb-feedback-4-theme"><Check size={14} />Theme</button>
    </div>
  </section>
}
