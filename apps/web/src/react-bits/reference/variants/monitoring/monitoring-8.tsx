import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowDown, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './monitoring-8.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/monitoring/monitoring-8. */
export default function Monitoring8(props: ReferenceFixtureProps) {
  const [selectedBar, setSelectedBar] = useState(4)
  const [sort, setSort] = useState<'p99' | 'req'>('p99')
  const bars = [['0–50', 10, false], ['50–100', 28, false], ['100–200', 64, false], ['200–300', 101, false], ['300–500', 120, false], ['500–800', 83, false], ['0.8–1.2s', 56, false], ['1.2–2s', 43, true], ['2–4s', 34, true], ['4s+', 30, true]] as const
  const rows = [
    ['POST', '/v2/checkout', '184', '412ms', '1.18s', '8.42s', '2.4%'],
    ['POST', '/v2/invoices', '76', '288ms', '640ms', '1.81s', '0.9%'],
    ['GET', '/v2/search', '618', '128ms', '384ms', '1.24s', '0.4%'],
    ['POST', '/v2/webhooks', '208', '74ms', '190ms', '486ms', '0.3%'],
    ['PUT', '/v2/profile', '31', '66ms', '148ms', '322ms', '0.2%'],
    ['GET', '/v2/orders', '942', '42ms', '96ms', '214ms', '0.1%'],
  ] as const
  return <section className="rb-public-monitoring-8" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-monitoring-8-shell"><header className="rb-monitoring-8-overview"><div><h2>Response times</h2><p>Last 24 hours · 2.06M requests · 6 routes</p></div><p className="budget"><CircleAlert size={11} />p99 over the 2.00s budget</p></header><div className="rb-monitoring-8-metrics"><article><p>p50 · /v2/checkout</p><strong>412ms</strong><span className="good">↓ 3.1%</span></article><article><p>p90 · /v2/checkout</p><strong>1.18s</strong><span className="bad">↑ 6.4%</span></article><article><p>p99 · /v2/checkout</p><strong>8.42s</strong><span className="bad">↑ 21.8%</span></article></div><article className="rb-monitoring-8-histogram"><header><h3>Latency distribution</h3><p>122% of requests plotted</p></header><div className="bars" role="group" aria-label="Latency histogram for /v2/checkout">{bars.map(([label, height, danger], index) => <button type="button" key={label} className={`${danger ? 'danger' : ''}${selectedBar === index ? ' selected' : ''}`} aria-label={`${label}ms, ${height}% of requests`} onClick={() => setSelectedBar(index)}><i style={{ height: `${Math.max(10, height)}px` }} /><span>{label}</span></button>)}</div></article><div className="rb-monitoring-8-table"><table><thead><tr><th>Route</th><th><button type="button" onClick={() => setSort('req')}>Req/s</button></th><th>p50</th><th>p90</th><th><button type="button" className="active" onClick={() => setSort('p99')}>p99 <ArrowDown size={11} /></button></th><th>Errors</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row[1]} className={index === 0 && sort === 'p99' ? 'highlight' : ''}><td><span className="method">{row[0]}</span><strong>{row[1]}</strong></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td className={index < 3 ? 'bad' : ''}>{row[5]}</td><td>{row[6]}</td></tr>)}</tbody></table></div><button type="button" className="rb-monitoring-8-theme">◉&nbsp; Theme</button></div></section>
}
