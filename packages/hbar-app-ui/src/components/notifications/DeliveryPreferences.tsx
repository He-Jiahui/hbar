import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {Fragment, useMemo, useState} from 'react'
import {Bell, Mail, Smartphone} from 'lucide-react'
import {
    type DeliveryChannel,
    deliveryGroups,
    NotificationButton,
    NotificationFrame,
    type NotificationSurfaceProps,
    NotificationToggle,
    reportNotificationAction,
} from './NotificationsPrimitives'

const deliveryChannels: readonly {
    readonly id: DeliveryChannel;
    readonly label: string;
    readonly Icon: typeof Bell
}[] = [
    {id: 'inApp', label: 'In-app', Icon: Bell},
    {id: 'email', label: 'Email', Icon: Mail},
    {id: 'push', label: 'Push', Icon: Smartphone},
]

function initialPreferences(): Readonly<Record<string, boolean>> {
    return Object.fromEntries(deliveryGroups.flatMap((group) => group.entries.flatMap((entry) => deliveryChannels.map((channel) => [
        `${entry.id}-${channel.id}`,
        entry.values[channel.id],
    ]))))
}

export function DeliveryPreferences({spec, onAction}: NotificationSurfaceProps) {
    const [values, setValues] = useState(initialPreferences)
    const [quietHours, setQuietHours] = useState(true)
    const [days, setDays] = useState<ReadonlySet<string>>(() => new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']))
    const [saved, setSaved] = useState(true)
    const enabledCount = useMemo(() => Object.values(values).filter(Boolean).length, [values])

    const toggle = (entryId: string, channel: DeliveryChannel) => {
        const key = `${entryId}-${channel}`
        setValues((current) => ({...current, [key]: !current[key]}))
        setSaved(false)
        reportNotificationAction(onAction, spec, 'delivery', key)
    }

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-preferences">
        <LumenFrame as="header" className="hbar-app-ui-notifications-preferences-header"><LumenText as="h1">Notification preferences</LumenText>
            <LumenText as="p">{enabledCount} of 21 deliveries enabled for this workspace.</LumenText></LumenFrame>
        <LumenFrame as="main" className="hbar-app-ui-notifications-preferences-main">
            <LumenFrame className="hbar-app-ui-notifications-preferences-scroll">
                <LumenCollection as="table" aria-label="Notification delivery preferences">
                    <LumenCollection as="thead">
                    <LumenCollectionItem as="tr">
                        <LumenCollectionItem as="th" scope="col">Event</LumenCollectionItem>
                        {deliveryChannels.map((channel) => {
                            const Icon = channel.Icon
                            return <LumenCollectionItem as="th" key={channel.id} scope="col"><HbarAppUiIcon icon={Icon} tier="sm"  strokeWidth={1.5}/>{channel.label}
                            </LumenCollectionItem>
                        })}</LumenCollectionItem>
                    </LumenCollection>
                    <LumenCollection as="tbody">{deliveryGroups.map((group) => <Fragment key={group.id}>
                        <LumenCollectionItem as="tr" className="hbar-app-ui-notifications-preference-group">
                            <LumenCollectionItem as="th" scope="row">{group.label}</LumenCollectionItem>
                            {deliveryChannels.map((channel) => <LumenCollectionItem as="td"
                                key={channel.id}>{group.summaries[channel.id]}</LumenCollectionItem>)}</LumenCollectionItem>
                        {group.entries.map((entry) => <LumenCollectionItem as="tr" key={entry.id}>
                            <LumenCollectionItem as="th" scope="row"><LumenText as="strong">{entry.label}</LumenText><LumenText as="small">{entry.detail}</LumenText></LumenCollectionItem>
                            {deliveryChannels.map((channel) => {
                                const key = `${entry.id}-${channel.id}`
                                return <LumenCollectionItem as="td" key={channel.id}><NotificationToggle
                                    label={`${entry.label}: ${channel.label}`} checked={values[key] ?? false}
                                    onChange={() => toggle(entry.id, channel.id)}/></LumenCollectionItem>
                            })}</LumenCollectionItem>)}</Fragment>)}</LumenCollection>
                </LumenCollection>
                <LumenFrame as="section" className="hbar-app-ui-notifications-quiet-hours">
                    <LumenFrame><LumenText as="h2">Quiet hours</LumenText><LumenText as="p">Hold email and push between 20:00 and 08:00. In-app stays on.</LumenText></LumenFrame>
                    <NotificationToggle label="Quiet hours"
                                        checked={quietHours} onChange={() => {
                        setQuietHours((current) => !current)
                        setSaved(false)
                        reportNotificationAction(onAction, spec, 'quiet-hours')
                    }}/>
                    <LumenFrame className="hbar-app-ui-notifications-quiet-days"
                         aria-label="Quiet hour days">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) =>
                        <LumenButton
                            type="button" key={day} aria-pressed={days.has(day)}
                            className={days.has(day) ? 'is-selected' : ''} onClick={() => {
                            setDays((current) => {
                                const next = new Set(current)
                                if (next.has(day)) next.delete(day)
                                else next.add(day)
                                return next
                            })
                            setSaved(false)
                            reportNotificationAction(onAction, spec, 'quiet-day', day)
                        }}>{day}</LumenButton>)}</LumenFrame>
                </LumenFrame>
            </LumenFrame>
        </LumenFrame>
        <LumenFrame as="footer" className="hbar-app-ui-notifications-save-bar">
            <LumenText as="span">{saved ? 'All changes saved' : 'Unsaved changes'}</LumenText>
            <LumenFrame><NotificationButton
                onClick={() => {
                    setValues(initialPreferences())
                    setQuietHours(true)
                    setDays(new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']))
                    setSaved(true)
                    reportNotificationAction(onAction, spec, 'reset')
                }}>Reset</NotificationButton><NotificationButton tone="light" disabled={saved} onClick={() => {
                setSaved(true)
                reportNotificationAction(onAction, spec, 'save')
            }}>Save preferences</NotificationButton></LumenFrame>
        </LumenFrame>
    </NotificationFrame>
}
