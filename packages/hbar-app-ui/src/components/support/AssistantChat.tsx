import { LumenButton, LumenTextarea } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
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

    if (!open) return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-assistant">
        <LumenButton type="button"
                className="hbar-app-ui-support-button hbar-app-ui-support-button-light hbar-app-ui-support-assistant-trigger"
                onClick={() => {
                    setOpen(true);
                    reportSupportAction(onAction, spec, 'open')
                }}>Open support assistant
        </LumenButton>
    </SupportFrame>

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-assistant">
        <section className="hbar-app-ui-support-assistant-panel" role="dialog" aria-modal="true"
                 aria-label="Northwind Assistant">
            <header><span className="hbar-app-ui-support-assistant-mark"><HbarAppUiIcon icon={Sparkles} tier="md" /></span><span><strong>Northwind Assistant</strong><small>Answers from your workspace and the docs</small></span><SupportIconButton
                label="Close chat" onClick={() => {
                setOpen(false);
                reportSupportAction(onAction, spec, 'close')
            }}><HbarAppUiIcon icon={X} tier="md" /></SupportIconButton></header>
            <main>
                <div className="hbar-app-ui-support-assistant-transcript">
                    <div className="hbar-app-ui-support-chat-bubble is-assistant">Hi Priya. I can look things up in your
                        workspace and in the docs. What are you running into?
                    </div>
                    <div className="hbar-app-ui-support-chat-bubble is-user">Our Monday export came through with no rows
                        in it.
                    </div>
                    <div className="hbar-app-ui-support-chat-bubble is-assistant">Run 1104 finished at 06:00 and
                        returned 0 rows. The saved view it uses was edited on Sunday at 17:41 and its date range is now
                        a single day, which is the usual cause.
                    </div>
                    {sent && <div className="hbar-app-ui-support-chat-bubble is-user">{sent}</div>}
                    <div className="hbar-app-ui-support-chat-related">{relatedArticles.map((article) => <LumenButton
                        type="button" key={article}
                        onClick={() => reportSupportAction(onAction, spec, 'open', article)}><HbarAppUiIcon icon={FileText} tier="sm"
                        />{article}</LumenButton>)}</div>
                </div>
                <div className="hbar-app-ui-support-assistant-actions">
                    <div className="hbar-app-ui-support-chat-actions">
                        <LumenButton type="button"
                                onClick={() => reportSupportAction(onAction, spec, 'run', 'restore-date-range')}>Restore
                            the previous date range
                        </LumenButton>
                        <LumenButton type="button"
                                onClick={() => reportSupportAction(onAction, spec, 'run', 'rerun-export')}>Re-run the
                            export now
                        </LumenButton>
                        <LumenButton type="button" onClick={() => {
                            setHandoff(true);
                            reportSupportAction(onAction, spec, 'handoff')
                        }}>Talk to a person <HbarAppUiIcon icon={ArrowRight} tier="sm" /></LumenButton>
                    </div>
                    {handoff && <p className="hbar-app-ui-support-assistant-handoff">A support specialist will join this
                        conversation.</p>}
                    <form className="hbar-app-ui-support-assistant-composer" onSubmit={(event) => {
                        event.preventDefault();
                        submit()
                    }}><LumenTextarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)}
                                 placeholder="Ask about your workspace" aria-label="Ask about your workspace"/>
                        <footer><small>AI answers, checked against your data</small>
                            <LumenButton type="submit" aria-label="Send message" disabled={!message.trim()}><HbarAppUiIcon icon={Send} tier="md" />
                            </LumenButton>
                        </footer>
                    </form>
                </div>
            </main>
        </section>
    </SupportFrame>
}
