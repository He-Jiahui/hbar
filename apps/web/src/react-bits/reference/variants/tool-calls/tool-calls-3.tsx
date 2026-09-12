import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-3.css'

type DiffLine = readonly [oldLine: string, newLine: string, marker: '' | '+' | '-', code: string]

const retryLines: readonly DiffLine[] = [
  ['18', '18', '', 'const max = options.maxAttempts ?? 5;'],
  ['19', '19', '', 'let attempt = 0;'],
  ['20', '', '-', 'const backoff = 100;'],
  ['', '20', '+', 'const baseBackoff = options.backoffMs ?? 200;'],
  ['', '21', '+', 'const jitter = () => Math.random() * baseBackoff;'],
  ['21', '22', '', ''],
  ['22', '23', '', 'while (attempt < max) {'],
  ['23', '', '-', '  await sleep(backoff * attempt);'],
  ['', '24', '+', '  await sleep(baseBackoff * 2 ** attempt + jitter());'],
  ['24', '25', '', '  try {'],
  ['25', '26', '', '    return await run();'],
  ['26', '', '-', '  } catch (err) {'],
  ['', '27', '+', '  } catch (err: unknown) {'],
  ['', '28', '+', '    if (!isRetryable(err)) throw err;'],
  ['27', '29', '', '    attempt += 1;'],
  ['28', '30', '', '  }'],
  ['29', '31', '', '}'],
  ['30', '32', '', ''],
  ['31', '33', '', 'throw new RetryError(max);'],
  ['32', '34', '', '}'],
]

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-3. */
export default function ToolCalls3(props: ReferenceFixtureProps) {
  const [open, setOpen] = useState(true)
  return <div className="rb-public-tool-3" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <header className="rb-public-tool-3-header"><div><span>edit_file</span><h2>Applied 2 file edits</h2></div><p><b>+15</b> <i>−4</i></p></header>
    <section className="rb-public-tool-3-frame">
      <div className="rb-public-tool-3-frame-inner">
        <button type="button" className="rb-public-tool-3-file" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>services/payments/retry.ts</span><em><b>+9</b> <i>−3</i></em>
        </button>
        {open && <div className="rb-public-tool-3-diff">
          <div className="rb-public-tool-3-hunk">@@ -18,13 +18,19 @@ export function withRetry(</div>
          {retryLines.map(([oldLine, newLine, marker, code], index) => <div className={`rb-public-tool-3-line ${marker === '+' ? 'added' : marker === '-' ? 'removed' : ''}`} key={`${oldLine}-${newLine}-${index}`}>
            <span>{oldLine}</span><span>{newLine}</span><small>{marker}</small><code>{code}</code>
          </div>)}
        </div>}
      </div>
    </section>
  </div>
}
