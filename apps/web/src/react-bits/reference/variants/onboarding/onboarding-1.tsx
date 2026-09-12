import { Check, CircleUserRound, Upload } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './onboarding-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-1. */
export default function Onboarding1({ onInteraction }: ReferenceFixtureProps) {
  const [name, setName] = useState('Sam Rivera')
  const [job, setJob] = useState('Product Engineer')
  const [timezone, setTimezone] = useState('Berlin (GMT+1)')
  const [updates, setUpdates] = useState(true)
  const [done, setDone] = useState(false)
  return <section className="rb-public-onboarding-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><form className="rb-onboarding-form" onSubmit={(event) => { event.preventDefault(); setDone(true) }}><h2>Set up your profile</h2><p className="intro">Add the details teammates will see across the workspace.</p><div className="rb-onboarding-photo"><div><CircleUserRound size={24} /></div><span><button type="button"><Upload size={13} /> Upload photo</button><small>PNG or JPG, at least 400 × 400 px, up to 10 MB.</small></span></div><label>Full name *<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Job title<input value={job} onChange={(event) => setJob(event.target.value)} /></label><label>Timezone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>Select a timezone</option><option>Lisbon (GMT+0)</option><option>Berlin (GMT+1)</option><option>New York (GMT−5)</option><option>Singapore (GMT+8)</option></select></label><label className="rb-onboarding-check"><input type="checkbox" checked={updates} onChange={(event) => setUpdates(event.target.checked)} /><span>Send me product updates and workspace tips.</span></label><button type="submit" className="rb-onboarding-continue">{done ? <><Check size={14} /> Saved</> : 'Continue'}</button></form><aside className="rb-onboarding-preview"><small>DIRECTORY PREVIEW</small><div className="rb-preview-card"><header><span>SR</span><div><strong>{name}</strong><p>{job}</p></div></header><div className="rb-preview-meta"><div><small>Timezone</small><strong>{timezone.replace(/\s*\(.*/, '')}</strong></div><div><small>Updates</small><strong>{updates ? 'Subscribed' : 'Off'}</strong></div></div></div><p>This is how teammates will see you. You can change<br />any of it later from your account settings.</p></aside><button type="button" className="rb-onboarding-theme">◉&nbsp; Theme</button></section>
}
