import { useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './tool-calls-6.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/tool-calls/tool-calls-6. */
export default function ToolCalls6({ onInteraction }: ReferenceFixtureProps) {
  const [approved, setApproved] = useState(false)
  const [toggles, setToggles] = useState([true, true, false, true, false])
  const toggle = (index: number) => setToggles((current) => current.map((value, item) => item === index ? !value : value))
  return <section className="rb-public-permissions-6" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}>
    <header><h1>Tool permissions</h1><span>{approved ? '1 pending' : '2 pending'}</span></header>
    <PermissionGroup title="REQUESTS"><div className="rb-public-permissions-6-request is-pending"><i /><div><strong>Send the Q3 renewal summary to 4 recipients</strong><small>send_email</small><button type="button"><ChevronRight size={13} />View request</button><div><button type="button" className="approve" onClick={() => setApproved(true)}><Check size={14} />Approve</button><button type="button" className="reject"><X size={14} />Reject</button></div></div></div><div className="rb-public-permissions-6-request"><i /><div><strong>Apply migration 0042_add_idempotency_key to production</strong><small>run_migration</small><button type="button"><ChevronRight size={13} />View request</button><p>Waiting for the request above</p></div></div><div className="rb-public-permissions-6-request compact"><i /><b>read_file</b><span>Read services/payments/retry.ts</span><em>Auto-approved</em></div></PermissionGroup>
    <PermissionGroup title="FILESYSTEM"><PermissionRow name="read_file" detail="Read any file inside the workspace" checked={toggles[0] ?? false} onClick={() => toggle(0)} /><PermissionRow name="edit_file" detail="Modify files and show a diff before saving" checked={toggles[1] ?? false} onClick={() => toggle(1)} /><PermissionRow name="delete_file" detail="Remove files, asking before each deletion" checked={toggles[2] ?? false} onClick={() => toggle(2)} /></PermissionGroup>
    <PermissionGroup title="NETWORK"><PermissionRow name="web_search" detail="Search the web for public documentation" checked={toggles[3] ?? false} onClick={() => toggle(3)} /><PermissionRow name="send_email" detail="Send email, asking approval each time" checked={toggles[4] ?? false} onClick={() => toggle(4)} /></PermissionGroup>
  </section>
}

function PermissionGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rb-public-permissions-6-group"><h2>{title}</h2><div>{children}</div></section> }
function PermissionRow({ name, detail, checked, onClick }: { name: string; detail: string; checked: boolean; onClick: () => void }) { return <div className="rb-public-permissions-6-row"><div><strong>{name}</strong><small>{detail}</small></div><button type="button" role="switch" aria-checked={checked} className={checked ? 'on' : ''} onClick={onClick}><i /></button></div> }
