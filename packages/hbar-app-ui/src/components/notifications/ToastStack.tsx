import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import {useEffect, useState} from 'react'
import {CheckCircle2, CircleAlert, Info, LoaderCircle, X} from 'lucide-react'
import {
    NotificationButton,
    NotificationFrame,
    NotificationIconButton,
    type NotificationSurfaceProps,
    reportNotificationAction,
} from './NotificationsPrimitives'

type ToastTone = 'success' | 'error' | 'info' | 'progress'

type Toast = { readonly id: number; readonly tone: ToastTone; readonly label: string }

const toastChoices: readonly { readonly tone: ToastTone; readonly label: string }[] = [
    {tone: 'success', label: 'Success'},
    {tone: 'error', label: 'Error'},
    {tone: 'info', label: 'Info'},
    {tone: 'progress', label: 'Progress'},
]

function ToastGlyph({tone}: { readonly tone: ToastTone }) {
    if (tone === 'success') return <HbarAppUiIcon icon={CheckCircle2} tier="sm"  aria-hidden="true"/>
    if (tone === 'error') return <HbarAppUiIcon icon={CircleAlert} tier="sm"  aria-hidden="true"/>
    if (tone === 'info') return <HbarAppUiIcon icon={Info} tier="sm"  aria-hidden="true"/>
    return <HbarAppUiIcon icon={LoaderCircle} tier="sm"  aria-hidden="true"/>
}

export function ToastStack({spec, onAction}: NotificationSurfaceProps) {
    const [toasts, setToasts] = useState<readonly Toast[]>([])
    const [isPaused, setPaused] = useState(false)

    useEffect(() => {
        if (!toasts.length || isPaused) return
        const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 4200)
        return () => window.clearTimeout(timer)
    }, [isPaused, toasts])

    const addToast = (tone: ToastTone, label: string) => {
        setToasts((current) => [...current, {id: Date.now(), tone, label}].slice(-4))
        reportNotificationAction(onAction, spec, 'show', tone)
    }

    return <NotificationFrame spec={spec} onAction={onAction} className="hbar-app-ui-notifications-toasts">
        <LumenFrame as="main" className="hbar-app-ui-notifications-toast-demo">
            <LumenFrame as="header"><LumenText as="h1">Toast notifications</LumenText><LumenText as="p">Transient messages stack in the corner, collapse when idle and expand
                on hover.</LumenText></LumenFrame>
            <LumenFrame className="hbar-app-ui-notifications-toast-choices">{toastChoices.map((choice) => <NotificationButton
                key={choice.tone}
                onClick={() => addToast(choice.tone, choice.label)}><ToastGlyph
                tone={choice.tone}/>{choice.label}</NotificationButton>)}</LumenFrame>
            <LumenFrame as="section" className="hbar-app-ui-notifications-toast-list" aria-live="polite" onPointerEnter={() => {
                setPaused(true)
                reportNotificationAction(onAction, spec, 'pause')
            }} onPointerLeave={() => setPaused(false)}>{toasts.length ? <LumenCollection as="ul">{toasts.map((toast) => <LumenCollectionItem key={toast.id}
                                                                                                       className={`is-${toast.tone}`}>
                    <ToastGlyph
                        tone={toast.tone}/><LumenText as="span"><LumenText as="strong">{toast.label}</LumenText><LumenText as="small">{isPaused ? 'Timer paused' : 'Dismisses automatically'}</LumenText></LumenText><NotificationIconButton
                    label={`Dismiss ${toast.label}`}
                    onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}><HbarAppUiIcon icon={X} tier="sm"
                    /></NotificationIconButton></LumenCollectionItem>)}</LumenCollection> :
                <LumenFrame className="hbar-app-ui-notifications-no-toasts"><LumenText as="span">No active toasts</LumenText>
                    <LumenButton
                        type="button" disabled>Clear all
                    </LumenButton>
                </LumenFrame>}</LumenFrame>
        </LumenFrame>
    </NotificationFrame>
}
