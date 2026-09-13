import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './card-3.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/card/card-3. */
export default function Card3(props: ReferenceFixtureProps) {
  const [complete, setComplete] = useState(1)
  const steps = [
    ['0.1', 'Connect a source', 'Point the workspace at the repository or warehouse you work in.'],
    ['0.2', 'Invite your team', 'Anyone with an invitation can open the workspace immediately.'],
    ['0.3', 'Set review rules', 'Decide what needs approval before it reaches production.'],
    ['0.4', 'Ship the first change', 'Run it end to end so you can see the whole trail in one place.'],
  ] as const
  return <section className="rb-public-card-3" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><header><p><strong>{complete}</strong> of 4 steps complete</p><button type="button" onClick={() => setComplete(0)}><RotateCcw size={13} />Reset</button></header><ul>{steps.map(([number, title, body], index) => { const done = index < complete; return <li key={number}><div><p className="rb-card-3-number">{number}</p><p className="rb-card-3-title">{title}</p><p className="rb-card-3-body">{body}</p></div><button type="button" className={done ? 'done' : ''} onClick={() => setComplete(done ? index : index + 1)}>{done && <Check size={14} />}{done ? 'Completed' : 'Mark complete'}<span className="sr-only">: {title}</span></button></li> })}</ul></section>
}
