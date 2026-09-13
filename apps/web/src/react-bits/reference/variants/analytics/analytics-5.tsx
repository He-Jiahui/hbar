import type { ReferenceFixtureProps } from '../../reference-types'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './analytics-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/analytics/analytics-5. */
export default function Analytics5(props: ReferenceFixtureProps) {
  const [mode, setMode] = useState('Sessions')
  const channels = [['Organic search', '5,842', '45.5%', '#f5f5f5'], ['Direct', '3,210', '25.0%', '#d4d4d4'], ['Referral', '1,680', '13.1%', '#8a8a8a'], ['Email', '1,145', '8.9%', '#525252'], ['Paid social', '968', '7.5%', '#292929']] as const
  return <section className="rb-public-analytics-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-analytics-5-card"><header><div><h2>Traffic by channel</h2><p>Where visitors came from over the last 30 days.</p></div><div className="rb-analytics-5-tabs">{['Sessions', 'Revenue'].map((value) => <button type="button" key={value} className={mode === value ? 'selected' : ''} onClick={() => setMode(value)}>{value}</button>)}</div></header><div className="rb-analytics-5-body"><div className="rb-analytics-5-donut"><div><strong>{mode === 'Sessions' ? '12,845' : '$38,412'}</strong><span>{mode}</span></div></div><ul>{channels.map(([name, count, percent, color]) => <li key={name}><i style={{ background: color }} /><span>{name}</span><b>{count}</b><small>{percent}</small></li>)}</ul></div></article></section>
}
