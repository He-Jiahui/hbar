import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './agent-approval-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/agent-approval/agent-approval-1. */
export default function AgentApproval1(props: ReferenceFixtureProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [showRequest, setShowRequest] = useState(false)
  const pending = decision === 'pending'
  return <div className="rb-public-approval-1" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <main className="rb-public-approval-1-content">
      <p className="rb-public-approval-1-day">Today</p>
      <div className="rb-public-approval-1-user"><p>Clean up the archived projects: we’re over the storage quota again.</p></div>
      <p className="rb-public-approval-1-explanation">Twelve archived projects haven’t been opened in over a year. Removing them and their build history frees about 4.2 GB. Because this is permanent, I need you to confirm before I run it.</p>
      <div className="rb-public-approval-1-tool"><span className="dot" /> <strong>list_projects</strong><span>0.8s</span></div>
      <section className={`rb-public-approval-1-request${pending ? '' : ' resolved'}`}>
        <div className="rb-public-approval-1-request-main"><div className="rb-public-approval-1-risk"><i />{pending ? 'Needs approval' : decision}</div><h2>{pending ? 'Delete 12 archived projects and their build history' : decision === 'approved' ? 'Delete request approved' : 'Delete request rejected'}</h2><p>{pending ? 'Frees 4.2 GB in the storage-cleanup workspace. Active projects are untouched and this can’t be undone.' : 'The decision was recorded for this fixture interaction.'}</p></div>
        {showRequest && <pre className="rb-public-approval-1-json">{JSON.stringify({ action: 'delete_archived_projects', count: 12, workspace: 'storage-cleanup' }, null, 2)}</pre>}
        <div className="rb-public-approval-1-actions"><button type="button" className="show" onClick={() => setShowRequest((value) => !value)}><ChevronRight size={13} className={showRequest ? 'open' : ''} /> Show request</button><div>{pending ? <><button type="button" className="reject" onClick={() => setDecision('rejected')}>Reject</button><button type="button" className="confirm" onClick={() => setDecision('approved')}>Delete 12 projects</button></> : <button type="button" className="confirm" onClick={() => setDecision('pending')}>Show request</button>}</div></div>
      </section>
    </main>
  </div>
}
