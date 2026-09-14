import {useState} from 'react'
import {FileText, Paperclip, X} from 'lucide-react'
import {reportSupportAction, SupportChip, SupportFrame, type SupportSurfaceProps} from './SupportPrimitives'

const areaOptions = ['Reports and exports', 'Billing and plans', 'Accounts and access', 'Integrations and API'] as const
const workspaceOptions = ['Northwind · Production', 'Northwind · Staging', 'Meridian'] as const
const suggestedArticles = ['Scheduled export arrives with no rows', 'Export runs but the file never lands in storage', 'Column order changes between runs'] as const
const priorityOptions = ['Low', 'Normal', 'Urgent'] as const

export function TicketForm({spec, onAction}: SupportSurfaceProps): React.JSX.Element {
    const [area, setArea] = useState<(typeof areaOptions)[number]>('Reports and exports')
    const [workspace, setWorkspace] = useState<(typeof workspaceOptions)[number]>('Northwind · Production')
    const [priority, setPriority] = useState<(typeof priorityOptions)[number]>('Normal')
    const [subject, setSubject] = useState('Scheduled export is empty')
    const [details, setDetails] = useState('')
    const [attachment, setAttachment] = useState(true)
    const [submitted, setSubmitted] = useState(false)

    const submit = () => {
        setSubmitted(true)
        reportSupportAction(onAction, spec, 'submit', priority)
    }

    return <SupportFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-ticket"><main className="hbar-app-ui-support-ticket-page">
        <header className="hbar-app-ui-support-ticket-heading"><h1>Open a ticket</h1><p>The more detail you give us up front, the fewer round trips it takes.</p></header>
        <div className="hbar-app-ui-support-ticket-layout"><form className="hbar-app-ui-support-ticket-form" onSubmit={(event) => {event.preventDefault(); submit()}}>
            <div className="hbar-app-ui-support-ticket-selects"><label>Area<select value={area} onChange={(event) => setArea(event.target.value as (typeof areaOptions)[number])}>{areaOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label>Workspace<select value={workspace} onChange={(event) => setWorkspace(event.target.value as (typeof workspaceOptions)[number])}>{workspaceOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div>
            <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)}/></label>
            <section className="hbar-app-ui-support-suggestions"><h2>These may answer it already</h2>{suggestedArticles.map((article) => <button type="button" key={article} onClick={() => reportSupportAction(onAction, spec, 'open', article)}><FileText size={14} aria-hidden="true"/><span>{article}</span></button>)}</section>
            <fieldset className="hbar-app-ui-support-priority"><legend>Priority</legend><div role="radiogroup" aria-label="Priority">{priorityOptions.map((option) => <button type="button" role="radio" aria-checked={priority === option} className={priority === option ? 'is-selected' : ''} key={option} onClick={() => {setPriority(option); reportSupportAction(onAction, spec, 'priority', option)}}>{option}</button>)}</div></fieldset>
            <label>What happened?<textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="What you did, what you expected, and what happened instead."/></label>
            <div className="hbar-app-ui-support-attachments"><button type="button" className="hbar-app-ui-support-button" onClick={() => {setAttachment(true); reportSupportAction(onAction, spec, 'attach')}}><Paperclip size={16}/>Attach files</button>{attachment && <span>export-log-1104.txt<button type="button" aria-label="Remove export-log-1104.txt" onClick={() => setAttachment(false)}><X size={14}/></button></span>}</div>
            <footer><button type="button" className="hbar-app-ui-support-button hbar-app-ui-support-button-quiet" onClick={() => reportSupportAction(onAction, spec, 'save', subject)}>Save draft</button><button type="submit" className="hbar-app-ui-support-button hbar-app-ui-support-button-light">{submitted ? 'Ticket submitted' : 'Submit ticket'}</button></footer>
        </form><aside className="hbar-app-ui-support-ticket-aside"><section><h2>First response</h2><strong>{priority === 'Urgent' ? '1 hour' : priority === 'Low' ? '1 business day' : '8 hours'}</strong><p>Based on your plan and the priority you selected.</p></section><section><h2>Sent with your ticket</h2><dl><div><dt>Plan</dt><dd>Pro</dd></div><div><dt>Region</dt><dd>eu-west</dd></div><div><dt>App version</dt><dd>4.19.2</dd></div></dl></section><section><h2>Before you send</h2><p>Name the report or schedule, not just the screen it appeared on.</p><p>Include the run time and time zone if the problem is intermittent.</p><p>Attach the run log rather than a screenshot of it where you can.</p></section><section><h2>Recent tickets</h2><div className="hbar-app-ui-support-recent-ticket"><span>Webhook retries stop</span><SupportChip>Resolved</SupportChip></div><div className="hbar-app-ui-support-recent-ticket"><span>Two invoices in March</span><SupportChip>Open</SupportChip></div></section></aside></div>
    </main></SupportFrame>
}
