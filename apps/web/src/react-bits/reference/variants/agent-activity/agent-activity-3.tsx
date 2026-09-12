import { CircleDashed, Pause, Square } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-activity-3.css'

const steps = ['Build the container image', 'Run the test suite', 'Push image to the registry', 'Apply database migrations', 'Roll out to production', 'Run smoke checks', 'Notify the release channel']

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-activity/agent-activity-3. */
export default function AgentActivity3({ onInteraction }: ReferenceFixtureProps) {
  const [stopped, setStopped] = useState(false)
  return <main className="rb-public-activity-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><div><h2>Deploy checkout-api</h2><p><i />{stopped ? 'Stopped' : 'Running'}</p></div><span>1 of 7</span></header><section><ol>{steps.map((step, index) => <li className={index === 0 && !stopped ? 'running' : ''} key={step}><span>{index === 0 && !stopped ? <CircleDashed size={18} /> : <i />}</span><strong>{step}</strong><small>{index === 0 && !stopped ? 'Running' : 'Queued'}</small></li>)}</ol><footer><b><i /></b><span>0:02 / 0:36</span><button type="button" onClick={() => setStopped((value) => !value)}>{stopped ? <Pause size={13} /> : <Square size={13} />}{stopped ? 'Resume' : 'Stop'}</button></footer></section></main>
}
