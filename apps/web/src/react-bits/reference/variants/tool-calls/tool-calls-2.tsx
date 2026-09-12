import { useMemo, useState } from 'react'
import { Check, CircleStop, RotateCcw } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-2. */
export default function ToolCalls2({ onInteraction }: ReferenceFixtureProps) {
  const [filter, setFilter] = useState('All')
  const [stopped, setStopped] = useState(false)
  const [retried, setRetried] = useState<string[]>([])
  const visible = useMemo(() => {
    const calls = [
      ['read_file', 'app/api/checkout/route.ts', '38ms', 'Done', 'done'],
      ['codebase_search', 'where is the retry backoff configured', '1.24s', 'Done', 'done'],
      ['grep', 'RETRY_BACKOFF_MS across the services directory', '112ms', 'Done', 'done'],
      ['edit_file', 'services/payments/retry.ts', '0.94s', 'Running', 'running'],
      ['run_terminal', 'pnpm test payments --runInBand', '—', stopped ? 'Stopped' : 'Streaming', 'running'],
      ['web_search', 'Halcyon Pay idempotency key best practices', '2.10s', 'Done', 'done'],
      ['fetch_url', 'https://docs.halcyonpay.com/api/idempotent_requests', '—', retried.includes('fetch_url') ? 'Retrying' : 'Failed', 'failed'],
      ['apply_patch', 'services/payments/idempotency.ts', '0.61s', 'Approved', 'done'],
      ['read_file', 'services/payments/__tests__/retry.test.ts', '41ms', 'Done', 'done'],
      ['run_terminal', 'pnpm lint --filter payments', '3.40s', retried.includes('run_terminal') ? 'Retrying' : 'Failed', 'failed'],
      ['send_email', 'Q3 renewal summary to 4 recipients', '—', 'Needs approval', 'approval'],
      ['delete_file', 'services/payments/legacy/backoff.ts', '—', 'Skipped', 'skipped'],
    ] as const
    return filter === 'All' ? calls : calls.filter(([, , , , state]) => filter === 'Running' ? state === 'running' : state === 'failed')
  }, [filter, retried, stopped])
  return <section className="rb-public-tools-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><div><h1>Tool activity</h1><nav>{['All', 'Running', 'Failed'].map((item) => <button type="button" className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</nav></div><button type="button" className="stop" onClick={() => setStopped((value) => !value)}><CircleStop size={14} />{stopped ? 'Resume' : 'Stop'}</button></header>
    <div className="rb-public-tools-2-list">{visible.map(([name, detail, duration, status, state]) => <article className={`is-${state}`} key={`${name}-${detail}`}><i /> <strong>{name}</strong><span>{detail}</span><time>{duration}</time><em>{status}</em>{state === 'failed' && <button type="button" aria-label={`Retry ${name}`} onClick={() => setRetried((current) => [...new Set([...current, name])])}><RotateCcw size={13} /></button>}{state === 'done' && <Check size={13} className="check" />}</article>)}</div>
    <button type="button" className="rb-public-tools-2-theme" aria-label="Theme">◉&nbsp; Theme</button>
  </section>
}
