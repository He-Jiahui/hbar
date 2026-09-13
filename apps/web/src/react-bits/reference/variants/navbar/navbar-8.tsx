import type { ReferenceFixtureProps } from '../../reference-types'
import { Download, Filter, MoreHorizontal, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './navbar-8.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/navbar/navbar-8. */
export default function Navbar8(props: ReferenceFixtureProps) {
  const [tab, setTab] = useState('Open')
  const rows = [['Retry failed webhooks after backoff', 'Nadia V.', '12m'], ['Split checkout bundle by route', 'Marcus S.', '1h'], ['Backfill invoice tax regions', 'Priya R.', '3h'], ['Rotate signing keys for Harbor Coffee', 'Tom A.', '6h'], ['Trim onboarding email sequence', 'Elena M.', '1d']] as const
  return <section className="rb-public-navbar-8" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><nav className="rb-navbar-8-toolbar"><div className="rb-navbar-8-tabs">{[['All', '248'], ['Open', '46'], ['In review', '12'], ['Done', '190']].map(([name, count]) => <button type="button" key={name} className={tab === name ? 'selected' : ''} onClick={() => setTab(name ?? '')}>{name}<small>{count}</small></button>)}<button type="button" aria-label="More views" className="more"><MoreHorizontal size={15} /></button></div><div className="rb-navbar-8-actions"><button type="button"><Filter size={14} /> Filter</button><button type="button"><SlidersHorizontal size={14} /> Display</button><button type="button" className="export"><Download size={14} /> Export</button></div></nav><p className="rb-navbar-8-count">{tab === 'Open' ? '46' : tab === 'All' ? '248' : tab === 'In review' ? '12' : '190'} items in {tab.toLowerCase()}</p><div className="rb-navbar-8-list">{rows.map(([title, owner, age]) => <button type="button" key={title} className="rb-navbar-8-row"><i /> <strong>{title}</strong><span>{owner}</span><time>{age}</time></button>)}</div></section>
}
