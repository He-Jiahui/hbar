import type { ReferenceFixtureProps } from '../../reference-types'
import { Check, CreditCard, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './paywall-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/paywall/paywall-5. */
export default function Paywall5(props: ReferenceFixtureProps) {
  const [reactivated, setReactivated] = useState(false)
  return <section className="rb-public-paywall-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-paywall-5-card">{reactivated ? <div className="rb-paywall-5-success"><Check size={24} /><h2>Pro is active again</h2><p>Your workspaces are back in sync. The next invoice will be issued on 1 April.</p><button type="button" onClick={() => setReactivated(false)}>View workspace</button></div> : <><p className="rb-paywall-5-eyebrow">TRIAL ENDED</p><h2>Your 14 days with Pro are up</h2><p className="rb-paywall-5-copy">Northwind Analytics is in read-only mode. Reactivate and everything picks up exactly where it stopped, including the exports that were mid-schedule.</p><div className="rb-paywall-5-keep">{[['Workspaces', '4 kept, read-only'], ['Saved views', '26 kept'], ['Scheduled exports', 'Paused'], ['Team members', '7 signed out']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="rb-paywall-5-payment"><CreditCard size={16} /><div><strong>Card ending 4471</strong><small>Expires 08/28 · billed to Northwind Ltd</small></div><button type="button">Change</button></div><button type="button" className="rb-paywall-5-reactivate" onClick={() => setReactivated(true)}><RotateCcw size={14} />Reactivate Pro: $168 / yr</button><p className="rb-paywall-5-footnote">Renews yearly. Cancel any time before the renewal date.</p></>}</article></section>
}
