import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './ai-usage-1.css'

const days = [
  ['Mon', 86, 62], ['Tue', 114, 81], ['Wed', 143, 103], ['Thu', 126, 90], ['Fri', 156, 110], ['Sat', 50, 36], ['Sun', 40, 29],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/ai-usage/ai-usage-1. */
export default function AiUsage1(props: ReferenceFixtureProps) {
  const [range, setRange] = useState('7d')
  const [hovered, setHovered] = useState<string | undefined>()
  return <div className="rb-public-usage-1" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <main className="rb-public-usage-1-content">
      <header className="rb-public-usage-1-header"><div><h2>Token usage</h2><p>Input and output tokens billed to this workspace.</p></div><div className="rb-public-usage-1-range">{['7d', '30d', '90d'].map((value) => <button type="button" className={range === value ? 'selected' : ''} key={value} onClick={() => setRange(value)}>{value}</button>)}</div></header>
      <section className="rb-public-usage-1-panel">
        <div className="rb-public-usage-1-metrics">{[['Total tokens', '48M'], ['Input', '35M'], ['Output', '14M'], ['Spend', '$311']].map(([label, value]) => <div key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>
        <div className="rb-public-usage-1-chart"><div className="rb-public-usage-1-legend"><span><i /> Input</span><span><i /> Output</span><p>Hover a bar for detail</p></div><div className="rb-public-usage-1-bars">{days.map(([day, total, input]) => <button type="button" key={day} onMouseEnter={() => setHovered(day)} onMouseLeave={() => setHovered(undefined)} aria-label={`${day}: ${(total / 10).toFixed(1)}M tokens`}><span className="bar"><i style={{ height: `${input}px` }} /><b style={{ height: `${total - input}px` }} /></span><small>{day}</small>{hovered === day && <em>{(total / 10).toFixed(1)}M tokens</em>}</button>)}</div></div>
      </section>
    </main>
  </div>
}
