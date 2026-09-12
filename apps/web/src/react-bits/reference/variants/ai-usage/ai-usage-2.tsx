import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './ai-usage-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/ai-usage/ai-usage-2. */
export default function AiUsage2({ onInteraction }: ReferenceFixtureProps) {
  const [tab, setTab] = useState('Cost')
  const rows = [
    ['Atlas Pro', 'Meridian Labs', '48k', '215M', '61M', '$1,565.40', '12.4%', 100],
    ['Atlas', 'Meridian Labs', '127k', '388M', '95M', '$812.06', '4.1%', 52],
    ['Atlas Long', 'Meridian Labs', '6.5k', '513M', '19M', '$704.28', '31.7%', 44],
    ['Quill', 'Northwind AI', '71k', '142M', '40M', '$356.72', '2.8%', 28],
    ['Ember', 'Orbital', '214k', '96M', '22M', '$118.94', '18.3%', 8],
    ['Ember Mini', 'Orbital', '402k', '62M', '15M', '$42.60', '46.2%', 4],
  ] as const
  return <section className="rb-public-usage-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <div className="rb-public-usage-2-content">
      <header><div><h1>Spend by model</h1><p>$3,600.00 across 6 models this billing period.</p></div><nav role="tablist">{['Cost', 'Requests', 'Tokens'].map((item) => <button type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav></header>
      <div className="rb-public-usage-2-table"><div className="rb-public-usage-2-table-inner"><div className="rb-public-usage-2-head"><span>Model</span><span>Requests</span><span>Input</span><span>Output</span><span>Share</span><span>Cost</span></div>{rows.map(([model, provider, requests, input, output, cost, share, width]) => <div className="rb-public-usage-2-row" key={model}><div><strong>{model}</strong><small>{provider}</small></div><span>{requests}</span><span>{input}</span><span>{output}</span><div className="share"><i><b style={{ width: `${width}%` }} /></i></div><div className="cost"><strong>{tab === 'Cost' ? cost : tab === 'Requests' ? requests : `${input} in`}</strong><small>{share}</small></div></div>)}</div></div>
    </div>
  </section>
}
