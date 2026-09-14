import {useEffect} from 'react'
import type {ReactNode} from 'react'
import {ArrowLeft, Search} from 'lucide-react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type CommandMenuProps = HbarAppUiVariantProps

export function reportCommandAction(
    onAction: CommandMenuProps['onAction'],
    spec: CommandMenuProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function CommandFrame({spec, onAction, className, children}: CommandMenuProps & {readonly className: string; readonly children: ReactNode}): React.JSX.Element {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={className}>{children}</ActionSurfaceFrame>
}

export function CommandBackdrop({
    children,
    onClose,
    closeLabel = 'Close menu',
}: {
    readonly children: ReactNode
    readonly onClose: () => void
    readonly closeLabel?: string
}): React.JSX.Element {
    return <div className="hbar-app-ui-dialog-backdrop hbar-app-ui-command-backdrop"><button type="button" className="hbar-app-ui-command-backdrop-dismiss" aria-label={closeLabel} onClick={onClose}/>{children}</div>
}

export function CommandSearch({
    value,
    onChange,
    placeholder,
    ariaLabel,
}: {
    readonly value: string
    readonly onChange: (value: string) => void
    readonly placeholder: string
    readonly ariaLabel: string
}): React.JSX.Element {
    return <label className="hbar-app-ui-command-search-field"><Search size={17} aria-hidden="true"/><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel}/></label>
}

export function CommandBack({onClick}: {readonly onClick: () => void}): React.JSX.Element {
    return <button type="button" className="hbar-app-ui-command-back" aria-label="Back to actions" onClick={onClick}><ArrowLeft size={18}/></button>
}

export function CommandHint({children}: {readonly children: ReactNode}): React.JSX.Element {
    return <span className="hbar-app-ui-command-hint">{children}</span>
}

export function CommandShortcut({
    keys,
    label,
}: {
    readonly keys: ReactNode
    readonly label: ReactNode
}): React.JSX.Element {
    return <span className="hbar-app-ui-command-shortcut"><CommandHint>{keys}</CommandHint><small>{label}</small></span>
}

export function CommandButton({
    children,
    tone = 'neutral',
    onClick,
}: {
    readonly children: ReactNode
    readonly tone?: 'neutral' | 'accent'
    readonly onClick: () => void
}): React.JSX.Element {
    return <button type="button" className={`hbar-app-ui-command-action hbar-app-ui-command-action-${tone}`} onClick={onClick}>{children}</button>
}

export function useCommandEscape(open: boolean, onClose: () => void): void {
    useEffect(() => {
        if (!open) return undefined
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', closeOnEscape)
        return () => document.removeEventListener('keydown', closeOnEscape)
    }, [onClose, open])
}
