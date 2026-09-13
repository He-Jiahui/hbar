import type { ReferenceFixtureProps } from '../../reference-types'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './support-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/support/support-5. */
export default function Support5(props: ReferenceFixtureProps) {
  const [tab, setTab] = useState<'All' | 'Open' | 'Resolved'>('All')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>()
  const tickets = [
    ['#4192', 'Scheduled export is empty', 'Reports and exports', 'Sofia Alvarez', '4 replies', 'Waiting on you', '22m ago'],
    ['#4188', 'SAML metadata upload fails validation', 'Accounts and access', 'Marcus Bell', '7 replies', 'Open', '3h ago'],
    ['#4171', 'Two invoices issued for March', 'Billing and plans', 'Wei Chen', '2 replies', 'Open', 'Yesterday'],
    ['#4150', 'Webhook retries stop after one failure', 'Integrations', 'Sofia Alvarez', '11 replies', 'Resolved', '4 Aug'],
    ['#4133', 'Seat count did not drop after removing a user', 'Billing and plans', 'Amelia Whitfield', '3 replies', 'Resolved', '1 Aug'],
    ['#4110', 'Dashboard filter resets between tabs', 'Dashboards', 'Marcus Bell', '5 replies', 'Resolved', '28 Jul'],
  ] as const
  const visible = tickets.filter((ticket) => {
    if (tab === 'Open' && ticket[5] === 'Resolved') return false
    if (tab === 'Resolved' && ticket[5] !== 'Resolved') return false
    if (query && !ticket.join(' ').toLowerCase().includes(query.toLowerCase())) return false
    return true
  })
  return <section className="rb-public-support-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <div className="rb-support-5-shell">
      <header className="rb-support-5-header"><div><h2>Your requests</h2><p>3 open · 1 waiting on your reply</p></div><button type="button" className="rb-support-5-new"><Plus size={14} />New request</button></header>
      <div className="rb-support-5-toolbar"><div className="rb-support-5-tabs">{(['All', 'Open', 'Resolved'] as const).map((value) => <button type="button" key={value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{value}</button>)}</div><label className="rb-support-5-search"><Search size={14} /><span className="sr-only">Search your requests</span><input aria-label="Search by subject or number" placeholder="Search by subject or number" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      <div className="rb-support-5-table"><div className="rb-support-5-columns"><span>TICKET</span><span>SUBJECT</span><span>STATUS</span><span>UPDATED</span></div><ul>{visible.map((ticket) => <li key={ticket[0]}><button type="button" className={selected === ticket[0] ? 'selected' : ''} onClick={() => setSelected(selected === ticket[0] ? undefined : ticket[0])}><span className="ticket-id">{ticket[0]}</span><span className="ticket-subject"><strong>{ticket[1]}</strong><small>{ticket[2]} · {ticket[3]} · {ticket[4]}</small></span><span className={`ticket-status status-${ticket[5].toLowerCase().replaceAll(' ', '-')}`}>{ticket[5]}</span><span className="ticket-updated">{ticket[6]}</span><ChevronRight className="ticket-arrow" size={14} /></button></li>)}</ul></div>
      <p className="rb-support-5-footnote">Resolved requests stay readable for 12 months. Replying to one reopens it.</p>
      <button type="button" className="rb-support-5-theme">◉&nbsp; Theme</button>
    </div>
  </section>
}
