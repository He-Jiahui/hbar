import { useState, type ReactNode } from 'react'
import { Check, ChevronRight, Play, RotateCcw } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './plan-observed.css'

export type PlanObservedVariant = 'agent-plan-3' | 'agent-plan-4' | 'agent-plan-5' | 'agent-plan-6'

const migrationSteps = [
  ['Load the source files', 'Done'], ['Validate the schema', 'Done'], ['Snapshot the current rows', 'Done'],
  ['Write the migration file', 'Done'], ['Backfill the user rows', 'Done'], ['Verify the row counts', 'Failed'], ['Drop the legacy tier column', 'Queued'],
] as const

function Plan3({ onInteraction }: ReferenceFixtureProps) {
  const [retry, setRetry] = useState(false)
  return <section className="rb-observed-plan-surface rb-observed-plan-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Migrate the entitlement tables</h1><span>5 of 13 done</span></header><div className="rb-observed-plan-3-frame"><ol><Group title="Prepare the data" count="3 of 3" steps={migrationSteps.slice(0, 3)} /><Group title="Apply the migration" count="2 of 4" steps={migrationSteps.slice(3)} retry={retry} onRetry={() => setRetry(true)} /><li className="collapsed"><b>›</b><strong>Ship the change</strong><span>0 of 3</span></li><li className="collapsed"><b>›</b><strong>Verify in staging</strong><span>0 of 3</span></li></ol></div><button type="button" className="theme">◉&nbsp; Theme</button></section>
}

function Group({ title, count, steps, retry = false, onRetry }: { title: string; count: string; steps: readonly (readonly [string, string])[]; retry?: boolean; onRetry?: () => void }) {
  return <li className="group"><div className="group-heading"><b><Check size={13} /></b><strong>{title}</strong><span>{count}</span></div><ol>{steps.map(([step, status], index) => <li className={status === 'Failed' && !retry ? 'failed' : ''} key={step}><b>{index + 1}</b><span>{step}</span><em>{status === 'Failed' && !retry ? <button type="button" onClick={onRetry}><RotateCcw size={12} /> Retry</button> : status}</em></li>)}</ol></li>
}

function Plan4({ onInteraction }: ReferenceFixtureProps) {
  const rows = [['Read the billing contract notes', '2m', '3m', '+1m', 28], ['Map the entitlement resolver', '3m', '2m', '−1m', 18], ['Patch the tier lookup fallback', '6m', '11m', '+5m', 100], ['Add a renewal-grace test', '5m', '5m', '–', 48], ['Summarize the handoff', '1m', '–', '–', 10]] as const
  return <section className="rb-observed-plan-surface rb-observed-plan-4" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Plan vs actual</h1><span>1 step left</span></header><div className="plan-metrics"><Metric label="Planned" value="17m" /><Metric label="Actual" value="21m" /><Metric label="Drift" value="+4m" danger /></div><div className="plan-table"><p>Planned versus actual duration for each step</p><div className="plan-table-head"><span>Step</span><span>Duration</span><span>Planned</span><span>Actual</span><span>Drift</span></div>{rows.map(([name, planned, actual, drift, width]) => <div className="plan-table-row" key={name}><strong>{name}</strong><i><b style={{ width: `${width}%` }} /></i><span>{planned}</span><span>{actual}</span><em className={drift.startsWith('+') ? 'danger' : ''}>{drift}</em></div>)}</div></section>
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div><small>{label}</small><strong className={danger ? 'danger' : ''}>{value}</strong></div> }

function Plan5({ onInteraction }: ReferenceFixtureProps) {
  const groups = [['Investigate', '7/7', ['Read the billing contract notes', 'Map the entitlement resolver', 'Trace an expired key end to end', 'Collect the failing support tickets', 'Diff the two tier tables', 'Check the renewal webhook log', 'Write up the root cause']], ['Implement', '2/7', ['Patch the tier lookup fallback', 'Add the grace-window constant', 'Add a renewal-grace test', 'Cover the expired-key branch', 'Run the license branch checks', 'Regenerate the registry payloads', 'Update the installation docs']], ['Verify', '0/7', ['Deploy to the staging project', 'Run the smoke tests', 'Check the billing dashboard', 'Compare the entitlement counts', 'Replay the failing tickets', 'Notify the reviewer channel', 'Summarize the handoff']]] as const
  return <section className="rb-observed-plan-surface rb-observed-plan-5" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Fix billing entitlements</h1><span>9 of 21 done</span></header><div className="plan-columns">{groups.map(([title, count, steps]) => <section key={title}><header><span>{title}</span><b>{count}</b></header><ol>{steps.map((step, index) => <li className={(title === 'Investigate' || (title === 'Implement' && index < 2)) ? 'done' : index === 2 && title === 'Implement' ? 'current' : ''} key={step}><strong>{step}</strong><small>● {index === 2 && title === 'Implement' ? 'Running' : title === 'Verify' || index > 2 ? 'Queued' : 'Done'} · {index + 1}m</small></li>)}</ol></section>)}</div><button type="button" className="theme">◉&nbsp; Theme</button></section>
}

function Plan6({ onInteraction }: ReferenceFixtureProps) {
  const [expanded, setExpanded] = useState<number[]>([0])
  const groups = [['Prepare the data', '2 steps', '5m'], ['Apply the migration', '3 steps', '11m'], ['Ship the change', '2 steps', '4m'], ['Verify in staging', '3 steps', '6m']] as const
  return <section className="rb-observed-plan-surface rb-observed-plan-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Fix billing entitlements</h1><span>10 steps</span></header><h2>Goal</h2><p className="goal">Repairs the tier lookup so expired keys fall back to the renewal grace period before access is revoked.</p><div className="plan-metrics"><Metric label="Steps" value="10" /><Metric label="Est. time" value="26m" /><Metric label="Est. cost" value="$0.54" /></div><h2>Tools</h2><div className="tools">{['Read files', 'Search code', 'Edit files', 'Run tests', 'Shell commands'].map((tool) => <span key={tool}>{tool}</span>)}</div><h2>Breakdown</h2><ol className="breakdown">{groups.map(([title, count, time], index) => <li key={title} className={expanded.includes(index) ? 'expanded' : ''}><button type="button" onClick={() => setExpanded((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])}><b>{index + 1}</b><strong>{title}</strong><span>{count}</span><small>{time}</small><ChevronRight size={14} /></button>{expanded.includes(index) && <p>Step details and verification checkpoints</p>}</li>)}</ol><footer><span>Review the plan before it runs.</span><button type="button"><Play size={14} />Edit plan</button></footer><button type="button" className="theme">◉&nbsp; Theme</button></section>
}

export function PlanObserved({ variant, ...props }: { variant: PlanObservedVariant } & ReferenceFixtureProps) {
  const Component: (props: ReferenceFixtureProps) => ReactNode = variant === 'agent-plan-3' ? Plan3 : variant === 'agent-plan-4' ? Plan4 : variant === 'agent-plan-5' ? Plan5 : Plan6
  return <Component {...props} />
}
