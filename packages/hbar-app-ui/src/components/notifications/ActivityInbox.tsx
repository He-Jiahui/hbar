import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {Archive, ArrowLeft, Check, ChevronDown, Clock3, ExternalLink, GitPullRequest} from 'lucide-react'
import {
    activityEntries,
    NotificationButton,
    NotificationFrame,
    type NotificationKind,
    type NotificationSurfaceProps,
    NotificationTabs,
    reportNotificationAction,
} from './NotificationsPrimitives'

function ActivityIcon({kind}: { readonly kind: NotificationKind }) {
    const Icon = kind === 'member' ? Check : kind === 'review' ? GitPullRequest : Clock3
    return <LumenText as="span" className="hbar-app-ui-notifications-activity-icon" aria-hidden="true"><HbarAppUiIcon icon={Icon} tier="sm"
                                                                                              strokeWidth={1.6}/></LumenText>
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

    return <NotificationFrame spec={spec} onAction={onAction}
                              className={`hbar-app-ui-notifications-activity ${showDetail ? 'is-detail-open' : 'is-list-open'}`}>
        <LumenFrame as="header" className="hbar-app-ui-notifications-activity-header"><LumenText as="h1">Activity</LumenText><NotificationTabs
            label="Activity views" value={view} onChange={(next) => {
            setView(next)
            reportNotificationAction(onAction, spec, 'filter', next)
        }} options={[{id: 'inbox', label: 'Inbox', count: 3}, {
            id: 'snoozed',
            label: 'Snoozed',
            count: 1
        }, {id: 'archived', label: 'Archived', count: 1}]}/></LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-notifications-activity-layout">
            <LumenFrame as="nav" aria-label="Activity inbox">
                <LumenCollection as="ul">{activityEntries.map((entry) => <LumenCollectionItem key={entry.id}>
                    <LumenButton type="button" className={entry.id === selected ? 'is-selected' : ''}
                            onClick={() => selectEntry(entry.id)}><ActivityIcon
                        kind={entry.kind}/><LumenText as="span"><LumenText as="span"><LumenText as="strong">{entry.person}</LumenText><LumenText as="time">{entry.time}</LumenText></LumenText><LumenText as="small">{entry.detail}</LumenText></LumenText>
                    </LumenButton>
                </LumenCollectionItem>)}</LumenCollection>
            </LumenFrame>
            <LumenFrame as="article" className="hbar-app-ui-notifications-activity-detail">
                <LumenButton type="button"
                        className="hbar-app-ui-notifications-back" onClick={() => setShowDetail(false)}><HbarAppUiIcon icon={ArrowLeft} tier="sm"
                    />Back
                </LumenButton>
                <LumenFrame as="header"><LumenText as="p"><LumenText as="strong">{selectedEntry.person}</LumenText> requested admin access to</LumenText><LumenText as="h2">Cedar Labs
                    billing</LumenText></LumenFrame>
                <LumenFrame
                    className="hbar-app-ui-notifications-detail-actions"><NotificationButton tone="light"
                                                                                             onClick={() => reportNotificationAction(onAction, spec, 'grant', selectedEntry.id)}><HbarAppUiIcon icon={Check} tier="sm"
                    />Grant access</NotificationButton><NotificationButton
                    onClick={() => reportNotificationAction(onAction, spec, 'snooze', selectedEntry.id)}><HbarAppUiIcon icon={Clock3} tier="sm"
                    />Snooze <HbarAppUiIcon icon={ChevronDown} tier="sm" /></NotificationButton><NotificationButton
                    onClick={() => reportNotificationAction(onAction, spec, 'archive', selectedEntry.id)}><HbarAppUiIcon icon={Archive} tier="sm"
                    />Archive</NotificationButton></LumenFrame>
                <LumenText as="p" className="hbar-app-ui-notifications-detail-copy">Priya needs to reconcile the October statement and
                    issue two credits before the close on Friday. Access can be time-boxed to 7 days.</LumenText>
                <LumenCollection as="dl"
                    className="hbar-app-ui-notifications-detail-facts">
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Requested role</LumenCollectionItem>
                        <LumenCollectionItem as="dd">Billing admin</LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Current role</LumenCollectionItem>
                        <LumenCollectionItem as="dd">Member</LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Duration</LumenCollectionItem>
                        <LumenCollectionItem as="dd">7 days</LumenCollectionItem>
                    </LumenFrame>
                    <LumenFrame>
                        <LumenCollectionItem as="dt">Approver</LumenCollectionItem>
                        <LumenCollectionItem as="dd">You</LumenCollectionItem>
                    </LumenFrame>
                </LumenCollection>
                <LumenButton
                    type="button" className="hbar-app-ui-notifications-open-console"
                    onClick={() => reportNotificationAction(onAction, spec, 'console', selectedEntry.id)}>Open in
                    console <HbarAppUiIcon icon={ExternalLink} tier="sm"
                        /></LumenButton>
            </LumenFrame>
        </LumenFrame>
    </NotificationFrame>
}
