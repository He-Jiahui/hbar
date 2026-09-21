import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, ArrowLeft, Check, ChevronDown, Clock3, ExternalLink, GitPullRequest} from 'lucide-react'
import {
    activityEntries,
    NotificationButton,
    NotificationFrame,
    NotificationTabs,
    reportNotificationAction,
    type NotificationKind,
    type NotificationSurfaceProps,
} from './NotificationsPrimitives'

function ActivityIcon({kind}: {readonly kind: NotificationKind}) {
    const Icon = kind === 'member' ? Check : kind === 'review' ? GitPullRequest : Clock3
    return <span className="hbar-app-ui-notifications-activity-icon" aria-hidden="true"><HbarAppUiIcon icon={Icon} tier="sm"  strokeWidth={1.6}/></span>
}

export function ActivityInbox({spec, onAction}: NotificationSurfaceProps) {
    const [selected, setSelected] = useState('priya-access')
    const [view, setView] = useState<'inbox' | 'snoozed' | 'archived'>('inbox')
    const [showDetail, setShowDetail] = useState(true)
    const selectedEntry = activityEntries.find((entry) => entry.id === selected) ?? activityEntries[0]!

    const selectEntry = (id: string) => {
        setSelected(id)
        setShowDetail(true)
        reportNotificationAction(onAction, spec, 'open', id)
    }

    return <NotificationFrame spec={spec} onAction={onAction} className={`hbar-app-ui-notifications-activity ${showDetail ? 'is-detail-open' : 'is-list-open'}`}>
        <header className="hbar-app-ui-notifications-activity-header"><h1>Activity</h1><NotificationTabs label="Activity views" value={view} onChange={(next) => {
            setView(next)
            reportNotificationAction(onAction, spec, 'filter', next)
        }} options={[{id: 'inbox', label: 'Inbox', count: 3}, {
            id: 'snoozed',
            label: 'Snoozed',
            count: 1
        }, {id: 'archived', label: 'Archived', count: 1}]}/></header>
        <main className="hbar-app-ui-notifications-activity-layout">
            <nav aria-label="Activity inbox">
                <ul>{activityEntries.map((entry) => <li key={entry.id}>
                    <LumenButton type="button" className={entry.id === selected ? 'is-selected' : ''}
                            onClick={() => selectEntry(entry.id)}><ActivityIcon
                        kind={entry.kind}/><span><span><strong>{entry.person}</strong><time>{entry.time}</time></span><small>{entry.detail}</small></span>
                    </LumenButton>
                </li>)}</ul>
            </nav>
            <article className="hbar-app-ui-notifications-activity-detail">
                <LumenButton type="button"
                        className="hbar-app-ui-notifications-back" onClick={() => setShowDetail(false)}><HbarAppUiIcon icon={ArrowLeft} tier="sm"
                    />Back
                </LumenButton>
                <header><p><strong>{selectedEntry.person}</strong> requested admin access to</p><h2>Cedar Labs
                    billing</h2></header>
                <div
                    className="hbar-app-ui-notifications-detail-actions"><NotificationButton tone="light"
                                                                                             onClick={() => reportNotificationAction(onAction, spec, 'grant', selectedEntry.id)}><HbarAppUiIcon icon={Check} tier="sm"
                    />Grant access</NotificationButton><NotificationButton
                    onClick={() => reportNotificationAction(onAction, spec, 'snooze', selectedEntry.id)}><HbarAppUiIcon icon={Clock3} tier="sm"
                    />Snooze <HbarAppUiIcon icon={ChevronDown} tier="sm" /></NotificationButton><NotificationButton
                    onClick={() => reportNotificationAction(onAction, spec, 'archive', selectedEntry.id)}><HbarAppUiIcon icon={Archive} tier="sm"
                    />Archive</NotificationButton></div>
                <p className="hbar-app-ui-notifications-detail-copy">Priya needs to reconcile the October statement and
                    issue two credits before the close on Friday. Access can be time-boxed to 7 days.</p>
                <dl
                    className="hbar-app-ui-notifications-detail-facts">
                    <div>
                        <dt>Requested role</dt>
                        <dd>Billing admin</dd>
                    </div>
                    <div>
                        <dt>Current role</dt>
                        <dd>Member</dd>
                    </div>
                    <div>
                        <dt>Duration</dt>
                        <dd>7 days</dd>
                    </div>
                    <div>
                        <dt>Approver</dt>
                        <dd>You</dd>
                    </div>
                </dl>
                <LumenButton
                    type="button" className="hbar-app-ui-notifications-open-console"
                    onClick={() => reportNotificationAction(onAction, spec, 'console', selectedEntry.id)}>Open in
                    console <HbarAppUiIcon icon={ExternalLink} tier="sm"
                        /></LumenButton>
            </article>
        </main>
    </NotificationFrame>
}
