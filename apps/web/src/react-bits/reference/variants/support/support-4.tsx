import type { ReferenceFixtureProps } from '../../reference-types'
import { ArrowRight, FileText, Send, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { reportFixtureClick } from '../../reference-interactions'
import './support-4.css'

/** Public clean-room fixture for https://pro.reactbits.dev/docs/app-ui/support/support-4. */
export default function Support4(props: ReferenceFixtureProps) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [closed, setClosed] = useState(false)
  const [notice, setNotice] = useState('')
  if (closed) return <section className="rb-public-support-4 rb-public-support-4-closed" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}><button type="button" onClick={() => setClosed(false)}>Open assistant</button><button type="button" className="rb-support-4-theme">◉&nbsp; Theme</button></section>
  return <section className="rb-public-support-4" onClickCapture={(event) => reportFixtureClick(event, props.onInteraction)}>
    <article className="rb-support-4-widget">
      <header className="rb-support-4-header"><span className="rb-support-4-avatar"><Sparkles size={16} /></span><div><strong>Northwind Assistant</strong><small>Answers from your workspace and the docs</small></div><button type="button" aria-label="Close chat" onClick={() => setClosed(true)}><X size={15} /></button></header>
      <div className="rb-support-4-body">
        <div className="rb-support-4-message assistant">Hi Priya. I can look things up in your workspace and in the docs. What are you running into?</div>
        <div className="rb-support-4-message user">Our Monday export came through with no rows in it.</div>
        <div className="rb-support-4-message assistant">Run 1104 finished at 06:00 and returned 0 rows. The saved view it uses was edited on Sunday at 17:41 and its date range is now a single day, which is the usual cause.</div>
        <div className="rb-support-4-links"><button type="button" onClick={() => setNotice('Opening article') }><FileText size={12} />Why an export can succeed with zero rows</button><button type="button" onClick={() => setNotice('Opening article')}><FileText size={12} />Editing a saved view used by a schedule</button></div>
        <div className="rb-support-4-actions"><button type="button" onClick={() => setNotice('Date range restored')}>Restore the previous date range</button><button type="button" onClick={() => setNotice('Export queued')}>Re-run the export now</button><button type="button" onClick={() => setNotice('A teammate will join shortly')}>Talk to a person <ArrowRight size={12} /></button></div>
        {notice && <p className="rb-support-4-notice" role="status">{notice}</p>}
        <form className="rb-support-4-composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) { setSent(true); setMessage('') } }}><textarea aria-label="Message" placeholder="Ask about your workspace" value={message} onChange={(event) => setMessage(event.target.value)} /><div><span>AI answers, checked against your data</span><button type="submit" aria-label="Send message"><Send size={14} /></button></div></form>
      </div>
    </article>
    {sent && <div className="rb-support-4-sent" role="status">Message sent</div>}
    <button type="button" className="rb-support-4-theme">◉&nbsp; Theme</button>
  </section>
}
