import type { ReferenceFixtureProps } from '../../reference-types'
import { CreditCard, Repeat2, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './card-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/card/card-6. */
export default function Card6(props: ReferenceFixtureProps) {
  const [range, setRange] = useState('30d')
  const metrics = [['Available balance', '74,910', '+8.6%', Wallet, true], ['Card spend', '16,240', '-5.4%', CreditCard, false], ['Recurring revenue', '38,900', '+4.7%', Repeat2, true], ['Active payers', '1,342', '-2.3%', Users, false]] as const
  const bars = [[25, 20, 30, 38, 44, 39, 51], [49, 42, 39, 35, 33, 31, 29], [23, 31, 35, 42, 46, 51, 55], [44, 39, 36, 33, 30, 28, 27]]
  return <section className="rb-public-card-6" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><header><h2>Accounts overview</h2><div className="rb-card-6-range" role="radiogroup">{['7d', '30d', '90d'].map((value) => <button type="button" role="radio" aria-checked={range === value} key={value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{value}</button>)}</div></header><div className="rb-card-6-grid">{metrics.map(([label, value, delta, Icon, positive], index) => <article key={label}><p><Icon size={15} />{label}</p><strong>{value}</strong><small className={positive ? 'positive' : ''}>{positive ? '↗' : '↘'} {delta} <span>vs previous {range}</span></small><div className="rb-card-6-bars">{(bars[index] ?? []).map((height, barIndex) => <i key={barIndex} className={barIndex === 6 ? 'current' : ''} style={{ height: `${height}%` }} />)}</div></article>)}</div><p className="rb-card-6-footer">Net movement across all four accounts over the last {range}: 5.6%.</p></section>
}
