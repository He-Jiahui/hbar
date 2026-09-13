import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './paywall-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/paywall/paywall-2. */
export default function Paywall2(props: ReferenceFixtureProps) {
  const [closed, setClosed] = useState(false)
  const [upgraded, setUpgraded] = useState(false)
  if (closed) return <section className="rb-public-paywall-2 rb-paywall-2-closed"><button type="button" onClick={() => setClosed(false)}>Scheduled exports are a Pro feature</button></section>
  return <section className="rb-public-paywall-2" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-paywall-2-card"><header><span><Sparkles size={16} /></span><div><h2>{upgraded ? 'Pro features enabled' : 'Scheduled exports are a Pro feature'}</h2><p>Your workspace is on Starter. Upgrading applies immediately and is prorated.</p></div><button type="button" aria-label="Dismiss" onClick={() => setClosed(true)}><X size={15} /></button></header><div className="rb-paywall-2-features">{[['Scheduled exports', 'Send any saved view to S3 or a warehouse on a cron you control.'], ['Unlimited history', 'Query beyond the 30 days Starter keeps, with no sampling.'], ['Shared workspaces', 'Invite the whole team and manage access by role.']].map(([title, text]) => <article key={title}><Check size={13} /><div><strong>{title}</strong><p>{text}</p></div></article>)}</div><footer><strong>$24 <small>per seat, per month</small></strong><button type="button" onClick={() => setClosed(true)}>Not now</button><button type="button" className="primary" onClick={() => setUpgraded(true)}>{upgraded ? 'Upgraded' : 'Upgrade workspace'}</button></footer></div></section>
}
