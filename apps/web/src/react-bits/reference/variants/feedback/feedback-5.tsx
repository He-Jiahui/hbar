import type { ReferenceFixtureProps } from '../../reference-types'
import { Archive, ArrowUpRight, Mail, MessageSquare, MoreHorizontal, Plus, Tag, UserRound } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './feedback-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/feedback/feedback-5. */
export default function Feedback5(props: ReferenceFixtureProps) {
  const [selected, setSelected] = useState(0)
  const [archived, setArchived] = useState(false)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const items = [
    ['Amelia Whitfield', '12m', 'Export silently drops the last column', 'Halcyon Pay', 'AW'],
    ['Jonas Vikander', '1h', 'Saved views replaced our spreadsheet', 'Meridian', 'JV'],
    ['Wei Chen', '3h', 'Can we get SSO on the Pro plan?', 'Acme', 'WC'],
    ['Tomás Guerrero', 'Yesterday', 'Filter resets when I switch tabs', 'Lumendesk', 'TG'],
    ['Priya Nandakumar', 'Yesterday', 'Board view slows down past 200 rows', 'Northwind', 'PN'],
    ['Marcus Bell', '2d', 'Invite emails keep landing in spam', 'Meridian', 'MB'],
    ['Sofia Alvarez', '3d', 'Onboarding tour skips the part I needed', 'Orbital', 'SA'],
  ] as const
  const current = items[selected] ?? items[0]
  return <section className="rb-public-feedback-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-feedback-5-heading"><div><h2>Feedback inbox</h2><p>2 unread · 42 this week</p></div><button type="button" onClick={() => setArchived(true)}><Archive size={14} />{archived ? 'Archived' : 'Archive read'}</button></header>
    <div className="rb-feedback-5-frame"><aside className="rb-feedback-5-list"><ul>{items.map((item, index) => <li key={item[0]}><button type="button" className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)}><div><span className={index < 2 ? 'unread' : ''}>{index < 2 ? '•' : ''}</span><strong>{item[0]}</strong><time>{item[1]}</time></div><p>{item[2]}</p><small>{index % 3 === 0 ? <MessageSquare size={11} /> : index % 3 === 1 ? <UserRound size={11} /> : <Mail size={11} />}{item[3]}</small></button></li>)}</ul></aside>
      <article className="rb-feedback-5-detail"><header><span className="rb-feedback-5-person">{current[4]}</span><div><h3>{current[0]}</h3><p>{current[3]} · /reports/revenue · {current[1]} ago</p></div><span className="rb-feedback-5-sentiment">Negative</span></header><h2>{current[2]}</h2><p className="rb-feedback-5-description">Running the Monday revenue export drops the final column about one time in five. It is always the last one, whatever it happens to be. We only noticed because a total stopped matching the invoice run.</p><div className="rb-feedback-5-tags"><span><Tag size={11} />Exports</span><span><Tag size={11} />Data loss</span><button type="button"><Plus size={11} />Add tag</button></div><dl className="rb-feedback-5-metrics"><div><dt>PLAN</dt><dd>Pro</dd></div><div><dt>SEATS</dt><dd>42 of 50</dd></div><div><dt>ACCOUNT AGE</dt><dd>2y 3m</dd></div><div><dt>PAST FEEDBACK</dt><dd>9 notes</dd></div></dl><section className="rb-feedback-5-others"><h3>Others said the same thing</h3><p>The CSV export loses a column now and then.<span>R. Okafor</span></p><p>Export ran twice and produced different totals.<span>L. Fontaine</span></p></section><textarea aria-label="Add an internal note for the team" placeholder="Add an internal note for the team" value={note} onChange={(event) => setNote(event.target.value)} /><footer><button type="button" className="primary" onClick={() => setSent(true)}>{sent ? 'Replied' : 'Reply'}</button><button type="button" onClick={() => setSent(true)}><ArrowUpRight size={13} />Create issue</button><button type="button" onClick={() => setArchived(true)}>Archive</button></footer></article></div><button type="button" className="rb-feedback-5-theme"><span>◉</span> Theme</button><button className="rb-feedback-5-more" type="button" aria-label="More actions"><MoreHorizontal size={15} /></button>
  </section>
}
