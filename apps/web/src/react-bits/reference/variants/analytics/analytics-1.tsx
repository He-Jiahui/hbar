import { Activity, Clock3, UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './analytics-1.css'

const metrics = [
  { label: 'Active teams', value: '8,733', delta: '−0.8%', icon: UsersRound, tone: 'negative', points: '0,18 28,17 55,18 84,25 111,34 140,40 170,41 200,35 230,21' },
  { label: 'Seats invited', value: '1,268', delta: '+3.6%', icon: UserPlus, tone: 'positive', points: '0,36 28,42 55,43 84,40 111,31 140,22 170,17 200,19 230,24' },
  { label: 'Sessions', value: '63,728', delta: '−0.2%', icon: Activity, tone: 'negative', points: '0,39 28,32 55,23 84,17 111,18 140,24 170,34 200,41 230,45' },
  { label: 'Median session', value: '7m 05s', delta: '−1.2%', icon: Clock3, tone: 'negative', points: '0,18 28,22 55,32 84,42 111,43 140,38 170,30 200,23 230,17' },
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/analytics/analytics-1. */
export default function Analytics1({ onInteraction }: ReferenceFixtureProps) {
  const [range, setRange] = useState('Week')
  return <section className="rb-public-analytics-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-public-analytics-1-content">
    <header className="rb-public-analytics-1-head"><div className="rb-public-analytics-1-head-copy"><h2>Workspace pulse</h2><p>Adoption, invitations and time spent across every workspace.</p></div><nav className="rb-public-analytics-1-range" role="tablist">{['Week', 'Month', 'Quarter'].map((item) => <button type="button" role="tab" aria-selected={range === item} className={range === item ? 'selected' : ''} key={item} onClick={() => setRange(item)}>{item}</button>)}</nav></header>
    <div className="rb-public-analytics-1-metrics">{metrics.map(({ label, value, delta, icon: Icon, tone, points }) => <article className="rb-public-analytics-1-metric" key={label}><div className="rb-public-analytics-1-metric-label"><Icon size={14} />{label}</div><p className="rb-public-analytics-1-metric-value">{value}</p><p className={`rb-public-analytics-1-metric-delta ${tone}`}><b>{delta}</b><span>vs start of week</span></p><svg className="rb-public-analytics-1-spark" viewBox="0 0 230 44" preserveAspectRatio="none" role="img" aria-label={`${label} trend`}><polyline points={points} /></svg></article>)}</div>
    <footer className="rb-public-analytics-1-foot"><p>12,845 workspaces tracked · 76% active in the last 30 days</p><a href="#report" onClick={(event) => event.preventDefault()}>Open report</a></footer>
  </div></section>
}
