import { ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './app-dialog-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-1. */
export default function AppDialog1({ onInteraction }: ReferenceFixtureProps) {
  const [open, setOpen] = useState(true)
  const [applied, setApplied] = useState(false)
  if (!open) return <section className="rb-public-app-dialog-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><button type="button" className="rb-dialog-trigger" onClick={() => setOpen(true)}>{applied ? 'Plan changed' : 'Change plan'}</button><button type="button" className="rb-dialog-theme">◉&nbsp; Theme</button></section>
  const rows = [['Plan', 'Team', 'Scale'], ['Seats', '24', '40'], ['Monthly total', '$1,440.00', '$2,600.00'], ['Support', 'Business hours', '24/7 priority'], ['Audit log retention', '30 days', '1 year']] as const
  return <section className="rb-public-app-dialog-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-dialog-backdrop" /><div className="rb-dialog" role="dialog" aria-modal="true" aria-label="Apply plan change"><header><div><h2>Apply plan change</h2><p>Your workspace moves to the Scale plan at the next renewal on Jul 1. Nothing is charged today.</p></div><button type="button" aria-label="Close dialog" onClick={() => setOpen(false)}><X size={16} /></button></header><dl>{rows.map(([label, before, after]) => <div key={label}><dt>{label}</dt><dd><span>{before}</span><ArrowRight size={13} /><strong>{after}</strong></dd></div>)}</dl><footer><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="primary" onClick={() => { setApplied(true); setOpen(false) }}>Apply change</button></footer></div><button type="button" className="rb-dialog-theme">◉&nbsp; Theme</button></section>
}
