import { HbarAppUiIcon } from '../../icon'
import type {ButtonHTMLAttributes, ReactNode} from 'react'
import {Check} from 'lucide-react'
import type {HbarAppUiEvent, HbarAppUiVariantProps} from '../../types'
import {ActionSurfaceFrame} from '../SurfaceFrame'

export type WizardSurfaceProps = HbarAppUiVariantProps
export type WizardButtonTone = 'neutral' | 'light' | 'danger'

export function reportWizardAction(
    onAction: WizardSurfaceProps['onAction'],
    spec: WizardSurfaceProps['spec'],
    actionId: string,
    value?: string,
): void {
    const event: HbarAppUiEvent = value === undefined
        ? {variantId: spec.id, actionId}
        : {variantId: spec.id, actionId, value}
    onAction?.(event)
}

export function WizardFrame({
    spec,
    onAction,
    className,
    children,
}: WizardSurfaceProps & {readonly className: string; readonly children: ReactNode}) {
    return <ActionSurfaceFrame spec={spec} onAction={onAction}
                               className={`hbar-app-ui-wizard-surface ${className}`}>{children}</ActionSurfaceFrame>
}

export function WizardButton({
    tone = 'neutral',
    className = '',
    children,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {readonly tone?: WizardButtonTone}) {
    return <button {...props} type={props.type ?? 'button'}
                   className={`hbar-app-ui-wizard-button hbar-app-ui-wizard-button-${tone}${className ? ` ${className}` : ''}`}>{children}</button>
}

export type WizardStep = {
    readonly id: string
    readonly label: string
}

export function WizardStepRail({
    steps,
    current,
    onSelect,
    compact = false,
}: {
    readonly steps: readonly WizardStep[]
    readonly current: number
    readonly onSelect?: ((index: number) => void) | undefined
    readonly compact?: boolean
}) {
    return <nav className={`hbar-app-ui-wizard-step-rail${compact ? ' is-compact' : ''}`} aria-label="Wizard progress">{steps.map((step, index) => {
        const complete = index < current
        const active = index === current
        return <div className={`hbar-app-ui-wizard-step${active ? ' is-active' : ''}${complete ? ' is-complete' : ''}`} key={step.id}>
            <button type="button" aria-current={active ? 'step' : undefined} aria-label={`${index + 1} ${step.label}`} disabled={!onSelect}
                    onClick={() => onSelect?.(index)}><span className="hbar-app-ui-wizard-step-index">{complete ? <HbarAppUiIcon icon={Check} tier="sm"  strokeWidth={2}/> : index + 1}</span><span className="hbar-app-ui-wizard-step-label">{step.label}</span></button>{index < steps.length - 1 &&
                <i aria-hidden="true"/>}
        </div>
    })}</nav>
}

export function WizardField({
    label,
    required = false,
    children,
}: {
    readonly label: string
    readonly required?: boolean
    readonly children: ReactNode
}) {
    return <label className="hbar-app-ui-wizard-field"><span>{label}{required && <b aria-hidden="true">*</b>}</span>{children}</label>
}

export function WizardFooter({children, className = ''}: {readonly children: ReactNode; readonly className?: string}) {
    return <footer className={`hbar-app-ui-wizard-footer${className ? ` ${className}` : ''}`}>{children}</footer>
}
