import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowLeft, ChevronDown, Mail, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './command-menu-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/command-menu/command-menu-4. */
export default function CommandMenu4(props: ReferenceFixtureProps) {
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [email, setEmail] = useState('erin.walsh@northwind.io')
  const [role, setRole] = useState('Editor')
  const [closed, setClosed] = useState(false)
  if (closed) return <section className="rb-public-command-4 rb-public-command-4-closed"><button type="button" onClick={() => setClosed(false)}>Run an action <kbd>⌘K</kbd></button></section>
  return <section className="rb-public-command-4" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-command-4-scrim"><section className="rb-command-4-dialog" role="dialog" aria-label="Run an action"><header><button type="button" aria-label="Back to actions" onClick={() => step === 'review' ? setStep('form') : setClosed(true)}><ArrowLeft size={15} /></button><UserPlus size={15} /><strong>{step === 'form' ? 'Invite a teammate' : 'Review invitation'}</strong><small>{step === 'form' ? 'Step 1 of 2' : 'Step 2 of 2'}</small></header>{step === 'form' ? <div className="rb-command-4-form"><label>Email address<input aria-label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<div className="rb-command-4-select"><select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)}><option>Viewer</option><option>Editor</option><option>Admin</option></select><ChevronDown size={14} /></div></label></div> : <div className="rb-command-4-review"><p><Mail size={14} /> Invite <strong>{email || 'name@company.com'}</strong> as <strong>{role}</strong>?</p><small>They will receive an email with access to the Northwind workspace.</small></div>}<footer><span><kbd>↵</kbd> to review <kbd>esc</kbd> to close</span><button type="button" className="primary" onClick={() => step === 'form' ? setStep('review') : setClosed(true)}>{step === 'form' ? 'Review' : 'Send invite'}</button></footer></section></div></section>
}
