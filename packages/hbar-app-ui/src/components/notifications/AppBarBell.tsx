import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useEffect, useRef, useState} from 'react'
import {Bell, CheckCheck, Settings, X} from 'lucide-react'
import {
    NotificationButton,
    NotificationFrame,
    NotificationIconButton,
    type NotificationSurfaceProps,
    reportNotificationAction,
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
        <LumenFrame as="header"
            className="hbar-app-ui-notifications-app-header">
            <LumenFrame className="hbar-app-ui-notifications-brand"><LumenText as="span">H</LumenText><LumenText as="strong">Halcyon</LumenText></LumenFrame>
            <LumenFrame as="nav"
                aria-label="Primary">
                <LumenButton type="button" className="is-selected">Overview</LumenButton>
                <LumenButton type="button">Projects</LumenButton>
                <LumenButton type="button">Reports</LumenButton>
            </LumenFrame>
            <LumenFrame
                className="hbar-app-ui-notifications-app-actions">
                <LumenFrame className="hbar-app-ui-notifications-bell-anchor">
                    <LumenButton type="button" ref={triggerRef}
                            className="hbar-app-ui-notifications-bell-trigger"
                            aria-label={`Notifications, ${unread} unread`}
                            aria-expanded={open} onClick={() => {
                        setOpen((current) => !current)
                        reportNotificationAction(onAction, spec, 'toggle-bell')
                    }}><HbarAppUiIcon icon={Bell} tier="md"  strokeWidth={1.6}/>{unread > 0 && <LumenText as="span">{unread}</LumenText>}</LumenButton>
                    {open && <LumenFrame as="aside"
                        ref={popoverRef} className="hbar-app-ui-dialog-menu hbar-app-ui-notifications-bell-popover"
                        role="dialog" aria-label="Notifications">
                        <LumenFrame as="header"><LumenText as="h2">Notifications</LumenText><NotificationIconButton
                            label="Close notifications" onClick={close}><HbarAppUiIcon icon={X} tier="sm" /></NotificationIconButton></LumenFrame>
                        <LumenCollection as="ul">
                            <LumenCollectionItem><LumenText as="strong">Priya requested access</LumenText><LumenText as="small">9m ago</LumenText></LumenCollectionItem>
                            <LumenCollectionItem><LumenText as="strong">Billing report is ready</LumenText><LumenText as="small">42m ago</LumenText></LumenCollectionItem>
                            <LumenCollectionItem><LumenText as="strong">New sign-in detected</LumenText><LumenText as="small">Yesterday</LumenText></LumenCollectionItem>
                        </LumenCollection>
                        <LumenFrame as="footer"><NotificationButton onClick={() => {
                            setUnread(0)
                            reportNotificationAction(onAction, spec, 'read-all')
                        }}><HbarAppUiIcon icon={CheckCheck} tier="sm" />Mark all read</NotificationButton></LumenFrame>
                    </LumenFrame>}</LumenFrame>
                <LumenButton type="button"
                        className="hbar-app-ui-notifications-settings" aria-label="Settings" title="Settings"
                        onClick={() => reportNotificationAction(onAction, spec, 'settings')}><HbarAppUiIcon icon={Settings} tier="md"
                     strokeWidth={1.6}/></LumenButton>
                <LumenText as="span" className="hbar-app-ui-notifications-avatar">AR</LumenText></LumenFrame>
        </LumenFrame>
        <LumenFrame as="main"
            className="hbar-app-ui-notifications-bell-empty"><LumenText as="p">Open the bell to review recent activity. The panel
            closes on Escape or on a click outside, and returns focus to the trigger.</LumenText></LumenFrame>
    </NotificationFrame>
}
