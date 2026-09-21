import {
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import { HbarAppUiIcon } from '../../icon'
import type {ReactNode} from 'react'
import {X} from 'lucide-react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type AppDialogProps = HbarAppUiVariantProps

export type AppDialogButtonTone = 'neutral' | 'accent' | 'danger'

export function reportDialogAction(
    onAction: AppDialogProps['onAction'],
    spec: AppDialogProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function DialogFrame({
                                spec,
                                onAction,
                                className,
                                children,
                            }: AppDialogProps & {
    readonly children: ReactNode;
    readonly className: string
}): ReactNode {
    return <ActionSurfaceFrame spec={spec} onAction={onAction} className={className}>{children}</ActionSurfaceFrame>
}

export function DialogBackdrop({children, className = ''}: {
    readonly children: ReactNode;
    readonly className?: string
}): ReactNode {
    return <LumenFrame className={`hbar-app-ui-dialog-backdrop ${className}`}>{children}</LumenFrame>
}

export function DialogCloseButton({onClose}: { readonly onClose: () => void }): ReactNode {
    return <LumenButton type="button" className="hbar-app-ui-dialog-close" aria-label="Close dialog" onClick={onClose}><HbarAppUiIcon icon={X} tier="md"
        /></LumenButton>
}

export function DialogButton({
                                 children,
                                 tone = 'neutral',
                                 disabled = false,
                                 onClick,
                                 className = '',
                             }: {
    readonly children: ReactNode
    readonly tone?: AppDialogButtonTone
    readonly disabled?: boolean
    readonly onClick: () => void
    readonly className?: string
}): ReactNode {
    return <LumenButton type="button"
                   className={`hbar-app-ui-dialog-button hbar-app-ui-dialog-button-${tone} ${className}`.trim()}
                   disabled={disabled} onClick={onClick}>{children}</LumenButton>
}

export function DialogField({
                                label,
                                children,
                                hint,
                            }: {
    readonly label: ReactNode
    readonly children: ReactNode
    readonly hint?: string
}): ReactNode {
    return <LumenFrame as="label" className="hbar-app-ui-dialog-field"><LumenText as="span">{label}</LumenText>{children}{hint && <LumenText as="small">{hint}</LumenText>}
    </LumenFrame>
}
