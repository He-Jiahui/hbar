import type { ReferenceFixtureProps } from '../../reference-types'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './feedback-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/feedback/feedback-6. */
export default function Feedback6(props: ReferenceFixtureProps) {
  const [range, setRange] = useState('30 days')
  const themes = [['Export reliability', 84, '22%'], ['Pricing and plans', 61, '8%'], ['Onboarding clarity', 47, '4%'], ['Filter persistence', 39, '31%'], ['Mobile layout', 22, '0%'], ['Webhook retries', 18, '12%'], ['Search relevance', 14, '3%'], ['Audit log gaps', 9, '6%']] as const
  const bars = [28, 40, 32, 58, 48, 42, 72, 60, 84, 68, 91, 77, 104, 88, 118, 97, 129, 110, 144, 132, 156, 174]
  return <section className="rb-public-feedback-6" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-feedback-6-heading"><div><h2>Feedback insights</h2><p>Every survey, widget and email reply, grouped by theme.</p></div><div className="rb-feedback-6-range">{['30 days', '90 days', '12 months'].map((value) => <button type="button" key={value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{value}</button>)}</div></header>
    <div className="rb-feedback-6-metrics"><article><span>Responses</span><strong>412</strong><small>4% response rate from 9,800 prompts</small></article><article><span>Average rating</span><div><strong>4.4</strong><small>↗ 0.2</small></div><small>Out of 5, against previous period</small></article><article><span>Sentiment</span><div className="rb-feedback-6-sentiment"><i /><i /><i /></div><div className="rb-feedback-6-legend"><span>● Positive <b>64%</b></span><span>● Neutral <b>24%</b></span><span>● Negative <b>12%</b></span></div></article></div>
    <div className="rb-feedback-6-lower"><section className="rb-feedback-6-themes"><header><strong>Top themes</strong><span>Mentions this period</span></header>{themes.map(([name, count, delta]) => <div className="rb-feedback-6-theme-row" key={name}><div><span>{name}</span><b>{count}</b><small>↗ {delta}</small></div><i><em style={{ width: `${Math.max(12, (count / 84) * 100)}%` }} /></i></div>)}</section><section className="rb-feedback-6-volume"><h3>Weekly volume</h3><p>Responses per day, last 20 days</p><div className="rb-feedback-6-bars">{bars.map((height, index) => <i key={index} className={index === bars.length - 1 ? 'current' : ''} style={{ height }} />)}</div><footer><span>20 days ago</span><b>54 today</b></footer></section></div><button type="button" className="rb-feedback-6-theme-button">◉&nbsp; Theme</button>
  </section>
}
