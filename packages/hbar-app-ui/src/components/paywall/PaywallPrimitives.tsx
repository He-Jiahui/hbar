import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import './PaywallSurface.css'

export function PaywallFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-paywall-surface ${className ?? ''}`}>
        {children}
    </ActionSurfaceFrame>
}

export function PaywallIcon({children, label, tier = 'sm'}: {readonly children: ReactNode; readonly label: string; readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'}) {
    return <span className={`hbar-app-ui-paywall-icon hbar-app-ui-icon-${tier}`} aria-label={label}>{children}</span>
}

export function PaywallButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {readonly tone?: 'neutral' | 'accent'}) {
    return <button {...props} className={`hbar-app-ui-paywall-button hbar-app-ui-paywall-button-${tone} ${props.className ?? ''}`}>{children}</button>
}

export function PaywallListStrategy({kind}: {readonly kind: 'content-grown' | 'pane-scroll' | 'virtualized'}) {
    return <span className="hbar-app-ui-paywall-strategy" data-hbar-app-ui-list-strategy={kind} aria-hidden="true" />
}
