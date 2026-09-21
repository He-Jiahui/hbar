import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useState} from 'react'
import {AlertCircle, CheckCircle2, ChevronDown, CircleAlert, Info, RotateCcw, X} from 'lucide-react'
import {
    NotificationButton,
    NotificationFrame,
    NotificationIconButton,
    reportNotificationAction,
    type NotificationSurfaceProps,
} from './NotificationsPrimitives'

type SystemMessageTone = 'info' | 'warning' | 'danger' | 'success' | 'usage'

type SystemMessage = {
    readonly id: string
    readonly tone: SystemMessageTone
    readonly title: string
    readonly detail: string
    readonly primary: string
    readonly secondary?: string
    readonly expandable?: boolean
}

const systemMessages: readonly SystemMessage[] = [
    {id: 'maintenance', tone: 'info', title: 'Scheduled maintenance on Sunday', detail: 'Halcyon will be read-only from 02:00 to 04:00 UTC while we migrate the ingest cluster.', primary: 'Read the notice'},
    {id: 'card', tone: 'warning', title: 'Your card expires in 6 days', detail: 'Renewal for Cedar Labs is due on 12 November. Update the payment method to avoid an interruption.', primary: 'Update card', secondary: 'Remind me later'},
    {id: 'imports', tone: 'danger', title: '3 of 5 imports failed', detail: 'The Northwind sync stopped after repeated schema errors. Nothing was written for the failed files.', primary: 'Retry failed', expandable: true},
    {id: 'domain', tone: 'success', title: 'meridian.example is verified', detail: 'DNS records propagated and the certificate was issued. Outbound mail now sends from this domain.', primary: 'View DNS'},
    {id: 'usage', tone: 'usage', title: 'You have used 84% of your monthly events', detail: 'At the current rate the workspace reaches its limit around 26 November.', primary: 'Increase limit'},
]

function SystemMessageIcon({tone}: {readonly tone: SystemMessageTone}) {
    const Icon = tone === 'warning' ? AlertCircle : tone === 'danger' ? CircleAlert : tone === 'success' ? CheckCircle2 : Info
    return <span className={`hbar-app-ui-notifications-system-icon is-${tone}`} aria-hidden="true"><HbarAppUiIcon icon={Icon} tier="md"  strokeWidth={1.7}/></span>
}

export function SystemMessages({spec, onAction}: NotificationSurfaceProps) {
    const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    const visible = systemMessages.filter((message) => !dismissed.has(message.id))

    const dismiss = (id: string) => {
        setDismissed((current) => new Set([...current, id]))
        reportNotificationAction(onAction, spec, 'dismiss', id)
    }

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-system">
        <header className="hbar-app-ui-notifications-system-header"><div><h1>System messages</h1><p>Persistent banners for account, billing and platform state.</p></div><NotificationButton disabled={!dismissed.size}
                                                                                                                                                                      onClick={() => {
            setDismissed(new Set())
            reportNotificationAction(onAction, spec, 'restore-all')
        }}><HbarAppUiIcon icon={RotateCcw} tier="sm" />Restore all</NotificationButton></header>
        <main className="hbar-app-ui-notifications-system-list">{visible.map((message) => <section key={message.id}
                                                                                                   className={`hbar-app-ui-notifications-system-message is-${message.tone}`}>
            <div
                className="hbar-app-ui-notifications-system-message-main"><SystemMessageIcon tone={message.tone}/>
                <div><h2>{message.title}</h2><p>{message.detail}</p>{message.expandable && <LumenButton
                    type="button" className="hbar-app-ui-notifications-details-toggle"
                    aria-expanded={expanded.has(message.id)} onClick={() => {
                    setExpanded((current) => {
                        const next = new Set(current)
                        if (next.has(message.id)) next.delete(message.id)
                        else next.add(message.id)
                        return next
                    })
                    reportNotificationAction(onAction, spec, 'details', message.id)
                }}>{expanded.has(message.id) ? 'Hide details' : 'Show details'} <HbarAppUiIcon icon={ChevronDown} tier="sm"
                                                                                             aria-hidden="true"/>
                </LumenButton>}{expanded.has(message.id) && <p
                    className="hbar-app-ui-notifications-expanded-copy">Three source files need a schema mapping before
                    the next retry.</p>}
                    <div
                        className="hbar-app-ui-notifications-system-actions"><NotificationButton
                        tone={message.tone === 'warning' ? 'light' : 'neutral'}
                        onClick={() => reportNotificationAction(onAction, spec, 'action', message.id)}>{message.primary}</NotificationButton>{message.secondary &&
                        <NotificationButton
                            onClick={() => reportNotificationAction(onAction, spec, 'secondary', message.id)}>{message.secondary}</NotificationButton>}
                    </div>
                    {message.tone === 'usage' && <div
                        className="hbar-app-ui-notifications-usage-meter"><span><i
                        style={{inlineSize: '84%'}}/></span><small>4.2 of 5 M events</small></div>}</div>
            </div>
            <NotificationIconButton
                label={`Dismiss: ${message.title}`} onClick={() => dismiss(message.id)}><HbarAppUiIcon icon={X} tier="sm"
                /></NotificationIconButton></section>)}</main>
    </NotificationFrame>
}
