import { Square } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-plan-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-plan/agent-plan-1. */
export default function AgentPlan1(props: ReferenceFixtureProps) {
  const [stopped, setStopped] = useState(false)
  const steps = [
    ['Read the billing contract notes', 'Done', 'done'],
    ['Map the entitlement resolver', 'Done', 'done'],
    ['Patch the tier lookup', stopped ? 'Stopped' : 'Running', 'running'],
    ['Add a renewal-grace test', 'Queued', 'queued'],
    ['Run the license checks', 'Queued', 'queued'],
    ['Regenerate the entitlement fixtures', 'Skipped', 'skipped'],
    ['Update the installation docs', 'Queued', 'queued'],
  ] as const

  return <div className="rb-public-plan-1" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-plan-1-header">
      <h2>Fix billing entitlements</h2>
      <div className="rb-public-plan-1-progress" aria-label="2 of 7 done"><span><i /></span><small>2 of 7 done</small></div>
      <button type="button" className="rb-public-plan-1-stop" onClick={() => setStopped((value) => !value)}><Square size={13} />{stopped ? 'Resume' : 'Stop'}</button>
    </header>
    <section className="rb-public-plan-1-frame" aria-label="Execution plan">
      <div className="rb-public-plan-1-inner"><ol>
        {steps.map(([title, status, state], index) => <li className={`state-${state}`} key={title}>
          <button type="button" onClick={() => undefined}>
            <span className="rb-public-plan-1-number">{index + 1}</span>
            <span className="rb-public-plan-1-title">{title}</span>
            <span className="rb-public-plan-1-status"><i />{status}</span>
          </button>
          {state === 'running' && <div className="rb-public-plan-1-detail"><p>Adding the renewal fallback so expired keys keep access through the grace window, without changing the response shape.</p><dl><div><dt>Target</dt><dd>lib/registry-auth.ts</dd></div><div><dt>Estimate</dt><dd>6 min</dd></div></dl></div>}
        </li>)}
      </ol></div>
    </section>
  </div>
}
