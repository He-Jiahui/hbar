import { useState, type ReactNode } from 'react'
import { ChevronRight, Download, Search } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './approval-observed.css'

export type ApprovalObservedVariant = 'agent-approval-3' | 'agent-approval-4' | 'agent-approval-5' | 'agent-approval-6'

function ActionFooter({ onDecision, label = 'Show request', expires }: { onDecision: (value: 'approved' | 'rejected') => void; label?: string; expires?: string }) {
  return <footer className="rb-observed-approval-footer"><button type="button" className="show"><ChevronRight size={13} />{label}</button>{expires && <span className="expires">{expires}</span>}<div><button type="button" className="reject" onClick={() => onDecision('rejected')}>Reject</button><button type="button" className="approve" onClick={() => onDecision('approved')}>Approve</button></div></footer>
}

function ApprovalQueue({ onInteraction }: ReferenceFixtureProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const rows = [['Email the Q3 renewal summary to 4 recipients', 'Queued', 'now'], ['Archive 312 paused campaigns older than 18 months', 'Queued', 'now'], ['Add a private note to ticket #4821', 'Auto-approved', '9:41'], ['Grant read access to analytics for 30 minutes', 'Approved', '9:12'], ['Rotate the production API token', 'Skipped', 'Yesterday'], ['Merge the staging config branch', 'Expired', 'Yesterday'], ['Change the invoice retention window to 45 days', 'Skipped', 'Yesterday'], ['Reset QA seed data before the nightly replay', 'Auto-approved', 'Mon'], ['Delete the abandoned import job queue', 'Expired', 'Mon']] as const
  return <section className="rb-observed-approval-surface rb-observed-approval-3" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Approvals</h1><span><i />3 waiting</span></header><main><section className="rb-observed-approval-queue-card"><div className="rb-observed-approval-queue-body"><div className="risk"><i />{decision === 'pending' ? 'Needs approval' : decision}</div><h2>Refund 3 duplicate charges to Acme Logistics</h2><p>$1,240.00 total · West billing account</p></div><ActionFooter onDecision={setDecision} /></section><div className="rb-observed-approval-queue-list">{rows.map(([title, status, time]) => <div key={title}><i /><strong>{title}</strong><span>{status}</span><small>{time}</small></div>)}</div></main><button type="button" className="theme">◉&nbsp; Theme</button></section>
}

function ApprovalScope({ onInteraction }: ReferenceFixtureProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const scopes = [['Read customer records', 'Names, emails, plan tier, and invoice status.'], ['Read recent tickets', 'Open and pending tickets from the last 30 days.'], ['Create one export', 'A CSV of renewal-risk accounts in the West workspace.']] as const
  return <section className="rb-observed-approval-surface rb-observed-approval-4" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Permission request</h1><span>Support agent</span></header><main><section className="rb-observed-approval-scope-card"><div className="scope-intro"><div className="risk"><i />{decision === 'pending' ? 'Needs approval' : decision}</div><h2>Grant read access to customer records for 45 minutes</h2><p>The support agent wants to connect to api.lumendesk.com. Read-only, no billing changes, and access ends automatically when the timer runs out.</p></div><div className="scope-list"><h3>SCOPES REQUESTED</h3>{scopes.map(([title, detail]) => <div key={title}><b>✓</b><span><strong>{title}</strong><small>{detail}</small></span></div>)}</div><ActionFooter onDecision={setDecision} expires="Expires in 44:58" /></section></main></section>
}

function ApprovalCost({ onInteraction }: ReferenceFixtureProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
  void decision
  const metrics = [['Runtime', '~40 min', 'Runs in the background'], ['Model usage', 'up to $18.40', 'Capped at $25.00'], ['Warehouse queries', '9,600', 'Read-only snapshots']] as const
  return <section className="rb-observed-approval-surface rb-observed-approval-5" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><main><section className="rb-observed-approval-cost-card"><div className="cost-intro"><div className="cost-heading"><span><i />High-cost operation</span><small>Demand forecast agent</small></div><h2>Run the Q4 demand forecast: about 40 minutes and up to $18 in model usage</h2></div><div className="cost-body">{metrics.map(([label, value, detail]) => <div className="cost-row" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>)}<div className="cost-meter"><div><span>Projected spend for this run</span><small>$18.40 of a $25.00 cap</small></div><i><b /></i></div></div><ActionFooter onDecision={setDecision} /></section></main></section>
}

function ApprovalHistory({ onInteraction }: ReferenceFixtureProps) {
  const [filter, setFilter] = useState('All')
  const rows = [['Refunded 3 duplicate charges to Acme Logistics', '$1,240.00 · West billing · Maya Chen', 'Approved', '10:42'], ['Added a private note to ticket #4821', 'Internal notes policy · Auto policy', 'Approved', '9:41'], ['Rotated the production API token', 'Payments service · Sam Rivera', 'Skipped', '9:18'], ['Granted read access to analytics for 30 minutes', 'Meridian service account · Owen Patel', 'Approved', '9:12'], ['Merged the staging config branch', 'No response in 2 hours · -', 'Expired', 'Yesterday'], ['Changed the invoice retention window to 45 days', 'billing-retention-policy.ts · Leah Stone', 'Skipped', 'Yesterday'], ['Reset QA seed data before the nightly replay', 'qa_orders, qa_refunds · QA only · Auto policy', 'Approved', 'Yesterday'], ['Archived 312 paused campaigns older than 18 months', 'EU and NA marketing · Nina Brooks', 'Skipped', 'Yesterday']] as const
  const visible = filter === 'All' ? rows : rows.filter(([, , status]) => status === filter)
  return <section className="rb-observed-approval-surface rb-observed-approval-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><header><h1>Approval history</h1><button type="button"><Download size={14} />Export</button></header><div className="history-toolbar"><label><Search size={14} /><input aria-label="Search decisions" placeholder="Search decisions" /></label><nav>{['All', 'Approved', 'Skipped', 'Expired'].map((item) => <button type="button" className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</nav></div><main className="history-list">{visible.map(([title, detail, status, time]) => <article key={title}><i /><div><strong>{title}</strong><small>{detail}</small></div><span>{status}</span><time>{time}</time></article>)}</main><button type="button" className="theme">◉&nbsp; Theme</button></section>
}

export function ApprovalObserved({ variant, ...props }: { variant: ApprovalObservedVariant } & ReferenceFixtureProps) {
  const Component: (props: ReferenceFixtureProps) => ReactNode = variant === 'agent-approval-3' ? ApprovalQueue : variant === 'agent-approval-4' ? ApprovalScope : variant === 'agent-approval-5' ? ApprovalCost : ApprovalHistory
  return <Component {...props} />
}
