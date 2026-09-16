import { HbarAppUiIcon } from '../../icon'
import {Fragment, useMemo, useState} from 'react'
import {Bell, Mail, Smartphone} from 'lucide-react'
import {
    deliveryGroups,
    NotificationButton,
    NotificationFrame,
    NotificationToggle,
    reportNotificationAction,
    type DeliveryChannel,
    type NotificationSurfaceProps,
} from './NotificationsPrimitives'

const deliveryChannels: readonly {readonly id: DeliveryChannel; readonly label: string; readonly Icon: typeof Bell}[] = [
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
        <header className="hbar-app-ui-notifications-preferences-header"><h1>Notification preferences</h1><p>{enabledCount} of 21 deliveries enabled for this workspace.</p></header>
        <main className="hbar-app-ui-notifications-preferences-main"><div className="hbar-app-ui-notifications-preferences-scroll">
            <table aria-label="Notification delivery preferences"><thead><tr><th scope="col">Event</th>{deliveryChannels.map((channel) => {
                const Icon = channel.Icon
                return <th key={channel.id} scope="col"><HbarAppUiIcon icon={Icon} tier="sm"  strokeWidth={1.5}/>{channel.label}</th>
            })}</tr></thead><tbody>{deliveryGroups.map((group) => <Fragment key={group.id}>
                <tr className="hbar-app-ui-notifications-preference-group"><th scope="row">{group.label}</th>{deliveryChannels.map((channel) => <td
                    key={channel.id}>{group.summaries[channel.id]}</td>)}</tr>{group.entries.map((entry) => <tr key={entry.id}>
                    <th scope="row"><strong>{entry.label}</strong><small>{entry.detail}</small></th>{deliveryChannels.map((channel) => {
                    const key = `${entry.id}-${channel.id}`
                    return <td key={channel.id}><NotificationToggle label={`${entry.label}: ${channel.label}`} checked={values[key] ?? false}
                                                                  onChange={() => toggle(entry.id, channel.id)}/></td>
                })}</tr>)}</Fragment>)}</tbody></table>
            <section className="hbar-app-ui-notifications-quiet-hours"><div><h2>Quiet hours</h2><p>Hold email and push between 20:00 and 08:00. In-app stays on.</p></div><NotificationToggle label="Quiet hours"
                                                                                                                                                     checked={quietHours} onChange={() => {
                setQuietHours((current) => !current)
                setSaved(false)
                reportNotificationAction(onAction, spec, 'quiet-hours')
            }}/><div className="hbar-app-ui-notifications-quiet-days" aria-label="Quiet hour days">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <button
                type="button" key={day} aria-pressed={days.has(day)} className={days.has(day) ? 'is-selected' : ''} onClick={() => {
                    setDays((current) => {
                        const next = new Set(current)
                        if (next.has(day)) next.delete(day)
                        else next.add(day)
                        return next
                    })
                    setSaved(false)
                    reportNotificationAction(onAction, spec, 'quiet-day', day)
                }}>{day}</button>)}</div></section>
        </div></main>
        <footer className="hbar-app-ui-notifications-save-bar"><span>{saved ? 'All changes saved' : 'Unsaved changes'}</span><div><NotificationButton
            onClick={() => {
                setValues(initialPreferences())
                setQuietHours(true)
                setDays(new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']))
                setSaved(true)
                reportNotificationAction(onAction, spec, 'reset')
            }}>Reset</NotificationButton><NotificationButton tone="light" disabled={saved} onClick={() => {
                setSaved(true)
                reportNotificationAction(onAction, spec, 'save')
            }}>Save preferences</NotificationButton></div></footer>
    </NotificationFrame>
}
