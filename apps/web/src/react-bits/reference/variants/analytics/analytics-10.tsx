import type { ReferenceFixtureProps } from '../../reference-types'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './analytics-10.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/analytics/analytics-10. */
export default function Analytics10(props: ReferenceFixtureProps) {
  const [quarter, setQuarter] = useState('Q1')
  const goals = [['Net new ARR', '84%', '$4.2M of $5.0M', 84], ['Expansion revenue', '108%', '$1.3M of $1.2M', 108], ['Logo retention', '98%', '91% of 93%', 98]] as const
  return <section className="rb-public-analytics-10" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-analytics-10-card"><header><div><h2>Quarterly goals</h2><p>Attainment against plan, 8 days left in {quarter}.</p></div><div className="rb-analytics-10-tabs">{['Q1', 'Q2', 'Q3', 'Q4'].map((value) => <button type="button" key={value} className={quarter === value ? 'selected' : ''} onClick={() => setQuarter(value)}>{value}</button>)}</div></header><div className="rb-analytics-10-goals">{goals.map(([name, value, detail, percent]) => <article key={name}><div className="rb-analytics-10-ring" style={{ background: `conic-gradient(#f5f5f5 0 ${Math.min(100, percent)}%, #292929 ${Math.min(100, percent)}% 100%)` }}><div><strong>{value}</strong><span>of target</span></div></div><h3>{name}</h3><p>{detail}</p></article>)}</div><footer><span>Blended attainment</span><strong>96.7%</strong></footer></article></section>
}
