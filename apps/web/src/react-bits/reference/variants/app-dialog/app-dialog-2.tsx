import type { ReferenceFixtureProps } from '../../reference-types'
import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './app-dialog-2.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-2. */
export default function AppDialog2(props: ReferenceFixtureProps) {
  const [value, setValue] = useState('')
  const [deleted, setDeleted] = useState(false)
  if (deleted) return <section className="rb-public-app-dialog-2 rb-app-dialog-2-done"><p>Project deleted</p></section>
  return <section className="rb-public-app-dialog-2" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><div className="rb-app-dialog-2-scrim"><article role="dialog" aria-label="Delete project"><header><div><h2>Delete atlas-production?</h2><p>This permanently removes the project and everything in it. It can't be undone.</p></div><button type="button" aria-label="Close dialog"><X size={15} /></button></header><div className="rb-app-dialog-2-stats"><div><strong>1,204</strong><span>Deployments</span></div><div><strong>38</strong><span>Environment variables</span></div><div><strong>3</strong><span>Custom domains</span></div><div><strong>11</strong><span>Team members</span></div></div><label>Type <strong>atlas-production</strong> to confirm<input aria-label="atlas-production" placeholder="atlas-production" value={value} onChange={(event) => setValue(event.target.value)} /></label><footer><button type="button">Cancel</button><button type="button" className="danger" disabled={value !== 'atlas-production'} onClick={() => setDeleted(true)}><AlertTriangle size={13} /> Delete project</button></footer></article></div></section>
}
