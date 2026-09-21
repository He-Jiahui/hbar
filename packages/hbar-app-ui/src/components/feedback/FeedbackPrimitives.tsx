import { LumenButton } from '@lumen/app-ui'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {LucideIcon} from 'lucide-react'
import type {HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import './FeedbackSurface.css'

export type HbarAppUiFeedbackIconTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export function FeedbackFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-feedback-surface hbar-app-ui-feedback-variant-${spec.variant} ${className ?? ''}`}>
        {children}
    </ActionSurfaceFrame>
}

export function FeedbackButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent'
}) {
    return <LumenButton {...props}
                   className={`hbar-app-ui-feedback-button hbar-app-ui-feedback-button-${tone} ${props.className ?? ''}`}>{children}</LumenButton>
}

export function FeedbackIcon({icon: Icon, tier = 'sm'}: {readonly icon: LucideIcon; readonly tier?: HbarAppUiFeedbackIconTier}) {
    return <Icon className={`hbar-app-ui-feedback-icon hbar-app-ui-icon-${tier}`} aria-hidden="true" />
}

export function FeedbackStatus({label, tone = 'neutral'}: {readonly label: string; readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger'}) {
    return <span className={`hbar-app-ui-feedback-status is-${tone}`}>{label}</span>
}

export function FeedbackAvatar({initials, label}: {readonly initials: string; readonly label?: string | undefined}) {
    return <span className="hbar-app-ui-feedback-avatar" aria-label={label}>{initials}</span>
}
