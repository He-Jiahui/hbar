import type { ReferenceFixtureProps } from '../../reference-types'
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './empty-state-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/empty-state/empty-state-4. */
export default function EmptyState4(props: ReferenceFixtureProps) {
  const [retried, setRetried] = useState(false)
  return <section className="rb-public-empty-4" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><article className="rb-empty-4-card"><header><span><AlertTriangle size={15} /></span><div><h2>{retried ? 'Still unable to load your orders' : 'We could not load your orders'}</h2><p>The request to the orders service timed out after 30 seconds. Your data is safe and nothing was changed.</p></div></header><dl><div><dt>Request</dt><dd>GET /v2/workspaces/orders</dd></div><div><dt>Trace</dt><dd>8f31c0a4e7b2</dd></div><div><dt>Last success</dt><dd>Today, 14:02</dd></div></dl><footer><button type="button" className="primary" onClick={() => setRetried(true)}><RefreshCw size={13} /> Try again</button><button type="button">Check service status <ExternalLink size={12} /></button></footer></article><p className="rb-empty-4-help">Still failing after a couple of attempts? Send the trace ID to support and we will pick it up<br className="rb-empty-4-break" /> from there.</p></section>
}
