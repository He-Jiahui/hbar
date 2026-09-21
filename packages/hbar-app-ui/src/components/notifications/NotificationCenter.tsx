import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useMemo, useState} from 'react'
import {AtSign, Check, CheckCheck, GitPullRequest, MessageSquare, ShieldCheck, UserRoundPlus, X} from 'lucide-react'
import {
    type NotificationEntry,
    NotificationFrame,
    notificationGroups,
    NotificationIconButton,
    type NotificationKind,
    type NotificationSurfaceProps,
    NotificationTabs,
    reportNotificationAction,
} from './NotificationsPrimitives'

type NotificationFilter = 'all' | 'unread' | 'mentions'

function EntryIcon({kind}: { readonly kind: NotificationKind }) {
    const Icon = kind === 'mention' ? AtSign
        : kind === 'review' ? GitPullRequest
            : kind === 'reply' || kind === 'comment' ? MessageSquare
                : kind === 'member' ? UserRoundPlus
                    : kind === 'security' ? ShieldCheck
                        : Check
    return <LumenText as="span" className="hbar-app-ui-notifications-entry-icon" aria-hidden="true"><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.6}/></LumenText>
}

function NotificationLine({entry}: { readonly entry: NotificationEntry }) {
    return <LumenText as="p">{entry.line.map((part, index) => part.emphasis
        ? <LumenText as="strong" key={`${entry.id}-${index}`}>{part.text}</LumenText>
        : <LumenText as="span" key={`${entry.id}-${index}`}>{part.text}</LumenText>)}</LumenText>
}

export function NotificationCenter({spec, onAction}: NotificationSurfaceProps) {
    const [filter, setFilter] = useState<NotificationFilter>('all')
    const [readIds, setReadIds] = useState(() => new Set(notificationGroups.flatMap((group) => group.entries.filter((entry) => !entry.unread).map((entry) => entry.id))))
    const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(() => new Set())

    const groups = useMemo(() => notificationGroups.map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
            if (dismissedIds.has(entry.id)) return false
            if (filter === 'unread') return !readIds.has(entry.id)
            if (filter === 'mentions') return entry.mention === true
            return true
        }),
    })).filter((group) => group.entries.length > 0), [dismissedIds, filter, readIds])

    const selectFilter = (next: NotificationFilter) => {
        setFilter(next)
        reportNotificationAction(onAction, spec, 'filter', next)
    }

    const setReadState = (entry: NotificationEntry, nextRead: boolean) => {
        setReadIds((current) => {
            const next = new Set(current)
            if (nextRead) next.add(entry.id)
            else next.delete(entry.id)
            return next
        })
        reportNotificationAction(onAction, spec, nextRead ? 'read' : 'unread', entry.id)
    }

    const dismiss = (entryId: string) => {
        setDismissedIds((current) => new Set([...current, entryId]))
        reportNotificationAction(onAction, spec, 'dismiss', entryId)
    }

    const unreadCount = notificationGroups.flatMap((group) => group.entries).filter((entry) => !readIds.has(entry.id) && !dismissedIds.has(entry.id)).length

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-center">
        <LumenFrame as="header" className="hbar-app-ui-notifications-page-header">
            <LumenText as="h1">Notifications <LumenText as="span">{unreadCount}</LumenText></LumenText>
            <LumenButton type="button" className="hbar-app-ui-notifications-mark-all" onClick={() => {
                setReadIds(new Set(notificationGroups.flatMap((group) => group.entries.map((entry) => entry.id))))
                reportNotificationAction(onAction, spec, 'read-all')
            }}><HbarAppUiIcon icon={CheckCheck} tier="sm"  strokeWidth={1.7}/>Mark all read
            </LumenButton>
        </LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-notifications-center-main">
            <NotificationTabs label="Notifications" value={filter} onChange={selectFilter} options={[
                {id: 'all', label: 'All', count: 8},
                {id: 'unread', label: 'Unread', count: unreadCount},
                {id: 'mentions', label: 'Mentions', count: 2},
            ]}/>
            <LumenFrame className="hbar-app-ui-notifications-feed">{groups.map((group) => <LumenFrame as="section" key={group.label}>
                <LumenText as="h2">{group.label}</LumenText>
                <LumenCollection as="ul">{group.entries.map((entry) => {
                    const isRead = readIds.has(entry.id)
                    return <LumenCollectionItem key={entry.id} className={isRead ? 'is-read' : 'is-unread'}>
                        <EntryIcon kind={entry.kind}/>
                        <LumenFrame className="hbar-app-ui-notifications-entry-copy"><NotificationLine
                            entry={entry}/>{entry.detail &&
                            <LumenText as="small">{entry.detail}</LumenText>}</LumenFrame>
                        <LumenText as="time">{entry.time}</LumenText>
                        <LumenFrame
                            className="hbar-app-ui-notifications-entry-actions"><NotificationIconButton
                            label={isRead ? 'Mark unread' : 'Mark as read'}
                            onClick={() => setReadState(entry, !isRead)}>{isRead
                            ? <HbarAppUiIcon icon={AtSign} tier="sm"  strokeWidth={1.6}/>
                            : <HbarAppUiIcon icon={Check} tier="sm"  strokeWidth={1.6}/>}</NotificationIconButton><NotificationIconButton
                            label="Dismiss notification" onClick={() => dismiss(entry.id)}><HbarAppUiIcon icon={X} tier="sm"
                                                                                              strokeWidth={1.6}/></NotificationIconButton>
                        </LumenFrame>
                    </LumenCollectionItem>
                })}</LumenCollection>
            </LumenFrame>)}</LumenFrame>
        </LumenFrame>
    </NotificationFrame>
}
