import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-approval-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-approval/agent-approval-2. */
export default function AgentApproval2({ onInteraction }: ReferenceFixtureProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [showDiff, setShowDiff] = useState(false)
  return <section className="rb-public-approval-2" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><h1>Retention policy update</h1><span>Repo maintenance agent</span></header>
    <main>
      <section className={`rb-public-approval-2-card is-${decision}`}>
        <div className="rb-public-approval-2-body">
          <div className="rb-public-approval-2-status"><i />{decision === 'pending' ? 'Needs approval' : decision === 'approved' ? 'Approved' : 'Rejected'}</div>
          <h2>Change the invoice retention window from 180 to 45 days</h2>
          <p>Applies to the finance workspace. Invoice drafts older than 45 days will be purged nightly; posted invoices are never touched.</p>
          <dl>
            <div><dt>Retention window</dt><dd><s>180 days</s><ChevronRight size={13} /><strong>45 days</strong></dd></div>
            <div><dt>Nightly purge</dt><dd><s>Off</s><ChevronRight size={13} /><strong>On</strong></dd></div>
            <div><dt>Grace period before purge</dt><dd><s>None</s><ChevronRight size={13} /><strong>7 days</strong></dd></div>
          </dl>
          {showDiff && <pre className="rb-public-approval-2-diff">- retentionWindow: 180 days\n+ retentionWindow: 45 days</pre>}
        </div>
        <footer>
          <button type="button" className="rb-public-approval-2-diff-toggle" onClick={() => setShowDiff((value) => !value)}><ChevronRight size={13} className={showDiff ? 'open' : ''} />{showDiff ? 'Hide diff' : 'Show diff'}</button>
          <div><button type="button" onClick={() => setDecision('rejected')}>Reject</button><button type="button" onClick={() => setDecision('approved')}>Always allow</button><button type="button" className="primary" onClick={() => setDecision('approved')}>Approve</button></div>
        </footer>
      </section>
    </main>
  </section>
}
