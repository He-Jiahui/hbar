import type { ReferenceFixtureProps } from '../../reference-types'
import { CircleAlert, CreditCard } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './paywall-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/paywall/paywall-4. */
export default function Paywall4(props: ReferenceFixtureProps) {
  const [upgraded, setUpgraded] = useState(false)
  const limits = [['API requests', '50k / 50k', 100], ['Rows processed', '1.84M / 2.00M', 92], ['Connected sources', '3 / 3', 100]] as const
  return <section className="rb-public-paywall-4" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-paywall-4-content"><header><span className="rb-paywall-4-icon"><CircleAlert size={16} /></span><div><h2>You have hit the Starter limit</h2><p>Ingestion is paused until 1 April, or until you raise the limit. Nothing has been deleted, and queries on existing data still work.</p></div></header><div className="rb-paywall-4-limits">{limits.map(([name, value, percent]) => <div className="rb-paywall-4-limit" key={name}><div><span>{name}</span><strong>{value}</strong></div><i><b style={{ width: `${percent}%` }} /></i></div>)}</div><article className="rb-paywall-4-upgrade"><div><h3>Pro raises every limit tenfold</h3><p>500k requests, 20M rows, unlimited sources. $24 per seat / mo.</p></div><div><button type="button"><CreditCard size={13} />Buy a one-off top-up</button><button type="button" className="primary" onClick={() => setUpgraded(true)}>{upgraded ? 'Upgraded' : 'Upgrade to Pro'}</button></div></article></div></section>
}
