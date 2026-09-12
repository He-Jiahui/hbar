import { Activity, Bookmark, Home, Search, SlidersHorizontal, UserRound, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './mobile-1.css'

const updates = [
  ['Northwind renewed for 12 months', 'Deals · 8m ago'],
  ['Weekly summary is ready', 'Reports · 40m ago'],
  ['Cedar Labs opened a ticket', 'Support · 1h ago'],
  ['Payout of $4,120 settled', 'Billing · 3h ago'],
  ['Harbor Coffee added two seats', 'Accounts · 5h ago'],
  ['Two invoices moved to overdue', 'Billing · 6h ago'],
  ['Meridian pilot enters week three', 'Deals · 9h ago'],
] as const
const tabs = [['Home', Home], ['Search', Search], ['Activity', Activity], ['Saved', Bookmark], ['You', UserRound]] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/mobile/mobile-1. */
export default function Mobile1({ onInteraction }: ReferenceFixtureProps) {
  const [active, setActive] = useState('Home')
  const [filtered, setFiltered] = useState(false)
  const [selected, setSelected] = useState<string | undefined>()
  return <div className="rb-public-mobile-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <section className="rb-public-mobile-1-device" aria-label="Meridian mobile app">
      <header><p>Meridian</p><div><button type="button" aria-label="Filters" className={filtered ? 'selected' : ''} onClick={() => setFiltered((value) => !value)}><SlidersHorizontal size={16} /></button><span>AR</span></div></header>
      <main><h2>Today</h2><p className="subtitle">4 updates since you last looked</p><ul>{updates.map(([title, meta]) => <li key={title}><button type="button" className={selected === title ? 'selected' : ''} aria-label={`${title}${meta}`} onClick={() => setSelected(title)}><span><strong>{title}</strong><small>{meta}</small></span><ChevronRight size={15} /></button></li>)}</ul></main>
      <nav aria-label="Mobile navigation" role="tablist">{tabs.map(([label, Icon]) => <button type="button" role="tab" aria-selected={active === label} className={active === label ? 'selected' : ''} key={label} onClick={() => setActive(label)}><Icon size={18} /><span>{label}</span>{label === 'Activity' && <b>3</b>}</button>)}</nav>
    </section>
  </div>
}
