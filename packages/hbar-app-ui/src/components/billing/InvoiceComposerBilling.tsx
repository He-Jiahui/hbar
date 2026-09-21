import { LumenInput, LumenSelect } from '@lumen/app-ui'
import {ArrowRight, Check, X} from 'lucide-react'
import {useMemo, useState, type ChangeEvent} from 'react'
import type {HbarAppUiVariantProps} from '../../types'
import type {HbarAppUiBillingFieldKind, HbarAppUiBillingInvoiceComposerContent, HbarAppUiBillingInvoiceField} from './BillingContent'
import {BillingButton, BillingFrame, BillingIcon, BillingIconButton, BillingWorkflowSteps} from './BillingPrimitives'

function InvoiceField({field, value, onChange}: {
    readonly field: HbarAppUiBillingInvoiceField
    readonly value: string
    readonly onChange: (value: string) => void
}) {
    const update = (next: string) => onChange(next)
    return <label className="hbar-app-ui-billing-field" htmlFor={`hbar-app-ui-billing-field-${field.id}`}>
        <span>{field.label}</span>
        <span className="hbar-app-ui-billing-field-control">
            {field.prefix && <span aria-hidden="true">{field.prefix}</span>}
            {renderControl(field, value, update)}
            {field.clearLabel && value && <BillingIconButton type="button" label={field.clearLabel} onClick={() => update('')}><X/></BillingIconButton>}
        </span>
        {field.description && <small>{field.description}</small>}
    </label>
}

function renderControl(field: HbarAppUiBillingInvoiceField, value: string, onChange: (value: string) => void) {
    const common = {
        id: `hbar-app-ui-billing-field-${field.id}`,
        name: field.id,
        value,
        placeholder: field.placeholder,
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.target.value),
    }
    switch (field.kind as HbarAppUiBillingFieldKind) {
        case 'select':
            return <LumenSelect {...common}>{(field.choices ?? []).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</LumenSelect>
        case 'date':
        case 'text':
        default:
            return <LumenInput {...common} type={field.kind}/>
    }
}

export function InvoiceComposerBilling({spec, onAction, content}: HbarAppUiVariantProps & {
    readonly content: HbarAppUiBillingInvoiceComposerContent
}) {
    const steps = content.steps
    const initialStepIndex = Math.max(0, steps.findIndex((step) => step.id === content.initialStepId))
    const [stepIndex, setStepIndex] = useState(initialStepIndex)
    const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
        content.sections.flatMap((section) => section.fields.map((field) => [field.id, field.value]))
    ))
    const [saved, setSaved] = useState(false)
    const activeStep = steps[stepIndex] ?? steps[0]
    const stepLabel = activeStep?.label ?? ''
    const stepDetail = useMemo(() => content.labels.stepDetail(stepIndex + 1, steps.length, stepLabel), [content.labels, stepIndex, stepLabel, steps.length])

    const updateField = (fieldId: string, value: string) => {
        setValues((current) => ({...current, [fieldId]: value}))
        setSaved(false)
        onAction?.({variantId: spec.id, actionId: 'field-change', value: `${fieldId}:${value}`})
    }

    const saveDraft = () => {
        setSaved(true)
        onAction?.({variantId: spec.id, actionId: 'save-draft'})
    }

    const moveStep = (nextIndex: number) => {
        const bounded = Math.max(0, Math.min(Math.max(steps.length - 1, 0), nextIndex))
        setStepIndex(bounded)
        setSaved(false)
        const nextStepId = steps[bounded]?.id
        if (nextStepId) onAction?.({variantId: spec.id, actionId: 'step-change', value: nextStepId})
        else onAction?.({variantId: spec.id, actionId: 'step-change'})
    }

    return <BillingFrame spec={spec} onAction={onAction} className="hbar-app-ui-billing-invoice-composer-surface">
        <main className="hbar-app-ui-billing-centered-page">
            <form className="hbar-app-ui-billing-form-shell" onSubmit={(event) => {
                event.preventDefault()
                if (stepIndex >= steps.length - 1) saveDraft()
                else moveStep(stepIndex + 1)
            }}>
                <header className="hbar-app-ui-billing-form-head">
                    <div><h1>{content.labels.pageTitle}</h1><p>{stepDetail}</p></div>
                    <span className="hbar-app-ui-billing-draft"><i aria-hidden="true"/>{content.labels.draft}</span>
                </header>
                <div className="hbar-app-ui-billing-form-body">
                    <BillingWorkflowSteps steps={steps} activeId={activeStep?.id ?? ''}/>
                    {content.sections.map((section, sectionIndex) => <section className={`hbar-app-ui-billing-form-section ${sectionIndex === stepIndex ? 'is-active' : ''}`} key={section.id}>
                        <header><h2>{section.title}</h2><p>{section.description}</p></header>
                        <div className="hbar-app-ui-billing-fields">
                            {section.fields.map((field) => <InvoiceField key={field.id} field={field} value={values[field.id] ?? ''} onChange={(value) => updateField(field.id, value)}/>) }
                        </div>
                    </section>)}
                </div>
                <footer className="hbar-app-ui-billing-form-footer">
                    <p>{saved ? content.labels.savedNotice : content.labels.pageDescription}</p>
                    <div className="hbar-app-ui-billing-footer-actions">
                        <BillingButton type="button" disabled={stepIndex === 0} onClick={() => moveStep(stepIndex - 1)}>{content.labels.previousStep}</BillingButton>
                        <BillingButton type="button" onClick={saveDraft}>{content.labels.saveDraft}<BillingIcon tier="sm"><Check/></BillingIcon></BillingButton>
                        <BillingButton tone="accent" type="submit">{stepIndex >= steps.length - 1 ? content.labels.complete : content.labels.nextStep}<BillingIcon tier="sm"><ArrowRight/></BillingIcon></BillingButton>
                    </div>
                </footer>
            </form>
        </main>
    </BillingFrame>
}
