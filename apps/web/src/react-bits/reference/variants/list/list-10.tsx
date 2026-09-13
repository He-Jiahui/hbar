import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './list-10.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/list/list-10. */
export default function List10(props: ReferenceFixtureProps) {
  const [completed, setCompleted] = useState<number[]>([])
  const steps = [['Acknowledge the page and declare an incident', 'On-call primary · 2 min'], ['Open the incident channel and post the first summary', 'Incident commander · 3 min'], ['Confirm blast radius from the error-rate dashboard', 'SRE · 5 min'], ['Roll back the checkout service to the last good deploy', 'Release engineer · 8 min'], ['Verify error rate and latency have recovered', 'SRE · 5 min'], ['Post customer-facing update to the status page', 'Support lead · 4 min'], ['Capture the timeline for the postmortem', 'Incident commander · 6 min'], ['Stand down responders and close the incident', 'On-call primary · 2 min']] as const
  return <section className="rb-public-list-10" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-list-10-shell"><p className="rb-list-10-eyebrow">INCIDENT RUNBOOK</p><h2>Checkout latency spike: SEV2</h2><div className="rb-list-10-progress"><i><b style={{ width: `${(completed.length / steps.length) * 100}%` }} /></i><span>{completed.length} of {steps.length} steps complete</span></div><main>{steps.slice(0, 6).map(([title, detail], index) => <article key={title} className={completed.includes(index) ? 'done' : ''}><button type="button" aria-label={`Mark step ${index + 1} complete: ${title}`} onClick={() => setCompleted((value) => value.includes(index) ? value.filter((item) => item !== index) : [...value, index])}>{completed.includes(index) && <Check size={13} />}</button><div><h3>{title}</h3><p>{detail}</p></div><a href="#runbook" onClick={(event) => event.preventDefault()}>Runbook <ExternalLink size={12} /></a></article>)}</main></div></section>
}
