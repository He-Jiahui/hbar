import {
    Apple,
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronRight,
    CircleHelp,
    Eye,
    EyeOff,
    GitBranch,
    KeyRound,
    Laptop,
    Link2,
    Mail,
    Monitor,
    MoreHorizontal,
    MousePointer2,
    QrCode,
    Smartphone,
    Upload,
    Wifi
} from 'lucide-react'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'
import {type HbarAppUiAuthListStrategy, type HbarAppUiAuthProviderChoice, uniqueHbarAppUiAuthItems} from './AuthContent'

export function AuthFrame({spec, onAction, className, children}: HbarAppUiVariantProps & {
    readonly children: ReactNode
}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-auth-surface ${className ?? ''}`}>{children}</ActionSurfaceFrame>
}

export function AuthCard({children, className = ''}: { readonly children: ReactNode; readonly className?: string }) {
    return <section className={`hbar-app-ui-auth-card ${className}`}>{children}</section>
}

export function AuthIcon({children, tier = 'sm'}: {
    readonly children: ReactNode;
    readonly tier?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}) {
    return <span className={`hbar-app-ui-auth-icon hbar-app-ui-icon-${tier}`} aria-hidden="true">{children}</span>
}

export function AuthButton({children, tone = 'neutral', ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly tone?: 'neutral' | 'accent' | 'danger'
}) {
    return <button {...props}
                   className={`hbar-app-ui-auth-button hbar-app-ui-auth-button-${tone} ${props.className ?? ''}`}>{children}</button>
}

export function AuthIconButton({label, children, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly label: string
}) {
    return <AuthButton {...props} className={`hbar-app-ui-auth-icon-button ${props.className ?? ''}`}
                       aria-label={props['aria-label'] ?? label} title={props.title ?? label}>{children}</AuthButton>
}

export function AuthBrand({label, compact = false}: { readonly label: string; readonly compact?: boolean }) {
    return <div className={`hbar-app-ui-auth-brand ${compact ? 'is-compact' : ''}`} aria-label={label} role="img"><span
        aria-hidden="true">{label.slice(0, 1)}</span><strong>{label}</strong></div>
}

export function AuthDivider({label}: { readonly label: string }) {
    return <div className="hbar-app-ui-auth-divider"><span aria-hidden="true"/><small>{label}</small><span
        aria-hidden="true"/></div>
}

export function AuthFooterLinks({links, onSelect}: {
    readonly links: readonly string[];
    readonly onSelect: (value: string) => void
}) {
    return <nav className="hbar-app-ui-auth-footer-links" aria-label={links.join(', ')}>{links.map((link) => <button
        type="button" className="hbar-app-ui-auth-inline-link" key={link}
        onClick={() => onSelect(link)}>{link}</button>)}</nav>
}

export function AuthField({label, placeholder, value, type = 'text', onChange, children, helper}: {
    readonly label: string;
    readonly placeholder?: string;
    readonly value?: string;
    readonly type?: string;
    readonly onChange?: (value: string) => void;
    readonly children?: ReactNode;
    readonly helper?: ReactNode
}) {
    return <label className="hbar-app-ui-auth-field"><span>{label}</span>
        <div className="hbar-app-ui-auth-input-wrap"><input type={type} value={value} placeholder={placeholder}
                                                            onChange={(event) => onChange?.(event.currentTarget.value)}/>{children}
        </div>
        {helper && <small>{helper}</small>}</label>
}

export function AuthPasswordButton({visible, showLabel, hideLabel, onToggle}: {
    readonly visible: boolean;
    readonly showLabel: string;
    readonly hideLabel: string;
    readonly onToggle: () => void
}) {
    return <AuthIconButton type="button" label={visible ? hideLabel : showLabel} onClick={onToggle}>{visible ?
        <AuthIcon><EyeOff/></AuthIcon> : <AuthIcon><Eye/></AuthIcon>}</AuthIconButton>
}

export function AuthProviderIcon({kind, label}: {
    readonly kind?: HbarAppUiAuthProviderChoice['icon'];
    readonly label: string
}) {
    switch (kind) {
        case 'google':
            return <AuthIcon><span className="hbar-app-ui-auth-provider-letter">{label.slice(0, 1)}</span></AuthIcon>
        case 'apple':
            return <AuthIcon><Apple/></AuthIcon>
        case 'github':
            return <AuthIcon><GitBranch/></AuthIcon>
        case 'mail':
            return <AuthIcon><Mail/></AuthIcon>
        case 'key':
            return <AuthIcon><KeyRound/></AuthIcon>
        case undefined:
            return <AuthIcon><CircleHelp/></AuthIcon>
        default:
            return <AuthIcon><CircleHelp/></AuthIcon>
    }
}

export function AuthProviderButtons({providers, onSelect, listStrategy, className = ''}: {
    readonly providers: readonly HbarAppUiAuthProviderChoice[];
    readonly onSelect: (provider: HbarAppUiAuthProviderChoice) => void;
    readonly listStrategy?: HbarAppUiAuthListStrategy | undefined;
    readonly className?: string
}) {
    const uniqueProviders = uniqueHbarAppUiAuthItems(providers)
    return <div className={`hbar-app-ui-auth-provider-buttons ${className}`}
                data-hbar-app-ui-list-strategy={listStrategy?.kind}>{uniqueProviders.map((provider) => <AuthButton
        key={provider.id} type="button" onClick={() => onSelect(provider)}><AuthProviderIcon kind={provider.icon}
                                                                                             label={provider.label}/>{provider.label}
    </AuthButton>)}</div>
}

export function AuthAvatar({initials, label, large = false}: {
    readonly initials: string;
    readonly label?: string;
    readonly large?: boolean
}) {
    return <span className={`hbar-app-ui-auth-avatar ${large ? 'is-large' : ''}`} aria-label={label}>{initials}</span>
}

export function AuthStatus({label, tone = 'neutral'}: {
    readonly label: string;
    readonly tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}) {
    return <span className={`hbar-app-ui-auth-status hbar-app-ui-auth-status-${tone}`}><i
        aria-hidden="true"/>{label}</span>
}

export function AuthMetaRows({rows}: { readonly rows: readonly { readonly label: string; readonly value: string }[] }) {
    return <dl className="hbar-app-ui-auth-meta-rows">{rows.map((row) => <div key={`${row.label}-${row.value}`}>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
    </div>)}</dl>
}

export function AuthArrow({back = false}: { readonly back?: boolean }) {
    return <AuthIcon>{back ? <ArrowLeft/> : <ArrowRight/>}</AuthIcon>
}

export function AuthLeadingIcon({kind}: {
    readonly kind: 'laptop' | 'phone' | 'key' | 'monitor' | 'wifi' | 'upload' | 'qr' | 'pointer'
}) {
    switch (kind) {
        case 'phone':
            return <AuthIcon><Smartphone/></AuthIcon>
        case 'key':
            return <AuthIcon><KeyRound/></AuthIcon>
        case 'monitor':
            return <AuthIcon><Monitor/></AuthIcon>
        case 'wifi':
            return <AuthIcon><Wifi/></AuthIcon>
        case 'upload':
            return <AuthIcon><Upload/></AuthIcon>
        case 'qr':
            return <AuthIcon><QrCode/></AuthIcon>
        case 'pointer':
            return <AuthIcon><MousePointer2/></AuthIcon>
        case 'laptop':
            return <AuthIcon><Laptop/></AuthIcon>
    }
}

export function AuthCheck() {
    return <AuthIcon><Check/></AuthIcon>
}

export function AuthLinkIcon() {
    return <AuthIcon><Link2/></AuthIcon>
}

export function AuthMore() {
    return <AuthIcon><MoreHorizontal/></AuthIcon>
}

export function AuthChevron() {
    return <AuthIcon><ChevronRight/></AuthIcon>
}
