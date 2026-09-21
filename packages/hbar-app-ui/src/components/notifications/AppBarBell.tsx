import { LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useEffect, useRef, useState} from 'react'
import {Bell, CheckCheck, Settings, X} from 'lucide-react'
import {
    NotificationButton,
    NotificationFrame,
    NotificationIconButton,
    reportNotificationAction,
    type NotificationSurfaceProps,
} from './NotificationsPrimitives'

export function AppBarBell({spec, onAction}: NotificationSurfaceProps) {
    const [open, setOpen] = useState(false)
    const [unread, setUnread] = useState(3)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const popoverRef = useRef<HTMLElement>(null)

    const close = () => {
        setOpen(false)
        triggerRef.current?.focus()
    }

    useEffect(() => {
        if (!open) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                close()
            }
        }
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
            close()
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('pointerdown', onPointerDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('pointerdown', onPointerDown)
        }
    }, [open])

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-app-bar">
        <header
            className="hbar-app-ui-notifications-app-header">
            <div className="hbar-app-ui-notifications-brand"><span>H</span><strong>Halcyon</strong></div>
            <nav
                aria-label="Primary">
                <LumenButton type="button" className="is-selected">Overview</LumenButton>
                <LumenButton type="button">Projects</LumenButton>
                <LumenButton type="button">Reports</LumenButton>
            </nav>
            <div
                className="hbar-app-ui-notifications-app-actions">
                <div className="hbar-app-ui-notifications-bell-anchor">
                    <LumenButton type="button" ref={triggerRef}
                            className="hbar-app-ui-notifications-bell-trigger"
                            aria-label={`Notifications, ${unread} unread`}
                            aria-expanded={open} onClick={() => {
                        setOpen((current) => !current)
                        reportNotificationAction(onAction, spec, 'toggle-bell')
                    }}><HbarAppUiIcon icon={Bell} tier="md"  strokeWidth={1.6}/>{unread > 0 && <span>{unread}</span>}</LumenButton>
                    {open && <aside
                        ref={popoverRef} className="hbar-app-ui-dialog-menu hbar-app-ui-notifications-bell-popover"
                        role="dialog" aria-label="Notifications">
                        <header><h2>Notifications</h2><NotificationIconButton
                            label="Close notifications" onClick={close}><HbarAppUiIcon icon={X} tier="sm" /></NotificationIconButton></header>
                        <ul>
                            <li><strong>Priya requested access</strong><small>9m ago</small></li>
                            <li><strong>Billing report is ready</strong><small>42m ago</small></li>
                            <li><strong>New sign-in detected</strong><small>Yesterday</small></li>
                        </ul>
                        <footer><NotificationButton onClick={() => {
                            setUnread(0)
                            reportNotificationAction(onAction, spec, 'read-all')
                        }}><HbarAppUiIcon icon={CheckCheck} tier="sm" />Mark all read</NotificationButton></footer>
                    </aside>}</div>
                <LumenButton type="button"
                        className="hbar-app-ui-notifications-settings" aria-label="Settings" title="Settings"
                        onClick={() => reportNotificationAction(onAction, spec, 'settings')}><HbarAppUiIcon icon={Settings} tier="md"
                     strokeWidth={1.6}/></LumenButton>
                <span className="hbar-app-ui-notifications-avatar">AR</span></div>
        </header>
        <main
            className="hbar-app-ui-notifications-bell-empty"><p>Open the bell to review recent activity. The panel
            closes on Escape or on a click outside, and returns focus to the trigger.</p></main>
    </NotificationFrame>
}
