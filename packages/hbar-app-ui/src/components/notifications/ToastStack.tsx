import {useEffect, useState} from 'react'
import {CheckCircle2, CircleAlert, Info, LoaderCircle, X} from 'lucide-react'
import {
    NotificationButton,
    NotificationFrame,
    NotificationIconButton,
    reportNotificationAction,
    type NotificationSurfaceProps,
} from './NotificationsPrimitives'

type ToastTone = 'success' | 'error' | 'info' | 'progress'

type Toast = {readonly id: number; readonly tone: ToastTone; readonly label: string}

const toastChoices: readonly {readonly tone: ToastTone; readonly label: string}[] = [
    {tone: 'success', label: 'Success'},
    {tone: 'error', label: 'Error'},
    {tone: 'info', label: 'Info'},
    {tone: 'progress', label: 'Progress'},
]

function ToastGlyph({tone}: {readonly tone: ToastTone}) {
    if (tone === 'success') return <CheckCircle2 size={15} aria-hidden="true"/>
    if (tone === 'error') return <CircleAlert size={15} aria-hidden="true"/>
    if (tone === 'info') return <Info size={15} aria-hidden="true"/>
    return <LoaderCircle size={15} aria-hidden="true"/>
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
        <main className="hbar-app-ui-notifications-toast-demo">
            <header><h1>Toast notifications</h1><p>Transient messages stack in the corner, collapse when idle and expand on hover.</p></header>
            <div className="hbar-app-ui-notifications-toast-choices">{toastChoices.map((choice) => <NotificationButton key={choice.tone}
                                                                                                                             onClick={() => addToast(choice.tone, choice.label)}><ToastGlyph
                tone={choice.tone}/>{choice.label}</NotificationButton>)}</div>
            <section className="hbar-app-ui-notifications-toast-list" aria-live="polite" onPointerEnter={() => {
                setPaused(true)
                reportNotificationAction(onAction, spec, 'pause')
            }} onPointerLeave={() => setPaused(false)}>{toasts.length ? <ul>{toasts.map((toast) => <li key={toast.id}
                                                                                                           className={`is-${toast.tone}`}><ToastGlyph
                tone={toast.tone}/><span><strong>{toast.label}</strong><small>{isPaused ? 'Timer paused' : 'Dismisses automatically'}</small></span><NotificationIconButton
                label={`Dismiss ${toast.label}`} onClick={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}><X
                size={14}/></NotificationIconButton></li>)}</ul> : <div className="hbar-app-ui-notifications-no-toasts"><span>No active toasts</span><button
                type="button" disabled>Clear all</button></div>}</section>
        </main>
    </NotificationFrame>
}
