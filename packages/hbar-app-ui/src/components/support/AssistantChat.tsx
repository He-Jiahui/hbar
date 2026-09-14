import {useState} from 'react'
import {ArrowRight, FileText, Send, Sparkles, X} from 'lucide-react'
import {reportSupportAction, SupportFrame, SupportIconButton, type SupportSurfaceProps} from './SupportPrimitives'

const relatedArticles = ['Why an export can succeed with zero rows', 'Editing a saved view used by a schedule'] as const

export function AssistantChat({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [open, setOpen] = useState(true)
    const [message, setMessage] = useState('')
    const [sent, setSent] = useState<string | null>(null)
    const [handoff, setHandoff] = useState(false)
    const submit = () => {
        const next = message.trim()
        if (!next) return
        setSent(next)
        setMessage('')
        reportSupportAction(onAction, spec, 'send', next)
    }

    if (!open) return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-assistant"><button type="button" className="hbar-app-ui-support-button hbar-app-ui-support-button-light hbar-app-ui-support-assistant-trigger" onClick={() => {setOpen(true); reportSupportAction(onAction, spec, 'open')}}>Open support assistant</button></SupportFrame>

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-assistant"><section className="hbar-app-ui-support-assistant-panel" role="dialog" aria-modal="true" aria-label="Northwind Assistant"><header><span className="hbar-app-ui-support-assistant-mark"><Sparkles size={18}/></span><span><strong>Northwind Assistant</strong><small>Answers from your workspace and the docs</small></span><SupportIconButton label="Close chat" onClick={() => {setOpen(false); reportSupportAction(onAction, spec, 'close')}}><X size={18}/></SupportIconButton></header><main><div className="hbar-app-ui-support-assistant-transcript"><div className="hbar-app-ui-support-chat-bubble is-assistant">Hi Priya. I can look things up in your workspace and in the docs. What are you running into?</div><div className="hbar-app-ui-support-chat-bubble is-user">Our Monday export came through with no rows in it.</div><div className="hbar-app-ui-support-chat-bubble is-assistant">Run 1104 finished at 06:00 and returned 0 rows. The saved view it uses was edited on Sunday at 17:41 and its date range is now a single day, which is the usual cause.</div>{sent && <div className="hbar-app-ui-support-chat-bubble is-user">{sent}</div>}<div className="hbar-app-ui-support-chat-related">{relatedArticles.map((article) => <button type="button" key={article} onClick={() => reportSupportAction(onAction, spec, 'open', article)}><FileText size={14}/>{article}</button>)}</div></div><div className="hbar-app-ui-support-assistant-actions"><div className="hbar-app-ui-support-chat-actions"><button type="button" onClick={() => reportSupportAction(onAction, spec, 'run', 'restore-date-range')}>Restore the previous date range</button><button type="button" onClick={() => reportSupportAction(onAction, spec, 'run', 'rerun-export')}>Re-run the export now</button><button type="button" onClick={() => {setHandoff(true); reportSupportAction(onAction, spec, 'handoff')}}>Talk to a person <ArrowRight size={14}/></button></div>{handoff && <p className="hbar-app-ui-support-assistant-handoff">A support specialist will join this conversation.</p>}<form className="hbar-app-ui-support-assistant-composer" onSubmit={(event) => {event.preventDefault(); submit()}}><textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about your workspace" aria-label="Ask about your workspace"/><footer><small>AI answers, checked against your data</small><button type="submit" aria-label="Send message" disabled={!message.trim()}><Send size={17}/></button></footer></form></div></main></section></SupportFrame>
}
