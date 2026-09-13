import type { ReferenceFixtureProps } from '../../reference-types'
import { Archive, ChevronRight, Clipboard, Copy, FileText, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './app-dialog-7.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/app-dialog/app-dialog-7. */
export default function AppDialog7(props: ReferenceFixtureProps) {
  const [open, setOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const actions = [{ label: 'Rename report', shortcut: '⌘R', icon: Pencil }, { label: 'Duplicate', shortcut: '⌘D', icon: Copy }, { label: 'Export as', shortcut: '', icon: FileText, arrow: true }, { label: 'Copy link', shortcut: '⌘⇧C', icon: Clipboard }, { label: 'Move to archive', shortcut: '', icon: Archive }, { label: 'Delete report', shortcut: '', icon: Trash2, danger: true }] as const
  return <section className="rb-public-app-dialog-7" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><button type="button" className={`rb-app-dialog-7-trigger${open ? ' blurred' : ''}`} onClick={() => setOpen(true)}>Report actions <ChevronRight size={13} /></button>{open && <div className="rb-app-dialog-7-scrim" role="dialog" aria-label="Report actions"><h2 className="sr-only">Report actions</h2><div className="rb-app-dialog-7-menu">{actions.map((action, index) => { const { label, shortcut, icon: Icon } = action; const arrow = 'arrow' in action && action.arrow; const danger = 'danger' in action && action.danger; return <button type="button" key={label} className={`${index === 0 ? 'selected ' : ''}${danger ? 'danger' : ''}`} onClick={() => { setNotice(label); setOpen(false) }}><Icon size={15} /><span>{label}</span>{shortcut && <small>{shortcut}</small>}{arrow && <ChevronRight className="arrow" size={14} />}</button> })}</div></div>}{notice && <p className="rb-app-dialog-7-notice" role="status">{notice}</p>}</section>
}
