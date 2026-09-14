import {useState} from 'react'
import {
    BookOpen,
    ChevronRight,
    Clock3,
    LifeBuoy,
    Mail,
    MessageCircle,
    Paperclip,
    Search,
    Send,
    TicketCheck,
    UserRound
} from 'lucide-react'
import {HbarAppUiButton, HbarAppUiSpotlight, HbarAppUiStatus, HbarAppUiTabs, HbarAppUiToolbar} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type SupportProps = HbarAppUiVariantProps

function HelpCenter({spec, onAction}: SupportProps) {
    const [query, setQuery] = useState('');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-support-variant-1"><HbarAppUiToolbar title="Help center"
                                                                                           detail="Search topics and popular articles"/>
        <div className="hbar-app-ui-inline-search"><Search size={14}/><input value={query}
                                                                             onChange={(event) => setQuery(event.target.value)}
                                                                             placeholder="Search help"/></div>
        <div
            className="hbar-app-ui-help-topics">{['Getting started', 'Workspaces', 'Activity and runs', 'Billing'].filter((topic) => topic.toLowerCase().includes(query.toLowerCase())).map((topic) =>
            <HbarAppUiSpotlight key={topic}><BookOpen size={17}/>
                <div><strong>{topic}</strong><small>8 articles</small></div>
                <ChevronRight size={13}/></HbarAppUiSpotlight>)}</div>
        <div className="hbar-app-ui-popular-articles"><strong>Popular articles</strong>
            <button type="button">Connect a local host</button>
            <button type="button">Recover a failed run</button>
            <button type="button">Invite a teammate</button>
        </div>
        <HbarAppUiButton tone="accent" onClick={() => onAction?.({variantId: spec.id, actionId: 'contact'})}><Mail
            size={13}/>Contact support</HbarAppUiButton></ActionSurfaceFrame>
}

function TicketForm({spec, onAction}: SupportProps) {
    const [priority, setPriority] = useState('Normal');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-support-variant-2"><HbarAppUiToolbar title="Submit a ticket"
                                                                                           detail="Article suggestions and response time"/><label>Subject<input
        placeholder="What can we help with?"/></label><label>Priority<select value={priority}
                                                                             onChange={(event) => setPriority(event.target.value)}>
        <option>Low</option>
        <option>Normal</option>
        <option>High</option>
        <option>Urgent</option>
    </select></label><HbarAppUiSpotlight><BookOpen size={14}/>
        <div><strong>Suggested article</strong><p>Check the connection troubleshooting guide before sending.</p></div>
        <ChevronRight size={13}/></HbarAppUiSpotlight><textarea placeholder="Describe the issue"/><label><Paperclip
        size={13}/>Attachments<input type="file"/></label><HbarAppUiStatus
        value={priority === 'Urgent' ? 'Reply within 1 hour' : 'Reply within 1 business day'}
        tone={priority === 'Urgent' ? 'warning' : 'neutral'}/><HbarAppUiButton tone="accent" onClick={() => onAction?.({
        variantId: spec.id,
        actionId: 'submit',
        value: priority
    })}><Send size={13}/>Submit ticket</HbarAppUiButton></ActionSurfaceFrame>
}

function TicketThread({spec, onAction}: SupportProps) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-support-variant-3">
        <div className="hbar-app-ui-ticket-thread">
            <main><HbarAppUiToolbar title="Ticket #1842" detail="Workspace connection issue"/><HbarAppUiStatus
                value="Open" tone="warning"/>
                <div className="hbar-app-ui-chat-transcript"><HbarAppUiSpotlight><span
                    className="hbar-app-ui-avatar">A</span>
                    <div><strong>You</strong><p>The workspace disconnected while a run was active.</p>
                        <small>10:18</small></div>
                </HbarAppUiSpotlight><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">S</span>
                    <div><strong>Support</strong><p>We found a stale host session. Reconnect and retry the run.</p>
                        <small>10:24</small></div>
                </HbarAppUiSpotlight></div>
                <textarea placeholder="Reply to support" onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        onAction?.({variantId: spec.id, actionId: 'reply', value: event.currentTarget.value});
                        event.currentTarget.value = ''
                    }
                }}/></main>
            <aside><HbarAppUiToolbar title="Timeline" detail="Ticket events"/><span><Clock3 size={13}/>Created · 18m ago</span><span><MessageCircle
                size={13}/>Assigned · 12m ago</span><span><LifeBuoy size={13}/>Response · 2m ago</span></aside>
        </div>
    </ActionSurfaceFrame>
}

function SupportChat({spec, onAction}: SupportProps) {
    const [handoff, setHandoff] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-support-variant-4"><HbarAppUiToolbar title="Support chat"
                                                                                           detail="Answers use workspace data"/><HbarAppUiStatus
        value={handoff ? 'Connecting a person' : 'Assistant online'} tone={handoff ? 'warning' : 'positive'}/>
        <div className="hbar-app-ui-support-chat"><HbarAppUiSpotlight><span className="hbar-app-ui-avatar">?</span>
            <div><strong>Support assistant</strong><p>I can look up runs, files and connection status.</p></div>
        </HbarAppUiSpotlight>
            <div className="hbar-app-ui-quick-replies"><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'ask', value: 'connection'})}>Why did my run
                fail?</HbarAppUiButton><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'ask', value: 'billing'})}>Show billing
                status</HbarAppUiButton></div>
            <HbarAppUiButton onClick={() => {
                setHandoff(true);
                onAction?.({variantId: spec.id, actionId: 'handoff'})
            }}><UserRound size={13}/>Talk to a person</HbarAppUiButton></div>
        <textarea placeholder="Ask support"/></ActionSurfaceFrame>
}

function RequestList({spec, onAction}: SupportProps) {
    const [tab, setTab] = useState('Open');
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-support-variant-5"><HbarAppUiToolbar title="Support requests"
                                                                                           detail="Status and reply counts"/><HbarAppUiTabs
        label="Request status" value={tab} options={['Open', 'Pending', 'Closed'].map((id) => ({id, label: id}))}
        onChange={setTab}/>
        <div
            className="hbar-app-ui-request-list">{['Unable to connect workspace', 'Question about run budget', 'Export is still processing'].map((request, index) =>
            <HbarAppUiSpotlight key={request}><TicketCheck size={14}/>
                <div><strong>{request}</strong><small>{index + 1} replies · {index + 1}h ago</small></div>
                <HbarAppUiStatus value={tab} tone={tab === 'Open' ? 'warning' : 'neutral'}/><HbarAppUiButton
                    onClick={() => onAction?.({
                        variantId: spec.id,
                        actionId: 'reply',
                        value: request
                    })}>Reply</HbarAppUiButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

export function Support({spec, onAction}: SupportProps) {
    switch (spec.variant) {
        case 1:
            return <HelpCenter spec={spec} onAction={onAction}/>;
        case 2:
            return <TicketForm spec={spec} onAction={onAction}/>;
        case 3:
            return <TicketThread spec={spec} onAction={onAction}/>;
        case 4:
            return <SupportChat spec={spec} onAction={onAction}/>;
        case 5:
            return <RequestList spec={spec} onAction={onAction}/>;
        default:
            return <HelpCenter spec={spec} onAction={onAction}/>
    }
}
