import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {CheckCircle2, LockKeyhole, Paperclip, Send} from 'lucide-react'
import {reportSupportAction, SupportChip, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

type ThreadMessage = {
    readonly id: string
    readonly sender: 'You' | 'Sofia Alvarez'
    readonly role?: string
    readonly time: string
    readonly body: string
    readonly attachment?: string
}

const messages: readonly ThreadMessage[] = [
    {id: 'one', sender: 'You', time: 'Mon 09:12', body: 'The Monday revenue export landed with headers but no rows. It ran at 06:00 as usual and the run log says it succeeded.', attachment: 'export-log-1104.txt'},
    {id: 'two', sender: 'Sofia Alvarez', role: 'Support', time: 'Mon 09:31', body: 'Thanks for the log. The job completed against a filter that excluded every row, which is why it reported success. Was the saved view edited on Sunday?'},
    {id: 'three', sender: 'You', time: 'Mon 10:04', body: 'Yes, someone narrowed the date range to a single day while testing and left it that way.'},
    {id: 'four', sender: 'Sofia Alvarez', role: 'Support', time: 'Mon 10:22', body: 'That explains it. I have added a warning on scheduled runs that return zero rows, shipping this week. In the meantime the schedule will email you instead of writing an empty file.'},
    {id: 'five', sender: 'You', time: 'Mon 11:15', body: 'Restored the range and re-ran it, 14,208 rows this time. Is there a way to lock a saved view so a schedule cannot be changed underneath it?'},
    {id: 'six', sender: 'Sofia Alvarez', role: 'Support', time: 'Mon 11:40', body: 'Yes. Open the view, choose Lock for schedules, and edits then require an admin. I have attached the steps for your workspace.', attachment: 'lock-a-saved-view.pdf'},
]

export function TicketThread({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [resolved, setResolved] = useState(false)
    const [reply, setReply] = useState('')
    const [sentReply, setSentReply] = useState<string | null>(null)
    const sendReply = () => {
        const next = reply.trim()
        if (!next) return
        setSentReply(next)
        setReply('')
        reportSupportAction(onAction, spec, 'reply', next)
    }

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-thread"><header className="hbar-app-ui-support-thread-heading"><div><div className="hbar-app-ui-support-thread-title"><h1>Scheduled export is empty</h1>{!resolved && <SupportChip tone="light">Awaiting your reply</SupportChip>}</div><p>Ticket #4192 · Reports and exports · Normal priority</p></div><button type="button" className="hbar-app-ui-support-button" onClick={() => {setResolved((value) => !value); reportSupportAction(onAction, spec, resolved ? 'reopen' : 'resolve')}}><HbarAppUiIcon icon={CheckCircle2} tier="md" />{resolved ? 'Reopen ticket' : 'Mark resolved'}</button></header>
        <div className="hbar-app-ui-support-thread-layout"><section className="hbar-app-ui-support-thread-main"><ol className="hbar-app-ui-support-messages">{messages.map((message) => <li key={message.id}><article><span className={`hbar-app-ui-support-message-avatar ${message.sender === 'You' ? 'is-you' : ''}`}>{message.sender === 'You' ? 'You' : 'SA'}</span><div><header><strong>{message.sender}</strong>{message.role && <small>{message.role}</small>}<time>{message.time}</time></header><p>{message.body}</p>{message.attachment && <span className="hbar-app-ui-support-file"><HbarAppUiIcon icon={Paperclip} tier="sm" />{message.attachment}</span>}</div></article></li>)}{sentReply && <li><article><span className="hbar-app-ui-support-message-avatar is-you">You</span><div><header><strong>You</strong><time>Now</time></header><p>{sentReply}</p></div></article></li>}</ol><form className="hbar-app-ui-support-reply" onSubmit={(event) => {event.preventDefault(); sendReply()}}><textarea rows={1} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to Sofia" aria-label="Reply to Sofia"/><footer><button type="button" aria-label="Attach a file" className="hbar-app-ui-support-icon-plain" onClick={() => reportSupportAction(onAction, spec, 'attach')}><HbarAppUiIcon icon={Paperclip} tier="md" /></button><button type="submit" className="hbar-app-ui-support-button hbar-app-ui-support-button-light" disabled={!reply.trim()}><HbarAppUiIcon icon={Send} tier="sm" />Send reply</button></footer></form></section><aside className="hbar-app-ui-support-thread-aside"><section><h2>Timeline</h2><dl><div><dt>Opened</dt><dd>Mon 09:12</dd></div><div><dt>First reply</dt><dd>19m later</dd></div><div><dt>Assigned to</dt><dd>Sofia Alvarez</dd></div><div><dt>Last update</dt><dd>Mon 10:22</dd></div></dl></section><section><h2>Related article</h2><strong>Why a scheduled export can succeed with zero rows</strong><button type="button" className="hbar-app-ui-support-button" onClick={() => reportSupportAction(onAction, spec, 'open', 'related-article')}>Open article</button></section><section className="hbar-app-ui-support-thread-access"><HbarAppUiIcon icon={LockKeyhole} tier="md" /><p>Only workspace admins and the assigned agent can read this thread.</p></section></aside></div>
    </SupportFrame>
}
