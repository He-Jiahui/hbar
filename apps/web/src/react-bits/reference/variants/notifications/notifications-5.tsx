import type { ReferenceFixtureProps } from '../../reference-types'
import { AlertCircle, CheckCircle2, Info, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './notifications-5.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/notifications/notifications-5. */
export default function Notifications5(props: ReferenceFixtureProps) {
  const [dismissed, setDismissed] = useState<number[]>([])
  const banners = [['Scheduled maintenance on Sunday', 'Halcyon will be read-only from 02:00 to 04:00 UTC while we migrate the ingest cluster.', 'Read the notice', 'info', Info], ['Your card expires in 6 days', 'Renewal for Cedar Labs is due on 12 November. Update the payment method to avoid an interruption.', 'Update card', 'warning', TriangleAlert], ['3 of 5 imports failed', 'The Northwind sync stopped after repeated schema errors. Nothing was written for the failed files.', 'Retry failed', 'error', AlertCircle], ['meridian.example is verified', 'DNS records propagated and the certificate was issued. Outbound mail now sends from this domain.', 'View DNS', 'success', CheckCircle2], ['You have used 84% of your monthly events', 'At the current rate the workspace reaches its limit around 26 November.', 'Increase limit', 'info', Info]] as const
  const visible = banners.map((banner, index) => ({ banner, index })).filter(({ index }) => !dismissed.includes(index))
  return <section className="rb-public-notifications-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><header><div><h2>System messages</h2><p>Persistent banners for account, billing and platform state.</p></div><button type="button" onClick={() => setDismissed([])}><RotateCcw size={14} /> Restore all</button></header><main>{visible.map(({ banner, index }) => { const [title, description, action, tone, Icon] = banner; return <article className={`rb-notifications-5-banner ${tone}`} key={title}><Icon size={16} /><div><h3>{title}</h3><p>{description}</p><button type="button" onClick={() => { if (tone === 'error') setDismissed((value) => value.filter((item) => item !== index)); }}>{action}</button></div><button type="button" aria-label={`Dismiss: ${title}`} onClick={() => setDismissed((value) => [...value, index])}><X size={13} /></button></article> })}</main><button type="button" className="rb-notifications-5-theme">◉&nbsp; Theme</button></section>
}
