import { LumenButton } from '@lumen/app-ui'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export function SettingsFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={`hbar-app-ui-settings-surface ${className ?? ''}`}>{children}</ActionSurfaceFrame>
}

export function SettingsIcon({children, tier = 'sm'}: {readonly children: ReactNode; readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'}) {
    return <span className={`hbar-app-ui-settings-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">{children}</span>
}

export function SettingsButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent' | 'danger'
}) {
    return <LumenButton {...props}
                   className={`hbar-app-ui-settings-button hbar-app-ui-settings-button-${tone} ${props.className ?? ''}`}>{children}</LumenButton>
}

export function SettingsIconButton({label, children, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {readonly label: string}) {
    return <SettingsButton {...props} className={`hbar-app-ui-settings-icon-button ${props.className ?? ''}`} aria-label={props['aria-label'] ?? label} title={props.title ?? label}>{children}</SettingsButton>
}

export function SettingsBadge({children, tone = 'neutral'}: {readonly children: ReactNode; readonly tone?: 'neutral' | 'warning' | 'danger'}) {
    return <span className={`hbar-app-ui-settings-badge hbar-app-ui-settings-badge-${tone}`}>{children}</span>
}

export function SettingsToggle({checked, label, onChange}: {
    readonly checked: boolean;
    readonly label: string;
    readonly onChange: () => void
}) {
    return <LumenButton type="button" role="switch" aria-checked={checked} aria-label={label}
                   className={`hbar-app-ui-settings-toggle ${checked ? 'is-on' : ''}`} onClick={onChange}><span
        aria-hidden="true"/></LumenButton>
}
