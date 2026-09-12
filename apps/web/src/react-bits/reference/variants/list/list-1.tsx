import { ArrowUpRight, Box, CreditCard, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './list-1.css'

const rows = [['Orders fulfilled', '5,109', '+11.2%', 'Picked, packed and handed to a carrier', Box, 'good'], ['Net revenue', '$374.8k', '+7.8%', 'Gross receipts less discounts and refunds', CreditCard, 'good'], ['Average basket', '$73.36', '−1.4%', 'Net revenue divided by completed orders', RotateCcw, 'bad'], ['Return rate', '4.6%', '+0.5%', 'Orders returned after fulfilment', Undo2, 'bad']] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/list/list-1. */
export default function List1({ onInteraction }: ReferenceFixtureProps) {
  const [range, setRange] = useState('28 days')
  const [selected, setSelected] = useState('')
  return <section className="rb-public-list-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-list-shell"><header><div><h2>Store performance</h2><p>Compared with the preceding period</p></div><nav role="tablist">{['7 days', '28 days', 'Quarter'].map((item) => <button type="button" role="tab" aria-selected={range === item} className={range === item ? 'selected' : ''} key={item} onClick={() => setRange(item)}>{item}</button>)}</nav></header><div className="rb-list-rows">{rows.map(([label, value, delta, detail, Icon, tone]) => <button type="button" className={`rb-list-row ${selected === label ? 'selected' : ''}`} key={label} onClick={() => setSelected(label)}><span className="rb-list-icon"><Icon size={15} /></span><span className="rb-list-copy"><strong>{value} <em className={tone}>{delta}</em></strong><small>{label}</small></span><p>{detail}</p><span className="rb-list-open"><ArrowUpRight size={15} /></span></button>)}</div></div><button type="button" className="rb-list-theme">◉&nbsp; Theme</button></section>
}
