import type { ReferenceFixtureProps } from '../../reference-types'
import { GitBranch } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './analytics-9.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/analytics/analytics-9. */
export default function Analytics9(props: ReferenceFixtureProps) {
  const [tab, setTab] = useState('Deployments')
  const cells = Array.from({ length: 182 }, (_, index) => ((index * 7 + 3) % 5))
  return <section className="rb-public-analytics-9" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-analytics-9-card"><header><div><h2><GitBranch size={14} /> Deployments</h2><strong>608</strong><p>Busiest Mon, 4 Nov (10) · 9-day active streak</p></div><div className="rb-analytics-9-tabs">{['Deployments', 'Incidents', 'Reviews'].map((value) => <button type="button" key={value} className={tab === value ? 'selected' : ''} onClick={() => setTab(value)}>{value}</button>)}</div></header><div className="rb-analytics-9-months"><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span></div><div className="rb-analytics-9-grid"><div className="rb-analytics-9-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div className="rb-analytics-9-cells">{cells.map((value, index) => <i key={index} className={`level-${value}`} />)}</div></div><footer><span>Less</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>More</span></footer></article></section>
}
