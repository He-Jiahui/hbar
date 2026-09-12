import { Check, Circle, Copy } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-5.css'

const stdout = `> payments@1.4.0 test
> jest --config jest.config.ts --runInBand

 PASS  services/payments/retry.test.ts
  withRetry
    retries on transient errors (18 ms)
    applies exponential backoff with jitter (24 ms)
    gives up after maxAttempts (9 ms)
 PASS  services/payments/idempotency.test.ts
  keyFor
    derives a stable key from the request (6 ms)
 FAIL  services/payments/charge.test.ts
  createCharge
    rejects duplicate idempotency keys (31 ms)

Test Suites: 1 failed, 2 passed, 3 total
Tests:       1 failed, 5 passed, 6 total
Time:        4.12 s`

const stderr = `  console.warn
    duplicate idempotency key rejected\n\n      at createCharge (services/payments/charge.ts:42:11)`

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-5. */
export default function ToolCalls5(props: ReferenceFixtureProps) {
  const [tab, setTab] = useState<'stdout' | 'stderr'>('stdout')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    setCopied(true)
    try { await navigator.clipboard?.writeText('$ pnpm test payments --runInBand') } catch { /* clipboard is optional in the fixture */ }
    window.setTimeout(() => setCopied(false), 1200)
  }
  return <div className="rb-public-tool-5" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-tool-5-header"><div><span>run_terminal</span><h2>Command output</h2></div><span>4.12s</span></header>
    <section className="rb-public-tool-5-frame">
      <div className="rb-public-tool-5-command"><span className="prompt">$</span><code>pnpm test payments --runInBand</code><span className="exit"><Circle size={6} fill="currentColor" /> exit <b>1</b></span><button type="button" aria-label="Copy command" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
      <div className="rb-public-tool-5-output">
        <div className="rb-public-tool-5-tabs"><button type="button" className={tab === 'stdout' ? 'selected' : ''} onClick={() => setTab('stdout')}>stdout</button><button type="button" className={tab === 'stderr' ? 'selected' : ''} onClick={() => setTab('stderr')}>stderr <em>1</em></button></div>
        <pre>{tab === 'stdout' ? stdout : stderr}</pre>
      </div>
    </section>
  </div>
}
