import { ExternalLink } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-4. */
export default function ToolCalls4({ onInteraction }: ReferenceFixtureProps) {
  const results = [
    ['Idempotent requests', 'Halcyon Pay Docs', 'docs.halcyonpay.com', 'Pass a unique Idempotency-Key header so a retried request is only executed once, even if the network fails after the charge is created.', '98%'],
    ['Designing robust and predictable APIs with idempotency', 'Halcyon Pay Blog', 'halcyonpay.com', 'How Halcyon Pay stores the first response against a key and replays it for 24 hours, and why keys should be derived from the client request.', '94%'],
    ['Handling retries and idempotency in payment systems', 'Increase Engineering', 'increase.com', 'A survey of key derivation strategies, including hashing the customer, amount, and currency to avoid duplicate charges under retry storms.', '89%'],
    ['Idempotency-Key HTTP header field', 'IETF Draft', 'datatracker.ietf.org', 'The proposed standard header that lets clients express at-most-once semantics for unsafe HTTP methods across intermediaries.', '82%'],
    ['What is an idempotency key and when should you use one?', 'Fly.io', 'fly.io', 'A practical walkthrough of adding idempotency to a checkout endpoint, with a Postgres table keyed on the request fingerprint.', '76%'],
    ['Exactly-once delivery is a myth. Idempotency is the answer', 'Confluent', 'confluent.io', 'Why distributed systems cannot guarantee exactly-once side effects, and how idempotent consumers make duplicate delivery harmless.', '71%'],
    ['Add idempotency keys to your webhook handlers', 'Svix', 'svix.com', 'Store processed event IDs so a redelivered webhook is acknowledged without repeating side effects.', '66%'],
  ] as const
  return <section className="rb-public-web-4" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><div><code>web_search</code><h1>Halcyon Pay idempotency key best practices</h1></div><span><i />Done&nbsp; · &nbsp;7 results</span></header>
    <div className="rb-public-web-4-results">{results.map(([title, source, domain, excerpt, score], index) => <a href={`#result-${index + 1}`} key={title} onClick={(event) => event.preventDefault()}><b>{index + 1}</b><div><div className="title"><strong>{title}</strong><ExternalLink size={12} /></div><small>{source} / {domain}</small><p>{excerpt}</p></div><em>{score}</em></a>)}</div>
    <button type="button" className="rb-public-web-4-theme" aria-label="Theme">◉&nbsp; Theme</button>
  </section>
}
