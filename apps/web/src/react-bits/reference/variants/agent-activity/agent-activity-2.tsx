import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-2.css'

const groups = [
  ['Prepare export', '4.2s', [['Validate source schema', '1.1s', 18], ['Snapshot three tables', '2.4s', 37], ['Acquire export lock', '0.7s', 10]]],
  ['Extract records', '12.8s', [['Read customers', '3.1s', 42], ['Read subscriptions', '6.4s', 70], ['Read invoices', '3.3s', 45]]],
  ['Transform rows', '8.3s', [['Normalise currencies', '2.2s', 28], ['Resolve account owners', '4.0s', 54], ['Drop test accounts', '2.1s', 27]]],
] as const

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-2. */
export default function AgentActivity2({ onInteraction }: ReferenceFixtureProps) {
  const [open, setOpen] = useState<number[]>([0, 1, 2])
  return <main className="rb-public-activity-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><div><h2>Weekly warehouse export</h2><p><i />Succeeded</p></div><span>32.4s</span></header>
    <section>{groups.map(([title, duration, steps], index) => <article key={title}><button type="button" className="group-head" onClick={() => setOpen((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items, index])}><i /><strong>{title}</strong><small>{duration}</small><ChevronDown size={14} className={open.includes(index) ? 'open' : ''} /></button>{open.includes(index) && <div className="step-list">{steps.map(([name, time, progress]) => <div key={name}><span>{name}</span><b style={{ '--progress': `${progress}%` } as React.CSSProperties}><i /></b><small>{time}</small></div>)}</div>}</article>)}</section>
  </main>
}
