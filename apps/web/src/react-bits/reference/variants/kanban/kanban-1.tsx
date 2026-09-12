import { GripVertical, MessageCircle, Paperclip, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './kanban-1.css'

type Card = { id: string; title: string; tag: string; comments?: number; files?: number; avatar: string }
const initial: Record<string, Card[]> = {
  Backlog: [{ id: 'HAL-241', title: 'Retry billing webhooks that fail on timeout', tag: 'Billing', comments: 4, files: 1, avatar: 'AR' }, { id: 'HAL-229', title: 'Deprecate the v1 usage endpoint', tag: 'API', comments: 1, avatar: 'SA' }, { id: 'HAL-214', title: 'Backfill workspace regions for EU tenants', tag: 'Platform', avatar: 'WC' }],
  'In progress': [{ id: 'HAL-238', title: 'Seat count drifts after a downgrade', tag: 'Billing', comments: 2, avatar: 'PN' }, { id: 'HAL-221', title: 'Cache invalidation on role change is slow', tag: 'Platform', comments: 8, avatar: 'MS' }, { id: 'HAL-233', title: 'Add SCIM group mapping to the admin console', tag: 'Identity', comments: 6, files: 2, avatar: 'WC' }],
  'In review': [{ id: 'HAL-236', title: 'Audit log export times out past 90 days', tag: 'Platform', files: 3, avatar: 'MS' }, { id: 'HAL-208', title: 'Rotate signing keys without downtime', tag: 'Identity', comments: 5, files: 1, avatar: 'SA' }],
  Done: [{ id: 'HAL-226', title: 'Rework the empty state on first workspace', tag: 'Growth', comments: 3, files: 1, avatar: 'AR' }, { id: 'HAL-217', title: 'Ship the invoice PDF redesign', tag: 'Billing', comments: 2, files: 4, avatar: 'PN' }],
}

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/kanban/kanban-1. */
export default function Kanban1({ onInteraction }: ReferenceFixtureProps) {
  const [columns, setColumns] = useState(initial)
  const [selected, setSelected] = useState('')
  const moveCard = (id: string, from: string) => { const index = Object.keys(columns).indexOf(from); const to = Object.keys(columns)[Math.min(index + 1, 3)] ?? from; if (to === from) return; const card = columns[from]?.find((item) => item.id === id); if (!card) return; setColumns((current) => ({ ...current, [from]: (current[from] ?? []).filter((item) => item.id !== id), [to]: [...(current[to] ?? []), card] })) }
  return <section className="rb-public-kanban-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><div><h2>Platform board</h2><p>10 open items. Drag a card, or focus one and press space to move it with the arrow keys.</p></div><div className="rb-kanban-people"><i>AR</i><i>PN</i><i>MS</i><i>WC</i></div></header><main className="rb-kanban-board">{Object.entries(columns).map(([column, cards]) => <section className="rb-kanban-column" key={column}><header><h3>{column}</h3><span>{column === 'In progress' ? `${cards.length}/4` : column === 'In review' ? `${cards.length}/3` : cards.length}</span><button type="button" aria-label={`Add card to ${column}`}><Plus size={15} /></button></header><div className="rb-kanban-cards">{cards.map((card) => <button type="button" className={`rb-kanban-card ${selected === card.id ? 'selected' : ''}`} key={card.id} onClick={() => setSelected(card.id)} onDoubleClick={() => moveCard(card.id, column)}><div className="rb-kanban-card-top"><span className="dot" />{card.id}<GripVertical size={14} /></div><strong>{card.title}</strong><footer><span>{card.tag}</span>{card.comments && <small><MessageCircle size={12} /> {card.comments}</small>}{card.files && <small><Paperclip size={12} /> {card.files}</small>}<i>{card.avatar}</i></footer></button>)}</div></section>)}</main><button type="button" className="rb-kanban-theme">◉&nbsp; Theme</button></section>
}
