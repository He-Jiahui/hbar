import { Image, Lightbulb, MessageSquareWarning, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReferenceFixtureProps } from '../../reference-types'
import { reportFixtureClick } from '../../reference-interactions'
import './feedback-1.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/feedback/feedback-1. */
export default function Feedback1({ onInteraction }: ReferenceFixtureProps) {
  const [kind, setKind] = useState('Idea')
  const [sent, setSent] = useState(false)
  const [text, setText] = useState('')
  if (sent) return <section className="rb-public-feedback-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-feedback-dialog"><h2>Thanks for the feedback</h2><p>Your note was sent to the team that owns this screen.</p><button type="button" onClick={() => setSent(false)}>Send another</button></div><button type="button" className="rb-feedback-theme">◉&nbsp; Theme</button></section>
  const types: readonly [string, LucideIcon][] = [['Idea', Lightbulb], ['Issue', MessageSquareWarning], ['Praise', MessageSquareWarning]]
  return <section className="rb-public-feedback-1" onClickCapture={(event) => reportFixtureClick(event, onInteraction)}><div className="rb-feedback-dim" /><div className="rb-feedback-dialog" role="dialog" aria-label="Send feedback"><header><div><h2>Send feedback</h2><p>Goes to the team that owns this screen.</p></div><button type="button" aria-label="Close feedback"><X size={14} /></button></header><div className="rb-feedback-types" role="radiogroup">{types.map(([label, Icon]) => <button type="button" role="radio" aria-checked={kind === label} className={kind === label ? 'selected' : ''} key={label} onClick={() => setKind(label)}><Icon size={14} /> {label}</button>)}</div><div className="rb-feedback-text"><textarea aria-label="Your feedback" placeholder="What would you like the product to do?" value={text} onChange={(event) => setText(event.target.value)} /><div><button type="button"><Image size={14} /> Screenshot attached</button><span>{400 - text.length}</span></div></div><div className="rb-feedback-context">Sent with your page URL, browser and workspace so we can reproduce it. No page content is captured.</div><footer><button type="button">Cancel</button><button type="button" className="primary" onClick={() => setSent(true)} disabled={!text.trim()}>Send feedback</button></footer></div><button type="button" className="rb-feedback-theme">◉&nbsp; Theme</button></section>
}
