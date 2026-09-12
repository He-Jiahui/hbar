import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './dashboard-1.css'

const metrics = [['Net revenue', '$2.59M', '+12.4%', 'positive'], ['Paid accounts', '3,914', '+4.1%', 'positive'], ['Average contract', '$1,284', '−2.3%', 'negative'], ['Monthly churn', '1.8%', '+0.3 pp', 'negative']] as const
const bars = [['Apr', 220], ['May', 239], ['Jun', 249], ['Jul', 266], ['Aug', 277], ['Sep', 287]] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/dashboard/dashboard-1. */
export default function Dashboard1({ onInteraction }: ReferenceFixtureProps) {
  const [range, setRange] = useState('Last 6 months')
  return <section className="rb-public-dashboard-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Revenue</h1><button type="button" onClick={() => setRange((value) => value === 'Last 6 months' ? 'Last 30 days' : 'Last 6 months')}>{range}<span>⌄</span></button></header><main className="rb-public-dashboard-1-main"><section className="rb-public-dashboard-1-summary">{metrics.map(([label, value, delta, tone]) => <article className="rb-public-dashboard-1-metric" key={label}><label>{label}</label><p className="rb-public-dashboard-1-metric-value">{value}</p><p className={`rb-public-dashboard-1-metric-delta ${tone}`}>{delta}<span>vs. prior 6 months</span></p></article>)}</section><section className="rb-public-dashboard-1-chart"><header className="rb-public-dashboard-1-chart-head"><h2>Net revenue by month</h2><span>USD, thousands</span></header><div className="rb-public-dashboard-1-plot"><div className="rb-public-dashboard-1-yaxis"><span>500</span><span>375</span><span>250</span><span>125</span><span>0</span></div><div className="rb-public-dashboard-1-bars">{bars.map(([month, height]) => <div className="rb-public-dashboard-1-bar" key={month}><i style={{ height }} /><small>{month}</small></div>)}</div></div></section></main><button type="button" className="rb-public-dashboard-1-theme">◉&nbsp; Theme</button></section>
}
