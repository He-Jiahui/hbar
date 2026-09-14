import {useState} from 'react'
import {Bell, Check, Clock3, X} from 'lucide-react'
import {
    HbarAppUiButton,
    HbarAppUiIconButton,
    HbarAppUiSpotlight,
    HbarAppUiStatus,
    HbarAppUiTabs,
    HbarAppUiToolbar
} from '../primitives'
import type {HbarAppUiVariantProps} from '../types'
import {ActionSurfaceFrame} from './SurfaceFrame'

type NotificationProps = HbarAppUiVariantProps

function NotificationCenter({spec, onAction}: NotificationProps) {
    const [filter, setFilter] = useState('Unread');
    const [read, setRead] = useState<string[]>([]);
    const notes = [{
        id: 'run',
        title: 'Run completed',
        detail: 'Workspace sync finished',
        tone: 'positive' as const
    }, {
        id: 'approval',
        title: 'Approval needed',
        detail: 'A tool call is waiting',
        tone: 'warning' as const
    }, {id: 'budget', title: 'Budget threshold', detail: 'Usage is approaching the limit', tone: 'warning' as const}];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-notification-variant-1"><HbarAppUiToolbar
        title="Notification center" detail="Grouped by day"/><HbarAppUiTabs label="Notifications" value={filter}
                                                                            options={[{
                                                                                id: 'Unread',
                                                                                label: 'Unread'
                                                                            }, {id: 'All', label: 'All'}]}
                                                                            onChange={setFilter}/>
        <div className="hbar-app-ui-notification-day">
            <strong>Today</strong>{notes.filter((note) => filter === 'All' || !read.includes(note.id)).map((note) =>
            <HbarAppUiSpotlight key={note.id}><Bell size={14}/>
                <div><strong>{note.title}</strong><small>{note.detail} · 2m ago</small></div>
                <HbarAppUiStatus value={read.includes(note.id) ? 'Read' : 'New'} tone={note.tone}/><HbarAppUiIconButton
                    label="Mark read" onClick={() => {
                    setRead((current) => [...current, note.id]);
                    onAction?.({variantId: spec.id, actionId: 'read', value: note.id})
                }}><Check size={13}/></HbarAppUiIconButton><HbarAppUiIconButton label="Dismiss"
                                                                                onClick={() => onAction?.({
                                                                                    variantId: spec.id,
                                                                                    actionId: 'dismiss',
                                                                                    value: note.id
                                                                                })}><X size={13}/></HbarAppUiIconButton></HbarAppUiSpotlight>)}
        </div>
    </ActionSurfaceFrame>
}

function ToastStack({spec, onAction}: NotificationProps) {
    const [expanded, setExpanded] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-notification-variant-2"><HbarAppUiToolbar title="Toast stack"
                                                                                                detail="Hover to expand and pause timers"/><HbarAppUiButton
        onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse' : 'Expand'} stack</HbarAppUiButton>
        <div className={`hbar-app-ui-toast-stack ${expanded ? 'is-expanded' : ''}`} onMouseEnter={() => onAction?.({
            variantId: spec.id,
            actionId: 'pause'
        })}>{['Run completed', 'Approval needed', 'Connection restored'].slice(0, expanded ? 3 : 1).map((message, index) =>
            <HbarAppUiSpotlight key={message}><Bell
                size={14}/><span><strong>{message}</strong><small>{index + 1}m ago</small></span><HbarAppUiIconButton
                label="Dismiss" onClick={() => onAction?.({variantId: spec.id, actionId: 'dismiss', value: message})}><X
                size={13}/></HbarAppUiIconButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function DeliveryPreferences({spec, onAction}: NotificationProps) {
    const [saved, setSaved] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-notification-variant-3"><HbarAppUiToolbar
        title="Delivery preferences" detail="In-app · email · push · quiet hours"/>
        <div className="hbar-app-ui-preference-matrix">
            <header><span>Event</span><span>In-app</span><span>Email</span><span>Push</span></header>
            {['Run finished', 'Approval request', 'Weekly summary'].map((event) => <div key={event}>
                <strong>{event}</strong><input type="checkbox" defaultChecked/><input type="checkbox"
                                                                                      defaultChecked={event !== 'Weekly summary'}/><input
                type="checkbox"/></div>)}</div>
        <label>Quiet hours <input type="time" defaultValue="22:00"/> to <input type="time"
                                                                               defaultValue="08:00"/></label>
        <div className="hbar-app-ui-sticky-save"><span>{saved ? 'Saved' : 'Unsaved changes'}</span><HbarAppUiButton
            tone="accent" onClick={() => {
            setSaved(true);
            onAction?.({variantId: spec.id, actionId: 'save'})
        }}>Save preferences</HbarAppUiButton></div>
    </ActionSurfaceFrame>
}

function ActivityInbox({spec, onAction}: NotificationProps) {
    const [selected, setSelected] = useState('run');
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-notification-variant-4">
        <div className="hbar-app-ui-notification-inbox">
            <aside><HbarAppUiToolbar title="Activity inbox" detail="Filter and snooze"/>
                <button type="button" className="is-selected" onClick={() => setSelected('run')}>Run
                    completed<small>2m</small></button>
                <button type="button" onClick={() => setSelected('approval')}>Approval needed<small>18m</small></button>
                <button type="button" onClick={() => setSelected('budget')}>Budget threshold<small>1h</small></button>
            </aside>
            <main><HbarAppUiToolbar
                title={selected === 'run' ? 'Run completed' : selected === 'approval' ? 'Approval needed' : 'Budget threshold'}
                detail="Context and snooze actions"/><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'snooze', value: selected})}><Clock3
                size={13}/>Snooze</HbarAppUiButton><HbarAppUiSpotlight><p>Workspace sync finished successfully and
                updated 12 records.</p><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'open', value: selected})}>Open
                context</HbarAppUiButton></HbarAppUiSpotlight></main>
        </div>
    </ActionSurfaceFrame>
}

function BannerSet({spec, onAction}: NotificationProps) {
    const [closed, setClosed] = useState<string[]>([]);
    const banners = [{
        id: 'info',
        title: 'New workspace update',
        detail: 'A newer projection is ready.',
        tone: 'neutral' as const
    }, {
        id: 'warn',
        title: 'Usage is near the limit',
        detail: 'Review your budget before starting another run.',
        tone: 'warning' as const
    }, {
        id: 'error',
        title: 'Connection lost',
        detail: 'Reconnect the local host to continue.',
        tone: 'danger' as const
    }, {id: 'success', title: 'Export ready', detail: 'Your report can be downloaded.', tone: 'positive' as const}];
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className="hbar-app-ui-notification-variant-5"><HbarAppUiToolbar title="Inline banners"
                                                                                                detail="Info · warning · error · success"/>
        <div
            className="hbar-app-ui-banner-list">{banners.filter((banner) => !closed.includes(banner.id)).map((banner) =>
            <HbarAppUiSpotlight className={`hbar-app-ui-banner hbar-app-ui-banner-${banner.tone}`} key={banner.id}><Bell
                size={14}/>
                <div><strong>{banner.title}</strong><p>{banner.detail}</p></div>
                <HbarAppUiIconButton label="Dismiss" onClick={() => {
                    setClosed((current) => [...current, banner.id]);
                    onAction?.({variantId: spec.id, actionId: 'dismiss', value: banner.id})
                }}><X size={13}/></HbarAppUiIconButton></HbarAppUiSpotlight>)}</div>
    </ActionSurfaceFrame>
}

function AppBarBell({spec, onAction}: NotificationProps) {
    const [open, setOpen] = useState(false);
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className="hbar-app-ui-notification-variant-6">
        <header className="hbar-app-ui-bell-bar"><strong>Workspace</strong>
            <button type="button" className="hbar-app-ui-bell-button" aria-label="Notifications"
                    onClick={() => setOpen((value) => !value)}><Bell size={16}/><i>3</i></button>
        </header>
        {open &&
            <HbarAppUiSpotlight className="hbar-app-ui-bell-popover"><strong>Notifications</strong><span>Run completed · 2m ago</span><span>Approval needed · 18m ago</span><HbarAppUiButton
                onClick={() => onAction?.({variantId: spec.id, actionId: 'read-all'})}>Mark all
                read</HbarAppUiButton></HbarAppUiSpotlight>}</ActionSurfaceFrame>
}

export function Notifications({spec, onAction}: NotificationProps) {
    switch (spec.variant) {
        case 1:
            return <NotificationCenter spec={spec} onAction={onAction}/>;
        case 2:
            return <ToastStack spec={spec} onAction={onAction}/>;
        case 3:
            return <DeliveryPreferences spec={spec} onAction={onAction}/>;
        case 4:
            return <ActivityInbox spec={spec} onAction={onAction}/>;
        case 5:
            return <BannerSet spec={spec} onAction={onAction}/>;
        case 6:
            return <AppBarBell spec={spec} onAction={onAction}/>;
        default:
            return <NotificationCenter spec={spec} onAction={onAction}/>
    }
}
