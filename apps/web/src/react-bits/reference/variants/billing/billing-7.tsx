import type { ReferenceFixtureProps } from '../../reference-types'
import { Bell, Database, Mail, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './billing-7.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/billing/billing-7. */
export default function Billing7(props: ReferenceFixtureProps) {
  const [cycle, setCycle] = useState<'This cycle' | 'Last cycle' | 'Cycle to date'>('This cycle')
  const [alertSet, setAlertSet] = useState(false)
  const entries = [
    { name: 'Seats', icon: Users, detail: '24 of 20 seats', percent: 120, note: '4 seats over at $12.00 each', cost: '$48.00', state: 'Over allowance', tone: 'danger', color: '#ff3b4d' },
    { name: 'API calls', icon: Zap, detail: '468,000 of 500,000 calls', percent: 94, note: '32,000 calls left this cycle', cost: '$0.00', state: 'Nearing limit', tone: 'warning', color: '#ff9d0a' },
    { name: 'Storage', icon: Database, detail: '96 of 100 GB', percent: 96, note: '4 GB left this cycle', cost: '$0.00', state: 'Nearing limit', tone: 'warning', color: '#ff9d0a' },
    { name: 'Transactional email', icon: Mail, detail: '118,400 of 250,000 sends', percent: 47, note: '131,600 sends left this cycle', cost: '$0.00', state: '', tone: 'normal', color: '#f5f5f5' },
  ] as const
  return <section className="rb-public-billing-7" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-billing-7-inner"><header className="rb-billing-7-header"><div><h2>Usage and overages</h2><p>Growth plan · Jun 1 to Jun 30 · 12 days remaining</p></div><div className="rb-billing-7-toggle">{(['This cycle', 'Last cycle', 'Cycle to date'] as const).map((value) => <button type="button" key={value} className={cycle === value ? 'selected' : ''} onClick={() => setCycle(value)}>{value}</button>)}</div></header><div className="rb-billing-7-summary">{[['ESTIMATED TOTAL', '$1,828.00', 'Billed Jul 1'], ['PLAN SUBSCRIPTION', '$1,780.00', '20 seats included'], ['METERED OVERAGE', '$48.00', '1 meter over']].map(([label, value, note]) => <article key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</div><div className="rb-billing-7-entitlement-heading"><div><h3>Metered entitlements</h3><p>Anything beyond the included allowance bills at the listed rate.</p></div><button type="button" onClick={() => setAlertSet((value) => !value)}><Bell size={14} />{alertSet ? 'Alert set' : 'Set an alert'}</button></div><div className="rb-billing-7-entries">{entries.map((entry) => { const Icon = entry.icon; return <article key={entry.name} className={`tone-${entry.tone}`}><header><p><Icon size={14} /><span>{entry.name}</span>{entry.state && <small>{entry.state}</small>}</p><span>{entry.detail}</span></header><div className="rb-billing-7-bar"><i style={{ width: `${Math.min(entry.percent, 100)}%`, background: entry.color }} /></div><div className="rb-billing-7-percent"><span>{entry.note}</span><strong>{entry.percent}%</strong><b>{entry.cost}</b></div></article>})}<footer><p>This cycle closes Jun 30. Overage is invoiced with the next subscription charge.</p><strong>$48.00</strong></footer></div><button type="button" className="rb-billing-7-theme">◉&nbsp; Theme</button></div></section>
}
