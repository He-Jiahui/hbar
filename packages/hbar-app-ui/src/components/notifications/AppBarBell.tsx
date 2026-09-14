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

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-app-bar"><header
        className="hbar-app-ui-notifications-app-header"><div className="hbar-app-ui-notifications-brand"><span>H</span><strong>Halcyon</strong></div><nav
        aria-label="Primary"><button type="button" className="is-selected">Overview</button><button type="button">Projects</button><button type="button">Reports</button></nav><div
        className="hbar-app-ui-notifications-app-actions"><div className="hbar-app-ui-notifications-bell-anchor"><button type="button" ref={triggerRef}
                                                                                                                          className="hbar-app-ui-notifications-bell-trigger" aria-label={`Notifications, ${unread} unread`}
                                                                                                                          aria-expanded={open} onClick={() => {
                setOpen((current) => !current)
                reportNotificationAction(onAction, spec, 'toggle-bell')
            }}><Bell size={17} strokeWidth={1.6}/>{unread > 0 && <span>{unread}</span>}</button>{open && <aside
                ref={popoverRef} className="hbar-app-ui-dialog-menu hbar-app-ui-notifications-bell-popover" role="dialog" aria-label="Notifications"><header><h2>Notifications</h2><NotificationIconButton
                label="Close notifications" onClick={close}><X size={15}/></NotificationIconButton></header><ul><li><strong>Priya requested access</strong><small>9m ago</small></li><li><strong>Billing report is ready</strong><small>42m ago</small></li><li><strong>New sign-in detected</strong><small>Yesterday</small></li></ul><footer><NotificationButton onClick={() => {
                setUnread(0)
                reportNotificationAction(onAction, spec, 'read-all')
            }}><CheckCheck size={15}/>Mark all read</NotificationButton></footer></aside>}</div><button type="button"
                                                                                                                                                                                         className="hbar-app-ui-notifications-settings" aria-label="Settings" title="Settings" onClick={() => reportNotificationAction(onAction, spec, 'settings')}><Settings
            size={16} strokeWidth={1.6}/></button><span className="hbar-app-ui-notifications-avatar">AR</span></div></header><main
        className="hbar-app-ui-notifications-bell-empty"><p>Open the bell to review recent activity. The panel closes on Escape or on a click outside, and returns focus to the trigger.</p></main></NotificationFrame>
}
