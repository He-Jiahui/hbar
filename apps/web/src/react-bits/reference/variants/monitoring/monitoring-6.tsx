import type { ReferenceFixtureProps } from '../../reference-types'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './monitoring-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/monitoring/monitoring-6. */
export default function Monitoring6(props: ReferenceFixtureProps) {
  const [range, setRange] = useState('90d')
  type Service = readonly [string, readonly number[], readonly number[]]
  const services: readonly Service[] = [['API', [4, 34, 64, 75], [23, 37]], ['Dashboard', [28, 58, 69, 88], [17, 31]], ['Payments', [12, 23, 42, 53, 83], [72, 86]], ['Webhooks', [3, 14, 33, 44, 74], [63, 77]], ['Search', [19, 49, 60, 79], [8, 22]], ['Asset CDN', [11, 38, 67], [67]]]
  return <section className="rb-public-monitoring-6" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-monitoring-6-shell"><header><div><h2><span className="ok-dot" />All systems operational</h2><p>99.937% average uptime over 90 days</p></div><div className="ranges">{['30d', '60d', '90d'].map((value) => <button type="button" key={value} className={range === value ? 'selected' : ''} onClick={() => setRange(value)}>{value}</button>)}</div></header><div className="rb-monitoring-6-services"><ul>{services.map(([service, marked, outages]) => <li key={service}><div className="service-head"><button type="button"><ChevronRight size={12} />{service}</button><span>99.{service === 'Payments' || service === 'Webhooks' ? '93' : '94'}% uptime</span></div><div className="service-bars" aria-label={`${service} daily status for the last ${range}`} role="img">{Array.from({ length: 90 }, (_, index) => <i key={index} className={outages.includes(index) ? 'outage' : marked.includes(index) ? 'degraded' : ''} />)}</div></li>)}</ul></div><footer><span>90 days ago</span><ul><li><i />Operational</li><li><i className="degraded" />Degraded</li><li><i className="outage" />Outage</li></ul><span>Today</span></footer><button type="button" className="rb-monitoring-6-theme">◉&nbsp; Theme</button></div></section>
}
